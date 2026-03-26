export type TaskStatus =
  | 'queued'
  | 'parsing'
  | 'downloading'
  | 'post_processing'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'parse_failed'
  | 'download_failed'

export interface DownloadTask {
  id: string
  url: string
  title: string
  thumbnail: string
  author: string
  duration: number
  sourceSite: string
  format: string
  resolution: string
  subtitleLang: string[]
  outputDir: string
  filename: string
  status: TaskStatus
  progress: number
  speed: string
  eta: string
  filesize: number
  downloadedSize: number
  error: string | null
  retryCount: number
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  filepath: string | null
}

export interface VideoInfo {
  title: string
  thumbnail: string
  author: string
  duration: number
  sourceSite: string
  formats: FormatOption[]
  subtitles: string[]
}

export interface FormatOption {
  id: string
  resolution: string
  format: string
  codec: string
  filesize: string
  note: string
}
