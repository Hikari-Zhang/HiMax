import { useEffect } from 'react'
import { useAppStore } from './store'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { UrlInputBar } from './components/UrlInputBar'
import { StatusBar } from './components/StatusBar'
import { DownloadingPage } from './pages/DownloadingPage'
import { CompletedPage } from './pages/CompletedPage'
import { HistoryPage } from './pages/HistoryPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'
import { VideoPreviewModal } from './components/VideoPreviewModal'

/**
 * Known video site domains (without protocol) for recognizing bare URLs from clipboard
 */
const VIDEO_SITE_PATTERNS = [
  'youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com',
  'bilibili.com', 'www.bilibili.com', 'b23.tv',
  'douyin.com', 'www.douyin.com', 'v.douyin.com', 'iesdouyin.com',
  'twitter.com', 'x.com', 'vimeo.com', 'dailymotion.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
  'instagram.com', 'www.instagram.com',
  'facebook.com', 'www.facebook.com', 'fb.watch',
  'weibo.com', 'video.weibo.com',
  'ixigua.com', 'www.ixigua.com',
  'kuaishou.com', 'www.kuaishou.com', 'v.kuaishou.com',
  'nicovideo.jp', 'www.nicovideo.jp',
  'twitch.tv', 'www.twitch.tv',
  'reddit.com', 'www.reddit.com',
  'v.qq.com', 'y.qq.com',
]

/**
 * Extract URL from text that may contain extra content (e.g. Douyin share text).
 * Also handles bare domain URLs without protocol prefix (e.g. "bilibili.com/video/xxx").
 */
function extractUrl(text: string): string {
  const trimmed = text.trim()
  // Already a full URL with protocol
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed
  // Try to find a URL with protocol in the text
  const match = trimmed.match(/https?:\/\/[^\s<>"{}|\\^`]+/i)
  if (match) {
    return match[0].replace(/[,;:!?。，；：！？)）\]】》]+$/, '')
  }
  // Check if it looks like a bare domain URL (no protocol) — e.g. "bilibili.com/video/xxx"
  const lower = trimmed.toLowerCase()
  for (const domain of VIDEO_SITE_PATTERNS) {
    if (lower.startsWith(domain + '/') || lower === domain) {
      return 'https://' + trimmed
    }
    // Also handle "www." variants
    if (lower.startsWith('www.' + domain + '/') || lower === 'www.' + domain) {
      return 'https://' + trimmed
    }
  }
  // Generic fallback: if it looks like a domain (xxx.yyy/...), add https://
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/\S*)?$/.test(trimmed)) {
    return 'https://' + trimmed
  }
  return trimmed
}

function App() {
  const currentPage = useAppStore((s) => s.currentPage)
  const showVideoPreview = useAppStore((s) => s.showVideoPreview)

  // ─── Register shortcut handler from main process ────
  useEffect(() => {
    const isElectron = !!window.electronAPI?.onShortcutTriggered
    if (!isElectron) return

    const handleShortcut = async (action: string) => {
      const store = useAppStore.getState()
      console.log('[App] Shortcut triggered:', action)

      switch (action) {
        case 'pasteAndDownload': {
          // If user is focused on an input/textarea, let normal paste work — skip shortcut action
          const activeEl = document.activeElement
          const isInInput = activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement).isContentEditable
          )
          if (isInInput) {
            console.log('[App] pasteAndDownload: skipped, focus is in input field')
            break
          }

          // Read clipboard, set URL, and auto-parse
          try {
            const text = await navigator.clipboard.readText()
            console.log('[App] Clipboard text:', text)
            const url = extractUrl(text)
            console.log('[App] Extracted URL:', url)
            if (url && /^https?:\/\//i.test(url)) {
              store.setUrlInput(url)
              store.parseUrl(url)
            } else {
              console.log('[App] Clipboard does not contain a valid URL:', text)
            }
          } catch (err) {
            console.warn('[App] Failed to read clipboard:', err)
          }
          break
        }

        case 'pauseAll':
          if (window.electronAPI?.pauseAllDownloads) {
            await window.electronAPI.pauseAllDownloads()
          }
          break

        case 'resumeAll':
          if (window.electronAPI?.resumeAllDownloads) {
            await window.electronAPI.resumeAllDownloads()
          }
          break

        case 'openSettings':
          store.setCurrentPage('settings')
          break

        case 'toggleClipboard':
          // Toggle clipboard monitoring setting
          store.updateSetting('clipboardMonitor', !store.settings.clipboardMonitor)
          break

        default:
          console.log('[App] Unhandled shortcut action:', action)
      }
    }

    window.electronAPI!.onShortcutTriggered(handleShortcut)
  }, [])

  const renderPage = () => {
    switch (currentPage) {
      case 'downloading': return <DownloadingPage />
      case 'completed': return <CompletedPage />
      case 'history': return <HistoryPage />
      case 'stats': return <StatsPage />
      case 'settings': return <SettingsPage />
      default: return <DownloadingPage />
    }
  }

  return (
    <div className="h-full flex flex-col theme-transition bg-bg-primary text-text-primary">
      {/* Title Bar */}
      <TitleBar />

      {/* URL Input Bar */}
      <UrlInputBar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </main>
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Video Preview Modal */}
      {showVideoPreview && <VideoPreviewModal />}
    </div>
  )
}

export default App
