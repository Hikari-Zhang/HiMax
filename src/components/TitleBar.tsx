import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { Minus, Square, Copy, X, Moon, Sun, Globe } from 'lucide-react'
import '../types/electron.d'

export function TitleBar() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useAppStore()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Check initial maximize state
    window.electronAPI?.isMaximized().then(setIsMaximized)
    // Listen for changes
    window.electronAPI?.onMaximizeChange(setIsMaximized)
  }, [])

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(newLang)
  }

  const handleMinimize = () => window.electronAPI?.minimize()
  const handleMaximize = () => window.electronAPI?.maximize()
  const handleClose = () => window.electronAPI?.close()

  return (
    <div className="drag-region flex items-center justify-between h-10 px-4 bg-bg-secondary border-b border-border shrink-0 theme-transition">
      {/* Left: App Title */}
      <div className="flex items-center gap-2 no-drag" style={{ marginLeft: 5 }}>
        <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-text-primary">{t('app.name')}</span>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1 no-drag" style={{ marginRight: 5 }}>
        {/* Language Toggle */}
        <button
          onClick={toggleLanguage}
          className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title={i18n.language === 'zh' ? 'Switch to English' : '切换到中文'}
        >
          <Globe size={14} />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Window Controls */}
        <button
          onClick={handleMinimize}
          className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={handleClose}
          className="p-1.5 rounded-md hover:bg-red-500/20 text-text-secondary hover:text-red-400 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
