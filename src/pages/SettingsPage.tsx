import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import {
  Settings, Download, Wifi, Cookie, Cpu, Keyboard, Info,
  FolderOpen, ChevronDown, ExternalLink, Shield, Check,
  Upload, Globe, Globe2, Trash2, RefreshCw, FileText, Save
} from 'lucide-react'

const tabs = [
  { id: 'general', icon: Settings },
  { id: 'download', icon: Download },
  { id: 'network', icon: Wifi },
  { id: 'cookie', icon: Cookie },
  { id: 'engine', icon: Cpu },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'about', icon: Info },
]

// Reusable components
function SettingRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-b-0">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0 ml-4">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${checked ? 'bg-accent' : 'bg-bg-hover border border-border'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Select({ value, options, onChange }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (val: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

// Tab Panels
function GeneralPanel() {
  const { t, i18n } = useTranslation()
  const { theme, settings, updateSetting } = useAppStore()

  return (
    <div className="space-y-1">
      <SettingRow label={t('settings.general.language')}>
        <Select
          value={i18n.language}
          options={[
            { value: 'zh', label: '简体中文' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(val) => {
            i18n.changeLanguage(val)
            updateSetting('language', val)
          }}
        />
      </SettingRow>
      <SettingRow label={t('settings.general.theme')}>
        <Select
          value={theme}
          options={[
            { value: 'dark', label: t('settings.general.themeDark') },
            { value: 'light', label: t('settings.general.themeLight') },
          ]}
          onChange={(val) => {
            if (val !== theme) {
              updateSetting('theme', val)
            }
          }}
        />
      </SettingRow>
      <SettingRow label={t('settings.general.launchAtStartup')}>
        <Toggle checked={settings.launchAtStartup} onChange={(v) => updateSetting('launchAtStartup', v)} />
      </SettingRow>
      <SettingRow label={t('settings.general.minimizeToTray')}>
        <Toggle checked={settings.minimizeToTray} onChange={(v) => updateSetting('minimizeToTray', v)} />
      </SettingRow>
      <SettingRow label={t('settings.general.closeAction')}>
        <Select
          value={settings.closeAction}
          options={[
            { value: 'minimize', label: t('settings.general.closeMinimize') },
            { value: 'quit', label: t('settings.general.closeQuit') },
          ]}
          onChange={(val) => updateSetting('closeAction', val)}
        />
      </SettingRow>
      <SettingRow label={t('settings.general.autoUpdate')}>
        <Toggle checked={settings.autoUpdate} onChange={(v) => updateSetting('autoUpdate', v)} />
      </SettingRow>
    </div>
  )
}

function DownloadPanel() {
  const { t } = useTranslation()
  const { settings, updateSetting } = useAppStore()

  return (
    <div className="space-y-1">
      <SettingRow label={t('settings.download.defaultDir')}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary max-w-[200px] truncate">{settings.defaultDir}</span>
          <button
            className="px-2 py-1 rounded-md border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
            onClick={async () => {
              const isElectron = typeof window !== 'undefined' && !!window.electronAPI
              if (isElectron) {
                const folder = await window.electronAPI!.selectFolder()
                if (folder) {
                  updateSetting('defaultDir', folder)
                }
              }
            }}
          >
            <FolderOpen size={12} className="inline mr-1" />
            {t('settings.download.browse')}
          </button>
        </div>
      </SettingRow>
      <SettingRow label={t('settings.download.defaultQuality')}>
        <Select
          value={settings.defaultQuality}
          options={[
            { value: 'best', label: t('settings.download.qualityBest') },
            { value: '1080p', label: '1080p' },
            { value: '720p', label: '720p' },
            { value: '480p', label: '480p' },
            { value: '360p', label: '360p' },
          ]}
          onChange={(val) => updateSetting('defaultQuality', val)}
        />
      </SettingRow>
      <SettingRow label={t('settings.download.defaultFormat')}>
        <Select
          value={settings.defaultFormat}
          options={[
            { value: 'mp4', label: 'MP4' },
            { value: 'mkv', label: 'MKV' },
            { value: 'webm', label: 'WebM' },
          ]}
          onChange={(val) => updateSetting('defaultFormat', val)}
        />
      </SettingRow>
      <SettingRow label={t('settings.download.defaultSubtitle')}>
        <Select
          value={settings.defaultSubtitle}
          options={[
            { value: 'none', label: t('settings.download.subtitleNone') },
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
            { value: 'all', label: 'All Available' },
          ]}
          onChange={(val) => updateSetting('defaultSubtitle', val)}
        />
      </SettingRow>
      <SettingRow label={t('settings.download.subtitleFormat')}>
        <Select
          value={settings.subtitleFormat}
          options={[
            { value: 'srt', label: 'SRT' },
            { value: 'ass', label: 'ASS' },
            { value: 'vtt', label: 'VTT' },
          ]}
          onChange={(val) => updateSetting('subtitleFormat', val)}
        />
      </SettingRow>
      <SettingRow
        label={t('settings.download.filenameTemplate')}
        description="Variables: {title} {author} {date} {resolution} {id}"
      >
        <input
          type="text"
          value={settings.filenameTemplate}
          onChange={(e) => updateSetting('filenameTemplate', e.target.value)}
          className="w-40 px-2 py-1 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent"
        />
      </SettingRow>
      <SettingRow label={t('settings.download.fileConflict')}>
        <Select
          value={settings.fileConflict}
          options={[
            { value: 'rename', label: t('settings.download.conflictRename') },
            { value: 'overwrite', label: t('settings.download.conflictOverwrite') },
            { value: 'skip', label: t('settings.download.conflictSkip') },
          ]}
          onChange={(val) => updateSetting('fileConflict', val)}
        />
      </SettingRow>
      <SettingRow label={t('settings.download.maxConcurrent')}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={10}
            value={settings.maxConcurrent}
            onChange={(e) => updateSetting('maxConcurrent', parseInt(e.target.value))}
            className="w-24 accent-accent"
          />
          <span className="text-sm font-mono text-text-primary w-6 text-center">{settings.maxConcurrent}</span>
        </div>
      </SettingRow>
      <SettingRow label={t('settings.download.speedLimit')}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={settings.speedLimit === 0 ? '' : settings.speedLimit}
            onChange={(e) => updateSetting('speedLimit', parseInt(e.target.value) || 0)}
            placeholder={t('settings.download.speedUnlimited')}
            className="w-24 px-2 py-1 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent text-right"
          />
          <span className="text-xs text-text-muted">MB/s</span>
        </div>
      </SettingRow>
      <SettingRow label={t('settings.download.afterComplete')}>
        <Select
          value={settings.afterComplete}
          options={[
            { value: 'notify', label: t('settings.download.notify') },
            { value: 'none', label: t('settings.download.noAction') },
          ]}
          onChange={(val) => updateSetting('afterComplete', val)}
        />
      </SettingRow>
    </div>
  )
}

function NetworkPanel() {
  const { t } = useTranslation()
  const { settings, updateSetting } = useAppStore()
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    latency?: number
  } | null>(null)

  const handleTestProxy = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const isElectron = typeof window !== 'undefined' && !!window.electronAPI
      if (isElectron && window.electronAPI?.testProxy) {
        const result = await window.electronAPI.testProxy(settings)
        if (result.success) {
          setTestResult({
            success: true,
            message: t('settings.network.testSuccess'),
            latency: result.latency,
          })
        } else {
          let message = t('settings.network.testFailed')
          if (result.error === 'PROXY_UNREACHABLE') {
            message = t('settings.network.testUnreachable')
          } else if (result.error === 'PROXY_AUTH_FAILED') {
            message = t('settings.network.testAuthFailed')
          } else if (result.error === 'PROXY_TIMEOUT') {
            message = t('settings.network.testTimeout')
          } else if (result.error === 'PROXY_REFUSED') {
            message = t('settings.network.testRefused')
          } else if (result.error) {
            message = result.error
          }
          setTestResult({
            success: false,
            message,
            latency: result.latency,
          })
        }
      } else {
        // Mock mode
        await new Promise((r) => setTimeout(r, 1500))
        setTestResult({
          success: true,
          message: t('settings.network.testSuccess'),
          latency: 230,
        })
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || t('settings.network.testFailed'),
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-1">
      <SettingRow label={t('settings.network.proxyMode')}>
        <Select
          value={settings.proxyMode}
          options={[
            { value: 'none', label: t('settings.network.proxyNone') },
            { value: 'system', label: t('settings.network.proxySystem') },
            { value: 'manual', label: t('settings.network.proxyManual') },
          ]}
          onChange={(val) => {
            updateSetting('proxyMode', val)
            setTestResult(null)
          }}
        />
      </SettingRow>

      {/* System proxy hint */}
      {settings.proxyMode === 'system' && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border/40">
          <Info size={13} className="text-text-muted shrink-0 mt-0.5" />
          <p className="text-xs text-text-muted">{t('settings.network.systemProxyHint')}</p>
        </div>
      )}

      {settings.proxyMode === 'manual' && (
        <>
          <SettingRow label={t('settings.network.proxyType')}>
            <Select
              value={settings.proxyType}
              options={[
                { value: 'http', label: 'HTTP' },
                { value: 'https', label: 'HTTPS' },
                { value: 'socks5', label: 'SOCKS5' },
              ]}
              onChange={(val) => updateSetting('proxyType', val)}
            />
          </SettingRow>
          <SettingRow label={t('settings.network.proxyHost')}>
            <input
              type="text"
              value={settings.proxyHost}
              onChange={(e) => updateSetting('proxyHost', e.target.value)}
              placeholder="127.0.0.1"
              className="w-36 px-2 py-1 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent"
            />
          </SettingRow>
          <SettingRow label={t('settings.network.proxyPort')}>
            <input
              type="text"
              value={settings.proxyPort}
              onChange={(e) => updateSetting('proxyPort', e.target.value)}
              placeholder="7890"
              className="w-24 px-2 py-1 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent"
            />
          </SettingRow>
          <SettingRow label={t('settings.network.proxyUsername')}>
            <input
              type="text"
              value={settings.proxyUsername}
              onChange={(e) => updateSetting('proxyUsername', e.target.value)}
              placeholder={t('settings.network.optional')}
              className="w-36 px-2 py-1 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent"
            />
          </SettingRow>
          <SettingRow label={t('settings.network.proxyPassword')}>
            <input
              type="password"
              value={settings.proxyPassword}
              onChange={(e) => updateSetting('proxyPassword', e.target.value)}
              placeholder={t('settings.network.optional')}
              className="w-36 px-2 py-1 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent"
            />
          </SettingRow>
        </>
      )}

      {/* Test connection button + result */}
      {settings.proxyMode !== 'none' && (
        <div className="pt-3 space-y-2.5">
          <button
            onClick={handleTestProxy}
            disabled={isTesting || (settings.proxyMode === 'manual' && (!settings.proxyHost || !settings.proxyPort))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isTesting
                ? 'bg-accent/50 text-white/70 cursor-wait'
                : settings.proxyMode === 'manual' && (!settings.proxyHost || !settings.proxyPort)
                  ? 'bg-accent/30 text-white/40 cursor-not-allowed'
                  : 'bg-accent text-white hover:bg-accent-hover'
            }`}
          >
            {isTesting ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                {t('settings.network.testing')}
              </>
            ) : (
              <>
                <Shield size={13} />
                {t('settings.network.testConnection')}
              </>
            )}
          </button>

          {/* Test result */}
          {testResult && testResult.success && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
              <Check size={14} className="text-green-400 shrink-0" />
              <div className="text-xs">
                <span className="text-green-400 font-medium">{testResult.message}</span>
                {testResult.latency !== undefined && (
                  <span className="text-text-muted ml-2">
                    {t('settings.network.latency')}: {(testResult.latency / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
          )}

          {testResult && !testResult.success && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <Info size={14} className="text-red-400 shrink-0" />
              <div className="text-xs">
                <span className="text-red-400 font-medium">{testResult.message}</span>
                {testResult.latency !== undefined && (
                  <span className="text-text-muted ml-2">
                    ({(testResult.latency / 1000).toFixed(1)}s)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CookiePanel() {
  const { t } = useTranslation()
  const { settings, updateSetting } = useAppStore()
  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<{
    success: boolean
    message: string
    type?: 'success' | 'error' | 'warning' | 'dpapi'
  } | null>(null)
  const [cookieStatus, setCookieStatus] = useState<{
    exists: boolean
    path?: string
    size?: number
    ageHours?: number
    isValid?: boolean
    lastModified?: string
  } | null>(null)
  const [selectedSite, setSelectedSite] = useState('')
  const [siteCookieValue, setSiteCookieValue] = useState('')
  const [isSavingSite, setIsSavingSite] = useState(false)
  const [savedSites, setSavedSites] = useState<Array<{ key: string; name: string; domain: string; cookieCount: number }>>([])
  const [customDomain, setCustomDomain] = useState('')

  const browserOptions = [
    { value: 'firefox', label: 'Firefox (推荐 / Recommended)' },
    { value: 'chrome', label: 'Google Chrome' },
    { value: 'edge', label: 'Microsoft Edge' },
    { value: 'brave', label: 'Brave' },
    { value: 'opera', label: 'Opera' },
    { value: 'chromium', label: 'Chromium' },
    { value: 'vivaldi', label: 'Vivaldi' },
    { value: 'safari', label: 'Safari (macOS)' },
  ]

  const browserDisplayNames: Record<string, string> = {
    chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', brave: 'Brave',
    opera: 'Opera', chromium: 'Chromium', vivaldi: 'Vivaldi', safari: 'Safari',
  }

  const siteOptions = [
    { value: 'bilibili', label: 'Bilibili (B站)' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'douyin', label: '抖音 / Douyin' },
    { value: 'twitter', label: 'Twitter / X' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'twitch', label: 'Twitch' },
    { value: 'nicovideo', label: 'NicoNico' },
    { value: 'vimeo', label: 'Vimeo' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'dailymotion', label: 'Dailymotion' },
    { value: '__custom__', label: t('settings.cookie.customSite') },
  ]

  // Load cookie status on mount and after export
  const refreshCookieStatus = async () => {
    if (window.electronAPI?.getCookieStatus) {
      const status = await window.electronAPI.getCookieStatus()
      setCookieStatus(status)
    }
  }

  const refreshSavedSites = async () => {
    if (window.electronAPI?.getSavedCookieSites) {
      const result = await window.electronAPI.getSavedCookieSites()
      setSavedSites(result.sites || [])
    }
  }

  // Initial load
  useState(() => {
    refreshCookieStatus()
    refreshSavedSites()
  })

  const handleExportCookies = async () => {
    if (!settings.cookieBrowser) {
      setExportResult({ success: false, message: t('settings.cookie.selectBrowserFirst'), type: 'warning' })
      return
    }

    setIsExporting(true)
    setExportResult(null)

    try {
      if (window.electronAPI?.exportCookies) {
        const result = await window.electronAPI.exportCookies(
          settings.cookieBrowser,
          settings.cookieProfile || ''
        )
        if (result.success) {
          setExportResult({
            success: true,
            message: t('settings.cookie.exportSuccess'),
            type: 'success',
          })
          await refreshCookieStatus()
        } else if (result.browserRunning) {
          // Browser is still running
          const browserName = browserDisplayNames[settings.cookieBrowser] || settings.cookieBrowser
          setExportResult({
            success: false,
            message: t('settings.cookie.browserRunning', { browser: browserName }),
            type: 'warning',
          })
        } else if (result.error?.startsWith('DPAPI_ERROR:')) {
          // DPAPI decryption failure
          setExportResult({
            success: false,
            message: result.error,
            type: 'dpapi',
          })
        } else if (result.error === 'EMPTY_COOKIES') {
          setExportResult({
            success: false,
            message: t('settings.cookie.emptyCookies'),
            type: 'warning',
          })
        } else {
          setExportResult({
            success: false,
            message: result.error || t('settings.cookie.exportFailed'),
            type: 'error',
          })
        }
      }
    } catch (e: any) {
      setExportResult({ success: false, message: e.message, type: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportCookies = async () => {
    if (!window.electronAPI?.selectFile || !window.electronAPI?.importCookies) return

    const filePath = await window.electronAPI.selectFile({
      filters: [{ name: 'Cookie Files', extensions: ['txt'] }],
    })
    if (!filePath) return

    const result = await window.electronAPI.importCookies(filePath)
    if (result.success) {
      setExportResult({
        success: true,
        message: t('settings.cookie.importSuccess'),
        type: 'success',
      })
      await refreshCookieStatus()
    } else if (result.error === 'INVALID_FORMAT') {
      setExportResult({
        success: false,
        message: t('settings.cookie.importInvalidFormat'),
        type: 'error',
      })
    } else {
      setExportResult({
        success: false,
        message: result.error || t('settings.cookie.importFailed'),
        type: 'error',
      })
    }
  }

  const handleDeleteCookies = async () => {
    if (window.electronAPI?.deleteCookies) {
      await window.electronAPI.deleteCookies()
      setCookieStatus(null)
      setExportResult(null)
      await refreshCookieStatus()
    }
  }

  const handleSelectCookieFile = async () => {
    if (window.electronAPI?.selectFile) {
      const filePath = await window.electronAPI.selectFile({
        filters: [{ name: 'Cookie Files', extensions: ['txt'] }],
      })
      if (filePath) {
        updateSetting('cookieFile', filePath)
      }
    }
  }

  const handleSaveSiteCookies = async () => {
    // Determine the effective site key: either a preset or custom domain
    const effectiveSiteKey = selectedSite === '__custom__' ? customDomain.trim() : selectedSite

    if (!effectiveSiteKey) {
      setExportResult({
        success: false,
        message: selectedSite === '__custom__'
          ? t('settings.cookie.customDomainEmpty')
          : t('settings.cookie.selectSitePlaceholder'),
        type: 'warning',
      })
      return
    }

    // Validate custom domain format
    if (selectedSite === '__custom__' && !effectiveSiteKey.includes('.')) {
      setExportResult({
        success: false,
        message: t('settings.cookie.customDomainInvalid'),
        type: 'warning',
      })
      return
    }

    if (!siteCookieValue.trim()) {
      setExportResult({
        success: false,
        message: t('settings.cookie.manualInputEmpty'),
        type: 'warning',
      })
      return
    }

    setIsSavingSite(true)
    setExportResult(null)

    try {
      if (window.electronAPI?.saveSiteCookies) {
        const result = await window.electronAPI.saveSiteCookies(effectiveSiteKey, siteCookieValue)
        if (result.success) {
          setExportResult({
            success: true,
            message: t('settings.cookie.manualInputSuccess'),
            type: 'success',
          })
          setSiteCookieValue('')
          setSelectedSite('')
          setCustomDomain('')
          await refreshCookieStatus()
          await refreshSavedSites()
        } else if (result.error === 'NO_VALID_COOKIES') {
          setExportResult({
            success: false,
            message: t('settings.cookie.noValidCookies'),
            type: 'error',
          })
        } else if (result.error === 'UNKNOWN_SITE') {
          setExportResult({
            success: false,
            message: t('settings.cookie.unknownSite'),
            type: 'error',
          })
        } else {
          setExportResult({
            success: false,
            message: result.error || t('settings.cookie.importFailed'),
            type: 'error',
          })
        }
      }
    } catch (e: any) {
      setExportResult({ success: false, message: e.message, type: 'error' })
    } finally {
      setIsSavingSite(false)
    }
  }

  const handleDeleteSiteCookie = async (siteKey: string) => {
    if (window.electronAPI?.deleteSiteCookies) {
      const result = await window.electronAPI.deleteSiteCookies(siteKey)
      if (result.success) {
        await refreshCookieStatus()
        await refreshSavedSites()
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* 说明提示 */}
      <div className="text-xs text-text-muted bg-bg-tertiary rounded-lg p-3 space-y-1.5">
        <p className="flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>{t('settings.cookie.hint')}</span>
        </p>
        <p className="text-amber-400/80 ml-4">
          {t('settings.cookie.bilibiliHint')}
        </p>
      </div>

      {/* Cookie模式选择 */}
      <SettingRow label={t('settings.cookie.mode')} description={t('settings.cookie.modeDesc')}>
        <Select
          value={settings.cookieMode}
          options={[
            { value: 'none', label: t('settings.cookie.modeNone') },
            { value: 'browser', label: t('settings.cookie.modeBrowser') },
            { value: 'file', label: t('settings.cookie.modeFile') },
          ]}
          onChange={(val) => updateSetting('cookieMode', val)}
        />
      </SettingRow>

      {/* 从浏览器读取模式 */}
      {settings.cookieMode === 'browser' && (
        <>
          <SettingRow label={t('settings.cookie.browser')} description={t('settings.cookie.browserDesc')}>
            <Select
              value={settings.cookieBrowser}
              options={browserOptions}
              onChange={(val) => updateSetting('cookieBrowser', val)}
            />
          </SettingRow>
          <SettingRow label={t('settings.cookie.profile')} description={t('settings.cookie.profileDesc')}>
            <input
              type="text"
              value={settings.cookieProfile}
              onChange={(e) => updateSetting('cookieProfile', e.target.value)}
              placeholder="Default"
              className="w-36 px-2 py-1 rounded-lg border border-border bg-bg-primary text-sm text-text-primary outline-none focus:border-accent"
            />
          </SettingRow>

          {/* Export Cookie 区域 */}
          <div className="p-3 rounded-lg border border-border bg-bg-primary space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary font-medium">{t('settings.cookie.exportTitle')}</p>
                <p className="text-xs text-text-muted mt-0.5">{t('settings.cookie.exportDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                {cookieStatus?.exists && (
                  <button
                    onClick={handleDeleteCookies}
                    className="px-2 py-1 rounded-md border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={12} className="inline mr-1" />
                    {t('settings.cookie.delete')}
                  </button>
                )}
                <button
                  onClick={handleExportCookies}
                  disabled={isExporting}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    isExporting
                      ? 'bg-accent/50 text-white/70 cursor-wait'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  }`}
                >
                  {isExporting ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      {t('settings.cookie.exporting')}
                    </>
                  ) : (
                    <>
                      <Download size={12} />
                      {t('settings.cookie.exportBtn')}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Cookie 文件状态 */}
            {cookieStatus?.exists && cookieStatus.isValid && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-green-500/10 border border-green-500/20">
                <Check size={14} className="text-green-400 shrink-0" />
                <div className="text-xs">
                  <span className="text-green-400 font-medium">{t('settings.cookie.fileReady')}</span>
                  <span className="text-text-muted ml-2">
                    {cookieStatus.ageHours !== undefined && cookieStatus.ageHours < 1
                      ? t('settings.cookie.justExported')
                      : `${cookieStatus.ageHours?.toFixed(1)}h ago`
                    }
                    {cookieStatus.size ? ` · ${(cookieStatus.size / 1024).toFixed(1)} KB` : ''}
                  </span>
                </div>
              </div>
            )}

            {cookieStatus?.exists && !cookieStatus.isValid && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                <Info size={14} className="text-amber-400 shrink-0" />
                <span className="text-xs text-amber-400">{t('settings.cookie.fileExpired')}</span>
              </div>
            )}

            {/* Export/Import 结果提示 */}
            {exportResult && exportResult.type === 'success' && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-green-500/10 border border-green-500/20">
                <Check size={14} className="text-green-400 shrink-0" />
                <span className="text-xs text-green-400">{exportResult.message}</span>
              </div>
            )}

            {exportResult && exportResult.type === 'warning' && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                <Shield size={14} className="text-amber-400 shrink-0" />
                <span className="text-xs text-amber-400">{exportResult.message}</span>
              </div>
            )}

            {exportResult && exportResult.type === 'error' && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-red-500/10 border border-red-500/20">
                <Info size={14} className="text-red-400 shrink-0" />
                <span className="text-xs text-red-400">{exportResult.message}</span>
              </div>
            )}

            {/* DPAPI 专用错误提示（带解决方案） */}
            {exportResult && exportResult.type === 'dpapi' && (
              <div className="px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-red-400 shrink-0" />
                  <span className="text-xs text-red-400 font-medium">{t('settings.cookie.dpapiError')}</span>
                </div>
                <div className="text-xs text-text-muted space-y-1 ml-5">
                  <p>{t('settings.cookie.dpapiSolution1')}</p>
                  <p>{t('settings.cookie.dpapiSolution2')}</p>
                  <p>{t('settings.cookie.dpapiSolution3')}</p>
                </div>
              </div>
            )}
          </div>

          {/* 手动导入 Cookie 区域 */}
          <div className="p-3 rounded-lg border border-border/60 bg-bg-primary space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary font-medium">{t('settings.cookie.importTitle')}</p>
                <p className="text-xs text-text-muted mt-0.5">{t('settings.cookie.importDesc')}</p>
              </div>
              <button
                onClick={handleImportCookies}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:text-text-primary hover:border-border-light transition-colors flex items-center gap-1.5"
              >
                <Upload size={12} />
                {t('settings.cookie.importBtn')}
              </button>
            </div>
            <p className="text-[11px] text-text-muted flex items-start gap-1.5">
              <ExternalLink size={11} className="shrink-0 mt-0.5" />
              <span>{t('settings.cookie.extensionHint')}</span>
            </p>
          </div>

          {/* 按网站添加 Cookie */}
          <div className="p-3 rounded-lg border border-border/60 bg-bg-primary space-y-3">
            <div>
              <p className="text-sm text-text-primary font-medium flex items-center gap-1.5">
                <FileText size={14} />
                {t('settings.cookie.manualInputTitle')}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{t('settings.cookie.manualInputDesc')}</p>
            </div>

            {/* 选择网站 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary shrink-0">{t('settings.cookie.selectSite')}</span>
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-bg-tertiary text-xs text-text-primary outline-none focus:border-accent appearance-none cursor-pointer"
              >
                <option value="">{t('settings.cookie.selectSitePlaceholder')}</option>
                {siteOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* 自定义域名输入 */}
            {selectedSite === '__custom__' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary shrink-0">{t('settings.cookie.customDomainLabel')}</span>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder={t('settings.cookie.customDomainPlaceholder')}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-bg-tertiary text-xs text-text-primary font-mono outline-none focus:border-accent"
                  spellCheck={false}
                />
              </div>
            )}

            {/* Cookie 输入框 */}
            {(selectedSite && selectedSite !== '__custom__') || (selectedSite === '__custom__' && customDomain.trim()) ? (
              <>
                <textarea
                  value={siteCookieValue}
                  onChange={(e) => setSiteCookieValue(e.target.value)}
                  placeholder={t('settings.cookie.cookieValuePlaceholder')}
                  className="w-full h-28 px-3 py-2 rounded-lg border border-border bg-bg-tertiary text-xs text-text-primary font-mono outline-none focus:border-accent resize-y placeholder:text-text-muted/50"
                  spellCheck={false}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">
                    {siteCookieValue.trim()
                      ? `${siteCookieValue.split(';').filter(s => s.trim() && s.includes('=')).length} cookies`
                      : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    {siteCookieValue.trim() && (
                      <button
                        onClick={() => setSiteCookieValue('')}
                        className="px-2.5 py-1.5 rounded-lg text-xs border border-border text-text-muted hover:text-text-primary hover:border-border-light transition-colors"
                      >
                        {t('settings.cookie.manualInputClear')}
                      </button>
                    )}
                    <button
                      onClick={handleSaveSiteCookies}
                      disabled={isSavingSite || !siteCookieValue.trim()}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        isSavingSite
                          ? 'bg-accent/50 text-white/70 cursor-wait'
                          : !siteCookieValue.trim()
                            ? 'bg-accent/30 text-white/40 cursor-not-allowed'
                            : 'bg-accent text-white hover:bg-accent-hover'
                      }`}
                    >
                      {isSavingSite ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          {t('settings.cookie.manualInputSaving')}
                        </>
                      ) : (
                        <>
                          <Save size={12} />
                          {t('settings.cookie.manualInputSaveBtn')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          {savedSites.length > 0 && (
            <div className="p-3 rounded-lg border border-border/60 bg-bg-primary space-y-2">
              <p className="text-sm text-text-primary font-medium">{t('settings.cookie.savedSites')}</p>
              <div className="space-y-1.5">
                {savedSites.map((site) => (
                  <div key={site.key} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg border border-border/40 bg-bg-tertiary">
                    <div className="flex items-center gap-2">
                      <Globe2 size={13} className="text-accent shrink-0" />
                      <div>
                        <span className="text-xs text-text-primary font-medium">{site.name}</span>
                        <span className="text-[10px] text-text-muted ml-2">
                          {t('settings.cookie.cookieCount', { count: site.cookieCount })}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSiteCookie(site.key)}
                      className="px-2 py-0.5 rounded text-[11px] border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={10} className="inline mr-0.5" />
                      {t('settings.cookie.deleteSiteCookie')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DPAPI 提示 */}
          <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <p className="text-xs text-amber-400/80 flex items-start gap-1.5">
              <Shield size={12} className="shrink-0 mt-0.5" />
              <span>{t('settings.cookie.dpapiHint')}</span>
            </p>
          </div>
        </>
      )}

      {/* Cookie文件模式 */}
      {settings.cookieMode === 'file' && (
        <SettingRow label={t('settings.cookie.filePath')} description={t('settings.cookie.filePathDesc')}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary max-w-[180px] truncate">
              {settings.cookieFile || t('settings.cookie.noFile')}
            </span>
            <button
              onClick={handleSelectCookieFile}
              className="px-2 py-1 rounded-md border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
            >
              <Upload size={12} className="inline mr-1" />
              {t('settings.cookie.selectFile')}
            </button>
          </div>
        </SettingRow>
      )}

      {/* 需要Cookie的网站列表 */}
      <div className="pt-2">
        <h3 className="text-xs font-medium text-text-secondary mb-2">{t('settings.cookie.sitesNeedCookie')}</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { site: 'bilibili.com', reason: t('settings.cookie.bilibili412') },
            { site: 'youtube.com', reason: t('settings.cookie.youtubeAge') },
            { site: 'douyin.com', reason: t('settings.cookie.douyinLogin') },
            { site: 'twitter.com / x.com', reason: t('settings.cookie.twitterLogin') },
            { site: 'instagram.com', reason: t('settings.cookie.instagramLogin') },
            { site: 'nicovideo.jp', reason: t('settings.cookie.nicoLogin') },
            { site: 'vimeo.com', reason: t('settings.cookie.vimeoPrivate') },
          ].map((item) => (
            <div key={item.site} className="flex items-start gap-2 py-1.5 px-2.5 rounded-lg border border-border/50 bg-bg-primary">
              <Globe2 size={13} className="text-text-muted shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-text-primary font-medium">{item.site}</span>
                <p className="text-[10px] text-text-muted mt-0.5">{item.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EnginePanel() {
  const { t } = useTranslation()
  const { settings, updateSetting } = useAppStore()
  const [binaryStatus, setBinaryStatus] = useState<{
    ytdlp: { installed: boolean; version: string | null; path: string }
    ffmpeg: { installed: boolean; version: string | null; path: string }
    binDir: string
  } | null>(null)
  const [isUpdatingYtdlp, setIsUpdatingYtdlp] = useState(false)
  const [isDownloadingFfmpeg, setIsDownloadingFfmpeg] = useState(false)
  const [updateResult, setUpdateResult] = useState<{
    target: 'ytdlp' | 'ffmpeg'
    success: boolean
    message: string
    version?: string
  } | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{
    stage: string
    percent?: number
    message?: string
  } | null>(null)

  // Load binary status on mount
  useEffect(() => {
    loadBinaryStatus()
    // Listen for progress events
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (isElectron && window.electronAPI?.onBinaryProgress) {
      window.electronAPI.onBinaryProgress((progress: any) => {
        setDownloadProgress(progress)
      })
    }
  }, [])

  const loadBinaryStatus = async () => {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (isElectron && window.electronAPI?.getBinaryStatus) {
      const status = await window.electronAPI.getBinaryStatus()
      setBinaryStatus(status)
    } else {
      // Mock data for browser dev
      setBinaryStatus({
        ytdlp: { installed: true, version: '2026.03.25', path: 'C:\\Users\\user\\AppData\\Roaming\\HiMax\\bin\\yt-dlp.exe' },
        ffmpeg: { installed: true, version: '7.1.1-essentials_build', path: 'C:\\Users\\user\\AppData\\Roaming\\HiMax\\bin\\ffmpeg.exe' },
        binDir: 'C:\\Users\\user\\AppData\\Roaming\\HiMax\\bin',
      })
    }
  }

  const handleUpdateYtdlp = async () => {
    setIsUpdatingYtdlp(true)
    setUpdateResult(null)
    setDownloadProgress(null)

    try {
      const isElectron = typeof window !== 'undefined' && !!window.electronAPI
      if (isElectron && window.electronAPI?.updateYtdlp) {
        const version = await window.electronAPI.updateYtdlp()
        setUpdateResult({
          target: 'ytdlp',
          success: true,
          message: t('settings.engine.updateSuccess'),
          version: version || undefined,
        })
        await loadBinaryStatus()
      } else {
        await new Promise((r) => setTimeout(r, 2000))
        setUpdateResult({
          target: 'ytdlp',
          success: true,
          message: t('settings.engine.updateSuccess'),
          version: '2026.03.26',
        })
      }
    } catch (e: any) {
      setUpdateResult({
        target: 'ytdlp',
        success: false,
        message: e.message || t('settings.engine.updateFailed'),
      })
    } finally {
      setIsUpdatingYtdlp(false)
      setDownloadProgress(null)
    }
  }

  const handleDownloadFfmpeg = async () => {
    setIsDownloadingFfmpeg(true)
    setUpdateResult(null)
    setDownloadProgress(null)

    try {
      const isElectron = typeof window !== 'undefined' && !!window.electronAPI
      if (isElectron && window.electronAPI?.downloadFfmpeg) {
        const version = await window.electronAPI.downloadFfmpeg()
        setUpdateResult({
          target: 'ffmpeg',
          success: true,
          message: t('settings.engine.downloadSuccess'),
          version: version || undefined,
        })
        await loadBinaryStatus()
      } else {
        await new Promise((r) => setTimeout(r, 2000))
        setUpdateResult({
          target: 'ffmpeg',
          success: true,
          message: t('settings.engine.downloadSuccess'),
          version: '7.1.1',
        })
      }
    } catch (e: any) {
      setUpdateResult({
        target: 'ffmpeg',
        success: false,
        message: e.message || t('settings.engine.downloadFailed'),
      })
    } finally {
      setIsDownloadingFfmpeg(false)
      setDownloadProgress(null)
    }
  }

  const handleSetCustomYtdlp = async () => {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (!isElectron) return

    const filePath = await window.electronAPI!.selectFile({
      filters: [
        { name: 'yt-dlp', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
      ],
    })
    if (!filePath) return

    const result = await window.electronAPI!.setCustomYtdlp(filePath)
    if (result.success) {
      updateSetting('customYtdlpPath', filePath)
      setUpdateResult({
        target: 'ytdlp',
        success: true,
        message: t('settings.engine.customPathSet'),
        version: result.version || undefined,
      })
      await loadBinaryStatus()
    } else {
      let message = t('settings.engine.invalidBinary')
      if (result.error === 'FILE_NOT_FOUND') {
        message = t('settings.engine.fileNotFound')
      }
      setUpdateResult({ target: 'ytdlp', success: false, message })
    }
  }

  const handleResetYtdlp = async () => {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (!isElectron) return

    const result = await window.electronAPI!.setCustomYtdlp('')
    if (result.success) {
      updateSetting('customYtdlpPath', '')
      await loadBinaryStatus()
      setUpdateResult(null)
    }
  }

  const handleSetCustomFfmpeg = async () => {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (!isElectron) return

    const filePath = await window.electronAPI!.selectFile({
      filters: [
        { name: 'FFmpeg', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
      ],
    })
    if (!filePath) return

    const result = await window.electronAPI!.setCustomFfmpeg(filePath)
    if (result.success) {
      updateSetting('customFfmpegPath', filePath)
      setUpdateResult({
        target: 'ffmpeg',
        success: true,
        message: t('settings.engine.customPathSet'),
        version: result.version || undefined,
      })
      await loadBinaryStatus()
    } else {
      let message = t('settings.engine.invalidBinary')
      if (result.error === 'FILE_NOT_FOUND') {
        message = t('settings.engine.fileNotFound')
      }
      setUpdateResult({ target: 'ffmpeg', success: false, message })
    }
  }

  const handleResetFfmpeg = async () => {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (!isElectron) return

    const result = await window.electronAPI!.setCustomFfmpeg('')
    if (result.success) {
      updateSetting('customFfmpegPath', '')
      await loadBinaryStatus()
      setUpdateResult(null)
    }
  }

  const handleOpenBinDir = async () => {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (isElectron && window.electronAPI?.openBinDir) {
      await window.electronAPI.openBinDir()
    }
  }

  // Helper: truncate path for display
  const truncatePath = (p: string, maxLen = 40) => {
    if (!p || p.length <= maxLen) return p
    const start = p.substring(0, 15)
    const end = p.substring(p.length - 22)
    return `${start}...${end}`
  }

  return (
    <div className="space-y-4">
      {/* yt-dlp Section */}
      <div className="p-3 rounded-lg border border-border bg-bg-primary space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${binaryStatus?.ytdlp?.installed ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm font-medium text-text-primary">yt-dlp</span>
            {binaryStatus?.ytdlp?.version && (
              <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                v{binaryStatus.ytdlp.version}
              </span>
            )}
            {binaryStatus && !binaryStatus.ytdlp.installed && (
              <span className="text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                {t('settings.engine.notInstalled')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleUpdateYtdlp}
              disabled={isUpdatingYtdlp}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                isUpdatingYtdlp
                  ? 'bg-accent/50 text-white/70 cursor-wait'
                  : 'bg-accent text-white hover:bg-accent-hover'
              }`}
            >
              {isUpdatingYtdlp ? (
                <>
                  <RefreshCw size={11} className="animate-spin" />
                  {t('settings.engine.updating')}
                </>
              ) : binaryStatus?.ytdlp?.installed ? (
                <>
                  <RefreshCw size={11} />
                  {t('settings.engine.checkUpdate')}
                </>
              ) : (
                <>
                  <Download size={11} />
                  {t('settings.engine.install')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* yt-dlp path */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-text-muted min-w-0">
            <FolderOpen size={11} className="shrink-0" />
            <span className="truncate font-mono" title={binaryStatus?.ytdlp?.path || ''}>
              {settings.customYtdlpPath
                ? truncatePath(settings.customYtdlpPath)
                : binaryStatus?.ytdlp?.path
                  ? truncatePath(binaryStatus.ytdlp.path)
                  : t('settings.engine.builtIn')
              }
            </span>
            {settings.customYtdlpPath && (
              <span className="text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded text-[10px]">
                {t('settings.engine.custom')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              onClick={handleSetCustomYtdlp}
              className="px-2 py-0.5 rounded-md border border-border text-[11px] text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
              title={t('settings.engine.customPath')}
            >
              {t('settings.engine.customPath')}
            </button>
            {settings.customYtdlpPath && (
              <button
                onClick={handleResetYtdlp}
                className="px-2 py-0.5 rounded-md border border-border text-[11px] text-text-muted hover:text-text-primary hover:border-border-light transition-colors"
                title={t('settings.engine.resetPath')}
              >
                {t('settings.engine.resetPath')}
              </button>
            )}
          </div>
        </div>

        {/* Update progress for yt-dlp */}
        {isUpdatingYtdlp && downloadProgress?.stage === 'ytdlp' && downloadProgress.percent !== undefined && (
          <div className="space-y-1">
            <div className="w-full h-1.5 rounded-full bg-bg-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            <p className="text-[10px] text-text-muted text-right">{downloadProgress.percent}%</p>
          </div>
        )}

        {/* yt-dlp result */}
        {updateResult && updateResult.target === 'ytdlp' && (
          <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md ${
            updateResult.success
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          }`}>
            {updateResult.success
              ? <Check size={13} className="text-green-400 shrink-0" />
              : <Info size={13} className="text-red-400 shrink-0" />
            }
            <span className={`text-xs ${updateResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {updateResult.message}
              {updateResult.version && ` (v${updateResult.version})`}
            </span>
          </div>
        )}
      </div>

      {/* FFmpeg Section */}
      <div className="p-3 rounded-lg border border-border bg-bg-primary space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${binaryStatus?.ffmpeg?.installed ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm font-medium text-text-primary">FFmpeg</span>
            {binaryStatus?.ffmpeg?.version && (
              <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                v{binaryStatus.ffmpeg.version}
              </span>
            )}
            {binaryStatus && !binaryStatus.ffmpeg.installed && (
              <span className="text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                {t('settings.engine.notInstalled')}
              </span>
            )}
          </div>
          {binaryStatus && !binaryStatus.ffmpeg.installed && (
            <button
              onClick={handleDownloadFfmpeg}
              disabled={isDownloadingFfmpeg}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                isDownloadingFfmpeg
                  ? 'bg-accent/50 text-white/70 cursor-wait'
                  : 'bg-accent text-white hover:bg-accent-hover'
              }`}
            >
              {isDownloadingFfmpeg ? (
                <>
                  <RefreshCw size={11} className="animate-spin" />
                  {t('settings.engine.downloading')}
                </>
              ) : (
                <>
                  <Download size={11} />
                  {t('settings.engine.install')}
                </>
              )}
            </button>
          )}
        </div>

        {/* FFmpeg path */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-text-muted min-w-0">
            <FolderOpen size={11} className="shrink-0" />
            <span className="truncate font-mono" title={binaryStatus?.ffmpeg?.path || ''}>
              {settings.customFfmpegPath
                ? truncatePath(settings.customFfmpegPath)
                : binaryStatus?.ffmpeg?.path
                  ? truncatePath(binaryStatus.ffmpeg.path)
                  : t('settings.engine.builtIn')
              }
            </span>
            {settings.customFfmpegPath && (
              <span className="text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded text-[10px]">
                {t('settings.engine.custom')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              onClick={handleSetCustomFfmpeg}
              className="px-2 py-0.5 rounded-md border border-border text-[11px] text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
              title={t('settings.engine.customPath')}
            >
              {t('settings.engine.customPath')}
            </button>
            {settings.customFfmpegPath && (
              <button
                onClick={handleResetFfmpeg}
                className="px-2 py-0.5 rounded-md border border-border text-[11px] text-text-muted hover:text-text-primary hover:border-border-light transition-colors"
                title={t('settings.engine.resetPath')}
              >
                {t('settings.engine.resetPath')}
              </button>
            )}
          </div>
        </div>

        {/* Download progress for FFmpeg */}
        {isDownloadingFfmpeg && downloadProgress?.stage === 'ffmpeg' && downloadProgress.percent !== undefined && (
          <div className="space-y-1">
            <div className="w-full h-1.5 rounded-full bg-bg-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            <p className="text-[10px] text-text-muted text-right">{downloadProgress.percent}%</p>
          </div>
        )}

        {/* FFmpeg result */}
        {updateResult && updateResult.target === 'ffmpeg' && (
          <div className={`flex items-center gap-2 px-2.5 py-2 rounded-md ${
            updateResult.success
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          }`}>
            {updateResult.success
              ? <Check size={13} className="text-green-400 shrink-0" />
              : <Info size={13} className="text-red-400 shrink-0" />
            }
            <span className={`text-xs ${updateResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {updateResult.message}
              {updateResult.version && ` (v${updateResult.version})`}
            </span>
          </div>
        )}
      </div>

      {/* Auto-update Toggle */}
      <SettingRow
        label={t('settings.engine.autoUpdate')}
        description={t('settings.engine.autoUpdateDesc')}
      >
        <Toggle
          checked={settings.autoUpdateYtdlp}
          onChange={(v) => updateSetting('autoUpdateYtdlp', v)}
        />
      </SettingRow>

      {/* Open binaries folder */}
      <div className="pt-2 flex items-center gap-3">
        <button
          onClick={handleOpenBinDir}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
        >
          <FolderOpen size={13} />
          {t('settings.engine.openBinDir')}
        </button>
        <button
          onClick={loadBinaryStatus}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
        >
          <RefreshCw size={13} />
          {t('settings.engine.refresh')}
        </button>
      </div>

      {/* Info hint */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border/40">
        <Info size={13} className="text-text-muted shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted">{t('settings.engine.hint')}</p>
      </div>
    </div>
  )
}

function ShortcutsPanel() {
  const { t } = useTranslation()
  const { settings, updateSetting } = useAppStore()

  // All shortcut actions with their display order
  const shortcutActions = [
    { key: 'pasteAndDownload', isGlobal: false },
    { key: 'pauseAll', isGlobal: false },
    { key: 'resumeAll', isGlobal: false },
    { key: 'openSettings', isGlobal: false },
    { key: 'toggleClipboard', isGlobal: false },
    { key: 'globalShow', isGlobal: true },
  ]

  const defaultShortcuts: Record<string, string> = {
    pasteAndDownload: 'Ctrl+V',
    pauseAll: 'Ctrl+Shift+P',
    resumeAll: 'Ctrl+Shift+R',
    openSettings: 'Ctrl+,',
    toggleClipboard: 'Ctrl+Shift+C',
    globalShow: 'Ctrl+Shift+D',
  }

  const [recordingAction, setRecordingAction] = useState<string | null>(null)
  const [recordedKeys, setRecordedKeys] = useState<string>('')
  const [conflictError, setConflictError] = useState<{
    action: string
    message: string
  } | null>(null)
  const [successAction, setSuccessAction] = useState<string | null>(null)

  // Get current shortcuts from settings (with defaults fallback)
  const currentShortcuts: Record<string, string> = {
    ...defaultShortcuts,
    ...(settings.shortcuts || {}),
  }

  // Start recording a new shortcut
  const startRecording = (action: string) => {
    setRecordingAction(action)
    setRecordedKeys('')
    setConflictError(null)
    setSuccessAction(null)
  }

  // Cancel recording
  const cancelRecording = () => {
    setRecordingAction(null)
    setRecordedKeys('')
  }

  // Clear a shortcut (set to empty)
  const clearShortcut = async (action: string) => {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (isElectron && window.electronAPI?.updateShortcut) {
      const result = await window.electronAPI.updateShortcut(action, '')
      if (result.success) {
        updateSetting('shortcuts', { ...currentShortcuts, [action]: '' })
        showSuccess(action)
      }
    } else {
      updateSetting('shortcuts', { ...currentShortcuts, [action]: '' })
      showSuccess(action)
    }
  }

  // Reset single shortcut to default
  const resetSingle = async (action: string) => {
    const defaultAccel = defaultShortcuts[action] || ''
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (isElectron && window.electronAPI?.updateShortcut) {
      const result = await window.electronAPI.updateShortcut(action, defaultAccel)
      if (result.success) {
        updateSetting('shortcuts', { ...currentShortcuts, [action]: defaultAccel })
        showSuccess(action)
      } else if (result.error === 'CONFLICT') {
        setConflictError({
          action,
          message: t('settings.shortcuts.conflict', {
            action: t(`settings.shortcuts.${result.conflictWith}`),
          }),
        })
      }
    } else {
      updateSetting('shortcuts', { ...currentShortcuts, [action]: defaultAccel })
      showSuccess(action)
    }
  }

  // Reset all shortcuts to defaults
  const resetAll = async () => {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (isElectron && window.electronAPI?.resetAllShortcuts) {
      const result = await window.electronAPI.resetAllShortcuts()
      if (result.success && result.shortcuts) {
        updateSetting('shortcuts', result.shortcuts)
      }
    } else {
      updateSetting('shortcuts', { ...defaultShortcuts })
    }
    setConflictError(null)
    setSuccessAction(null)
  }

  const showSuccess = (action: string) => {
    setSuccessAction(action)
    setTimeout(() => setSuccessAction(null), 2000)
  }

  // Handle key events when recording
  const handleKeyDown = async (e: React.KeyboardEvent, action: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Escape to cancel
    if (e.key === 'Escape') {
      cancelRecording()
      return
    }

    // Ignore lone modifier presses
    const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta']
    if (modifierKeys.includes(e.key)) {
      // Show partial combo while holding modifiers
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')
      setRecordedKeys(parts.join('+') + '+...')
      return
    }

    // Build accelerator string
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey) parts.push('Meta')

    // Normalize key name
    let key = e.key
    if (key === ' ') key = 'Space'
    else if (key === ',') key = ','
    else if (key.length === 1) key = key.toUpperCase()
    else {
      // Map common key names
      const keyMap: Record<string, string> = {
        ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
        Delete: 'Delete', Backspace: 'Backspace', Enter: 'Enter', Tab: 'Tab',
        Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
        Insert: 'Insert',
      }
      key = keyMap[key] || key
    }
    parts.push(key)

    const accelerator = parts.join('+')
    setRecordedKeys(accelerator)

    // Must have at least one modifier (except for function keys)
    const isFunctionKey = /^F\d{1,2}$/.test(key)
    if (!isFunctionKey && parts.length < 2) {
      setConflictError({
        action,
        message: t('settings.shortcuts.needModifier'),
      })
      return
    }

    // Check for conflicts with other shortcuts in current config
    const normalizeAccel = (a: string) =>
      a.split('+').map(p => p.trim().toLowerCase()).sort().join('+')

    const normalizedNew = normalizeAccel(accelerator)
    for (const [existingAction, existingAccel] of Object.entries(currentShortcuts)) {
      if (existingAction !== action && existingAccel && normalizeAccel(existingAccel) === normalizedNew) {
        setConflictError({
          action,
          message: t('settings.shortcuts.conflict', {
            action: t(`settings.shortcuts.${existingAction}`),
          }),
        })
        return
      }
    }

    // Apply the shortcut
    setConflictError(null)
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI
    if (isElectron && window.electronAPI?.updateShortcut) {
      const result = await window.electronAPI.updateShortcut(action, accelerator)
      if (result.success) {
        updateSetting('shortcuts', { ...currentShortcuts, [action]: accelerator })
        setRecordingAction(null)
        showSuccess(action)
      } else if (result.error === 'CONFLICT') {
        setConflictError({
          action,
          message: t('settings.shortcuts.conflict', {
            action: t(`settings.shortcuts.${result.conflictWith}`),
          }),
        })
      } else if (result.error === 'IN_USE_BY_OTHER_APP') {
        setConflictError({
          action,
          message: t('settings.shortcuts.inUseByOtherApp'),
        })
      } else {
        setConflictError({
          action,
          message: t('settings.shortcuts.setFailed'),
        })
      }
    } else {
      // Browser mock mode
      updateSetting('shortcuts', { ...currentShortcuts, [action]: accelerator })
      setRecordingAction(null)
      showSuccess(action)
    }
  }

  // Render key badges from an accelerator string
  const renderKeyBadges = (accelerator: string) => {
    if (!accelerator) {
      return (
        <span className="text-xs text-text-muted italic">
          {t('settings.shortcuts.notSet')}
        </span>
      )
    }
    return (
      <div className="flex items-center gap-0.5">
        {accelerator.split('+').map((key, i) => (
          <span key={i} className="flex items-center">
            {i > 0 && <span className="text-text-muted mx-0.5 text-[10px]">+</span>}
            <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-md bg-bg-hover border border-border text-[11px] font-mono text-text-secondary shadow-sm">
              {key}
            </kbd>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Shortcuts list */}
      <div className="space-y-0.5">
        {shortcutActions.map((sc) => {
          const isRecording = recordingAction === sc.key
          const isModified = currentShortcuts[sc.key] !== defaultShortcuts[sc.key]
          const hasConflict = conflictError?.action === sc.key
          const isSuccess = successAction === sc.key

          return (
            <div key={sc.key} className="group">
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                isRecording
                  ? 'bg-accent/10 border border-accent/30'
                  : hasConflict
                    ? 'bg-red-500/5 border border-red-500/20'
                    : isSuccess
                      ? 'bg-green-500/5 border border-green-500/20'
                      : 'hover:bg-bg-hover border border-transparent'
              }`}>
                {/* Label */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-text-primary">
                    {t(`settings.shortcuts.${sc.key}`)}
                  </span>
                  {sc.isGlobal && (
                    <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-medium">
                      {t('settings.shortcuts.global')}
                    </span>
                  )}
                  {isModified && !isRecording && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded text-nowrap">
                      {t('settings.shortcuts.modified')}
                    </span>
                  )}
                </div>

                {/* Right side: key badges + actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isRecording ? (
                    <div className="flex items-center gap-2">
                      <div
                        tabIndex={0}
                        onKeyDown={(e) => handleKeyDown(e, sc.key)}
                        onBlur={cancelRecording}
                        autoFocus
                        className="flex items-center gap-1 px-3 py-1 rounded-md bg-bg-primary border-2 border-accent text-xs font-mono text-accent min-w-[120px] outline-none animate-pulse"
                      >
                        {recordedKeys || t('settings.shortcuts.pressKeys')}
                      </div>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={cancelRecording}
                        className="text-[11px] text-text-muted hover:text-text-primary transition-colors"
                      >
                        Esc
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Key badges */}
                      <div
                        onClick={() => startRecording(sc.key)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        title={t('settings.shortcuts.clickToChange')}
                      >
                        {renderKeyBadges(currentShortcuts[sc.key])}
                      </div>

                      {/* Action buttons (visible on hover) */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startRecording(sc.key)}
                          className="p-1 rounded text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                          title={t('settings.shortcuts.edit')}
                        >
                          <Keyboard size={12} />
                        </button>
                        {currentShortcuts[sc.key] && (
                          <button
                            onClick={() => clearShortcut(sc.key)}
                            className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title={t('settings.shortcuts.clear')}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        {isModified && (
                          <button
                            onClick={() => resetSingle(sc.key)}
                            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                            title={t('settings.shortcuts.resetSingle')}
                          >
                            <RefreshCw size={12} />
                          </button>
                        )}
                      </div>

                      {/* Success indicator */}
                      {isSuccess && (
                        <Check size={14} className="text-green-400 shrink-0" />
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Conflict error message */}
              {hasConflict && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 ml-3 mt-0.5">
                  <Info size={11} className="text-red-400 shrink-0" />
                  <span className="text-[11px] text-red-400">{conflictError.message}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reset all + tips */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
        >
          <RefreshCw size={13} />
          {t('settings.shortcuts.resetAll')}
        </button>
      </div>

      {/* Info hint */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border/40">
        <Info size={13} className="text-text-muted shrink-0 mt-0.5" />
        <div className="text-xs text-text-muted space-y-1">
          <p>{t('settings.shortcuts.hint')}</p>
          <p>{t('settings.shortcuts.globalHint')}</p>
        </div>
      </div>
    </div>
  )
}

function AboutPanel() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center py-8 space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-lg font-bold text-text-primary">Downie Clone</h2>
        <p className="text-xs text-text-muted mt-1">{t('settings.about.description')}</p>
      </div>
      <p className="text-sm text-text-secondary">{t('settings.about.version')}: 1.0.0-beta</p>

      <div className="flex items-center gap-3">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary transition-colors">
          <ExternalLink size={13} />
          {t('settings.about.github')}
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors">
          <RefreshCw size={13} />
          {t('settings.about.checkUpdate')}
        </button>
      </div>

      <div className="mt-4 text-center text-[11px] text-text-muted space-y-1">
        <p>{t('settings.about.license')}: MIT</p>
        <p>Electron v41 · React v19 · yt-dlp</p>
        <p>Made with love</p>
      </div>
    </div>
  )
}

const panels: Record<string, React.FC> = {
  general: GeneralPanel,
  download: DownloadPanel,
  network: NetworkPanel,
  cookie: CookiePanel,
  engine: EnginePanel,
  shortcuts: ShortcutsPanel,
  about: AboutPanel,
}

export function SettingsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('general')

  const ActivePanel = panels[activeTab] || GeneralPanel

  return (
    <div className="space-y-4">
      <h1 className="text-base font-semibold text-text-primary">{t('settings.title')}</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors
                ${activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
            >
              <Icon size={13} />
              {t(`settings.tabs.${tab.id}`)}
            </button>
          )
        })}
      </div>

      {/* Panel Content */}
      <div className="max-w-2xl">
        <ActivePanel />
      </div>
    </div>
  )
}
