import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { TaskCard } from '../components/TaskCard'
import { Download, PauseCircle, PlayCircle, Trash2 } from 'lucide-react'

export function DownloadingPage() {
  const { t } = useTranslation()
  const { downloadingTasks, pauseAll, resumeAll, clearCompleted } = useAppStore()

  const activeTasks = downloadingTasks.filter(
    (t) => t.status === 'downloading' || t.status === 'parsing' || t.status === 'post_processing'
  )
  const pausedTasks = downloadingTasks.filter((t) => t.status === 'paused')
  const queuedTasks = downloadingTasks.filter((t) => t.status === 'queued')
  const failedTasks = downloadingTasks.filter(
    (t) => t.status === 'download_failed' || t.status === 'parse_failed'
  )

  if (downloadingTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <Download size={48} strokeWidth={1} className="mb-4 opacity-30" />
        <p className="text-base font-medium">{t('downloading.empty')}</p>
        <p className="text-sm mt-1 opacity-60">{t('downloading.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-text-primary">
          {t('downloading.title')}
          <span className="ml-2 text-sm text-text-muted font-normal">({downloadingTasks.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => pauseAll()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <PauseCircle size={13} />
            {t('downloading.pauseAll')}
          </button>
          <button
            onClick={() => resumeAll()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <PlayCircle size={13} />
            {t('downloading.resumeAll')}
          </button>
          <button
            onClick={() => clearCompleted()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-text-secondary hover:bg-bg-hover hover:text-error transition-colors"
          >
            <Trash2 size={13} />
            {t('downloading.clearCompleted')}
          </button>
        </div>
      </div>

      {/* Active Downloads */}
      {activeTasks.length > 0 && (
        <div className="space-y-2">
          {activeTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Paused */}
      {pausedTasks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-warning" />
            Paused ({pausedTasks.length})
          </h2>
          {pausedTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Queued */}
      {queuedTasks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-text-muted" />
            Queued ({queuedTasks.length})
          </h2>
          {queuedTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Failed */}
      {failedTasks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-error" />
            Failed ({failedTasks.length})
          </h2>
          {failedTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
