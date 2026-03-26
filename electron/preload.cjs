const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Platform Info ────────────────
  platform: process.platform, // 'win32' | 'darwin' | 'linux'

  // ─── Window Controls ────────────────
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window-maximized-changed', (_event, isMaximized) => callback(isMaximized))
  },

  // ─── Binary Management ────────────────
  getBinaryStatus: () => ipcRenderer.invoke('binary:status'),
  ensureBinaries: () => ipcRenderer.invoke('binary:ensure'),
  updateYtdlp: () => ipcRenderer.invoke('binary:update-ytdlp'),
  downloadFfmpeg: () => ipcRenderer.invoke('binary:download-ffmpeg'),
  setCustomYtdlp: (customPath) => ipcRenderer.invoke('binary:set-custom-ytdlp', customPath),
  setCustomFfmpeg: (customPath) => ipcRenderer.invoke('binary:set-custom-ffmpeg', customPath),
  openBinDir: () => ipcRenderer.invoke('binary:open-bin-dir'),
  onBinaryProgress: (callback) => {
    ipcRenderer.on('binary:progress', (_event, progress) => callback(progress))
  },

  // ─── Shortcut Management ────────────────
  getShortcuts: () => ipcRenderer.invoke('shortcut:get-all'),
  getDefaultShortcuts: () => ipcRenderer.invoke('shortcut:get-defaults'),
  updateShortcut: (action, accelerator) => ipcRenderer.invoke('shortcut:update', action, accelerator),
  resetAllShortcuts: () => ipcRenderer.invoke('shortcut:reset-all'),
  validateShortcut: (accelerator) => ipcRenderer.invoke('shortcut:validate', accelerator),
  onShortcutTriggered: (callback) => {
    ipcRenderer.on('shortcut:triggered', (_event, action) => callback(action))
  },

  // ─── Network / Proxy ────────────────
  testProxy: (settings) => ipcRenderer.invoke('proxy:test', settings),

  // ─── URL Parsing ────────────────
  parseUrl: (url, options) => ipcRenderer.invoke('ytdlp:parse-url', url, options),
  parsePlaylist: (url, options) => ipcRenderer.invoke('ytdlp:parse-playlist', url, options),

  // ─── Download Management ────────────────
  addDownload: (videoInfo, downloadOptions) => ipcRenderer.invoke('download:add', videoInfo, downloadOptions),
  pauseDownload: (taskId) => ipcRenderer.invoke('download:pause', taskId),
  resumeDownload: (taskId) => ipcRenderer.invoke('download:resume', taskId),
  cancelDownload: (taskId) => ipcRenderer.invoke('download:cancel', taskId),
  retryDownload: (taskId) => ipcRenderer.invoke('download:retry', taskId),
  removeDownload: (taskId, deleteFile) => ipcRenderer.invoke('download:remove', taskId, deleteFile),
  pauseAllDownloads: () => ipcRenderer.invoke('download:pause-all'),
  resumeAllDownloads: () => ipcRenderer.invoke('download:resume-all'),
  getTasks: () => ipcRenderer.invoke('download:get-tasks'),
  getAllTasks: () => ipcRenderer.invoke('download:get-all-tasks'),
  clearHistory: (deleteFiles) => ipcRenderer.invoke('download:clear-history', deleteFiles),
  clearCompleted: (deleteFiles) => ipcRenderer.invoke('download:clear-completed', deleteFiles),
  getStats: () => ipcRenderer.invoke('download:get-stats'),

  onDownloadEvent: (callback) => {
    ipcRenderer.on('download:event', (_event, payload) => callback(payload))
  },

  // ─── Settings ────────────────
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  setLoginItem: (enabled) => ipcRenderer.invoke('settings:set-login-item', enabled),
  getLoginItem: () => ipcRenderer.invoke('settings:get-login-item'),

  // ─── Cookie Management ────────────────
  exportCookies: (browser, profile) => ipcRenderer.invoke('cookie:export', browser, profile),
  importCookies: (filePath) => ipcRenderer.invoke('cookie:import', filePath),
  saveCookieText: (cookieText) => ipcRenderer.invoke('cookie:save-text', cookieText),
  saveSiteCookies: (siteKey, cookieString) => ipcRenderer.invoke('cookie:save-site', siteKey, cookieString),
  getSavedCookieSites: () => ipcRenderer.invoke('cookie:get-sites'),
  deleteSiteCookies: (siteKey) => ipcRenderer.invoke('cookie:delete-site', siteKey),
  getCookieStatus: () => ipcRenderer.invoke('cookie:status'),
  deleteCookies: () => ipcRenderer.invoke('cookie:delete'),

  // ─── File System / Dialog ────────────────
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectFile: (options) => ipcRenderer.invoke('dialog:select-file', options),
  openPath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  openUrl: (url) => ipcRenderer.invoke('shell:open-url', url),
  getDownloadsPath: () => ipcRenderer.invoke('app:get-downloads-path'),
})
