import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import {
  CheckCircle, Play, FolderOpen, RotateCcw, Trash2,
  Globe, User, Timer, HardDrive
} from 'lucide-react'
import type { DownloadTask } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(ts: number | null): string {
  if (!ts) return '--'
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function CompletedCard({ task, onDelete }: { task: DownloadTask; onDelete: (task: DownloadTask) => void }) {
  const { t } = useTranslation()
  const { openFile, showInFolder, redownloadTask } = useAppStore()

  const siteColors: Record<string, string> = {
    'youtube.com': 'from-red-500/20 to-red-900/20',
    'bilibili.com': 'from-blue-400/20 to-blue-800/20',
    'vimeo.com': 'from-cyan-500/20 to-cyan-800/20',
  }
  const gradientClass = siteColors[task.sourceSite] || 'from-gray-500/20 to-gray-800/20'

  const handlePlay = () => {
    console.log('[CompletedCard.handlePlay] task.filepath:', task.filepath)
    if (task.filepath) openFile(task.filepath)
  }

  const handleOpenFolder = () => {
    const target = task.filepath || task.outputDir
    console.log('[CompletedCard.handleOpenFolder] filepath:', task.filepath, 'outputDir:', task.outputDir, 'target:', target)
    if (target) showInFolder(target)
  }

  const handleRedownload = () => {
    redownloadTask(task)
  }

  return (
    <div className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-bg-secondary hover:border-border-light hover:bg-bg-tertiary/50 transition-all duration-200">
      {/* Thumbnail */}
      <div className={`relative w-24 h-16 rounded-lg bg-gradient-to-br ${gradientClass} shrink-0 flex items-center justify-center overflow-hidden group`}>
        <Globe size={16} className="text-text-muted/40" />
        {/* Play overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onClick={handlePlay}
        >
          <Play size={20} fill="white" className="text-white" />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-text-primary leading-5 truncate">{task.title}</h3>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-text-muted">
          <span className="flex items-center gap-1"><User size={10} />{task.author}</span>
          <span className="flex items-center gap-1"><Timer size={10} />{formatDuration(task.duration)}</span>
          <span className="flex items-center gap-1"><HardDrive size={10} />{formatSize(task.filesize)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium">
            {task.resolution}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-bg-hover text-[10px] font-medium uppercase">
            {task.format}
          </span>
          <span className="text-[10px] text-text-muted">
            {formatDate(task.completedAt)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handlePlay} className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-accent transition-colors" title={t('completed.play')}>
          <Play size={14} />
        </button>
        <button onClick={handleOpenFolder} className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors" title={t('completed.openFolder')}>
          <FolderOpen size={14} />
        </button>
        <button onClick={handleRedownload} className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors" title={t('completed.redownload')}>
          <RotateCcw size={14} />
        </button>
        <button onClick={() => onDelete(task)} className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-error transition-colors" title={t('completed.delete')}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

export function CompletedPage() {
  const { t } = useTranslation()
  const { completedTasks, removeTask } = useAppStore()
  const [deleteTarget, setDeleteTarget] = useState<DownloadTask | null>(null)

  const handleDeleteRequest = (task: DownloadTask) => {
    setDeleteTarget(task)
  }

  const handleDeleteConfirm = (deleteFile: boolean) => {
    if (deleteTarget) {
      removeTask(deleteTarget.id, deleteFile)
      setDeleteTarget(null)
    }
  }

  if (completedTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <CheckCircle size={48} strokeWidth={1} className="mb-4 opacity-30" />
        <p className="text-base font-medium">{t('completed.empty')}</p>
        <p className="text-sm mt-1 opacity-60">{t('completed.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-text-primary">
          {t('completed.title')}
          <span className="ml-2 text-sm text-text-muted font-normal">({completedTasks.length})</span>
        </h1>
      </div>

      <div className="space-y-2">
        {completedTasks.map((task) => (
          <CompletedCard key={task.id} task={task} onDelete={handleDeleteRequest} />
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('confirm.deleteTask')}
        message={t('confirm.deleteTaskMessage')}
        confirmLabel={t('completed.delete')}
        danger
        showDeleteFile
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
