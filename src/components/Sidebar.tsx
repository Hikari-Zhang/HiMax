import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { Download, CheckCircle, Clock, BarChart3, Settings } from 'lucide-react'

const navItems = [
  { id: 'downloading', icon: Download, badge: true },
  { id: 'completed', icon: CheckCircle, badge: true },
  { id: 'history', icon: Clock, badge: false },
  { id: 'stats', icon: BarChart3, badge: false },
  { id: 'settings', icon: Settings, badge: false },
]

export function Sidebar() {
  const { t } = useTranslation()
  const { currentPage, setCurrentPage, downloadingTasks, completedTasks } = useAppStore()

  const getBadge = (id: string) => {
    if (id === 'downloading') {
      const active = downloadingTasks.filter(
        (t) => t.status === 'downloading' || t.status === 'queued' || t.status === 'paused' || t.status === 'post_processing'
      ).length
      return active > 0 ? active : null
    }
    if (id === 'completed') return completedTasks.length > 0 ? completedTasks.length : null
    return null
  }

  return (
    <aside className="w-[68px] bg-bg-secondary border-r border-border flex flex-col items-center py-3 gap-1 shrink-0 theme-transition">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = currentPage === item.id
        const badge = getBadge(item.id)

        return (
          <button
            key={item.id}
            onClick={() => setCurrentPage(item.id)}
            className={`relative w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all duration-200 group
              ${isActive
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
              }`}
            title={t(`nav.${item.id}`)}
          >
            <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
            <span className="text-[9px] mt-0.5 leading-none font-medium">
              {t(`nav.${item.id}`)}
            </span>
            {badge !== null && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </aside>
  )
}
