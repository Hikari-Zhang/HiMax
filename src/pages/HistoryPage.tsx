import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import {
  Search, Filter, LayoutList, LayoutGrid, Trash2,
  CheckCircle, XCircle, Video, Music, Globe, User,
  Timer, HardDrive, Clock, AlertTriangle
} from 'lucide-react'
import type { DownloadTask } from '../types'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function formatDate(ts: number | null): string {
  if (!ts) return '--'
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

type ViewMode = 'list' | 'grid'
type StatusFilter = 'all' | 'completed' | 'failed'
type TypeFilter = 'all' | 'video' | 'audio'

const filterButtons: { id: StatusFilter; icon: typeof Filter }[] = [
  { id: 'all', icon: Filter },
  { id: 'completed', icon: CheckCircle },
  { id: 'failed', icon: XCircle },
]

const typeButtons: { id: TypeFilter; icon: typeof Video }[] = [
  { id: 'all', icon: Filter },
  { id: 'video', icon: Video },
  { id: 'audio', icon: Music },
]

export function HistoryPage() {
  const { t } = useTranslation()
  const { historyTasks, clearHistory } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)

  const filteredTasks = historyTasks.filter((task) => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!task.title.toLowerCase().includes(q) && !task.url.toLowerCase().includes(q) && !task.author.toLowerCase().includes(q)) {
        return false
      }
    }
    // Status filter
    if (statusFilter === 'completed' && task.status !== 'completed') return false
    if (statusFilter === 'failed' && task.status !== 'download_failed' && task.status !== 'parse_failed') return false
    // Type filter
    if (typeFilter === 'video' && ['mp3', 'm4a', 'flac', 'wav'].includes(task.format)) return false
    if (typeFilter === 'audio' && !['mp3', 'm4a', 'flac', 'wav'].includes(task.format)) return false
    return true
  })

  if (historyTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <Clock size={48} strokeWidth={1} className="mb-4 opacity-30" />
        <p className="text-base font-medium">{t('history.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-text-primary">
          {t('history.title')}
          <span className="ml-2 text-sm text-text-muted font-normal">({historyTasks.length})</span>
        </h1>
        <button
          onClick={() => setShowClearConfirm(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-error hover:bg-error/10 transition-colors"
        >
          <Trash2 size={13} />
          {t('history.clearAll')}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-bg-secondary">
          <Search size={14} className="text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('history.search')}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {filterButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setStatusFilter(btn.id)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors
                ${statusFilter === btn.id
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
                }`}
            >
              {t(`history.filter${btn.id.charAt(0).toUpperCase() + btn.id.slice(1)}`)}
            </button>
          ))}
        </div>

        {/* Type Filters */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {typeButtons.map((btn) => {
            const Icon = btn.icon
            return (
              <button
                key={btn.id}
                onClick={() => setTypeFilter(btn.id)}
                className={`p-1.5 transition-colors
                  ${typeFilter === btn.id
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
                  }`}
                title={t(`history.filter${btn.id.charAt(0).toUpperCase() + btn.id.slice(1)}`)}
              >
                <Icon size={14} />
              </button>
            )
          })}
        </div>

        {/* View Toggle */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-bg-hover'}`}
            title={t('history.listView')}
          >
            <LayoutList size={14} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-bg-hover'}`}
            title={t('history.gridView')}
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {/* Results */}
      {viewMode === 'list' ? (
        <div className="space-y-1">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_100px_80px_80px_120px] gap-3 px-3 py-2 text-[10px] text-text-muted uppercase tracking-wider font-medium">
            <span>Title</span>
            <span>Source</span>
            <span>Size</span>
            <span>Format</span>
            <span>Date</span>
          </div>
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="grid grid-cols-[1fr_100px_80px_80px_120px] gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-secondary transition-colors cursor-pointer group"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {task.status === 'completed' ? (
                    <CheckCircle size={12} className="text-success shrink-0" />
                  ) : (
                    <XCircle size={12} className="text-error shrink-0" />
                  )}
                  <span className="text-sm text-text-primary truncate">{task.title}</span>
                </div>
                <span className="text-[10px] text-text-muted ml-5">{task.author}</span>
              </div>
              <span className="text-xs text-text-secondary flex items-center">{task.sourceSite}</span>
              <span className="text-xs text-text-secondary flex items-center">{formatSize(task.filesize)}</span>
              <span className="text-xs text-text-secondary flex items-center uppercase">{task.format} {task.resolution}</span>
              <span className="text-xs text-text-muted flex items-center">{formatDate(task.completedAt || task.createdAt)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {filteredTasks.map((task) => {
            const siteColors: Record<string, string> = {
              'youtube.com': 'from-red-500/20 to-red-900/20',
              'bilibili.com': 'from-blue-400/20 to-blue-800/20',
              'vimeo.com': 'from-cyan-500/20 to-cyan-800/20',
            }
            const gradientClass = siteColors[task.sourceSite] || 'from-gray-500/20 to-gray-800/20'
            return (
              <div key={task.id} className="rounded-xl border border-border bg-bg-secondary hover:border-border-light transition-colors overflow-hidden cursor-pointer group">
                <div className={`h-28 bg-gradient-to-br ${gradientClass} flex items-center justify-center relative`}>
                  <Globe size={24} className="text-text-muted/30" />
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white">
                    {formatDuration(task.duration)}
                  </div>
                </div>
                <div className="p-2.5">
                  <h3 className="text-xs font-medium text-text-primary line-clamp-2 leading-4">{task.title}</h3>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-muted">
                    <span>{task.author}</span>
                    <span>{formatSize(task.filesize)}</span>
                    <span className="uppercase">{task.format}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Clear History Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowClearConfirm(false)}>
          <div
            className="bg-bg-primary border border-border rounded-xl p-6 w-[380px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-error/15 flex items-center justify-center">
                <AlertTriangle size={20} className="text-error" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{t('history.clearAll')}</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {t('history.clearAllConfirm', { defaultValue: `确定要清空全部下载历史吗？共 ${historyTasks.length} 条记录` })}
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 mt-3 mb-5 cursor-pointer group">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="w-4 h-4 rounded border-border text-error accent-error"
              />
              <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                {t('confirm.alsoDeleteFile')}
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowClearConfirm(false); setDeleteFiles(false) }}
                className="px-4 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:bg-bg-hover transition-colors"
              >
                {t('confirm.cancel')}
              </button>
              <button
                onClick={async () => {
                  await clearHistory(deleteFiles)
                  setShowClearConfirm(false)
                  setDeleteFiles(false)
                }}
                className="px-4 py-1.5 text-xs rounded-lg bg-error text-white hover:bg-error/90 transition-colors"
              >
                {t('confirm.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
