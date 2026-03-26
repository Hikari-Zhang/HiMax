/**
 * Binary Manager - Manages yt-dlp and FFmpeg binaries
 * Handles detection, downloading, and version checking
 */
const path = require('path')
const fs = require('fs')
const { execFile, spawn } = require('child_process')
const https = require('https')
const http = require('http')
const { getBinDir } = require('./app-paths.cjs')

class BinaryManager {
  constructor() {
    // Store binaries in <install_dir>/appdata/bin/
    this.binDir = getBinDir()
    this.platform = process.platform // 'win32' | 'darwin' | 'linux'

    this.ytdlpName = this.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    this.ffmpegName = this.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    this.ffprobeName = this.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'

    this.ytdlpPath = path.join(this.binDir, this.ytdlpName)
    this.ffmpegPath = path.join(this.binDir, this.ffmpegName)
    this.ffprobePath = path.join(this.binDir, this.ffprobeName)

    // Download URLs
    this.ytdlpUrls = {
      win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
      darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
      linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
    }

    // FFmpeg download URLs (using yt-dlp's recommended builds)
    this.ffmpegUrls = {
      win32: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
      darwin: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-macos64-gpl.tar.xz',
      linux: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
    }
  }

  /**
   * Ensure bin directory exists
   */
  ensureBinDir() {
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true })
    }
  }

  /**
   * Check if a binary exists and is executable
   */
  binaryExists(binPath) {
    try {
      fs.accessSync(binPath, fs.constants.X_OK)
      return true
    } catch {
      // On Windows, just check if file exists
      return this.platform === 'win32' && fs.existsSync(binPath)
    }
  }

  /**
   * Get yt-dlp version
   */
  getYtdlpVersion() {
    return new Promise((resolve) => {
      if (!this.binaryExists(this.ytdlpPath)) {
        resolve(null)
        return
      }
      execFile(this.ytdlpPath, ['--version'], { timeout: 10000 }, (err, stdout) => {
        if (err) {
          resolve(null)
        } else {
          resolve(stdout.trim())
        }
      })
    })
  }

  /**
   * Get FFmpeg version
   */
  getFfmpegVersion() {
    return new Promise((resolve) => {
      if (!this.binaryExists(this.ffmpegPath)) {
        resolve(null)
        return
      }
      execFile(this.ffmpegPath, ['-version'], { timeout: 10000 }, (err, stdout) => {
        if (err) {
          resolve(null)
        } else {
          const match = stdout.match(/ffmpeg version (\S+)/)
          resolve(match ? match[1] : 'unknown')
        }
      })
    })
  }

  /**
   * Get full status of all binaries
   */
  async getStatus() {
    const [ytdlpVersion, ffmpegVersion] = await Promise.all([
      this.getYtdlpVersion(),
      this.getFfmpegVersion(),
    ])

    return {
      ytdlp: {
        installed: !!ytdlpVersion,
        version: ytdlpVersion,
        path: this.ytdlpPath,
      },
      ffmpeg: {
        installed: !!ffmpegVersion,
        version: ffmpegVersion,
        path: this.ffmpegPath,
      },
      binDir: this.binDir,
    }
  }

  /**
   * Download a file with progress tracking
   */
  downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const tempPath = destPath + '.tmp'

      const doRequest = (reqUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'))
          return
        }

        const protocol = reqUrl.startsWith('https') ? https : http
        protocol.get(reqUrl, { headers: { 'User-Agent': 'HiMax/1.0' } }, (response) => {
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            doRequest(response.headers.location, redirectCount + 1)
            return
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`))
            return
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10)
          let downloadedSize = 0

          const file = fs.createWriteStream(tempPath)

          response.on('data', (chunk) => {
            downloadedSize += chunk.length
            if (onProgress && totalSize > 0) {
              onProgress({
                downloaded: downloadedSize,
                total: totalSize,
                percent: Math.round((downloadedSize / totalSize) * 100),
              })
            }
          })

          response.pipe(file)

          file.on('finish', () => {
            file.close(() => {
              // Move temp to final
              try {
                if (fs.existsSync(destPath)) {
                  fs.unlinkSync(destPath)
                }
                fs.renameSync(tempPath, destPath)

                // Make executable on Unix
                if (this.platform !== 'win32') {
                  fs.chmodSync(destPath, 0o755)
                }

                resolve()
              } catch (e) {
                reject(e)
              }
            })
          })

          file.on('error', (err) => {
            fs.unlinkSync(tempPath).catch(() => {})
            reject(err)
          })
        }).on('error', reject)
      }

      doRequest(url)
    })
  }

  /**
   * Download yt-dlp binary
   */
  async downloadYtdlp(onProgress) {
    this.ensureBinDir()
    const url = this.ytdlpUrls[this.platform]
    if (!url) throw new Error(`Unsupported platform: ${this.platform}`)

    await this.downloadFile(url, this.ytdlpPath, onProgress)
    return this.getYtdlpVersion()
  }

  /**
   * Download FFmpeg (extract from archive)
   */
  async downloadFfmpeg(onProgress) {
    this.ensureBinDir()
    const url = this.ffmpegUrls[this.platform]
    if (!url) throw new Error(`Unsupported platform: ${this.platform}`)

    if (this.platform === 'win32') {
      // Download zip, extract ffmpeg.exe and ffprobe.exe
      const zipPath = path.join(this.binDir, 'ffmpeg.zip')
      await this.downloadFile(url, zipPath, onProgress)

      // Use PowerShell to extract on Windows
      await new Promise((resolve, reject) => {
        const extractDir = path.join(this.binDir, 'ffmpeg-extract')
        const cmd = `
          $ErrorActionPreference = 'Stop';
          if (Test-Path '${extractDir}') { Remove-Item -Recurse -Force '${extractDir}' };
          Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force;
          $ffmpeg = Get-ChildItem -Path '${extractDir}' -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1;
          $ffprobe = Get-ChildItem -Path '${extractDir}' -Recurse -Filter 'ffprobe.exe' | Select-Object -First 1;
          if ($ffmpeg) { Copy-Item $ffmpeg.FullName '${this.ffmpegPath}' -Force };
          if ($ffprobe) { Copy-Item $ffprobe.FullName '${this.ffprobePath}' -Force };
          Remove-Item -Recurse -Force '${extractDir}';
          Remove-Item -Force '${zipPath}';
        `.replace(/\n/g, ' ')

        execFile('powershell', ['-NoProfile', '-Command', cmd], { timeout: 120000 }, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    } else {
      // macOS/Linux: download tar.xz, extract
      const archivePath = path.join(this.binDir, 'ffmpeg.tar.xz')
      await this.downloadFile(url, archivePath, onProgress)

      await new Promise((resolve, reject) => {
        const extractDir = path.join(this.binDir, 'ffmpeg-extract')
        execFile('sh', ['-c', `
          mkdir -p "${extractDir}" &&
          tar -xf "${archivePath}" -C "${extractDir}" &&
          find "${extractDir}" -name "ffmpeg" -type f -exec cp {} "${this.ffmpegPath}" \\; &&
          find "${extractDir}" -name "ffprobe" -type f -exec cp {} "${this.ffprobePath}" \\; &&
          chmod +x "${this.ffmpegPath}" "${this.ffprobePath}" &&
          rm -rf "${extractDir}" "${archivePath}"
        `], { timeout: 120000 }, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    return this.getFfmpegVersion()
  }

  /**
   * Update yt-dlp using its built-in update mechanism
   */
  async updateYtdlp(onProgress) {
    if (!this.binaryExists(this.ytdlpPath)) {
      return this.downloadYtdlp(onProgress)
    }

    return new Promise((resolve, reject) => {
      execFile(this.ytdlpPath, ['--update'], { timeout: 60000 }, async (err, stdout) => {
        if (err) {
          // Fallback: re-download
          try {
            const version = await this.downloadYtdlp(onProgress)
            resolve(version)
          } catch (e) {
            reject(e)
          }
        } else {
          const version = await this.getYtdlpVersion()
          resolve(version)
        }
      })
    })
  }

  /**
   * Set a custom path for yt-dlp (overrides default)
   * @param {string} customPath - empty string to reset to default
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async setCustomYtdlpPath(customPath) {
    if (!customPath) {
      // Reset to default
      this.ytdlpPath = path.join(this.binDir, this.ytdlpName)
      const version = await this.getYtdlpVersion()
      return { success: true, version, path: this.ytdlpPath }
    }

    // Verify the binary exists and works
    if (!fs.existsSync(customPath)) {
      return { success: false, error: 'FILE_NOT_FOUND' }
    }

    try {
      const version = await new Promise((resolve, reject) => {
        execFile(customPath, ['--version'], { timeout: 10000 }, (err, stdout) => {
          if (err) reject(err)
          else resolve(stdout.trim())
        })
      })
      this.ytdlpPath = customPath
      return { success: true, version, path: customPath }
    } catch (err) {
      return { success: false, error: 'INVALID_BINARY', details: err.message }
    }
  }

  /**
   * Set a custom path for FFmpeg (overrides default)
   * @param {string} customPath - empty string to reset to default
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async setCustomFfmpegPath(customPath) {
    if (!customPath) {
      // Reset to default
      this.ffmpegPath = path.join(this.binDir, this.ffmpegName)
      const version = await this.getFfmpegVersion()
      return { success: true, version, path: this.ffmpegPath }
    }

    // Verify the binary exists and works
    if (!fs.existsSync(customPath)) {
      return { success: false, error: 'FILE_NOT_FOUND' }
    }

    try {
      const version = await new Promise((resolve, reject) => {
        execFile(customPath, ['-version'], { timeout: 10000 }, (err, stdout) => {
          if (err) reject(err)
          else {
            const match = stdout.match(/ffmpeg version (\S+)/)
            resolve(match ? match[1] : 'unknown')
          }
        })
      })
      this.ffmpegPath = customPath
      // Also check for ffprobe in the same directory
      const dir = path.dirname(customPath)
      const ffprobePath = path.join(dir, this.ffprobeName)
      if (fs.existsSync(ffprobePath)) {
        this.ffprobePath = ffprobePath
      }
      return { success: true, version, path: customPath }
    } catch (err) {
      return { success: false, error: 'INVALID_BINARY', details: err.message }
    }
  }

  /**
   * Ensure both binaries are available, download if missing
   */
  async ensureBinaries(onProgress) {
    const status = await this.getStatus()
    const results = { ytdlp: status.ytdlp, ffmpeg: status.ffmpeg }

    if (!status.ytdlp.installed) {
      if (onProgress) onProgress({ stage: 'ytdlp', message: 'Downloading yt-dlp...' })
      const version = await this.downloadYtdlp((p) => {
        if (onProgress) onProgress({ stage: 'ytdlp', ...p })
      })
      results.ytdlp = { installed: true, version, path: this.ytdlpPath }
    }

    if (!status.ffmpeg.installed) {
      if (onProgress) onProgress({ stage: 'ffmpeg', message: 'Downloading FFmpeg...' })
      const version = await this.downloadFfmpeg((p) => {
        if (onProgress) onProgress({ stage: 'ffmpeg', ...p })
      })
      results.ffmpeg = { installed: true, version, path: this.ffmpegPath }
    }

    return results
  }
}

module.exports = { BinaryManager }
