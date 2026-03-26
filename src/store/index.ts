import { create } from 'zustand'
import type { DownloadTask, TaskStatus, VideoInfo } from '../types'
import type { VideoInfoData, StatsData } from '../types/electron.d'
import { mockDownloadingTasks, mockCompletedTasks, mockHistoryTasks } from '../mock/data'
import i18n from '../i18n'

// Check if we're running inside Electron
// Use a getter function to handle cases where electronAPI might not be ready at module init time
const getIsElectron = () => !!window.electronAPI?.parseUrl
const isElectron = getIsElectron()
console.log('[Store] isElectron:', isElectron, 'electronAPI:', !!window.electronAPI, 'parseUrl:', !!window.electronAPI?.parseUrl)

interface AppState {
  // Theme
  theme: 'dark' | 'light'
  toggleTheme: () => void

  // Navigation
  currentPage: string
  setCurrentPage: (page: string) => void

  // Download tasks
  downloadingTasks: DownloadTask[]
  completedTasks: DownloadTask[]
  historyTasks: DownloadTask[]

  // URL input
  urlInput: string
  setUrlInput: (url: string) => void
  isParsingUrl: boolean
  showVideoPreview: boolean
  setShowVideoPreview: (show: boolean) => void
  parsedVideoInfo: VideoInfoData | null
  parseError: string | null

  // Clipboard monitoring
  clipboardMonitor: boolean
  toggleClipboardMonitor: () => void

  // Task operations
  pauseTask: (id: string) => void
  resumeTask: (id: string) => void
  cancelTask: (id: string) => void
  retryTask: (id: string) => void
  removeTask: (id: string, deleteFile?: boolean) => void
  pauseAll: () => void
  resumeAll: () => void
  clearHistory: (deleteFiles?: boolean) => Promise<void>
  clearCompleted: (deleteFiles?: boolean) => Promise<void>

  // File operations
  openFile: (filepath: string) => Promise<void>
  showInFolder: (filepath: string) => Promise<void>
  redownloadTask: (task: DownloadTask) => Promise<void>

  // URL parsing (real)
  parseUrl: (url: string) => Promise<void>
  startDownload: (videoInfo: VideoInfoData, options: any) => Promise<void>

  // Task loading
  loadTasks: () => Promise<void>

  // Stats
  stats: StatsData | null
  loadStats: () => Promise<void>

  // Binary status
  binaryStatus: { ytdlp: any; ffmpeg: any } | null
  binaryLoading: boolean
  checkBinaries: () => Promise<void>

  // Settings
  settings: {
    language: string
    defaultDir: string
    defaultQuality: string
    defaultFormat: string
    defaultSubtitle: string
    subtitleFormat: string
    filenameTemplate: string
    fileConflict: string
    maxConcurrent: number
    speedLimit: number
    proxyMode: string
    proxyType: string
    proxyHost: string
    proxyPort: string
    proxyUsername: string
    proxyPassword: string
    autoUpdateYtdlp: boolean
    customYtdlpPath: string
    customFfmpegPath: string
    clipboardWhitelist: string[]
    scheduledDownload: boolean
    scheduleStart: string
    scheduleEnd: string
    cookieMode: string       // 'none' | 'browser' | 'file'
    cookieBrowser: string    // 'chrome' | 'edge' | 'firefox' | 'opera' | 'brave' | 'chromium' | 'vivaldi' | 'safari'
    cookieProfile: string    // browser profile name (optional)
    cookieFile: string       // path to Netscape cookie.txt file
    launchAtStartup: boolean
    minimizeToTray: boolean
    closeAction: string      // 'minimize' | 'quit'
    autoUpdate: boolean
    afterComplete: string    // 'notify' | 'none'
    theme: string            // 'dark' | 'light'
    shortcuts: Record<string, string>  // action -> accelerator string
  }
  updateSetting: (key: string, value: any) => void
  loadSettings: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'dark',
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('light', newTheme === 'light')
    const newSettings = { ...state.settings, theme: newTheme }
    if (isElectron) {
      window.electronAPI!.updateSettings(newSettings)
    }
    return { theme: newTheme, settings: newSettings }
  }),

  currentPage: 'downloading',
  setCurrentPage: (page) => set({ currentPage: page }),

  // Initialize with mock data if not in Electron, empty if in Electron
  downloadingTasks: isElectron ? [] : mockDownloadingTasks,
  completedTasks: isElectron ? [] : mockCompletedTasks,
  historyTasks: isElectron ? [] : mockHistoryTasks,

  urlInput: '',
  setUrlInput: (url) => set({ urlInput: url }),
  isParsingUrl: false,
  showVideoPreview: false,
  setShowVideoPreview: (show) => set({ showVideoPreview: show }),
  parsedVideoInfo: null,
  parseError: null,

  clipboardMonitor: false,
  toggleClipboardMonitor: () => set((state) => ({ clipboardMonitor: !state.clipboardMonitor })),

  // ─── Task operations ────────────────

  pauseTask: async (id) => {
    if (isElectron) {
      await window.electronAPI!.pauseDownload(id)
    } else {
      set((state) => ({
        downloadingTasks: state.downloadingTasks.map((t) =>
          t.id === id ? { ...t, status: 'paused' as TaskStatus } : t
        ),
      }))
    }
  },

  resumeTask: async (id) => {
    if (isElectron) {
      await window.electronAPI!.resumeDownload(id)
    } else {
      set((state) => ({
        downloadingTasks: state.downloadingTasks.map((t) =>
          t.id === id ? { ...t, status: 'downloading' as TaskStatus } : t
        ),
      }))
    }
  },

  cancelTask: async (id) => {
    if (isElectron) {
      await window.electronAPI!.cancelDownload(id)
    } else {
      set((state) => ({
        downloadingTasks: state.downloadingTasks.filter((t) => t.id !== id),
      }))
    }
  },

  retryTask: async (id) => {
    if (isElectron) {
      await window.electronAPI!.retryDownload(id)
    }
  },

  removeTask: async (id, deleteFile = false) => {
    if (isElectron) {
      await window.electronAPI!.removeDownload(id, deleteFile)
    }
  },

  pauseAll: async () => {
    if (isElectron) {
      await window.electronAPI!.pauseAllDownloads()
    }
  },

  resumeAll: async () => {
    if (isElectron) {
      await window.electronAPI!.resumeAllDownloads()
    }
  },

  clearHistory: async (deleteFiles = false) => {
    if (isElectron) {
      await window.electronAPI!.clearHistory(deleteFiles)
    } else {
      // Mock mode: just clear the history tasks
      set({ historyTasks: [] })
    }
  },

  clearCompleted: async (deleteFiles = false) => {
    if (isElectron) {
      await window.electronAPI!.clearCompleted(deleteFiles)
    } else {
      // Mock mode: remove completed from all lists
      set((state) => ({
        downloadingTasks: state.downloadingTasks.filter((t) => t.status !== 'completed'),
        completedTasks: [],
        historyTasks: state.historyTasks.filter((t) => t.status !== 'completed'),
      }))
    }
  },

  // ─── File operations ────────────────

  openFile: async (filepath: string) => {
    console.log('[Store.openFile] called with filepath:', filepath, 'isElectron:', isElectron)
    if (isElectron && filepath) {
      const result = await window.electronAPI!.openPath(filepath)
      console.log('[Store.openFile] shell.openPath result:', result)
    } else {
      console.warn('[Store.openFile] Skipped: isElectron=', isElectron, 'filepath=', filepath)
    }
  },

  showInFolder: async (filepath: string) => {
    console.log('[Store.showInFolder] called with filepath:', filepath, 'isElectron:', isElectron)
    if (isElectron && filepath) {
      const result = await window.electronAPI!.showInFolder(filepath)
      console.log('[Store.showInFolder] showItemInFolder result:', result)
    } else {
      console.warn('[Store.showInFolder] Skipped: isElectron=', isElectron, 'filepath=', filepath)
    }
  },

  redownloadTask: async (task: DownloadTask) => {
    if (!isElectron) return
    // Remove old task first (without deleting the file)
    await window.electronAPI!.removeDownload(task.id, false)
    // Re-add as new download
    const videoInfo = {
      url: task.url,
      title: task.title,
      thumbnail: task.thumbnail,
      author: task.author,
      duration: task.duration,
      sourceSite: task.sourceSite,
    }
    await window.electronAPI!.addDownload(videoInfo, {
      url: task.url,
      format: task.format,
      resolution: task.resolution,
      outputDir: task.outputDir,
      filename: task.filename,
      subtitleLangs: task.subtitleLang,
      filesize: 0,
    })
  },

  // ─── URL Parsing (real) ────────────────

  parseUrl: async (url: string) => {
    // Re-check isElectron at call time (in case electronAPI was injected after module init)
    const electronReady = getIsElectron()
    console.log('[Store.parseUrl] called with url:', url, 'isElectron:', isElectron, 'electronReady:', electronReady)

    if (!isElectron && !electronReady) {
      // Mock mode: just show the preview modal after delay
      console.log('[Store.parseUrl] Running in MOCK mode')
      set({ isParsingUrl: true })
      await new Promise((r) => setTimeout(r, 1500))
      set({ isParsingUrl: false, showVideoPreview: true })
      return
    }

    set({ isParsingUrl: true, parseError: null, parsedVideoInfo: null })

    try {
      console.log('[Store.parseUrl] Calling electronAPI.parseUrl...')
      const result = await window.electronAPI!.parseUrl(url, {
        settings: get().settings,
      })
      console.log('[Store.parseUrl] Result:', JSON.stringify(result).substring(0, 500))

      if (result.success && result.data) {
        if (result.data._cookieWarning) {
          console.warn('[Store.parseUrl] Cookie warning:', result.data._cookieWarning)
        }
        console.log('[Store.parseUrl] SUCCESS - setting parsedVideoInfo, title:', result.data.title)
        set({
          isParsingUrl: false,
          parsedVideoInfo: result.data,
          showVideoPreview: true,
          parseError: null,
        })
      } else {
        console.log('[Store.parseUrl] FAILED - error:', result.error)
        set({
          isParsingUrl: false,
          parseError: result.error || 'Unknown error',
        })
      }
    } catch (e: any) {
      console.error('[Store.parseUrl] EXCEPTION:', e)
      set({
        isParsingUrl: false,
        parseError: e.message || 'Parse failed',
      })
    }
  },

  // ─── Start Download (real) ────────────────

  startDownload: async (videoInfo, options) => {
    if (!isElectron) return

    try {
      await window.electronAPI!.addDownload(videoInfo, options)
      set({ showVideoPreview: false, urlInput: '' })
    } catch (e) {
      console.error('Failed to start download:', e)
    }
  },

  // ─── Load Tasks from backend ────────────────

  loadTasks: async () => {
    if (!isElectron) return

    try {
      const tasks = await window.electronAPI!.getTasks()
      set({
        downloadingTasks: tasks.downloading,
        completedTasks: tasks.completed,
        historyTasks: tasks.history,
      })
    } catch (e) {
      console.error('Failed to load tasks:', e)
    }
  },

  // ─── Binary Status ────────────────

  stats: null,

  loadStats: async () => {
    if (isElectron) {
      try {
        const stats = await window.electronAPI!.getStats()
        set({ stats })
      } catch (e) {
        console.error('Failed to load stats:', e)
      }
    } else {
      // Mock mode: generate from mock data
      const { mockStatsData } = await import('../mock/data')
      set({ stats: mockStatsData as StatsData })
    }
  },

  binaryStatus: null,
  binaryLoading: false,

  checkBinaries: async () => {
    if (!isElectron) return

    set({ binaryLoading: true })
    try {
      const status = await window.electronAPI!.getBinaryStatus()
      set({ binaryStatus: status, binaryLoading: false })

      // Auto-download if missing
      if (!status.ytdlp.installed || !status.ffmpeg.installed) {
        await window.electronAPI!.ensureBinaries()
        const newStatus = await window.electronAPI!.getBinaryStatus()
        set({ binaryStatus: newStatus })
      }
    } catch (e) {
      console.error('Failed to check binaries:', e)
      set({ binaryLoading: false })
    }
  },

  // ─── Settings ────────────────

  settings: {
    language: 'zh',
    defaultDir: 'D:\\Videos\\Downloads',
    defaultQuality: 'best',
    defaultFormat: 'mp4',
    defaultSubtitle: 'none',
    subtitleFormat: 'srt',
    filenameTemplate: '{title}',
    fileConflict: 'rename',
    maxConcurrent: 3,
    speedLimit: 0,
    proxyMode: 'none',
    proxyType: 'http',
    proxyHost: '',
    proxyPort: '',
    proxyUsername: '',
    proxyPassword: '',
    autoUpdateYtdlp: true,
    customYtdlpPath: '',
    customFfmpegPath: '',
    clipboardWhitelist: [],
    scheduledDownload: false,
    scheduleStart: '01:00',
    scheduleEnd: '06:00',
    cookieMode: 'none',
    cookieBrowser: 'edge',
    cookieProfile: '',
    cookieFile: '',
    launchAtStartup: false,
    minimizeToTray: false,
    closeAction: 'quit',
    autoUpdate: true,
    afterComplete: 'notify',
    theme: 'dark',
    shortcuts: {
      pasteAndDownload: 'Ctrl+V',
      pauseAll: 'Ctrl+Shift+P',
      resumeAll: 'Ctrl+Shift+R',
      openSettings: 'Ctrl+,',
      toggleClipboard: 'Ctrl+Shift+C',
      globalShow: 'Ctrl+Shift+D',
    },
  },
  updateSetting: (key, value) => {
    set((state) => {
      const newSettings = { ...state.settings, [key]: value }
      // Sync to backend
      if (isElectron) {
        window.electronAPI!.updateSettings(newSettings)
        // Handle special settings that need Electron API calls
        if (key === 'launchAtStartup') {
          window.electronAPI!.setLoginItem(value as boolean)
        }
      }
      // Handle theme change
      if (key === 'theme') {
        document.documentElement.classList.toggle('light', value === 'light')
        return { settings: newSettings, theme: value as string }
      }
      return { settings: newSettings }
    })
  },
  loadSettings: async () => {
    if (!isElectron) return
    try {
      const saved = await window.electronAPI!.loadSettings()
      if (saved && typeof saved === 'object') {
        set((state) => ({
          settings: { ...state.settings, ...saved },
          // Sync top-level theme from saved settings
          ...(saved.theme ? { theme: saved.theme } : {}),
        }))
        // Apply loaded theme
        if (saved.theme) {
          document.documentElement.classList.toggle('light', saved.theme === 'light')
        }
        // Apply loaded language
        if (saved.language) {
          i18n.changeLanguage(saved.language)
        }
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  },
}))

// ─── Setup event listeners from backend ────────────────


// Debounced loaders to avoid IPC race conditions when rapid events arrive
let _loadTasksTimer: ReturnType<typeof setTimeout> | null = null
let _loadStatsTimer: ReturnType<typeof setTimeout> | null = null

const debouncedLoadTasks = () => {
  if (_loadTasksTimer) clearTimeout(_loadTasksTimer)
  _loadTasksTimer = setTimeout(() => {
    useAppStore.getState().loadTasks()
  }, 150)
}

const debouncedLoadStats = () => {
  if (_loadStatsTimer) clearTimeout(_loadStatsTimer)
  _loadStatsTimer = setTimeout(() => {
    useAppStore.getState().loadStats()
  }, 500)
}

if (isElectron) {
  // Listen for download events from main process
  window.electronAPI!.onDownloadEvent(({ event, data }) => {
    switch (event) {
      case 'task-added':
      case 'task-removed':
        // Full reload needed for structural changes (new/removed tasks)
        debouncedLoadTasks()
        debouncedLoadStats()
        break

      case 'task-updated': {
        // Optimization: if the event includes full task data, update in-place first
        // for instant UI feedback, then schedule a full reload as backup
        if (data && data.id && data.status) {
          useAppStore.setState((state) => {
            const isNowComplete = data.status === 'completed'
            const isNowFailed = data.status === 'download_failed' || data.status === 'parse_failed'
            const wasInDownloading = state.downloadingTasks.some((t) => t.id === data.id)

            if (wasInDownloading && isNowComplete) {
              // Move from downloading to completed immediately
              return {
                downloadingTasks: state.downloadingTasks.filter((t) => t.id !== data.id),
                completedTasks: [data as DownloadTask, ...state.completedTasks],
              }
            }

            // For other status changes, update in-place in downloadingTasks
            return {
              downloadingTasks: state.downloadingTasks.map((t) =>
                t.id === data.id ? { ...t, ...data } : t
              ),
              // Also update if it's in completedTasks
              completedTasks: state.completedTasks.map((t) =>
                t.id === data.id ? { ...t, ...data } : t
              ),
            }
          })
        }
        // Always schedule a full reload as backup (ensures consistency)
        debouncedLoadTasks()
        debouncedLoadStats()
        break
      }

      case 'task-progress': {
        // Update progress in-place without full reload (performance)
        // Only update tasks that are actively downloading or post-processing
        const { id, progress, speed, eta, filesize, downloadedSize } = data
        useAppStore.setState((state) => ({
          downloadingTasks: state.downloadingTasks.map((t) =>
            t.id === id && (t.status === 'downloading' || t.status === 'post_processing')
              ? {
                  ...t,
                  progress,
                  speed,
                  eta,
                  ...(filesize && filesize > 0 ? { filesize } : {}),
                  ...(downloadedSize && downloadedSize > 0 ? { downloadedSize } : {}),
                }
              : t
          ),
        }))
        break
      }
    }
  })

  // Initial load
  setTimeout(() => {
    useAppStore.getState().loadSettings()
    useAppStore.getState().loadTasks()
    useAppStore.getState().checkBinaries()
    useAppStore.getState().loadStats()
  }, 500)

  // Get real downloads path (fallback if settings don't have it)
  window.electronAPI!.getDownloadsPath().then((downloadPath) => {
    const currentDir = useAppStore.getState().settings.defaultDir
    // Only override if still using hardcoded default
    if (currentDir === 'D:\\Videos\\Downloads' || !currentDir) {
      useAppStore.setState((state) => ({
        settings: { ...state.settings, defaultDir: downloadPath },
      }))
    }
  })
}
