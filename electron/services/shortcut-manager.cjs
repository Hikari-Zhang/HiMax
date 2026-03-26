/**
 * Shortcut Manager
 * Handles global shortcuts (via Electron globalShortcut) and in-app shortcuts
 */

const { globalShortcut, BrowserWindow } = require('electron')

// Default shortcut mapping
const DEFAULT_SHORTCUTS = {
  pasteAndDownload: 'Ctrl+V',          // In-app only (not global)
  pauseAll: 'Ctrl+Shift+P',            // In-app only
  resumeAll: 'Ctrl+Shift+R',           // In-app only
  openSettings: 'Ctrl+,',              // In-app only
  toggleClipboard: 'Ctrl+Shift+C',     // In-app only
  globalShow: 'Ctrl+Shift+D',          // Global shortcut
}

// Actions that should be registered as global shortcuts (work when app is not focused)
const GLOBAL_ACTIONS = ['globalShow']

class ShortcutManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow
    this.shortcuts = { ...DEFAULT_SHORTCUTS }
    this.registeredGlobal = new Map()  // accelerator -> action
    this._inAppRegistered = false  // Track if in-app listener is already registered
  }

  /**
   * Initialize shortcuts from saved settings
   * @param {object} savedShortcuts - shortcuts from settings.json
   */
  init(savedShortcuts) {
    if (savedShortcuts && typeof savedShortcuts === 'object') {
      // Merge saved with defaults (saved take priority)
      this.shortcuts = { ...DEFAULT_SHORTCUTS, ...savedShortcuts }
    }
    this.registerAll()
  }

  /**
   * Register all shortcuts
   */
  registerAll() {
    this.unregisterAll()

    for (const [action, accelerator] of Object.entries(this.shortcuts)) {
      if (GLOBAL_ACTIONS.includes(action) && accelerator) {
        this._registerGlobal(action, accelerator)
      }
    }

    // Register in-app shortcuts via webContents
    this._registerInApp()
  }

  /**
   * Register a global shortcut
   */
  _registerGlobal(action, accelerator) {
    try {
      // Convert our format to Electron accelerator format
      const electronAccelerator = this._toElectronAccelerator(accelerator)
      if (!electronAccelerator) return

      const success = globalShortcut.register(electronAccelerator, () => {
        this._executeAction(action)
      })

      if (success) {
        this.registeredGlobal.set(electronAccelerator, action)
        console.log(`[ShortcutManager] Registered global: ${electronAccelerator} -> ${action}`)
      } else {
        console.warn(`[ShortcutManager] Failed to register global: ${electronAccelerator} (may be in use by another app)`)
      }
    } catch (err) {
      console.error(`[ShortcutManager] Error registering global ${action}:`, err.message)
    }
  }

  /**
   * Register in-app shortcuts (sent to renderer via IPC when triggered)
   */
  _registerInApp() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    // Only register once — the callback reads this.shortcuts dynamically
    if (this._inAppRegistered) return
    this._inAppRegistered = true

    // Actions that should NOT preventDefault (browser default behavior should still work)
    // e.g. Ctrl+V should still paste into input fields; we just also notify the renderer
    const PASSTHROUGH_ACTIONS = ['pasteAndDownload']

    // We'll use 'before-input-event' on webContents to intercept keypresses
    this.mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return

      // Build the accelerator string from the event
      const parts = []
      if (input.control) parts.push('Ctrl')
      if (input.alt) parts.push('Alt')
      if (input.shift) parts.push('Shift')
      if (input.meta) parts.push('Meta')

      // Normalize key name
      let key = input.key
      if (key === ',') key = ','
      else if (key.length === 1) key = key.toUpperCase()
      parts.push(key)

      const pressed = parts.join('+')

      // Check if any non-global shortcut matches
      for (const [action, accelerator] of Object.entries(this.shortcuts)) {
        if (GLOBAL_ACTIONS.includes(action)) continue // Skip global ones
        if (this._normalizeAccelerator(accelerator) === this._normalizeAccelerator(pressed)) {
          // For passthrough actions, don't preventDefault — let the browser handle it too
          if (!PASSTHROUGH_ACTIONS.includes(action)) {
            event.preventDefault()
          }
          this._executeAction(action)
          return
        }
      }
    })
  }

  /**
   * Execute an action triggered by shortcut
   */
  _executeAction(action) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    switch (action) {
      case 'globalShow':
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore()
        }
        this.mainWindow.show()
        this.mainWindow.focus()
        break

      default:
        // Send to renderer for handling
        this.mainWindow.webContents.send('shortcut:triggered', action)
        break
    }
  }

  /**
   * Update a single shortcut
   * @param {string} action - action name
   * @param {string} accelerator - new key combo (empty string to disable)
   * @returns {{ success: boolean, error?: string }}
   */
  updateShortcut(action, accelerator) {
    // Validate the accelerator
    if (accelerator && !this._isValidAccelerator(accelerator)) {
      return { success: false, error: 'INVALID_ACCELERATOR' }
    }

    // Check for conflicts with other shortcuts
    if (accelerator) {
      const normalized = this._normalizeAccelerator(accelerator)
      for (const [existingAction, existingAccel] of Object.entries(this.shortcuts)) {
        if (existingAction !== action && this._normalizeAccelerator(existingAccel) === normalized) {
          return { success: false, error: 'CONFLICT', conflictWith: existingAction }
        }
      }

      // Check if global shortcut is available
      if (GLOBAL_ACTIONS.includes(action)) {
        const electronAccel = this._toElectronAccelerator(accelerator)
        if (electronAccel && globalShortcut.isRegistered(electronAccel)) {
          // It might be ours, check
          if (!this.registeredGlobal.has(electronAccel)) {
            return { success: false, error: 'IN_USE_BY_OTHER_APP' }
          }
        }
      }
    }

    // Unregister old if it was global
    const oldAccelerator = this.shortcuts[action]
    if (GLOBAL_ACTIONS.includes(action) && oldAccelerator) {
      const oldElectron = this._toElectronAccelerator(oldAccelerator)
      if (oldElectron && this.registeredGlobal.has(oldElectron)) {
        globalShortcut.unregister(oldElectron)
        this.registeredGlobal.delete(oldElectron)
      }
    }

    // Update
    this.shortcuts[action] = accelerator

    // Register new if global
    if (GLOBAL_ACTIONS.includes(action) && accelerator) {
      this._registerGlobal(action, accelerator)
    }

    return { success: true }
  }

  /**
   * Reset all shortcuts to defaults
   */
  resetAll() {
    this.shortcuts = { ...DEFAULT_SHORTCUTS }
    this.registerAll()
    return { success: true, shortcuts: { ...this.shortcuts } }
  }

  /**
   * Get current shortcuts
   */
  getShortcuts() {
    return { ...this.shortcuts }
  }

  /**
   * Get default shortcuts
   */
  getDefaults() {
    return { ...DEFAULT_SHORTCUTS }
  }

  /**
   * Validate an accelerator string
   */
  _isValidAccelerator(accel) {
    if (!accel || typeof accel !== 'string') return false
    const parts = accel.split('+')
    if (parts.length === 0) return false
    // Must have at least one non-modifier key
    const modifiers = ['Ctrl', 'Alt', 'Shift', 'Meta', 'Command', 'Cmd']
    const hasNonModifier = parts.some(p => !modifiers.includes(p))
    return hasNonModifier
  }

  /**
   * Normalize accelerator for comparison
   */
  _normalizeAccelerator(accel) {
    if (!accel) return ''
    return accel
      .split('+')
      .map(p => p.trim().toLowerCase())
      .sort()
      .join('+')
  }

  /**
   * Convert our accelerator format to Electron's globalShortcut format
   */
  _toElectronAccelerator(accel) {
    if (!accel) return null
    // Electron accepts: Ctrl, Alt, Shift, Super/Meta, plus key names
    // Our format is already close — just make sure it's valid
    return accel
      .replace(/Meta/g, process.platform === 'darwin' ? 'Command' : 'Super')
  }

  /**
   * Unregister all global shortcuts
   */
  unregisterAll() {
    for (const [accelerator] of this.registeredGlobal) {
      try {
        globalShortcut.unregister(accelerator)
      } catch (err) {
        // Ignore
      }
    }
    this.registeredGlobal.clear()
  }

  /**
   * Cleanup on app quit
   */
  destroy() {
    this.unregisterAll()
  }
}

module.exports = { ShortcutManager, DEFAULT_SHORTCUTS }
