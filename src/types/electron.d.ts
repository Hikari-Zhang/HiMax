// Type declarations for the Electron API exposed via preload

export interface ParseResult {
  success: boolean
  data?: VideoInfoData
  error?: string
}

export interface PlaylistParseResult {
  success: boolean
  data?: VideoInfoData[]
  error?: string
}

export interface VideoInfoData {
  id: string
  title: string
  thumbnail: string
  author: string
  duration: number
  sourceSite: string
  description: string
  uploadDate: string
  viewCount: number
  url: string
  formats: FormatOptionData[]
  subtitles: SubtitleData[]
  isPlaylist: boolean
  playlistCount: number
  _cookieWarning?: string
}

export interface FormatOptionData {
  id: string
  resolution: string
  format: string
  codec: string
  filesize: string
  note: string
}

export interface SubtitleData {
  lang: string
  name: string
  auto: boolean
}

export interface BinaryStatus {
  ytdlp: { installed: boolean; version: string | null; path: string }
  ffmpeg: { installed: boolean; version: string | null; path: string }
  binDir: string
}

export interface DownloadEventPayload {
  event: string
  data: any
}

export interface StatsData {
  totalDownloads: number
  totalSize: string
  todayDownloads: number
  weekDownloads: number
  sourceDistribution: Array<{ name: string; value: number; color: string }>
  formatDistribution: Array<{ name: string; value: number; color: string }>
  dailyTrend: Array<{ date: string; downloads: number; size: number }>
}

declare global {
  interface Window {
    electronAPI?: {
      // Platform Info
      platform: 'win32' | 'darwin' | 'linux'

      // Window Controls
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      onMaximizeChange: (callback: (isMaximized: boolean) => void) => void

      // Binary Management
      getBinaryStatus: () => Promise<BinaryStatus>
      ensureBinaries: () => Promise<any>
      updateYtdlp: () => Promise<string>
      downloadFfmpeg: () => Promise<string>
      setCustomYtdlp: (customPath: string) => Promise<{ success: boolean; version?: string; path?: string; error?: string }>
      setCustomFfmpeg: (customPath: string) => Promise<{ success: boolean; version?: string; path?: string; error?: string }>
      openBinDir: () => Promise<boolean>
      onBinaryProgress: (callback: (progress: any) => void) => void

      // Shortcut Management
      getShortcuts: () => Promise<Record<string, string>>
      getDefaultShortcuts: () => Promise<Record<string, string>>
      updateShortcut: (action: string, accelerator: string) => Promise<{ success: boolean; error?: string; conflictWith?: string }>
      resetAllShortcuts: () => Promise<{ success: boolean; shortcuts?: Record<string, string> }>
      validateShortcut: (accelerator: string) => Promise<{ valid: boolean }>
      onShortcutTriggered: (callback: (action: string) => void) => void

      // Network / Proxy
      testProxy: (settings: any) => Promise<{ success: boolean; latency?: number; error?: string }>

      // URL Parsing
      parseUrl: (url: string, options?: any) => Promise<ParseResult>
      parsePlaylist: (url: string, options?: any) => Promise<PlaylistParseResult>

      // Download Management
      addDownload: (videoInfo: any, downloadOptions: any) => Promise<{ success: boolean; data?: any }>
      pauseDownload: (taskId: string) => Promise<boolean>
      resumeDownload: (taskId: string) => Promise<boolean>
      cancelDownload: (taskId: string) => Promise<boolean>
      retryDownload: (taskId: string) => Promise<boolean>
      removeDownload: (taskId: string, deleteFile?: boolean) => Promise<boolean>
      pauseAllDownloads: () => Promise<boolean>
      resumeAllDownloads: () => Promise<boolean>
      getTasks: () => Promise<{ downloading: any[]; completed: any[]; history: any[] }>
      getAllTasks: () => Promise<any[]>
      clearHistory: (deleteFiles?: boolean) => Promise<{ success: boolean; count: number }>
      clearCompleted: (deleteFiles?: boolean) => Promise<{ success: boolean; count: number }>
      getStats: () => Promise<StatsData>
      onDownloadEvent: (callback: (payload: DownloadEventPayload) => void) => void

      // Settings
      loadSettings: () => Promise<Record<string, any>>
      updateSettings: (settings: any) => Promise<boolean>
      setLoginItem: (enabled: boolean) => Promise<boolean>
      getLoginItem: () => Promise<boolean>

      // Cookie Management
      exportCookies: (browser: string, profile?: string) => Promise<{ success: boolean; path?: string; size?: number; error?: string; browserRunning?: boolean }>
      importCookies: (filePath: string) => Promise<{ success: boolean; path?: string; size?: number; error?: string }>
      saveCookieText: (cookieText: string) => Promise<{ success: boolean; path?: string; size?: number; error?: string }>
      saveSiteCookies: (siteKey: string, cookieString: string) => Promise<{ success: boolean; path?: string; size?: number; count?: number; error?: string }>
      getSavedCookieSites: () => Promise<{ sites: Array<{ key: string; name: string; domain: string; cookieCount: number }> }>
      deleteSiteCookies: (siteKey: string) => Promise<{ success: boolean; error?: string }>
      getCookieStatus: () => Promise<{ exists: boolean; path?: string; size?: number; ageHours?: number; isValid?: boolean; lastModified?: string; error?: string }>
      deleteCookies: () => Promise<{ success: boolean; error?: string }>

      // File System / Dialog
      selectFolder: () => Promise<string | null>
      selectFile: (options?: any) => Promise<string | null>
      openPath: (filePath: string) => Promise<boolean>
      showInFolder: (filePath: string) => Promise<boolean>
      openUrl: (url: string) => Promise<boolean>
      getDownloadsPath: () => Promise<string>
    }
  }
}
