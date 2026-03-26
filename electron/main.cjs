const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const { BinaryManager } = require('./services/binary-manager.cjs')
const { YtdlpEngine } = require('./services/ytdlp-engine.cjs')
const { DownloadManager } = require('./services/download-manager.cjs')
const { ShortcutManager } = require('./services/shortcut-manager.cjs')
const { registerIpcHandlers } = require('./ipc-handlers.cjs')
const { getAppDataDir, ensureDir } = require('./services/app-paths.cjs')

let mainWindow = null
let binaryManager = null
let ytdlpEngine = null
let downloadManager = null
let shortcutManager = null
let tray = null
let isQuitting = false

function createWindow() {
  // Ensure appdata directory exists within the install directory
  // All config/binaries/cookies are stored here for clean uninstall
  ensureDir(getAppDataDir())

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // In dev, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Notify renderer when maximize state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-changed', false)
  })

  // ─── Initialize backend services ────────────────
  binaryManager = new BinaryManager()
  ytdlpEngine = new YtdlpEngine(binaryManager)
  downloadManager = new DownloadManager(ytdlpEngine, {
    maxConcurrent: 3,
  })

  // ─── Initialize shortcuts ────
  shortcutManager = new ShortcutManager(mainWindow)
  // Load saved shortcuts from settings
  const savedSettings = downloadManager.getSettings()
  shortcutManager.init(savedSettings.shortcuts || {})

  // Register all IPC handlers (shortcutManager must be initialized first)
  registerIpcHandlers(mainWindow, {
    binaryManager,
    ytdlpEngine,
    downloadManager,
    shortcutManager,
  })

  // ─── Close behavior: minimize to tray or quit ────
  mainWindow.on('close', (e) => {
    if (isQuitting) return // Allow quit
    const settings = downloadManager.getSettings()
    const closeAction = settings.closeAction || 'quit'
    const minimizeToTray = settings.minimizeToTray || false

    if (closeAction === 'minimize') {
      e.preventDefault()
      if (minimizeToTray && tray) {
        mainWindow.hide()
      } else {
        mainWindow.minimize()
      }
    }
    // If closeAction is 'quit', allow default close
  })

  // ─── System Tray ────────────────
  createTray()
}

function createTray() {
  // Create a simple tray icon (16x16 default icon)
  const iconPath = path.join(__dirname, 'tray-icon.png')
  let trayIcon
  try {
    const fs = require('fs')
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath)
    } else {
      // Fallback: create a simple 16x16 icon
      trayIcon = nativeImage.createEmpty()
    }
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('HiMax')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ─── Window control IPC (before window creation) ────

ipcMain.on('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on('window-close', () => {
  mainWindow?.close() // Will be intercepted by 'close' event handler if tray is enabled
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false
})

// ─── App lifecycle ────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  // Cleanup
  if (downloadManager) {
    downloadManager.shutdown()
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  isQuitting = true
  if (shortcutManager) {
    shortcutManager.destroy()
  }
  if (downloadManager) {
    downloadManager.shutdown()
  }
})
