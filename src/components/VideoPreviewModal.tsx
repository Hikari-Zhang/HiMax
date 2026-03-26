import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { mockVideoInfo } from '../mock/data'
import type { VideoInfoData } from '../types/electron.d'
import {
  X, Download, FolderOpen, Globe, User, Timer,
  ChevronDown, Check, Image
} from 'lucide-react'

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Check if running inside Electron
const isElectron = !!window.electronAPI?.parseUrl

export function VideoPreviewModal() {
  const { t } = useTranslation()
  const { setShowVideoPreview, setUrlInput, settings, parsedVideoInfo, startDownload } = useAppStore()

  // Use real data if available, fall back to mock ONLY when not in Electron
  const video: VideoInfoData = parsedVideoInfo || (mockVideoInfo as unknown as VideoInfoData)

  console.log('[VideoPreviewModal] isElectron:', isElectron, 'parsedVideoInfo:', parsedVideoInfo ? `{title: "${parsedVideoInfo.title}"}` : 'null', 'using mock:', !parsedVideoInfo)

  const formats = video.formats || []
  const subtitles = isElectron
    ? (video.subtitles || []).map((s: any) => typeof s === 'string' ? s : s.name || s.lang)
    : (mockVideoInfo.subtitles || [])

  // Pick initial format based on settings.defaultQuality
  const getDefaultFormatId = () => {
    if (formats.length === 0) return '2'
    // If user set a quality preference, try to match
    const quality = settings.defaultQuality
    if (quality && quality !== 'best') {
      const match = formats.find((f) => f.resolution === quality)
      if (match) return match.id
    }
    // Otherwise pick recommended or first
    return formats.find((f) => f.note?.toLowerCase().includes('recommend'))?.id || formats[0]?.id || ''
  }

  // Pick initial subtitles based on settings.defaultSubtitle
  const getDefaultSubtitles = () => {
    const pref = settings.defaultSubtitle
    if (!pref || pref === 'none') return []
    if (pref === 'all') return [...subtitles]
    // Try to find a matching subtitle
    const match = subtitles.find((s: string) => s.toLowerCase().startsWith(pref.toLowerCase()))
    return match ? [match] : []
  }

  // Build initial filename from template
  const getDefaultFilename = () => {
    const template = settings.filenameTemplate || '{title}'
    const vars: Record<string, string> = {
      title: video.title || 'video',
      author: video.author || 'Unknown',
      date: video.uploadDate || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      resolution: '', // Will be determined at download time
      id: video.id || '',
    }
    let name = template
    for (const [key, val] of Object.entries(vars)) {
      name = name.replace(new RegExp(`\\{${key}\\}`, 'g'), val)
    }
    // Sanitize for filesystem
    name = name.replace(/[<>:"/\\|?*]/g, '_').trim()
    if (name.length > 200) name = name.substring(0, 200)
    name = name.replace(/[. ]+$/, '')
    return name || 'video'
  }

  const [selectedFormat, setSelectedFormat] = useState(getDefaultFormatId)
  const [selectedSubtitles, setSelectedSubtitles] = useState<string[]>(getDefaultSubtitles)
  const [outputDir, setOutputDir] = useState(settings.defaultDir)
  const [filename, setFilename] = useState(getDefaultFilename)
  const [showFormatDropdown, setShowFormatDropdown] = useState(false)
  const [showSubtitleDropdown, setShowSubtitleDropdown] = useState(false)
  const [thumbnailError, setThumbnailError] = useState(false)

  const currentFormat = formats.find((f) => f.id === selectedFormat) || formats[0]

  useEffect(() => {
    if (video.title) setFilename(getDefaultFilename())
  }, [video.title])

  const handleClose = () => {
    setShowVideoPreview(false)
  }

  const handleSelectFolder = async () => {
    if (isElectron) {
      const folder = await window.electronAPI!.selectFolder()
      if (folder) setOutputDir(folder)
    }
  }

  const handleDownload = async () => {
    if (isElectron && parsedVideoInfo) {
      // Real download
      const ext = currentFormat?.resolution?.toLowerCase().includes('audio') ? 'mp3' : (currentFormat?.format?.toLowerCase() || 'mp4')
      await startDownload(parsedVideoInfo, {
        url: parsedVideoInfo.url,
        format: ext,
        resolution: currentFormat?.resolution || 'best',
        outputDir,
        filename: `${filename}.${ext}`,
        subtitleLangs: selectedSubtitles,
        filesize: 0,
      })
    } else {
      // Mock mode
      setShowVideoPreview(false)
      setUrlInput('')
    }
  }

  const toggleSubtitle = (lang: string) => {
    setSelectedSubtitles((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] max-h-[85vh] bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary" style={{ marginLeft: 5 }}>{t('videoPreview.title')}</h2>
          <button
            onClick={handleClose}
            style={{ marginRight: 5 }}
            className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ paddingLeft: 29, paddingRight: 29 }}>
          {/* Video Info */}
          <div className="flex gap-4">
            <div className="w-40 h-24 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 shrink-0 flex items-center justify-center overflow-hidden">
              {video.thumbnail && !thumbnailError ? (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={() => setThumbnailError(true)}
                />
              ) : (
                <Image size={24} className="text-text-muted/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-text-primary leading-5 line-clamp-2">{video.title}</h3>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
                <span className="flex items-center gap-1"><User size={10} />{video.author}</span>
                <span className="flex items-center gap-1"><Timer size={10} />{formatDuration(video.duration)}</span>
                <span className="flex items-center gap-1"><Globe size={10} />{video.sourceSite}</span>
              </div>
            </div>
          </div>

          {/* Format Selection */}
          {formats.length > 0 && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-text-secondary">{t('videoPreview.quality')} / {t('videoPreview.format')}</label>
              <div className="relative">
                <button
                  onClick={() => setShowFormatDropdown(!showFormatDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm text-text-primary hover:border-border-light transition-colors"
                >
                  <span>
                    {currentFormat?.resolution} ({currentFormat?.format}) — {currentFormat?.codec} {currentFormat?.filesize}
                    {currentFormat?.note && <span className="ml-2 text-accent text-xs">{currentFormat.note}</span>}
                  </span>
                  <ChevronDown size={14} className={`text-text-muted transition-transform ${showFormatDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showFormatDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowFormatDropdown(false)} />
                    <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-bg-secondary border border-border rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto">
                      {formats.map((fmt) => (
                        <button
                          key={fmt.id}
                          onClick={() => { setSelectedFormat(fmt.id); setShowFormatDropdown(false) }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors
                            ${fmt.id === selectedFormat ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}
                        >
                          <span>
                            {fmt.resolution} ({fmt.format}) — {fmt.codec} {fmt.filesize}
                            {fmt.note && <span className="ml-2 text-accent">{fmt.note}</span>}
                          </span>
                          {fmt.id === selectedFormat && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Subtitle Selection */}
          {subtitles.length > 0 && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-text-secondary">{t('videoPreview.subtitle')}</label>
              <div className="relative">
                <button
                  onClick={() => setShowSubtitleDropdown(!showSubtitleDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm text-text-primary hover:border-border-light transition-colors"
                >
                  <span>
                    {selectedSubtitles.length > 0
                      ? selectedSubtitles.join(', ')
                      : t('settings.download.subtitleNone')
                    }
                  </span>
                  <ChevronDown size={14} className={`text-text-muted transition-transform ${showSubtitleDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showSubtitleDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSubtitleDropdown(false)} />
                    <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-bg-secondary border border-border rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto">
                      {subtitles.map((lang: string) => (
                        <button
                          key={lang}
                          onClick={() => toggleSubtitle(lang)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors
                            ${selectedSubtitles.includes(lang) ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`}
                        >
                          <span>{lang}</span>
                          {selectedSubtitles.includes(lang) && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Save To */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-text-secondary">{t('videoPreview.saveTo')}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm text-text-primary">
                <FolderOpen size={14} className="text-text-muted shrink-0" />
                <span className="truncate">{outputDir}</span>
              </div>
              <button
                onClick={handleSelectFolder}
                className="px-3 py-2 rounded-lg border border-border bg-bg-primary text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
              >
                {t('settings.download.browse')}
              </button>
            </div>
          </div>

          {/* Filename */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-text-secondary">{t('videoPreview.filename')}</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border" style={{ paddingLeft: 29, paddingRight: 29 }}>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover transition-colors"
          >
            {t('videoPreview.cancel')}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors shadow-sm"
          >
            <Download size={14} />
            {t('videoPreview.download')}
          </button>
        </div>
      </div>
    </div>
  )
}
