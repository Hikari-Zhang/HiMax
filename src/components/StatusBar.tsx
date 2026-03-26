import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { Circle, Download, ListOrdered, Clipboard } from 'lucide-react'

export function StatusBar() {
  const { t } = useTranslation()
  const { downloadingTasks, clipboardMonitor, toggleClipboardMonitor, settings } = useAppStore()

  const activeTasks = downloadingTasks.filter(
    (t) => t.status === 'downloading' || t.status === 'parsing' || t.status === 'post_processing'
  ).length
  const queuedTasks = downloadingTasks.filter((t) => t.status === 'queued').length
  const totalSpeed = downloadingTasks
    .filter((t) => t.status === 'downloading')
    .reduce((sum, t) => {
      // Match formats: "5.20MiB/s", "5.2 MB/s", "500KiB/s", "1.2 GiB/s", "500.00B/s" etc.
      const match = t.speed?.match(/([\d.]+)\s*(GiB|GB|MiB|MB|KiB|KB|B)(?:\/s)?/i)
      if (!match) return sum
      const val = parseFloat(match[1])
      const unit = match[2].toUpperCase()
      if (unit === 'GIB' || unit === 'GB') return sum + val * 1024
      if (unit === 'MIB' || unit === 'MB') return sum + val
      if (unit === 'KIB' || unit === 'KB') return sum + val / 1024
      if (unit === 'B') return sum + val / (1024 * 1024)
      return sum
    }, 0)
  const maxConcurrent = settings.maxConcurrent || 3

  return (
    <div className="h-7 px-4 flex items-center gap-4 text-[11px] text-text-muted bg-bg-secondary border-t border-border shrink-0 theme-transition">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5" style={{ marginLeft: 5 }}>
        <Circle
          size={7}
          fill={activeTasks > 0 ? '#22c55e' : '#666'}
          stroke="none"
        />
        <span>{activeTasks > 0 ? t('status.active') : t('status.ready')}</span>
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Active downloads */}
      <div className="flex items-center gap-1">
        <Download size={11} />
        <span>{t('status.active')}: {activeTasks}/{maxConcurrent}</span>
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Queue */}
      <div className="flex items-center gap-1">
        <ListOrdered size={11} />
        <span>{t('status.queue')}: {queuedTasks}</span>
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Speed */}
      <div className="flex items-center gap-1">
        <Download size={11} />
        <span>{t('status.speed')}: {totalSpeed.toFixed(1)} MB/s</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clipboard monitor toggle */}
      <button
        onClick={toggleClipboardMonitor}
        style={{ marginRight: 5 }}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors
          ${clipboardMonitor
            ? 'text-accent bg-accent/10'
            : 'text-text-muted hover:text-text-secondary'
          }`}
      >
        <Clipboard size={10} />
        <span>{t('status.clipboard')}: {clipboardMonitor ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  )
}
