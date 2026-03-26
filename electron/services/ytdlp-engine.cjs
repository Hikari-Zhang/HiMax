/**
 * yt-dlp Engine - Video parsing and downloading
 * Wraps yt-dlp CLI with progress tracking, pause/resume/cancel support
 */
const { spawn, execSync } = require('child_process')
const path = require('path')
const EventEmitter = require('events')
const fs = require('fs')
const DouyinExtractor = require('./douyin-extractor.cjs')
const { getCookiePath, getDebugDir, ensureDir } = require('./app-paths.cjs')

class YtdlpEngine extends EventEmitter {
  constructor(binaryManager) {
    super()
    this.binaryManager = binaryManager
    this.activeProcesses = new Map() // taskId -> { process, isPaused }
    this.douyinExtractor = new DouyinExtractor()
  }

  /**
   * Build proxy args from settings
   */
  _buildProxyArgs(settings) {
    if (!settings || settings.proxyMode === 'none') return []
    if (settings.proxyMode === 'system') return [] // yt-dlp uses system proxy by default

    if (settings.proxyMode === 'manual' && settings.proxyHost && settings.proxyPort) {
      let proxyUrl = `${settings.proxyType || 'http'}://`
      if (settings.proxyUsername) {
        proxyUrl += `${settings.proxyUsername}`
        if (settings.proxyPassword) proxyUrl += `:${settings.proxyPassword}`
        proxyUrl += '@'
      }
      proxyUrl += `${settings.proxyHost}:${settings.proxyPort}`
      return ['--proxy', proxyUrl]
    }

    return []
  }

  /**
   * Test proxy connectivity by attempting to fetch a lightweight URL via yt-dlp.
   * @param {object} settings - proxy-related settings (proxyMode, proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword)
   * @returns {Promise<{ success: boolean, latency?: number, error?: string }>}
   */
  testProxy(settings) {
    return new Promise((resolve) => {
      const args = [
        ...this._buildCommonArgs(),
        '--dump-json',
        '--no-download',
        '--no-warnings',
        '--no-playlist',
        '--socket-timeout', '15',
      ]

      // Add proxy args
      args.push(...this._buildProxyArgs(settings))

      // Use a lightweight, always-available URL to test connectivity
      args.push('https://www.youtube.com/watch?v=jNQXAC9IVRw')

      const startTime = Date.now()

      const proc = spawn(this.binaryManager.ytdlpPath, args, {
        timeout: 20000,
        windowsHide: true,
        env: this._buildUtf8Env(),
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        const latency = Date.now() - startTime

        if (code === 0) {
          resolve({ success: true, latency })
        } else {
          let error = 'Connection failed'
          if (stderr.includes('Unable to download webpage') || stderr.includes('urlopen error')) {
            error = 'PROXY_UNREACHABLE'
          } else if (stderr.includes('407') || stderr.includes('Proxy Authentication Required')) {
            error = 'PROXY_AUTH_FAILED'
          } else if (stderr.includes('timed out') || stderr.includes('timeout')) {
            error = 'PROXY_TIMEOUT'
          } else if (stderr.includes('Connection refused')) {
            error = 'PROXY_REFUSED'
          } else if (stderr) {
            error = stderr.split('\n')[0].substring(0, 200)
          }
          resolve({ success: false, latency, error })
        }
      })

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })

      // Timeout safety net
      setTimeout(() => {
        try { proc.kill() } catch (e) {}
        resolve({ success: false, error: 'PROXY_TIMEOUT' })
      }, 20000)
    })
  }

  /**
   * Build cookie args
   * Supports three modes:
   *   1. cookies-from-browser: auto-extract from browser (e.g. 'chrome', 'edge', 'firefox')
   *   2. cookie file: Netscape format cookie.txt
   *   3. none: no cookies
   */
  _buildCookieArgs(options = {}) {
    const { cookieMode, cookieBrowser, cookieFile, cookieProfile } = options

    if (cookieMode === 'browser' && cookieBrowser) {
      // Format: BROWSER[:PROFILE[:KEYRING[:CONTAINER]]]
      let browserArg = cookieBrowser
      if (cookieProfile) {
        browserArg += `:${cookieProfile}`
      }
      return ['--cookies-from-browser', browserArg]
    }

    if (cookieMode === 'file' && cookieFile && fs.existsSync(cookieFile)) {
      // Sanitize cookie file before use — fix stale quote issues etc.
      this._sanitizeCookieFile(cookieFile)
      return ['--cookies', cookieFile]
    }

    return []
  }

  /**
   * Sanitize a Netscape cookie file in-place:
   *  - Strip stray quotes from cookie names and values (common from bad copy-paste)
   *  - Ensure session cookies (expiry=0) get a future expiry so yt-dlp doesn't skip them
   * @param {string} cookiePath
   */
  _sanitizeCookieFile(cookiePath) {
    try {
      const content = fs.readFileSync(cookiePath, 'utf-8')
      const lines = content.split('\n')
      let changed = false

      const sanitized = lines.map(line => {
        // Skip comments and blank lines
        if (!line.trim() || line.startsWith('#')) return line

        const parts = line.split('\t')
        if (parts.length < 7) return line

        // parts: [domain, flag, path, secure, expiry, name, value]
        let name = parts[5]
        let value = parts[6]
        let expiry = parts[4]

        // Strip stray quotes from name
        const cleanName = name.replace(/^["']+|["']+$/g, '')
        // Strip stray quotes from value
        const cleanValue = value.replace(/^["']+|["']+$/g, '')
        // Fix session cookie expiry (0) — set to 1 year from now
        const cleanExpiry = (expiry === '0') ? String(Math.floor(Date.now() / 1000) + 86400 * 365) : expiry

        if (cleanName !== name || cleanValue !== value || cleanExpiry !== expiry) {
          changed = true
          parts[5] = cleanName
          parts[6] = cleanValue
          parts[4] = cleanExpiry
          return parts.join('\t')
        }

        return line
      })

      if (changed) {
        fs.writeFileSync(cookiePath, sanitized.join('\n'), 'utf-8')
        console.log('[YtdlpEngine] Sanitized cookie file:', cookiePath)
      }
    } catch (err) {
      console.error('[YtdlpEngine] Cookie sanitize error:', err.message)
    }
  }

  /**
   * Check if a browser process is currently running (Windows)
   * @param {string} browser - Browser name (chrome, edge, firefox, etc.)
   * @returns {Promise<boolean>}
   */
  _isBrowserRunning(browser) {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        resolve(false) // Skip check on non-Windows
        return
      }

      // Map browser names to their process names
      const processNames = {
        chrome: 'chrome.exe',
        edge: 'msedge.exe',
        firefox: 'firefox.exe',
        brave: 'brave.exe',
        opera: 'opera.exe',
        chromium: 'chromium.exe',
        vivaldi: 'vivaldi.exe',
      }

      const processName = processNames[browser.toLowerCase()]
      if (!processName) {
        resolve(false)
        return
      }

      const proc = spawn('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/NH', '/FO', 'CSV'], {
        windowsHide: true,
        timeout: 5000,
      })

      let stdout = ''
      proc.stdout.on('data', (data) => { stdout += data.toString() })
      proc.on('close', () => {
        // tasklist output contains the process name if running
        resolve(stdout.toLowerCase().includes(processName.toLowerCase()))
      })
      proc.on('error', () => resolve(false))
    })
  }

  /**
   * Build a UTF-8 env for yt-dlp subprocesses.
   * On Windows the console codepage defaults to GBK (CP936), which causes
   * Chinese characters in filenames/titles to become garbled when Node reads
   * stdout with the default UTF-8 toString(). Setting PYTHONIOENCODING and
   * PYTHONUTF8 forces yt-dlp (a Python program) to output UTF-8 regardless
   * of the system locale.
   * @returns {Object} env object with UTF-8 flags
   */
  _buildUtf8Env() {
    return {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    }
  }

  /**
   * Decode a Buffer from yt-dlp stdout/stderr.
   * First tries UTF-8; if replacement characters (\uFFFD) are detected
   * (which means the bytes were NOT valid UTF-8), falls back to GBK (CP936).
   * This handles the case where yt-dlp's PyInstaller-bundled Python ignores
   * PYTHONIOENCODING and outputs filenames in the system's default codepage.
   * @param {Buffer} buffer
   * @returns {string}
   */
  _decodeOutput(buffer) {
    const utf8 = buffer.toString('utf-8')
    if (!utf8.includes('\uFFFD')) {
      return utf8  // Valid UTF-8, no garbling
    }
    // Contains replacement characters — likely GBK bytes decoded as UTF-8
    try {
      const decoder = new TextDecoder('gbk')
      const gbkResult = decoder.decode(buffer)
      console.log('[YtdlpEngine] Detected GBK output, decoded successfully')
      return gbkResult
    } catch {
      // TextDecoder('gbk') failed — return the UTF-8 result as-is
      return utf8
    }
  }

  /**
   * Extract a valid URL from user-pasted text that may contain extra content.
   * 
   * Users often paste share text from apps like Douyin (TikTok), WeChat, etc.
   * which includes titles, hashtags, and other text alongside the actual URL.
   * 
   * Example input:
   *   "1.00 t@e.Ox 02/28 再黑的号你杨哥也是轻松拯救！ # 三角洲行动  https://v.douyin.com/GxIU0nXN384/ 复制此链接"
   * Expected output:
   *   "https://v.douyin.com/GxIU0nXN384/"
   * 
   * @param {string} input - Raw user input (may contain non-URL text)
   * @returns {string} The extracted URL, or the original input if no URL found
   */
  _extractUrl(input) {
    if (!input || typeof input !== 'string') return input

    const trimmed = input.trim()

    // Quick check: if input looks like a plain URL already, return as-is
    if (/^https?:\/\/\S+$/i.test(trimmed)) {
      return trimmed
    }

    // Try to extract URL(s) from the text
    // Match http/https URLs, including those with unicode path segments
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\u0000-\u001F\u007F-\u009F]+/gi
    const matches = trimmed.match(urlPattern)

    if (matches && matches.length > 0) {
      // Clean trailing punctuation that might have been captured
      let url = matches[0].replace(/[,;:!?。，；：！？)）\]】》]+$/, '')
      console.log(`[YtdlpEngine] Extracted URL from shared text: "${url}" (original length: ${trimmed.length})`)
      return url
    }

    // No URL found — return original input (yt-dlp will handle the error)
    return trimmed
  }

  /**
   * Build common yt-dlp arguments needed for all operations.
   * Currently enables Node.js as JS runtime for YouTube n-parameter challenge solving.
   * yt-dlp only enables deno by default; without this, YouTube videos may fail to parse.
   * @returns {string[]} Common args array
   */
  _buildCommonArgs() {
    return ['--js-runtimes', 'node']
  }

  /**
   * Build a clean environment for yt-dlp, stripping all Electron/Chromium 
   * environment variables that can interfere with DPAPI cookie decryption.
   * Also forces UTF-8 output to avoid GBK garbling on Windows.
   * @returns {Object} Clean env object
   */
  _buildCleanEnv() {
    const cleanEnv = {}
    const electronVarPrefixes = [
      'ELECTRON_', 'CHROME_', 'GOOGLE_', 'NODE_', 'ORIGINAL_XDG_',
    ]
    const electronExactVars = [
      'ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ASAR',
      'GOOGLE_API_KEY', 'GOOGLE_DEFAULT_CLIENT_ID', 'GOOGLE_DEFAULT_CLIENT_SECRET',
    ]

    for (const [key, value] of Object.entries(process.env)) {
      // Skip Electron-specific variables
      const isElectronVar = electronVarPrefixes.some(p => key.startsWith(p)) ||
                            electronExactVars.includes(key)
      if (!isElectronVar) {
        cleanEnv[key] = value
      }
    }

    // Force UTF-8 output for Python/yt-dlp
    cleanEnv.PYTHONIOENCODING = 'utf-8'
    cleanEnv.PYTHONUTF8 = '1'

    return cleanEnv
  }

  /**
   * Export cookies from a browser to a Netscape cookie.txt file.
   * 
   * IMPORTANT: This runs yt-dlp with a clean environment (no Electron vars)
   * to avoid DPAPI decryption conflicts on Windows. The target browser MUST 
   * be closed before calling this, otherwise the Cookie SQLite DB may be locked.
   *
   * For Chromium-based browsers (Chrome/Edge/Brave/etc.), DPAPI is used to 
   * encrypt cookies. Running from inside Electron can conflict with this.
   * Firefox uses its own encryption (not DPAPI) and is generally more reliable.
   *
   * @param {string} browser - Browser name (chrome, edge, firefox, etc.)
   * @param {string} outputPath - Path to save the cookie.txt file
   * @param {string} [profile] - Optional browser profile name
   * @returns {Promise<{success: boolean, path?: string, error?: string, browserRunning?: boolean}>}
   */
  async exportCookies(browser, outputPath, profile = '') {
    // Step 1: Check if the target browser is running
    const isRunning = await this._isBrowserRunning(browser)
    if (isRunning) {
      console.log(`[YtdlpEngine] Browser ${browser} is still running!`)
      return {
        success: false,
        browserRunning: true,
        error: `BROWSER_RUNNING:${browser}`,
      }
    }

    // Step 2: Run yt-dlp with a completely clean environment
    return new Promise((resolve) => {
      const browserArg = profile ? `${browser}:${profile}` : browser
      const args = [
        '--cookies-from-browser', browserArg,
        '--cookies', outputPath,
        '--skip-download',
        '--no-warnings',
        '--quiet',
        'https://www.youtube.com',  // Dummy URL to trigger cookie extraction
      ]

      console.log('[YtdlpEngine] Exporting cookies:', browser, '->', outputPath)
      console.log('[YtdlpEngine] Command:', this.binaryManager.ytdlpPath, args.join(' '))

      // Use a CLEAN environment - remove all Electron/Chromium env vars
      // This is critical to avoid DPAPI context conflicts on Windows
      const cleanEnv = this._buildCleanEnv()

      const proc = spawn(this.binaryManager.ytdlpPath, args, {
        timeout: 60000,  // 60s timeout (cookie DB can be large)
        windowsHide: true,
        env: cleanEnv,
      })

      let stderr = ''
      let stdout = ''

      proc.stdout.on('data', (data) => {
        stdout += this._decodeOutput(Buffer.isBuffer(data) ? data : Buffer.from(data))
      })

      proc.stderr.on('data', (data) => {
        stderr += this._decodeOutput(Buffer.isBuffer(data) ? data : Buffer.from(data))
      })

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath)
          if (stats.size > 100) {
            console.log('[YtdlpEngine] Cookie export successful, file size:', stats.size)
            resolve({ success: true, path: outputPath, size: stats.size })
          } else {
            console.error('[YtdlpEngine] Cookie file too small:', stats.size)
            resolve({
              success: false,
              error: 'EMPTY_COOKIES',
            })
          }
        } else {
          console.error('[YtdlpEngine] Cookie export failed (code', code, '):', stderr)

          // Detect specific DPAPI error
          const isDpapiError = stderr.includes('DPAPI') || stderr.includes('decrypt')
          
          resolve({
            success: false,
            error: isDpapiError ? `DPAPI_ERROR:${stderr.split('\n')[0]}` : (stderr || `yt-dlp exited with code ${code}`),
          })
        }
      })

      proc.on('error', (err) => {
        console.error('[YtdlpEngine] Cookie export error:', err)
        resolve({ success: false, error: err.message })
      })
    })
  }

  /**
   * Site cookie presets — maps site key to domain info for Netscape format conversion.
   * Users select a site, paste browser cookie string (key=value; key2=value2),
   * and we auto-convert to Netscape format.
   */
  static SITE_PRESETS = {
    bilibili:   { domain: '.bilibili.com',    name: 'Bilibili' },
    youtube:    { domain: '.youtube.com',      name: 'YouTube' },
    douyin:     { domain: '.douyin.com',       name: '抖音 / Douyin', extraDomains: ['.iesdouyin.com'] },
    twitter:    { domain: '.x.com',            name: 'Twitter / X' },
    instagram:  { domain: '.instagram.com',    name: 'Instagram' },
    tiktok:     { domain: '.tiktok.com',       name: 'TikTok' },
    nicovideo:  { domain: '.nicovideo.jp',     name: 'NicoNico' },
    vimeo:      { domain: '.vimeo.com',        name: 'Vimeo' },
    facebook:   { domain: '.facebook.com',     name: 'Facebook' },
    twitch:     { domain: '.twitch.tv',        name: 'Twitch' },
    dailymotion:{ domain: '.dailymotion.com',  name: 'Dailymotion' },
  }

  /**
   * Convert a browser cookie string (key=value; key2=value2) to Netscape cookie lines.
   * Handles various edge cases:
   *   - Surrounding quotes (single/double) from copy-paste
   *   - Leading/trailing whitespace
   *   - Empty or invalid pairs
   * @param {string} domain - e.g. '.youtube.com'
   * @param {string} cookieStr - cookie string from browser dev tools
   * @returns {string[]} Array of Netscape format lines
   */
  _browserCookieToNetscape(domain, cookieStr) {
    const lines = []
    // Strip surrounding quotes that users may accidentally include
    // e.g. "'key=val; key2=val2'" or '"key=val; key2=val2"'
    let cleaned = cookieStr.trim()
    if ((cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
      cleaned = cleaned.slice(1, -1).trim()
    }

    const pairs = cleaned.split(';').map(s => s.trim()).filter(Boolean)
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=')
      if (eqIdx <= 0) continue
      // Strip any remaining quotes from name/value
      const name = pair.substring(0, eqIdx).trim().replace(/^["']+|["']+$/g, '')
      const value = pair.substring(eqIdx + 1).trim().replace(/^["']+|["']+$/g, '')
      if (!name) continue
      // Netscape format: domain  flag  path  secure  expiry  name  value
      // Use TRUE for secure (HTTPS), set expiry to far future to avoid session-only issues
      const expiry = Math.floor(Date.now() / 1000) + 86400 * 365 // 1 year from now
      lines.push(`${domain}\tTRUE\t/\tTRUE\t${expiry}\t${name}\t${value}`)
    }
    return lines
  }

  /**
   * Save cookies for a specific site. Accepts browser-style cookie string,
   * auto-converts to Netscape format, and merges into cookies.txt.
   * @param {string} siteKey - Site key from SITE_PRESETS (e.g. 'youtube', 'bilibili')
   * @param {string} cookieString - Browser cookie string (key=value; key2=value2)
   * @returns {{success: boolean, path?: string, size?: number, count?: number, error?: string}}
   */
  saveSiteCookies(siteKey, cookieString) {
    try {
      if (!cookieString || !cookieString.trim()) {
        return { success: false, error: 'EMPTY_INPUT' }
      }

      const preset = YtdlpEngine.SITE_PRESETS[siteKey]
      // Support custom domains: if siteKey is not a preset, treat it as a raw domain
      let domain, siteName, extraDomains = []
      if (preset) {
        domain = preset.domain
        siteName = preset.name
        extraDomains = preset.extraDomains || []
      } else if (siteKey.includes('.')) {
        // Custom domain — ensure it starts with a dot for cookie matching
        domain = siteKey.startsWith('.') ? siteKey : `.${siteKey}`
        siteName = siteKey.replace(/^\./, '')
      } else {
        return { success: false, error: 'UNKNOWN_SITE' }
      }

      const trimmed = cookieString.trim()
      
      // Parse the cookie string for the primary domain
      const newLines = this._browserCookieToNetscape(domain, trimmed)
      if (newLines.length === 0) {
        return { success: false, error: 'NO_VALID_COOKIES' }
      }

      // Also generate cookie lines for extra domains (e.g. Douyin -> .iesdouyin.com)
      const extraLines = []
      for (const extraDomain of extraDomains) {
        extraLines.push(...this._browserCookieToNetscape(extraDomain, trimmed))
      }

      const destPath = this.getDefaultCookiePath()
      const destDir = path.dirname(destPath)
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
      }

      // All domains to clean up (primary + extras)
      const allDomains = [domain, ...extraDomains]

      // Read existing cookies, remove old entries for ALL related domains, append new ones
      let existingLines = []
      if (fs.existsSync(destPath)) {
        const content = fs.readFileSync(destPath, 'utf-8')
        existingLines = content.split('\n').filter(line => {
          // Keep header comments and lines NOT belonging to any of our domains
          if (line.startsWith('#') || !line.trim()) return true
          return !allDomains.some(d => line.startsWith(d + '\t'))
        })
        // Also remove section comment lines for extra domains
        existingLines = existingLines.filter(line => {
          if (!line.startsWith('# --- ')) return true
          return !allDomains.some(d => line.includes(`(${d})`))
        })
      } else {
        existingLines = [
          '# Netscape HTTP Cookie File',
          '# https://curl.haxx.se/rfc/cookie_spec.html',
          '# This file was generated by HiMax',
          '',
        ]
      }

      // Remove trailing empty lines, add a blank separator, then new cookies
      while (existingLines.length > 0 && !existingLines[existingLines.length - 1].trim()) {
        existingLines.pop()
      }
      existingLines.push('') // blank separator
      existingLines.push(`# --- ${siteName} (${domain}) ---`)
      existingLines.push(...newLines)

      // Append extra domain cookies
      for (const extraDomain of extraDomains) {
        const linesForDomain = this._browserCookieToNetscape(extraDomain, trimmed)
        existingLines.push(`# --- ${siteName} (${extraDomain}) ---`)
        existingLines.push(...linesForDomain)
      }
      existingLines.push('')

      fs.writeFileSync(destPath, existingLines.join('\n'), 'utf-8')
      
      const totalCount = newLines.length + extraLines.length
      const stats = fs.statSync(destPath)
      console.log(`[YtdlpEngine] Site cookies saved: ${siteName} (${newLines.length} cookies for ${domain}${extraDomains.length ? `, ${extraLines.length} for ${extraDomains.join(',')}` : ''}), file: ${destPath}, size: ${stats.size}`)
      return { success: true, path: destPath, size: stats.size, count: totalCount }
    } catch (err) {
      console.error('[YtdlpEngine] Save site cookies error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Get list of sites that have cookies saved in cookies.txt.
   * @returns {{sites: Array<{key: string, name: string, domain: string, cookieCount: number}>}}
   */
  getSavedCookieSites() {
    try {
      const destPath = this.getDefaultCookiePath()
      if (!fs.existsSync(destPath)) {
        return { sites: [] }
      }

      const content = fs.readFileSync(destPath, 'utf-8')
      const lines = content.split('\n')
      
      const siteCounts = {}
      for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue
        const parts = line.split('\t')
        if (parts.length >= 7) {
          const domain = parts[0]
          siteCounts[domain] = (siteCounts[domain] || 0) + 1
        }
      }

      const sites = []
      for (const [siteKey, preset] of Object.entries(YtdlpEngine.SITE_PRESETS)) {
        const count = siteCounts[preset.domain]
        if (count && count > 0) {
          sites.push({ key: siteKey, name: preset.name, domain: preset.domain, cookieCount: count })
        }
      }

      // Also check for non-preset domains
      for (const [domain, count] of Object.entries(siteCounts)) {
        const isPreset = Object.values(YtdlpEngine.SITE_PRESETS).some(p => p.domain === domain)
        if (!isPreset) {
          sites.push({ key: domain, name: domain, domain: domain, cookieCount: count })
        }
      }

      return { sites }
    } catch (err) {
      console.error('[YtdlpEngine] Get saved cookie sites error:', err)
      return { sites: [] }
    }
  }

  /**
   * Delete cookies for a specific site from cookies.txt.
   * @param {string} siteKey - Site key from SITE_PRESETS or raw domain
   * @returns {{success: boolean, error?: string}}
   */
  deleteSiteCookies(siteKey) {
    try {
      const destPath = this.getDefaultCookiePath()
      if (!fs.existsSync(destPath)) {
        return { success: true }
      }

      const preset = YtdlpEngine.SITE_PRESETS[siteKey]
      const domain = preset ? preset.domain : siteKey
      const extraDomains = (preset && preset.extraDomains) ? preset.extraDomains : []
      const allDomains = [domain, ...extraDomains]

      const content = fs.readFileSync(destPath, 'utf-8')
      const lines = content.split('\n')
      
      // Filter out lines belonging to ALL related domains (and their section comments)
      const filtered = lines.filter(line => {
        if (line.startsWith('# --- ') && allDomains.some(d => line.includes(`(${d})`))) return false
        if (!line.startsWith('#') && line.trim() && allDomains.some(d => line.startsWith(d + '\t'))) return false
        return true
      })

      // Clean up consecutive blank lines
      const cleaned = []
      for (const line of filtered) {
        if (!line.trim() && cleaned.length > 0 && !cleaned[cleaned.length - 1].trim()) continue
        cleaned.push(line)
      }

      fs.writeFileSync(destPath, cleaned.join('\n'), 'utf-8')
      console.log(`[YtdlpEngine] Deleted cookies for domain: ${domain}`)
      return { success: true }
    } catch (err) {
      console.error('[YtdlpEngine] Delete site cookies error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Save user-provided Netscape format cookie text (legacy method, still supported).
   * @param {string} cookieText - Raw cookie text content (Netscape format)
   * @returns {{success: boolean, path?: string, size?: number, error?: string}}
   */
  saveCookieText(cookieText) {
    try {
      if (!cookieText || !cookieText.trim()) {
        return { success: false, error: 'EMPTY_INPUT' }
      }

      const text = cookieText.trim()

      // Basic validation: check for Netscape cookie format or browser cookie string
      const isNetscape = text.includes('# Netscape HTTP Cookie File') ||
                         text.includes('# HTTP Cookie File') ||
                         (text.includes('\t') && text.split('\n').filter(l => l.trim() && !l.startsWith('#')).length > 0)

      if (!isNetscape) {
        return { success: false, error: 'INVALID_FORMAT' }
      }

      let finalText = text
      if (!text.startsWith('# Netscape HTTP Cookie File') && !text.startsWith('# HTTP Cookie File')) {
        finalText = '# Netscape HTTP Cookie File\n# https://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated by Downie Clone\n\n' + text
      }

      const destPath = this.getDefaultCookiePath()
      const destDir = path.dirname(destPath)
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
      }

      fs.writeFileSync(destPath, finalText, 'utf-8')
      
      const stats = fs.statSync(destPath)
      console.log('[YtdlpEngine] Cookie text saved:', destPath, 'size:', stats.size)
      return { success: true, path: destPath, size: stats.size }
    } catch (err) {
      console.error('[YtdlpEngine] Cookie text save error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Import a user-provided cookies.txt file to the default cookie path.
   * This is the ultimate fallback when DPAPI export fails.
   * @param {string} sourcePath - Path to the user's cookies.txt file
   * @returns {{success: boolean, path?: string, size?: number, error?: string}}
   */
  importCookieFile(sourcePath) {
    try {
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: 'File not found' }
      }

      const content = fs.readFileSync(sourcePath, 'utf-8')
      
      // Basic validation: check for Netscape cookie format
      const isNetscape = content.includes('# Netscape HTTP Cookie File') ||
                         content.includes('# HTTP Cookie File') ||
                         (content.includes('\t') && content.split('\n').filter(l => l.trim() && !l.startsWith('#')).length > 0)

      if (!isNetscape) {
        return { success: false, error: 'INVALID_FORMAT' }
      }

      const destPath = this.getDefaultCookiePath()
      fs.copyFileSync(sourcePath, destPath)
      
      const stats = fs.statSync(destPath)
      console.log('[YtdlpEngine] Cookie file imported:', sourcePath, '->', destPath, 'size:', stats.size)
      return { success: true, path: destPath, size: stats.size }
    } catch (err) {
      console.error('[YtdlpEngine] Cookie import error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Get the default cookie file path (in appdata directory within install dir)
   */
  getDefaultCookiePath() {
    return getCookiePath()
  }

  /**
   * Check if a cookie file exists and is recent (less than maxAge ms old)
   */
  isCookieFileValid(cookiePath, maxAgeMs = 24 * 60 * 60 * 1000) {
    try {
      if (!fs.existsSync(cookiePath)) return false
      const stats = fs.statSync(cookiePath)
      if (stats.size < 100) return false // Too small, probably empty/invalid
      const age = Date.now() - stats.mtimeMs
      return age < maxAgeMs
    } catch {
      return false
    }
  }

  /**
   * Parse video URL and extract metadata
   * Returns video info without downloading
   * If cookie extraction fails (DPAPI error), automatically retries without cookies
   */
  async parseUrl(url, options = {}) {
    // Extract URL from shared text (e.g. Douyin/TikTok share messages)
    url = this._extractUrl(url)

    const settings = options.settings || {}
    const cookieMode = options.cookieMode || settings.cookieMode || 'none'
    const cookieBrowser = options.cookieBrowser || settings.cookieBrowser || ''
    const cookieFile = options.cookieFile || settings.cookieFile || ''
    const cookieProfile = options.cookieProfile || settings.cookieProfile || ''

    // Determine the effective cookie strategy
    let effectiveCookieOpts = null

    if (cookieMode === 'file' && cookieFile) {
      // User explicitly chose a cookie file
      effectiveCookieOpts = { cookieMode: 'file', cookieFile, cookieBrowser: '', cookieProfile: '' }
    } else if (cookieMode === 'browser' && cookieBrowser) {
      // Browser mode — check if we have a pre-exported cookie file first
      const defaultCookiePath = this.getDefaultCookiePath()
      if (this.isCookieFileValid(defaultCookiePath)) {
        console.log('[YtdlpEngine] Using pre-exported cookie file:', defaultCookiePath)
        effectiveCookieOpts = { cookieMode: 'file', cookieFile: defaultCookiePath, cookieBrowser: '', cookieProfile: '' }
      } else {
        // No valid exported file — try browser mode directly (may fail with DPAPI)
        console.log('[YtdlpEngine] No valid exported cookie file, trying browser mode directly...')
        effectiveCookieOpts = { cookieMode: 'browser', cookieBrowser, cookieFile: '', cookieProfile }
      }
    }

    // AUTO-DETECT: Even if cookieMode is 'none', check if cookies.txt exists
    // (e.g. user saved site cookies via "Add Cookie by Site" but didn't change cookieMode)
    if (!effectiveCookieOpts) {
      const defaultCookiePath = this.getDefaultCookiePath()
      if (this.isCookieFileValid(defaultCookiePath)) {
        console.log('[YtdlpEngine] Auto-detected saved cookies.txt, using it:', defaultCookiePath)
        effectiveCookieOpts = { cookieMode: 'file', cookieFile: defaultCookiePath, cookieBrowser: '', cookieProfile: '' }
      }
    }

    // Log effective cookie strategy for debugging
    if (effectiveCookieOpts) {
      console.log('[YtdlpEngine] parseUrl cookie strategy:', JSON.stringify(effectiveCookieOpts))
      if (effectiveCookieOpts.cookieMode === 'file' && effectiveCookieOpts.cookieFile) {
        try {
          const stats = fs.statSync(effectiveCookieOpts.cookieFile)
          console.log(`[YtdlpEngine] Cookie file: ${effectiveCookieOpts.cookieFile}, size: ${stats.size}, age: ${((Date.now() - stats.mtimeMs) / 1000 / 60).toFixed(1)} min`)
        } catch (e) {
          console.log(`[YtdlpEngine] Cookie file stat error: ${e.message}`)
        }
      }
    } else {
      console.log('[YtdlpEngine] parseUrl: NO cookies configured')
    }

    // First attempt: with cookies if configured
    try {
      return await this._runParse(url, options, effectiveCookieOpts)
    } catch (error) {
      const errMsg = error.message || ''

      // Check if this is a cookie/auth-related error
      const isCookieError = errMsg.includes('DPAPI') ||
                            errMsg.includes('decrypt') ||
                            errMsg.includes('keyring') ||
                            errMsg.includes('secretstorage')
      
      const isAuthError = errMsg.includes('Sign in') ||
                          errMsg.includes('not a bot') ||
                          errMsg.includes('HTTP Error 412') ||
                          errMsg.includes('HTTP Error 403') ||
                          errMsg.includes('Fresh cookies') ||
                          (errMsg.includes('cookies') && (errMsg.includes('authentication') || errMsg.includes('login') || errMsg.includes('logged in') || errMsg.includes('needed')))

      // If DPAPI failed on browser mode, try without cookies
      if (effectiveCookieOpts && isCookieError) {
        console.log('[YtdlpEngine] Cookie extraction failed (DPAPI/decrypt error), retrying WITHOUT cookies...')
        console.log('[YtdlpEngine] Original error:', errMsg.substring(0, 200))

        try {
          const result = await this._runParse(url, options, null)
          result._cookieWarning = 'Cookie reading failed (DPAPI error). Parsed without cookies. Go to Settings > Cookie > "Add Cookie by Site" to add cookies manually.'
          return result
        } catch (retryError) {
          throw new Error(
            `Cookie error: ${errMsg.split('\n')[0]}\n` +
            `Retry without cookies also failed: ${retryError.message}`
          )
        }
      }

      // Auth/bot error — distinguish between "had cookies but insufficient" vs "no cookies at all"
      if (isAuthError) {
        if (effectiveCookieOpts) {
          // We DID send cookies, but they weren't enough (missing login session)
          // Detect which site for a more targeted message
          const isYouTube = url.includes('youtube.com') || url.includes('youtu.be')
          const isBilibili = url.includes('bilibili.com') || url.includes('b23.tv')
          const isDouyin = url.includes('douyin.com') || url.includes('iesdouyin.com')
          
          let siteHint = ''
          if (isDouyin) {
            // yt-dlp Douyin extractor is known to be broken (GitHub issue #9667)
            // Fallback to our custom Douyin extractor (no cookies needed!)
            console.log('[YtdlpEngine] yt-dlp Douyin failed, trying custom DouyinExtractor fallback...')
            try {
              const douyinResult = await this.douyinExtractor.parseVideo(url, options.settings)
              douyinResult._cookieWarning = 'Parsed using built-in Douyin extractor (yt-dlp Douyin is currently broken). No cookies needed!'
              console.log('[YtdlpEngine] DouyinExtractor fallback SUCCESS:', douyinResult.title)
              return douyinResult
            } catch (douyinErr) {
              console.error('[YtdlpEngine] DouyinExtractor fallback also failed:', douyinErr.message)
              // If both fail, throw a combined error
              siteHint =
                `\nDouyin (抖音) yt-dlp extractor is currently broken (known issue).` +
                `\nBuilt-in fallback extractor also failed: ${douyinErr.message}` +
                `\n\nPlease try:` +
                `\n1. Check if the video link is valid and accessible` +
                `\n2. Try a different Douyin video link` +
                `\n3. If the issue persists, the video may require login or be region-locked`
            }
          } else if (isYouTube) {
            siteHint = 
              `\nYouTube requires FULL Google login cookies (SID, HSID, SSID, __Secure-1PSID, etc).` +
              `\nYour current cookie file only contains visitor-level cookies without login session.` +
              `\n\nHow to fix:` +
              `\n1. Open Chrome/Edge, sign in to YouTube, play a video successfully` +
              `\n2. Press F12 > Application > Cookies > youtube.com` +
              `\n3. Copy ALL cookies (especially SID, HSID, SSID, __Secure-1PSID, __Secure-3PSID, LOGIN_INFO)` +
              `\n4. Go to Settings > Cookie > "Add Cookie by Site" > YouTube, paste the FULL cookie string` +
              `\n\nAlternatively: use a browser extension like "Get cookies.txt LOCALLY" to export a complete cookies.txt file, then import it.`
          } else if (isBilibili) {
            siteHint =
              `\nBilibili requires login cookies (SESSDATA, bili_jct, DedeUserID).` +
              `\nPlease make sure you are logged in to Bilibili in your browser, then re-export or re-paste cookies.`
          } else {
            siteHint =
              `\nThe cookie file was sent but the site still requires authentication.` +
              `\nYour cookies may be expired or missing login session data.` +
              `\nPlease re-export cookies after logging in to the site in your browser.`
          }

          throw new Error(
            `Cookie authentication failed - your cookies are insufficient or expired.${siteHint}` +
            `\n\nOriginal error: ${errMsg.split('\n')[0]}`
          )
        } else {
          // No cookies configured at all
          const isDouyin = url.includes('douyin.com') || url.includes('iesdouyin.com')
          if (isDouyin) {
            // yt-dlp Douyin extractor is known to be broken (GitHub issue #9667)
            // Fallback to our custom Douyin extractor (no cookies needed!)
            console.log('[YtdlpEngine] yt-dlp Douyin failed (no cookies), trying custom DouyinExtractor fallback...')
            try {
              const douyinResult = await this.douyinExtractor.parseVideo(url, options.settings)
              douyinResult._cookieWarning = 'Parsed using built-in Douyin extractor (yt-dlp Douyin is currently broken). No cookies needed!'
              console.log('[YtdlpEngine] DouyinExtractor fallback SUCCESS:', douyinResult.title)
              return douyinResult
            } catch (douyinErr) {
              console.error('[YtdlpEngine] DouyinExtractor fallback also failed:', douyinErr.message)
              throw new Error(
                `抖音 (Douyin) video extraction failed.\n` +
                `yt-dlp error: ${errMsg.split('\n')[0]}\n` +
                `Built-in extractor error: ${douyinErr.message}\n\n` +
                `Please check if the video link is valid and accessible.`
              )
            }
          }
          throw new Error(
            `This site requires authentication cookies.\n` +
            `Go to Settings > Cookie > "Add Cookie by Site", select the site, and paste your browser cookies.\n` +
            `Original error: ${errMsg.split('\n')[0]}`
          )
        }
      }

      // Check for YouTube n-parameter challenge failure (JS runtime missing)
      const isFormatError = errMsg.includes('Requested format is not available') ||
                            errMsg.includes('n challenge solving failed') ||
                            errMsg.includes('Only images are available')
      if (isFormatError) {
        const isYT = url.includes('youtube.com') || url.includes('youtu.be')
        if (isYT) {
          throw new Error(
            `YouTube n-parameter challenge failed — no video formats available.\n` +
            `This is usually caused by missing JavaScript runtime for yt-dlp.\n\n` +
            `Please ensure Node.js (v20+) is installed and available in your system PATH.\n` +
            `Download: https://nodejs.org/\n\n` +
            `After installing, restart the application.\n\n` +
            `Original error: ${errMsg.split('\n')[0]}`
          )
        }
      }

      // Not a cookie error — just throw as-is
      throw error
    }
  }

  /**
   * Internal: run a single parse attempt
   */
  _runParse(url, options, cookieOpts) {
    return new Promise((resolve, reject) => {
      const args = [
        ...this._buildCommonArgs(),
        '--dump-json',
        '--no-download',
        '--no-warnings',
        '--no-playlist',  // Parse single video by default
      ]

      // Add ffmpeg path
      if (this.binaryManager.binaryExists(this.binaryManager.ffmpegPath)) {
        args.push('--ffmpeg-location', path.dirname(this.binaryManager.ffmpegPath))
      }

      // Proxy
      args.push(...this._buildProxyArgs(options.settings))

      // Cookie (only if provided)
      if (cookieOpts) {
        args.push(...this._buildCookieArgs(cookieOpts))
      }

      args.push(url)

      console.log('[YtdlpEngine] Parse command:', this.binaryManager.ytdlpPath, args.join(' '))

      const proc = spawn(this.binaryManager.ytdlpPath, args, {
        timeout: 60000,
        windowsHide: true,
        env: this._buildUtf8Env(),
      })

      const stdoutChunks = []
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdoutChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data))
      })

      proc.stderr.on('data', (data) => {
        stderr += this._decodeOutput(Buffer.isBuffer(data) ? data : Buffer.from(data))
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `yt-dlp exited with code ${code}`))
          return
        }

        try {
          const stdout = this._decodeOutput(Buffer.concat(stdoutChunks))
          const info = JSON.parse(stdout)
          resolve(this._normalizeVideoInfo(info))
        } catch (e) {
          reject(new Error(`Failed to parse video info: ${e.message}`))
        }
      })

      proc.on('error', reject)
    })
  }

  /**
   * Parse a playlist URL
   */
  parsePlaylist(url, options = {}) {
    return new Promise((resolve, reject) => {
      const args = [
        ...this._buildCommonArgs(),
        '--dump-json',
        '--no-download',
        '--no-warnings',
        '--flat-playlist',  // Only get metadata, don't resolve each video
        '--yes-playlist',
      ]

      args.push(...this._buildProxyArgs(options.settings))

      // Cookie
      const cookieOpts = {
        cookieMode: options.cookieMode || (options.settings && options.settings.cookieMode) || 'none',
        cookieBrowser: options.cookieBrowser || (options.settings && options.settings.cookieBrowser) || '',
        cookieFile: options.cookieFile || (options.settings && options.settings.cookieFile) || '',
        cookieProfile: options.cookieProfile || (options.settings && options.settings.cookieProfile) || '',
      }
      args.push(...this._buildCookieArgs(cookieOpts))

      args.push(url)

      const proc = spawn(this.binaryManager.ytdlpPath, args, {
        timeout: 120000, // Playlists need more time
        windowsHide: true,
        env: this._buildUtf8Env(),
      })

      const stdoutChunks = []
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdoutChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data))
      })

      proc.stderr.on('data', (data) => {
        stderr += this._decodeOutput(Buffer.isBuffer(data) ? data : Buffer.from(data))
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `yt-dlp exited with code ${code}`))
          return
        }

        try {
          const stdout = this._decodeOutput(Buffer.concat(stdoutChunks))
          // Each video is a separate JSON line
          const videos = stdout
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line))
            .map((info) => this._normalizeVideoInfo(info))

          resolve(videos)
        } catch (e) {
          reject(new Error(`Failed to parse playlist info: ${e.message}`))
        }
      })

      proc.on('error', reject)
    })
  }

  /**
   * Normalize yt-dlp JSON output to our VideoInfo format
   * Handles differences between YouTube, Bilibili (DASH), and other sites
   */
  _normalizeVideoInfo(info) {
    // Debug: save raw JSON for troubleshooting (only in dev)
    try {
      const debugDir = getDebugDir()
      ensureDir(debugDir)
      const debugFile = path.join(debugDir, `parse_${Date.now()}.json`)
      fs.writeFileSync(debugFile, JSON.stringify(info, null, 2), 'utf-8')
      console.log('[YtdlpEngine] Raw JSON saved to:', debugFile)
    } catch (e) {
      // Ignore debug save errors (e.g. when not in Electron context)
    }

    const isBilibili = (info.extractor_key || '').toLowerCase().includes('bilibili') ||
                        (info.webpage_url || '').includes('bilibili.com')

    // ─── Extract and normalize all formats ────────────
    const allFormats = (info.formats || []).map((f) => {
      const hasVideo = f.vcodec && f.vcodec !== 'none'
      const hasAudio = f.acodec && f.acodec !== 'none'

      // Determine resolution string
      let resolution = 'unknown'
      if (hasVideo) {
        if (f.height) {
          resolution = `${f.height}p`
        } else if (f.resolution && f.resolution !== 'audio only') {
          resolution = f.resolution
        }
      } else if (hasAudio && !hasVideo) {
        resolution = 'Audio'
      }

      // Normalize extension: m4s -> mp4 for display (B站 DASH segments)
      let displayExt = f.ext || 'unknown'
      if (displayExt === 'm4s') displayExt = 'mp4'

      // Normalize codec for display
      let codec = ''
      if (hasVideo) {
        const vc = (f.vcodec || '').toLowerCase()
        if (vc.startsWith('avc') || vc.startsWith('h264')) codec = 'H.264'
        else if (vc.startsWith('hev') || vc.startsWith('hevc') || vc.startsWith('h265')) codec = 'H.265'
        else if (vc.startsWith('av01') || vc.startsWith('av1')) codec = 'AV1'
        else if (vc.startsWith('vp9') || vc.startsWith('vp09')) codec = 'VP9'
        else codec = f.vcodec
      } else if (hasAudio) {
        const ac = (f.acodec || '').toLowerCase()
        if (ac.startsWith('mp4a') || ac.includes('aac')) codec = 'AAC'
        else if (ac.startsWith('opus')) codec = 'Opus'
        else if (ac.includes('mp3')) codec = 'MP3'
        else codec = f.acodec
      }

      return {
        formatId: String(f.format_id || ''),
        resolution,
        ext: displayExt,
        codec,
        rawCodec: hasVideo ? f.vcodec : f.acodec,
        filesize: f.filesize || f.filesize_approx || 0,
        fps: f.fps || null,
        abr: f.abr || null,
        vbr: f.vbr || null,
        tbr: f.tbr || null,
        height: f.height || 0,
        width: f.width || 0,
        hasVideo: !!hasVideo,
        hasAudio: !!hasAudio,
        note: f.format_note || '',
        quality: f.quality || 0,
        dynamicRange: f.dynamic_range || null,
      }
    })

    // ─── Build UI format options ────────────
    // Group video formats by resolution, pick the best for each resolution
    const resolutions = new Map()
    for (const f of allFormats) {
      if (!f.hasVideo || f.resolution === 'unknown') continue

      const key = f.resolution
      const existing = resolutions.get(key)

      if (!existing) {
        resolutions.set(key, f)
      } else {
        // Prefer: larger filesize > higher quality score > H.264 over others (better compat)
        const newScore = (f.filesize || 0) + (f.quality || 0) * 1000
        const existScore = (existing.filesize || 0) + (existing.quality || 0) * 1000
        if (newScore > existScore) {
          resolutions.set(key, f)
        }
      }
    }

    const formatOptions = []

    // Sort by height (descending)
    const resSorted = [...resolutions.entries()]
      .sort((a, b) => {
        const ha = a[1].height || parseInt(a[0]) || 0
        const hb = b[1].height || parseInt(b[0]) || 0
        return hb - ha
      })

    for (const [res, f] of resSorted) {
      const sizeStr = f.filesize ? this._formatBytes(f.filesize) : ''
      const fpsStr = f.fps && f.fps > 30 ? `${f.fps}fps` : ''
      const hdrStr = f.dynamicRange && f.dynamicRange !== 'SDR' ? f.dynamicRange : ''

      // Build descriptive note
      const noteParts = [f.note, hdrStr, fpsStr].filter(Boolean)
      const noteStr = noteParts.join(' · ')

      formatOptions.push({
        id: f.formatId,
        resolution: res,
        format: f.ext.toUpperCase(),
        codec: f.codec,
        filesize: sizeStr || 'Unknown',
        note: noteStr,
      })
    }

    // If no video formats found (shouldn't happen), add a "best" option
    if (formatOptions.length === 0) {
      formatOptions.push({
        id: 'bestvideo+bestaudio',
        resolution: 'Best',
        format: 'MP4',
        codec: 'auto',
        filesize: 'Unknown',
        note: 'Best available quality',
      })
    }

    // Add audio-only option
    formatOptions.push({
      id: 'bestaudio',
      resolution: 'Audio Only',
      format: 'MP3',
      codec: 'audio',
      filesize: 'Varies',
      note: 'Best audio quality',
    })

    // ─── Extract subtitles ────────────
    const subtitles = []
    const subs = info.subtitles || {}
    const autoSubs = info.automatic_captions || {}

    for (const [lang, tracks] of Object.entries(subs)) {
      subtitles.push({ lang, name: this._langName(lang), auto: false })
    }
    for (const [lang, tracks] of Object.entries(autoSubs)) {
      if (!subs[lang]) {
        subtitles.push({ lang, name: this._langName(lang) + ' (Auto)', auto: true })
      }
    }

    // ─── Normalize thumbnail ────────────
    let thumbnail = info.thumbnail || ''
    // B站缩略图可能需要添加协议头
    if (thumbnail && thumbnail.startsWith('//')) {
      thumbnail = 'https:' + thumbnail
    }

    // ─── Duration handling ────────────
    // B站的 duration 有时是毫秒级，需要转换
    let duration = info.duration || 0
    if (duration > 100000) {
      // Likely in milliseconds (e.g. from timelength)
      duration = Math.round(duration / 1000)
    }

    // ─── Build result ────────────
    const result = {
      id: String(info.id || ''),
      title: info.title || info.fulltitle || 'Unknown',
      thumbnail,
      author: info.uploader || info.channel || info.creator || info.uploader_id || 'Unknown',
      duration,
      sourceSite: info.extractor_key || this._extractDomain(info.webpage_url || ''),
      description: (info.description || '').substring(0, 2000), // Limit description length
      uploadDate: info.upload_date || '',
      viewCount: info.view_count || 0,
      url: info.webpage_url || info.original_url || info.url || '',
      formats: formatOptions,
      subtitles,
      isPlaylist: info._type === 'playlist',
      playlistCount: info.playlist_count || 0,
    }

    console.log('[YtdlpEngine] Normalized video info:', JSON.stringify({
      id: result.id,
      title: result.title,
      author: result.author,
      duration: result.duration,
      sourceSite: result.sourceSite,
      formatsCount: result.formats.length,
      formats: result.formats.map(f => `${f.resolution} ${f.format} ${f.codec}`),
    }, null, 2))

    return result
  }

  /**
   * Start downloading a video
   */
  startDownload(taskId, url, options = {}) {
    // Extract URL from shared text (safety net)
    url = this._extractUrl(url)

    const {
      format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      resolution,
      outputDir,
      filename,
      subtitleLangs = [],
      settings = {},
      cookieFile,
      fileConflict = 'rename',
    } = options

    const args = [
      ...this._buildCommonArgs(),
      '--newline',           // Output progress on new lines
      '--no-warnings',
      '--progress',
      '--progress-template', '%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s',
    ]

    // FFmpeg location
    if (this.binaryManager.binaryExists(this.binaryManager.ffmpegPath)) {
      args.push('--ffmpeg-location', path.dirname(this.binaryManager.ffmpegPath))
    }

    // Format selection
    // For DASH sites (like Bilibili), always use bestvideo+bestaudio pattern
    // Single format_id won't work as video and audio are separate streams
    if (format === 'bestaudio' || (resolution && resolution.toLowerCase().includes('audio'))) {
      args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0')
    } else if (resolution) {
      const height = parseInt(resolution)
      if (height) {
        // Use bestvideo with height constraint + bestaudio, with fallbacks
        args.push('-f', `bestvideo[height<=${height}]+bestaudio/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`)
      } else {
        args.push('-f', 'bestvideo+bestaudio/best')
      }
    } else {
      // Default: always try bestvideo+bestaudio first (works for both DASH and non-DASH)
      args.push('-f', 'bestvideo+bestaudio/best')
    }

    // Merge format
    args.push('--merge-output-format', 'mp4')

    // Output template
    const outputTemplate = filename
      ? path.join(outputDir || '.', filename)
      : path.join(outputDir || '.', '%(title)s.%(ext)s')
    args.push('-o', outputTemplate)

    // Subtitles
    if (subtitleLangs.length > 0) {
      args.push('--write-sub', '--sub-langs', subtitleLangs.join(','))
      if (settings.subtitleFormat) {
        args.push('--sub-format', settings.subtitleFormat)
      }
    }

    // Speed limit
    if (settings.speedLimit && settings.speedLimit > 0) {
      args.push('--limit-rate', `${settings.speedLimit}M`)
    }

    // Proxy
    args.push(...this._buildProxyArgs(settings))

    // Cookie - prefer exported cookie file over browser mode (avoids DPAPI issues)
    const rawCookieMode = settings.cookieMode || 'none'
    let dlCookieOpts = null

    if (rawCookieMode === 'file' && (cookieFile || settings.cookieFile)) {
      dlCookieOpts = { cookieMode: 'file', cookieFile: cookieFile || settings.cookieFile, cookieBrowser: '', cookieProfile: '' }
    } else if (rawCookieMode === 'browser' && settings.cookieBrowser) {
      // Check for pre-exported cookie file first
      const defaultCookiePath = this.getDefaultCookiePath()
      if (this.isCookieFileValid(defaultCookiePath)) {
        console.log('[YtdlpEngine] Download using pre-exported cookie file:', defaultCookiePath)
        dlCookieOpts = { cookieMode: 'file', cookieFile: defaultCookiePath, cookieBrowser: '', cookieProfile: '' }
      } else {
        dlCookieOpts = { cookieMode: 'browser', cookieBrowser: settings.cookieBrowser, cookieFile: '', cookieProfile: settings.cookieProfile || '' }
      }
    }

    // AUTO-DETECT: Even if cookieMode is 'none', use cookies.txt if it exists
    if (!dlCookieOpts) {
      const defaultCookiePath = this.getDefaultCookiePath()
      if (this.isCookieFileValid(defaultCookiePath)) {
        console.log('[YtdlpEngine] Download auto-detected saved cookies.txt:', defaultCookiePath)
        dlCookieOpts = { cookieMode: 'file', cookieFile: defaultCookiePath, cookieBrowser: '', cookieProfile: '' }
      }
    }

    if (dlCookieOpts) {
      args.push(...this._buildCookieArgs(dlCookieOpts))
    }

    // File conflict strategy (fileConflict already destructured from options above)
    if (fileConflict === 'overwrite') {
      args.push('--force-overwrites')
    } else {
      args.push('--no-overwrites')
    }

    // URL
    args.push(url)

    console.log('[YtdlpEngine] Starting download:', taskId)
    console.log('[YtdlpEngine] Command:', this.binaryManager.ytdlpPath, args.join(' '))

    const proc = spawn(this.binaryManager.ytdlpPath, args, {
      windowsHide: true,
      env: this._buildUtf8Env(),
    })

    this.activeProcesses.set(taskId, { process: proc, isPaused: false })

    let lastProgress = 0

    proc.stdout.on('data', (data) => {
      const lines = this._decodeOutput(data).split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        // Try to parse progress line
        const progressMatch = trimmed.match(/([\d.]+)%?\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)/)
        if (progressMatch) {
          const percent = parseFloat(progressMatch[1])
          if (!isNaN(percent) && percent !== lastProgress) {
            lastProgress = percent
            this.emit('progress', {
              taskId,
              progress: percent,
              speed: progressMatch[2].trim() || '0 B/s',
              eta: progressMatch[3].trim() || '--:--',
              downloaded: progressMatch[4].trim() || '0 B',
              total: progressMatch[5].trim() || 'Unknown',
            })
          }
          continue
        }

        // Standard yt-dlp progress format: [download]  45.2% of 350.00MiB at 5.20MiB/s ETA 00:42
        const stdMatch = trimmed.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\S+)\s+at\s+([\d.]+\S+)\s+ETA\s+(\S+)/)
        if (stdMatch) {
          const percent = parseFloat(stdMatch[1])
          if (!isNaN(percent)) {
            this.emit('progress', {
              taskId,
              progress: percent,
              speed: stdMatch[3],
              eta: stdMatch[4],
              downloaded: '',
              total: stdMatch[2],
            })
          }
          continue
        }

        // Destination file info: [download] Destination: path/to/file.mp4
        const destMatch = trimmed.match(/\[(?:download|Merger)\].*Destination:\s*(.+)/)
        if (destMatch) {
          this.emit('destination', { taskId, filepath: destMatch[1].trim() })
          continue
        }

        // Merger output: [Merger] Merging formats into "path/to/file.mp4"
        const mergerMatch = trimmed.match(/\[Merger\]\s+Merging formats into\s+"(.+)"/)
        if (mergerMatch) {
          this.emit('destination', { taskId, filepath: mergerMatch[1].trim() })
          this.emit('postprocess', { taskId, message: trimmed })
          continue
        }

        // MoveFiles post-processor: [MoveFiles] Moving file "tmp.mp4" to "final.mp4"
        const moveMatch = trimmed.match(/\[MoveFiles\]\s+Moving file\s+"[^"]+"\s+to\s+"(.+)"/)
        if (moveMatch) {
          this.emit('destination', { taskId, filepath: moveMatch[1].trim() })
          continue
        }

        // Merging / post-processing info (without path)
        if (trimmed.includes('[Merger]') || trimmed.includes('[ExtractAudio]') || trimmed.includes('[FixupM4a]')) {
          this.emit('postprocess', { taskId, message: trimmed })
          continue
        }

        // Already downloaded: [download] path/to/file.mp4 has already been downloaded
        const alreadyMatch = trimmed.match(/\[download\]\s+(.+?)\s+has already been downloaded/)
        if (alreadyMatch) {
          this.emit('destination', { taskId, filepath: alreadyMatch[1].trim() })
          this.emit('progress', { taskId, progress: 100, speed: '0 B/s', eta: '0:00' })
          continue
        }

        // General info/debug
        this.emit('log', { taskId, message: trimmed })
      }
    })

    proc.stderr.on('data', (data) => {
      const msg = this._decodeOutput(data).trim()
      if (msg) {
        this.emit('log', { taskId, message: `[stderr] ${msg}` })
      }
    })

    proc.on('close', (code) => {
      // Check if the process was still tracked (i.e. not cancelled/paused externally).
      // pauseDownload() and cancelDownload() delete the entry BEFORE killing,
      // so if the entry is gone, this close was triggered by pause/cancel — not an error.
      const wasTracked = this.activeProcesses.has(taskId)
      this.activeProcesses.delete(taskId)

      if (code === 0) {
        this.emit('complete', { taskId })
      } else if (!wasTracked) {
        // Process was removed by pauseDownload/cancelDownload before close fired
        this.emit('cancelled', { taskId })
      } else {
        // Process was still tracked = genuine failure
        this.emit('error', { taskId, error: `Download failed with exit code ${code}` })
      }
    })

    proc.on('error', (err) => {
      this.activeProcesses.delete(taskId)
      this.emit('error', { taskId, error: err.message })
    })

    return taskId
  }

  /**
   * Kill a child process and its entire process tree.
   * On Windows, process.kill('SIGTERM') only kills the immediate process —
   * it does NOT kill child processes (e.g. ffmpeg spawned by yt-dlp).
   * This means the download continues even after the yt-dlp process is killed.
   * 
   * Solution: use `taskkill /T /F /PID <pid>` on Windows to kill the entire
   * process tree. On other platforms, use SIGTERM as before.
   * @param {import('child_process').ChildProcess} proc
   */
  _killProcessTree(proc) {
    if (!proc || !proc.pid) {
      console.log('[YtdlpEngine] _killProcessTree: no process or PID')
      return
    }

    const pid = proc.pid

    if (process.platform === 'win32') {
      try {
        // /T = kill process tree, /F = force kill
        execSync(`taskkill /T /F /PID ${pid}`, {
          windowsHide: true,
          timeout: 5000,
        })
        console.log(`[YtdlpEngine] Killed process tree PID ${pid} via taskkill`)
      } catch (err) {
        // taskkill may fail if process already exited — that's fine
        console.log(`[YtdlpEngine] taskkill PID ${pid} result: ${err.message || 'already exited'}`)
        // Fallback: try regular kill
        try { proc.kill() } catch {}
      }
    } else {
      // macOS / Linux: SIGTERM should propagate to process group
      try {
        // Kill the process group (negative PID)
        process.kill(-pid, 'SIGTERM')
      } catch {
        // Fallback to killing just the process
        try { proc.kill('SIGTERM') } catch {}
      }
    }
  }

  /**
   * Cancel a download
   */
  cancelDownload(taskId) {
    const entry = this.activeProcesses.get(taskId)
    if (entry) {
      this.activeProcesses.delete(taskId)
      this._killProcessTree(entry.process)
      return true
    }
    return false
  }

  /**
   * Pause a download (kill process, to be resumed later)
   * yt-dlp supports resuming partial downloads automatically
   */
  pauseDownload(taskId) {
    const entry = this.activeProcesses.get(taskId)
    if (entry) {
      this.activeProcesses.delete(taskId)
      this._killProcessTree(entry.process)
      return true
    }
    return false
  }

  /**
   * Check if a task is active
   */
  isActive(taskId) {
    return this.activeProcesses.has(taskId)
  }

  /**
   * Get count of active downloads
   */
  getActiveCount() {
    return this.activeProcesses.size
  }

  /**
   * Kill all active downloads
   */
  killAll() {
    for (const [taskId, entry] of this.activeProcesses) {
      this._killProcessTree(entry.process)
    }
    this.activeProcesses.clear()
  }

  // ─── Helpers ────────────────────────────

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `~${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  _extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '')
    } catch {
      return 'unknown'
    }
  }

  _langName(code) {
    const names = {
      en: 'English',
      zh: 'Chinese',
      'zh-Hans': 'Chinese (Simplified)',
      'zh-Hant': 'Chinese (Traditional)',
      ja: 'Japanese',
      ko: 'Korean',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      ru: 'Russian',
      ar: 'Arabic',
    }
    return names[code] || code
  }
}

module.exports = { YtdlpEngine }
