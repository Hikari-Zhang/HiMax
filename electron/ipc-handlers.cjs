/**
 * IPC Handlers - Bridge between renderer process and backend services
 */
const { ipcMain, dialog, shell } = require('electron')

function registerIpcHandlers(mainWindow, { binaryManager, ytdlpEngine, downloadManager, shortcutManager }) {
  // ─── Binary Management ────────────────────

  ipcMain.handle('binary:status', async () => {
    return binaryManager.getStatus()
  })

  ipcMain.handle('binary:ensure', async () => {
    return binaryManager.ensureBinaries((progress) => {
      mainWindow.webContents.send('binary:progress', progress)
    })
  })

  ipcMain.handle('binary:update-ytdlp', async () => {
    return binaryManager.updateYtdlp((progress) => {
      mainWindow.webContents.send('binary:progress', { stage: 'ytdlp', ...progress })
    })
  })

  ipcMain.handle('binary:download-ffmpeg', async () => {
    return binaryManager.downloadFfmpeg((progress) => {
      mainWindow.webContents.send('binary:progress', { stage: 'ffmpeg', ...progress })
    })
  })

  ipcMain.handle('binary:set-custom-ytdlp', async (_event, customPath) => {
    try {
      const result = await binaryManager.setCustomYtdlpPath(customPath)
      // Also update the ytdlp engine's reference
      if (result.success) {
        ytdlpEngine.binaryManager = binaryManager
      }
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('binary:set-custom-ffmpeg', async (_event, customPath) => {
    try {
      return await binaryManager.setCustomFfmpegPath(customPath)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('binary:open-bin-dir', async () => {
    const { shell } = require('electron')
    shell.openPath(binaryManager.binDir)
    return true
  })

  // ─── Shortcut Management ────────────────────

  ipcMain.handle('shortcut:get-all', async () => {
    // shortcutManager may be initialized after IPC registration
    if (!shortcutManager) {
      const { DEFAULT_SHORTCUTS } = require('./services/shortcut-manager.cjs')
      return DEFAULT_SHORTCUTS
    }
    return shortcutManager.getShortcuts()
  })

  ipcMain.handle('shortcut:get-defaults', async () => {
    const { DEFAULT_SHORTCUTS } = require('./services/shortcut-manager.cjs')
    return DEFAULT_SHORTCUTS
  })

  ipcMain.handle('shortcut:update', async (_event, action, accelerator) => {
    if (!shortcutManager) {
      return { success: false, error: 'NOT_INITIALIZED' }
    }
    const result = shortcutManager.updateShortcut(action, accelerator)
    if (result.success) {
      // Persist to settings
      const currentSettings = downloadManager.getSettings()
      currentSettings.shortcuts = shortcutManager.getShortcuts()
      downloadManager.updateSettings(currentSettings)
    }
    return result
  })

  ipcMain.handle('shortcut:reset-all', async () => {
    if (!shortcutManager) {
      return { success: false, error: 'NOT_INITIALIZED' }
    }
    const result = shortcutManager.resetAll()
    if (result.success) {
      // Persist to settings
      const currentSettings = downloadManager.getSettings()
      currentSettings.shortcuts = result.shortcuts
      downloadManager.updateSettings(currentSettings)
    }
    return result
  })

  ipcMain.handle('shortcut:validate', async (_event, accelerator) => {
    if (!shortcutManager) {
      return { valid: true }
    }
    // Check if accelerator is valid and not in use by other apps
    const valid = shortcutManager._isValidAccelerator(accelerator)
    return { valid }
  })

  // ─── URL Parsing ────────────────────────

  ipcMain.handle('proxy:test', async (_event, settings) => {
    try {
      const result = await ytdlpEngine.testProxy(settings)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ytdlp:parse-url', async (_event, url, options) => {
    try {
      const info = await ytdlpEngine.parseUrl(url, options)
      return { success: true, data: info }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ytdlp:parse-playlist', async (_event, url, options) => {
    try {
      const videos = await ytdlpEngine.parsePlaylist(url, options)
      return { success: true, data: videos }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── Download Management ────────────────

  ipcMain.handle('download:add', async (_event, videoInfo, downloadOptions) => {
    const task = downloadManager.addTask(videoInfo, downloadOptions)
    return { success: true, data: task }
  })

  ipcMain.handle('download:pause', async (_event, taskId) => {
    return downloadManager.pauseTask(taskId)
  })

  ipcMain.handle('download:resume', async (_event, taskId) => {
    return downloadManager.resumeTask(taskId)
  })

  ipcMain.handle('download:cancel', async (_event, taskId) => {
    return downloadManager.cancelTask(taskId)
  })

  ipcMain.handle('download:retry', async (_event, taskId) => {
    return downloadManager.retryTask(taskId)
  })

  ipcMain.handle('download:remove', async (_event, taskId, deleteFile) => {
    console.log('[IPC] download:remove called:', taskId, 'deleteFile:', deleteFile)
    return downloadManager.removeTask(taskId, deleteFile)
  })

  ipcMain.handle('download:pause-all', async () => {
    downloadManager.pauseAll()
    return true
  })

  ipcMain.handle('download:resume-all', async () => {
    downloadManager.resumeAll()
    return true
  })

  ipcMain.handle('download:get-stats', async () => {
    return downloadManager.getStats()
  })

  ipcMain.handle('download:clear-history', async (_event, deleteFiles) => {
    return downloadManager.clearHistory(deleteFiles)
  })

  ipcMain.handle('download:clear-completed', async (_event, deleteFiles) => {
    return downloadManager.clearCompleted(deleteFiles)
  })

  ipcMain.handle('download:get-tasks', async () => {
    return downloadManager.getTasksByCategory()
  })

  ipcMain.handle('download:get-all-tasks', async () => {
    return downloadManager.getAllTasks()
  })

  // ─── Cookie Management ────────────────────

  ipcMain.handle('cookie:export', async (_event, browser, profile) => {
    try {
      const outputPath = ytdlpEngine.getDefaultCookiePath()
      const result = await ytdlpEngine.exportCookies(browser, outputPath, profile)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('cookie:status', async () => {
    const cookiePath = ytdlpEngine.getDefaultCookiePath()
    const fs = require('fs')
    try {
      if (!fs.existsSync(cookiePath)) {
        return { exists: false, path: cookiePath }
      }
      const stats = fs.statSync(cookiePath)
      const ageMs = Date.now() - stats.mtimeMs
      const ageHours = Math.round(ageMs / (1000 * 60 * 60) * 10) / 10
      return {
        exists: true,
        path: cookiePath,
        size: stats.size,
        ageHours,
        isValid: ytdlpEngine.isCookieFileValid(cookiePath),
        lastModified: stats.mtime.toISOString(),
      }
    } catch (error) {
      return { exists: false, path: cookiePath, error: error.message }
    }
  })

  ipcMain.handle('cookie:save-text', async (_event, cookieText) => {
    try {
      const result = ytdlpEngine.saveCookieText(cookieText)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('cookie:save-site', async (_event, siteKey, cookieString) => {
    try {
      const result = ytdlpEngine.saveSiteCookies(siteKey, cookieString)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('cookie:get-sites', async () => {
    try {
      return ytdlpEngine.getSavedCookieSites()
    } catch (error) {
      return { sites: [] }
    }
  })

  ipcMain.handle('cookie:delete-site', async (_event, siteKey) => {
    try {
      return ytdlpEngine.deleteSiteCookies(siteKey)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('cookie:import', async (_event, sourcePath) => {
    try {
      const result = ytdlpEngine.importCookieFile(sourcePath)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('cookie:delete', async () => {
    const cookiePath = ytdlpEngine.getDefaultCookiePath()
    const fs = require('fs')
    try {
      if (fs.existsSync(cookiePath)) {
        fs.unlinkSync(cookiePath)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── Settings ────────────────────────

  ipcMain.handle('settings:load', async () => {
    return downloadManager.getSettings()
  })

  ipcMain.handle('settings:update', async (_event, settings) => {
    downloadManager.updateSettings(settings)
    return true
  })

  ipcMain.handle('settings:set-login-item', async (_event, enabled) => {
    const { app } = require('electron')
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
      })
      return true
    } catch (e) {
      console.error('[IPC] Failed to set login item:', e)
      return false
    }
  })

  ipcMain.handle('settings:get-login-item', async () => {
    const { app } = require('electron')
    try {
      const settings = app.getLoginItemSettings()
      return settings.openAtLogin
    } catch (e) {
      return false
    }
  })

  // ─── File System ────────────────────────

  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:select-file', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('shell:open-path', async (_event, filePath) => {
    console.log('[IPC] shell:open-path called with:', filePath)
    const fs = require('fs')
    let resolvedPath = filePath

    // If the file doesn't exist, it might be a garbled GBK path
    // Try to find the correct file via downloadManager's task data
    if (filePath && !fs.existsSync(filePath)) {
      console.log('[IPC] shell:open-path file not found, trying to resolve...')
      const path = require('path')
      const dir = path.dirname(filePath)

      // Search through tasks for one whose filepath was this garbled path
      const allTasks = downloadManager.getAllTasks()
      for (const task of allTasks) {
        if (task.filepath === filePath && task.title) {
          // Try to find the actual file by title
          const found = downloadManager._findOutputFile(
            task.outputDir || dir,
            task.title,
            task.filename
          )
          if (found) {
            console.log(`[IPC] shell:open-path resolved garbled path to: ${found}`)
            resolvedPath = found
            // Also fix the task's filepath for future use
            task.filepath = found
            break
          }
        }
      }
    }

    try {
      const result = await shell.openPath(resolvedPath)
      // shell.openPath returns '' on success, error message on failure
      if (result) {
        console.error('[IPC] shell:open-path failed:', result)
        return false
      }
      console.log('[IPC] shell:open-path success')
      return true
    } catch (err) {
      console.error('[IPC] shell:open-path error:', err)
      return false
    }
  })

  ipcMain.handle('shell:show-in-folder', async (_event, filePath) => {
    console.log('[IPC] shell:show-in-folder called with:', filePath)
    const fs = require('fs')
    let resolvedPath = filePath

    // Check if the path is a directory (e.g. outputDir fallback when filepath is null during download)
    if (filePath && fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          console.log('[IPC] shell:show-in-folder path is a directory, opening it directly')
          await shell.openPath(filePath)
          return true
        }
      } catch {}
    }

    // If the file doesn't exist, try to resolve garbled path
    if (filePath && !fs.existsSync(filePath)) {
      console.log('[IPC] shell:show-in-folder file not found, trying to resolve...')
      const path = require('path')
      const dir = path.dirname(filePath)

      const allTasks = downloadManager.getAllTasks()
      for (const task of allTasks) {
        if (task.filepath === filePath && task.title) {
          const found = downloadManager._findOutputFile(
            task.outputDir || dir,
            task.title,
            task.filename
          )
          if (found) {
            console.log(`[IPC] shell:show-in-folder resolved garbled path to: ${found}`)
            resolvedPath = found
            task.filepath = found
            break
          }
        }
      }
    }

    shell.showItemInFolder(resolvedPath)
    return true
  })

  ipcMain.handle('shell:open-url', async (_event, url) => {
    shell.openExternal(url)
    return true
  })

  ipcMain.handle('app:get-downloads-path', async () => {
    const { app } = require('electron')
    return app.getPath('downloads')
  })

  // ─── Forward download manager events to renderer ────

  downloadManager.onUpdate((event, data) => {
    try {
      mainWindow.webContents.send('download:event', { event, data })
    } catch {
      // Window might be destroyed
    }
  })
}

module.exports = { registerIpcHandlers }
