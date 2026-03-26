import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import type { DownloadTask } from '../types'
import {
  Pause, Play, X, RotateCcw, FolderOpen, MoreHorizontal,
  Clock, AlertTriangle, CheckCircle, Loader2, Download,
  Globe, User, Timer
} from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

interface TaskCardProps {
  task: DownloadTask
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const statusIcons: Record<string, { icon: typeof Clock; color: string }> = {
  queued: { icon: Clock, color: 'text-text-muted' },
  parsing: { icon: Loader2, color: 'text-info' },
  downloading: { icon: Download, color: 'text-accent' },
  post_processing: { icon: Loader2, color: 'text-warning' },
  completed: { icon: CheckCircle, color: 'text-success' },
  paused: { icon: Pause, color: 'text-warning' },
  cancelled: { icon: X, color: 'text-text-muted' },
  parse_failed: { icon: AlertTriangle, color: 'text-error' },
  download_failed: { icon: AlertTriangle, color: 'text-error' },
}

export function TaskCard({ task }: TaskCardProps) {
  const { t } = useTranslation()
  const { pauseTask, resumeTask, cancelTask, retryTask, removeTask, showInFolder, openFile, redownloadTask } = useAppStore()
  const [showMore, setShowMore] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const statusInfo = statusIcons[task.status] || statusIcons.queued
  const StatusIcon = statusInfo.icon
  const isActive = task.status === 'downloading'
  const isPaused = task.status === 'paused'
  const isFailed = task.status === 'download_failed' || task.status === 'parse_failed'
  const isQueued = task.status === 'queued'

  // Generate a color-coded gradient for the thumbnail placeholder
  const siteColors: Record<string, string> = {
    'youtube.com': 'from-red-500/20 to-red-900/20',
    'bilibili.com': 'from-blue-400/20 to-blue-800/20',
    'x.com': 'from-gray-400/20 to-gray-800/20',
    'tiktok.com': 'from-pink-500/20 to-purple-800/20',
    'vimeo.com': 'from-cyan-500/20 to-cyan-800/20',
  }
  const gradientClass = siteColors[task.sourceSite] || 'from-gray-500/20 to-gray-800/20'

  return (
    <div className={`group relative rounded-xl border transition-all duration-200 overflow-hidden
      ${isFailed ? 'border-error/30 bg-error/5' : 'border-border bg-bg-secondary hover:border-border-light hover:bg-bg-tertiary/50'}
    `}>
      <div className="flex p-3 gap-3">
        {/* Thumbnail */}
        <div className={`w-28 h-20 rounded-lg bg-gradient-to-br ${gradientClass} shrink-0 flex items-center justify-center overflow-hidden`}>
          <div className="text-center">
            <Globe size={20} className="mx-auto text-text-muted/50 mb-1" />
            <span className="text-[10px] text-text-muted/60">{task.sourceSite}</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="text-sm font-medium text-text-primary leading-5 line-clamp-2 flex-1">
              {task.title}
            </h3>
            <div className={`shrink-0 ${statusInfo.color}`}>
              <StatusIcon size={14} className={task.status === 'parsing' || task.status === 'post_processing' ? 'animate-spin' : ''} />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1 text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <User size={10} />
              {task.author}
            </span>
            <span className="flex items-center gap-1">
              <Globe size={10} />
              {task.sourceSite}
            </span>
            <span className="flex items-center gap-1">
              <Timer size={10} />
              {formatDuration(task.duration)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-[11px] text-text-secondary">
            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium">
              {task.resolution}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-bg-hover text-[10px] font-medium uppercase">
              {task.format}
            </span>
            {task.subtitleLang.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-bg-hover text-[10px]">
                CC: {task.subtitleLang.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Section */}
      {(isActive || isPaused || isFailed || isQueued) && (
        <div className="px-3 pb-3">
          {/* Progress Bar */}
          {task.progress > 0 && (
            <div className="relative h-1.5 bg-bg-hover rounded-full overflow-hidden mb-2">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500
                  ${isFailed ? 'bg-error' : isPaused ? 'bg-warning' : 'bg-accent'}
                  ${isActive ? 'progress-shine' : ''}
                `}
                style={{ width: `${task.progress}%` }}
              />
            </div>
          )}

          {/* Stats Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[11px] text-text-muted">
              {isActive && (
                <>
                  <span className="font-mono text-text-secondary">{task.progress.toFixed(1)}%</span>
                  <span className="text-accent font-medium">{task.speed}</span>
                  <span>{formatSize(task.downloadedSize)} / {formatSize(task.filesize)}</span>
                  <span>ETA {task.eta}</span>
                </>
              )}
              {isPaused && (
                <>
                  <span className="font-mono text-text-secondary">{task.progress.toFixed(1)}%</span>
                  <span className="text-warning">Paused</span>
                  <span>{formatSize(task.downloadedSize)} / {formatSize(task.filesize)}</span>
                </>
              )}
              {isFailed && (
                <span className="text-error text-xs">{task.error}</span>
              )}
              {isQueued && (
                <>
                  {task.progress > 0 && (
                    <span className="font-mono text-text-secondary">{task.progress.toFixed(1)}%</span>
                  )}
                  <span className="text-info">{t('downloading.queued', 'Queued')}</span>
                  {task.filesize > 0 && (
                    <span>{task.progress > 0 ? `${formatSize(task.downloadedSize)} / ` : ''}{formatSize(task.filesize)}</span>
                  )}
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              {isActive && (
                <button
                  onClick={() => pauseTask(task.id)}
                  className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-warning transition-colors"
                  title={t('downloading.pause')}
                >
                  <Pause size={14} />
                </button>
              )}
              {isPaused && (
                <button
                  onClick={() => resumeTask(task.id)}
                  className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-accent transition-colors"
                  title={t('downloading.resume')}
                >
                  <Play size={14} />
                </button>
              )}
              {isFailed && (
                <button
                  onClick={() => retryTask(task.id)}
                  className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-accent transition-colors"
                  title={t('downloading.retry')}
                >
                  <RotateCcw size={14} />
                </button>
              )}
              {(isActive || isPaused || isQueued) && (
                <button
                  onClick={() => cancelTask(task.id)}
                  className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-error transition-colors"
                  title={t('downloading.cancel')}
                >
                  <X size={14} />
                </button>
              )}
              <button
                onClick={() => {
                  const target = task.filepath || task.outputDir
                  console.log('[TaskCard] showInFolder clicked, filepath:', task.filepath, 'outputDir:', task.outputDir, 'target:', target)
                  if (target) showInFolder(target)
                }}
                className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
                title={t('downloading.openFolder')}
              >
                <FolderOpen size={14} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowMore(!showMore)}
                  className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
                  title={t('downloading.more')}
                >
                  <MoreHorizontal size={14} />
                </button>
                {showMore && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
                    <div className="absolute right-0 top-7 z-50 w-44 py-1.5 bg-bg-secondary border border-border rounded-lg shadow-xl">
                      <button
                        onClick={() => { navigator.clipboard.writeText(task.url); setShowMore(false) }}
                        className="w-full px-4 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                      >
                        Copy URL
                      </button>
                      <button
                        onClick={() => { redownloadTask(task); setShowMore(false) }}
                        className="w-full px-4 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                      >
                        Re-download
                      </button>
                      <button
                        onClick={() => { console.log('[TaskCard] openFile clicked, filepath:', task.filepath); if (task.filepath) openFile(task.filepath); setShowMore(false) }}
                        className="w-full px-4 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
                      >
                        View Log
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={() => { setShowDeleteConfirm(true); setShowMore(false) }}
                        className="w-full px-4 py-1.5 text-left text-xs text-error hover:bg-error/10 transition-colors"
                      >
                        Delete Task
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t('confirm.deleteTask')}
        message={t('confirm.deleteTaskMessage')}
        confirmLabel={t('completed.delete')}
        danger
        showDeleteFile
        onConfirm={(deleteFile) => {
          removeTask(task.id, deleteFile)
          setShowDeleteConfirm(false)
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
