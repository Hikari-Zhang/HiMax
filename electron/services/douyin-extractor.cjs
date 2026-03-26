/**
 * Custom Douyin (抖音) video extractor
 * 
 * Bypasses yt-dlp's broken Douyin extractor by directly parsing the mobile web page.
 * No cookies required — uses the iesdouyin.com mobile share page which embeds
 * video data in `window._ROUTER_DATA`.
 * 
 * This is a fallback for when yt-dlp fails with "Fresh cookies needed".
 */

const https = require('https')
const http = require('http')
const url = require('url')

class DouyinExtractor {
  constructor() {
    this.mobileUA = 'Mozilla/5.0 (Linux; Android 12; SM-G991B Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    this.defaultHeaders = {
      'User-Agent': this.mobileUA,
      'Referer': 'https://www.douyin.com/',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
  }

  /**
   * Check if a URL is a Douyin URL
   */
  static isDouyinUrl(inputUrl) {
    return /douyin\.com|iesdouyin\.com/.test(inputUrl)
  }

  /**
   * Extract video ID from various Douyin URL formats:
   * - https://www.douyin.com/video/7592921587440028968
   * - https://v.douyin.com/xxxxx/
   * - https://www.iesdouyin.com/share/video/7592921587440028968/
   */
  async extractVideoId(inputUrl) {
    // Direct video URL: /video/ID
    const directMatch = inputUrl.match(/\/video\/(\d+)/)
    if (directMatch) {
      return directMatch[1]
    }

    // Short link: need to follow redirect
    if (inputUrl.includes('v.douyin.com') || inputUrl.includes('/share/')) {
      const finalUrl = await this._followRedirects(inputUrl)
      const idMatch = finalUrl.match(/\/video\/(\d+)/)
      if (idMatch) {
        return idMatch[1]
      }
      // Also try aweme_id in query params
      const urlObj = new URL(finalUrl)
      const awemeId = urlObj.searchParams.get('aweme_id')
      if (awemeId) return awemeId
    }

    // Try extracting any long number that looks like an aweme_id
    const numMatch = inputUrl.match(/(\d{15,})/)
    if (numMatch) return numMatch[1]

    throw new Error('Could not extract Douyin video ID from URL')
  }

  /**
   * Parse a Douyin video URL and return video info
   * @param {string} inputUrl - Douyin video URL
   * @param {object} [proxySettings] - Optional proxy settings
   * @returns {Promise<object>} Normalized video info compatible with our VideoInfo format
   */
  async parseVideo(inputUrl, proxySettings) {
    console.log('[DouyinExtractor] Parsing:', inputUrl)

    const videoId = await this.extractVideoId(inputUrl)
    console.log('[DouyinExtractor] Video ID:', videoId)

    // Fetch the mobile share page
    const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}/`
    console.log('[DouyinExtractor] Fetching share page:', shareUrl)

    const html = await this._fetchPage(shareUrl, proxySettings)

    // Extract _ROUTER_DATA JSON from the page
    const routerDataMatch = html.match(/window\._ROUTER_DATA\s*=\s*(\{.+?\})\s*<\/script/s)
    if (!routerDataMatch) {
      // Try alternative pattern
      const altMatch = html.match(/window\._ROUTER_DATA\s*=\s*(\{.+?\});?\s*<\/script/s)
      if (!altMatch) {
        console.error('[DouyinExtractor] Could not find _ROUTER_DATA in page HTML')
        console.error('[DouyinExtractor] HTML length:', html.length)
        console.error('[DouyinExtractor] HTML snippet:', html.substring(0, 500))
        throw new Error('Failed to extract video data from Douyin page. The page structure may have changed.')
      }
      return this._parseRouterData(altMatch[1], videoId, inputUrl)
    }

    return this._parseRouterData(routerDataMatch[1], videoId, inputUrl)
  }

  /**
   * Parse the _ROUTER_DATA JSON and extract video info
   */
  _parseRouterData(jsonStr, videoId, originalUrl) {
    let data
    try {
      data = JSON.parse(jsonStr)
    } catch (e) {
      console.error('[DouyinExtractor] JSON parse error:', e.message)
      throw new Error('Failed to parse Douyin video data JSON')
    }

    // Navigate to the item data
    // The structure is: loaderData -> video_(id)/page -> videoInfoRes -> item_list[0]
    const loaderData = data.loaderData || {}
    
    // Find the correct page key (it may vary)
    let videoPage = null
    for (const [key, value] of Object.entries(loaderData)) {
      if (key.includes('video') && value && value.videoInfoRes) {
        videoPage = value
        break
      }
    }

    if (!videoPage || !videoPage.videoInfoRes || !videoPage.videoInfoRes.item_list || !videoPage.videoInfoRes.item_list[0]) {
      console.error('[DouyinExtractor] Unexpected data structure:', JSON.stringify(Object.keys(loaderData)))
      throw new Error('Douyin video data has unexpected structure. Video may be unavailable.')
    }

    const item = videoPage.videoInfoRes.item_list[0]
    const author = item.author || {}
    const video = item.video || {}
    const playAddr = video.play_addr || {}
    const coverInfo = video.cover || {}

    // Get video URL
    const videoUri = playAddr.uri || ''
    let videoUrl = ''
    if (videoUri) {
      if (videoUri.includes('mp3') || videoUri.startsWith('http')) {
        videoUrl = videoUri
      } else {
        // Construct the play URL
        videoUrl = `https://www.douyin.com/aweme/v1/play/?video_id=${videoUri}`
      }
    }

    // Also check url_list for direct URLs
    if (!videoUrl && playAddr.url_list && playAddr.url_list.length > 0) {
      videoUrl = playAddr.url_list[0]
    }

    if (!videoUrl) {
      throw new Error('Could not extract video download URL')
    }

    // Get thumbnail
    let thumbnail = ''
    if (coverInfo.url_list && coverInfo.url_list.length > 0) {
      thumbnail = coverInfo.url_list[0]
    }

    // Get duration (in milliseconds in the API, convert to seconds)
    let duration = video.duration || 0
    if (duration > 10000) {
      duration = Math.round(duration / 1000) // ms -> seconds
    }

    // Get video dimensions
    const width = video.width || playAddr.width || 0
    const height = video.height || playAddr.height || 0

    // Build format options
    const formatOptions = []

    // Main video format
    if (height) {
      formatOptions.push({
        id: 'douyin_default',
        resolution: `${height}p`,
        format: 'MP4',
        codec: 'H.264',
        filesize: 'Unknown',
        note: 'Douyin original (no watermark)',
      })
    } else {
      formatOptions.push({
        id: 'douyin_default',
        resolution: 'Original',
        format: 'MP4',
        codec: 'H.264',
        filesize: 'Unknown',
        note: 'Douyin original (no watermark)',
      })
    }

    // Audio-only option
    formatOptions.push({
      id: 'bestaudio',
      resolution: 'Audio Only',
      format: 'MP3',
      codec: 'audio',
      filesize: 'Varies',
      note: 'Audio extracted from video',
    })

    const result = {
      id: item.aweme_id || videoId,
      title: item.desc || 'Douyin Video',
      thumbnail,
      author: author.nickname || 'Unknown',
      duration,
      sourceSite: 'Douyin',
      description: item.desc || '',
      uploadDate: '',
      viewCount: 0,
      url: originalUrl || `https://www.douyin.com/video/${videoId}`,
      formats: formatOptions,
      subtitles: [],
      isPlaylist: false,
      playlistCount: 0,
      // Custom fields for our downloader
      _douyinDirect: true,         // Flag: this was parsed by our custom extractor
      _douyinVideoUrl: videoUrl,   // Direct video URL for downloading
      _douyinVideoUri: videoUri,   // Video URI for constructing alternative URLs
      _douyinHeaders: {            // Required headers for downloading
        'User-Agent': this.mobileUA,
        'Referer': 'https://www.douyin.com/',
      },
    }

    console.log('[DouyinExtractor] Parsed successfully:', {
      id: result.id,
      title: result.title,
      author: result.author,
      duration: result.duration,
      videoUrl: videoUrl.substring(0, 100) + '...',
    })

    return result
  }

  /**
   * Download a Douyin video using the direct URL
   * Returns the resolved (final redirect) video URL for downloading with ffmpeg/fetch
   * @param {string} videoUrl - The video URL from parseVideo
   * @param {string} outputPath - Full output file path
   * @param {object} [proxySettings] - Optional proxy settings  
   * @param {function} [onProgress] - Progress callback (percent, downloadedBytes, totalBytes)
   * @returns {Promise<string>} Path to downloaded file
   */
  async downloadVideo(videoUrl, outputPath, proxySettings, onProgress) {
    console.log('[DouyinExtractor] Downloading:', videoUrl.substring(0, 100))
    console.log('[DouyinExtractor] Output:', outputPath)

    const fs = require('fs')
    const path = require('path')

    // Ensure output directory exists
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 10) {
          reject(new Error('Too many redirects'))
          return
        }

        const parsedUrl = new URL(requestUrl)
        const transport = parsedUrl.protocol === 'https:' ? https : http

        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: {
            'User-Agent': this.mobileUA,
            'Referer': 'https://www.douyin.com/',
            'Accept': '*/*',
          },
        }

        const req = transport.request(options, (res) => {
          // Follow redirects
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location
            if (redirectUrl.startsWith('/')) {
              redirectUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${redirectUrl}`
            }
            console.log(`[DouyinExtractor] Redirect ${res.statusCode} -> ${redirectUrl.substring(0, 100)}`)
            res.resume() // Drain the response
            doRequest(redirectUrl, redirectCount + 1)
            return
          }

          if (res.statusCode !== 200) {
            res.resume()
            reject(new Error(`Download failed with HTTP ${res.statusCode}`))
            return
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
          let downloadedBytes = 0

          const fileStream = fs.createWriteStream(outputPath)

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length
            if (onProgress && totalBytes > 0) {
              const percent = Math.round((downloadedBytes / totalBytes) * 100)
              onProgress(percent, downloadedBytes, totalBytes)
            }
          })

          res.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close()
            console.log(`[DouyinExtractor] Download complete: ${downloadedBytes} bytes`)
            resolve(outputPath)
          })

          fileStream.on('error', (err) => {
            fs.unlink(outputPath, () => {})
            reject(err)
          })
        })

        req.on('error', (err) => {
          reject(new Error(`Download request failed: ${err.message}`))
        })

        req.end()
      }

      doRequest(videoUrl)
    })
  }

  /**
   * Fetch a page's HTML content
   */
  _fetchPage(pageUrl, proxySettings) {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 10) {
          reject(new Error('Too many redirects'))
          return
        }

        const parsedUrl = new URL(requestUrl)
        const transport = parsedUrl.protocol === 'https:' ? https : http

        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: this.defaultHeaders,
          timeout: 30000,
        }

        const req = transport.request(options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location
            if (redirectUrl.startsWith('/')) {
              redirectUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${redirectUrl}`
            }
            res.resume()
            doRequest(redirectUrl, redirectCount + 1)
            return
          }

          if (res.statusCode !== 200) {
            res.resume()
            reject(new Error(`HTTP ${res.statusCode} fetching Douyin page`))
            return
          }

          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            const html = Buffer.concat(chunks).toString('utf-8')
            resolve(html)
          })
          res.on('error', reject)
        })

        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('Douyin page request timed out'))
        })

        req.end()
      }

      doRequest(pageUrl)
    })
  }

  /**
   * Follow redirects to get the final URL
   */
  _followRedirects(inputUrl) {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl, redirectCount = 0) => {
        if (redirectCount > 10) {
          resolve(requestUrl) // Give up, return what we have
          return
        }

        const parsedUrl = new URL(requestUrl)
        const transport = parsedUrl.protocol === 'https:' ? https : http

        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'HEAD',
          headers: {
            'User-Agent': this.mobileUA,
          },
          timeout: 15000,
        }

        const req = transport.request(options, (res) => {
          res.resume()
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location
            if (redirectUrl.startsWith('/')) {
              redirectUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${redirectUrl}`
            }
            doRequest(redirectUrl, redirectCount + 1)
          } else {
            resolve(requestUrl)
          }
        })

        req.on('error', () => resolve(requestUrl))
        req.on('timeout', () => {
          req.destroy()
          resolve(requestUrl)
        })

        req.end()
      }

      doRequest(inputUrl)
    })
  }
}

module.exports = DouyinExtractor
