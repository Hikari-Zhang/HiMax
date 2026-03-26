import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { Clipboard, Play, Link, Loader2, AlertCircle, X } from 'lucide-react'

export function UrlInputBar() {
  const { t } = useTranslation()
  const { urlInput, setUrlInput, isParsingUrl, parseError, parseUrl } = useAppStore()
  const [isFocused, setIsFocused] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showFullError, setShowFullError] = useState(false)

  /**
   * Extract URL from pasted text (e.g. Douyin/TikTok share messages contain
   * titles, hashtags and extra text alongside the actual URL).
   */
  const extractUrl = (text: string): string => {
    const trimmed = text.trim()
    // Already a clean URL
    if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed
    // Try to find a URL in the text
    const match = trimmed.match(/https?:\/\/[^\s<>"{}|\\^`]+/i)
    if (match) {
      // Clean trailing punctuation
      return match[0].replace(/[,;:!?。，；：！？)）\]】》]+$/, '')
    }
    return trimmed
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setUrlInput(extractUrl(text))
    } catch {
      // clipboard permission denied
    }
  }

  const handleParse = () => {
    if (!urlInput.trim() || isParsingUrl) return
    parseUrl(urlInput.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleParse()
    }
  }

  return (
    <div
      className={`mx-5 mt-3 mb-2 shrink-0 theme-transition ${isDragOver ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-primary rounded-lg' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        const text = e.dataTransfer.getData('text/plain')
        if (text) setUrlInput(extractUrl(text))
      }}
    >
      <div
        className={`flex items-center gap-2 rounded-lg border transition-all duration-200 px-3 py-2
          ${isFocused
            ? 'border-accent bg-bg-secondary shadow-lg shadow-accent/5'
            : 'border-border bg-bg-secondary hover:border-border-light'
          }
          ${isDragOver ? 'border-accent bg-accent/5' : ''}
        `}
      >
        <Link size={16} className="text-text-muted shrink-0" style={{ marginLeft: 5 }} />
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text')
            const extracted = extractUrl(pasted)
            if (extracted !== pasted) {
              e.preventDefault()
              setUrlInput(extracted)
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={t('urlInput.placeholder')}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
        />
        {parseError && (
          <button
            onClick={() => setShowFullError(!showFullError)}
            className="flex items-center gap-1 text-error text-xs shrink-0 hover:text-red-300 transition-colors"
            title={parseError}
          >
            <AlertCircle size={13} />
            <span className="max-w-[200px] truncate">{parseError.split('\n')[0]}</span>
          </button>
        )}
        <button
          onClick={handlePaste}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <Clipboard size={13} />
          {t('urlInput.paste')}
        </button>
        <button
          onClick={handleParse}
          disabled={!urlInput.trim() || isParsingUrl}
          style={{ marginRight: 5 }}
          className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-all duration-200
            ${urlInput.trim() && !isParsingUrl
              ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
              : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
            }`}
        >
          {isParsingUrl ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>...</span>
            </>
          ) : (
            <>
              <Play size={13} />
              {t('urlInput.parse')}
            </>
          )}
        </button>
      </div>

      {/* Expanded error panel */}
      {parseError && showFullError && (
        <div className="mt-1.5 mx-0.5 p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-300 relative">
          <button
            onClick={() => setShowFullError(false)}
            className="absolute top-2 right-2 text-red-400/60 hover:text-red-300 transition-colors"
          >
            <X size={14} />
          </button>
          <div className="flex gap-2 pr-6">
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <pre className="whitespace-pre-wrap font-sans leading-relaxed break-words">{parseError}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
