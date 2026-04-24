/**
 * Download Manager - Task queue, concurrency control, persistence
 * Manages the lifecycle of all download tasks
 */
const { app, Notification } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { getDataDir } = require('./app-paths.cjs')

class DownloadManager {
  constructor(ytdlpEngine, settings = {}) {
    this.engine = ytdlpEngine
    this.tasks = new Map()       // taskId -> task object
    this.settings = settings
    this.maxConcurrent = settings.maxConcurrent || 3
    this.listeners = new Set()   // Set of callback functions for state changes

    // Data persistence — stored in <install_dir>/appdata/data/
    this.dataDir = getDataDir()
    this.tasksFile = path.join(this.dataDir, 'tasks.json')
    this.settingsFile = path.join(this.dataDir, 'settings.json')
    this._ensureDataDir()
    this._loadSettings()
    this._loadTasks()

    // Wire up engine events
    this._setupEngineEvents()

    // Auto-resume interrupted downloads after a short delay
    // (give the app time to fully initialize before spawning yt-dlp processes)
    const queuedCount = [...this.tasks.values()].filter(t => t.status === 'queued').length
    if (queuedCount > 0) {
      console.log(`[DownloadManager] ${queuedCount} interrupted task(s) found, will auto-resume in 3s...`)
      setTimeout(() => {
        console.log('[DownloadManager] Auto-resuming interrupted downloads...')
        this._processQueue()
      }, 3000)
    }
  }

  // ─── Public API ────────────────────────────

  /**
   * Add a new download task
   */
  addTask(videoInfo, downloadOptions) {
    const taskId = this._generateId()
    const now = Date.now()

    // Apply default settings if not explicitly specified in downloadOptions
    const format = downloadOptions.format || this.settings.defaultFormat || 'mp4'
    const resolution = downloadOptions.resolution || this.settings.defaultQuality || 'best'
    const outputDir = downloadOptions.outputDir || this.settings.defaultDir || app.getPath('downloads')

    // Generate filename from template
    const filename = downloadOptions.filename || this._buildFilename(videoInfo, {
      format,
      resolution,
    })

    const task = {
      id: taskId,
      url: videoInfo.url || downloadOptions.url,
      title: videoInfo.title || 'Unknown',
      thumbnail: videoInfo.thumbnail || '',
      author: videoInfo.author || 'Unknown',
      duration: videoInfo.duration || 0,
      sourceSite: videoInfo.sourceSite || 'unknown',
      format,
      resolution,
      subtitleLang: downloadOptions.subtitleLangs || [],
      outputDir,
      filename,
      status: 'queued',
      progress: 0,
      speed: '0 B/s',
      eta: '--:--',
      filesize: downloadOptions.filesize || 0,
      downloadedSize: 0,
      error: null,
      retryCount: 0,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      filepath: null,

      // Internal fields
      _downloadOptions: downloadOptions,
      // Douyin direct download fields (set when parsed by custom DouyinExtractor)
      _douyinDirect: videoInfo._douyinDirect || false,
      _douyinVideoUrl: videoInfo._douyinVideoUrl || null,
      _douyinVideoUri: videoInfo._douyinVideoUri || null,
      _douyinHeaders: videoInfo._douyinHeaders || null,
    }

    this.tasks.set(taskId, task)
    this._saveTasks()
    this._notifyListeners('task-added', task)

    // Try to start if we have capacity
    this._processQueue()

    return task
  }

  /**
   * Pause a downloading task
   */
  pauseTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return false

    if (task.status === 'downloading') {
      this.engine.pauseDownload(taskId)
      task.status = 'paused'
      task.speed = '0 B/s'
      task.eta = '--:--'
      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._processQueue() // Start next queued task
      return true
    }
    return false
  }

  /**
   * Resume a paused or queued task
   * Also supports resuming failed tasks (acts like retry)
   */
  resumeTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return false

    if (task.status === 'paused' || task.status === 'queued') {
      task.status = 'queued'
      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._processQueue()
      return true
    }
    // Also allow resuming failed tasks (same as retry)
    if (task.status === 'download_failed' || task.status === 'parse_failed') {
      task.status = 'queued'
      task.error = null
      task.retryCount++
      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._processQueue()
      return true
    }
    return false
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return false

    if (task.status === 'downloading') {
      this.engine.cancelDownload(taskId)
    }

    task.status = 'cancelled'
    this._saveTasks()
    this._notifyListeners('task-updated', task)
    this._processQueue()
    return true
  }

  /**
   * Retry a failed task
   */
  retryTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return false

    if (task.status === 'download_failed' || task.status === 'parse_failed') {
      task.status = 'queued'
      task.error = null
      task.progress = 0
      task.speed = '0 B/s'
      task.eta = '--:--'
      task.retryCount++
      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._processQueue()
      return true
    }
    return false
  }

  /**
   * Remove a task completely
   */
  removeTask(taskId, deleteFile = false) {
    const task = this.tasks.get(taskId)
    if (!task) return false

    console.log(`[DownloadManager] removeTask: id=${taskId}, deleteFile=${deleteFile}, filepath=${task.filepath}`)

    // Stop if still running
    if (task.status === 'downloading') {
      this.engine.cancelDownload(taskId)
    }

    // Delete file if requested
    if (deleteFile && task.filepath) {
      if (fs.existsSync(task.filepath)) {
        try {
          fs.unlinkSync(task.filepath)
          console.log(`[DownloadManager] File deleted: ${task.filepath}`)
        } catch (err) {
          console.error(`[DownloadManager] Failed to delete file: ${task.filepath}`, err)
        }
      } else {
        console.warn(`[DownloadManager] File not found for deletion: ${task.filepath}`)
      }
    }

    this.tasks.delete(taskId)
    this._saveTasks()
    this._notifyListeners('task-removed', { id: taskId })
    return true
  }

  /**
   * Pause all active downloads
   */
  pauseAll() {
    for (const [id, task] of this.tasks) {
      if (task.status === 'downloading') {
        this.pauseTask(id)
      }
    }
  }

  /**
   * Resume all paused tasks
   */
  resumeAll() {
    for (const [id, task] of this.tasks) {
      if (task.status === 'paused') {
        this.resumeTask(id)
      }
    }
  }

  /**
   * Get all tasks
   */
  getAllTasks() {
    return [...this.tasks.values()]
  }

  /**
   * Get tasks by status category
   */
  getTasksByCategory() {
    const downloading = []
    const completed = []
    const history = []

    for (const task of this.tasks.values()) {
      // Strip internal fields for frontend
      const cleanTask = { ...task }
      delete cleanTask._downloadOptions
      delete cleanTask._douyinDirect
      delete cleanTask._douyinVideoUrl
      delete cleanTask._douyinVideoUri
      delete cleanTask._douyinHeaders

      if (task.status === 'completed') {
        completed.push(cleanTask)
        history.push(cleanTask)
      } else if (task.status === 'cancelled') {
        history.push(cleanTask)
      } else if (task.status === 'download_failed' || task.status === 'parse_failed') {
        downloading.push(cleanTask)
        history.push(cleanTask)
      } else {
        downloading.push(cleanTask)
      }
    }

    return { downloading, completed, history }
  }

  /**
   * Clear all history tasks (completed, cancelled, failed)
   * Does NOT delete files from disk
   */
  clearHistory(deleteFiles = false) {
    const toRemove = []
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'cancelled' ||
          task.status === 'download_failed' || task.status === 'parse_failed') {
        // Stop if still running (shouldn't be, but just in case)
        if (task.status === 'downloading') {
          this.engine.cancelDownload(id)
        }
        // Delete file if requested
        if (deleteFiles && task.filepath && fs.existsSync(task.filepath)) {
          try {
            fs.unlinkSync(task.filepath)
            console.log(`[DownloadManager] clearHistory deleted file: ${task.filepath}`)
          } catch (err) {
            console.error(`[DownloadManager] clearHistory failed to delete: ${task.filepath}`, err)
          }
        }
        toRemove.push(id)
      }
    }
    for (const id of toRemove) {
      this.tasks.delete(id)
    }
    if (toRemove.length > 0) {
      this._saveTasks()
      this._notifyListeners('task-removed', { cleared: toRemove.length })
    }
    console.log(`[DownloadManager] clearHistory: removed ${toRemove.length} tasks`)
    return { success: true, count: toRemove.length }
  }

  /**
   * Clear completed tasks from the downloading view
   * (removes tasks with status 'completed')
   */
  clearCompleted(deleteFiles = false) {
    const toRemove = []
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed') {
        if (deleteFiles && task.filepath && fs.existsSync(task.filepath)) {
          try {
            fs.unlinkSync(task.filepath)
            console.log(`[DownloadManager] clearCompleted deleted file: ${task.filepath}`)
          } catch (err) {
            console.error(`[DownloadManager] clearCompleted failed to delete: ${task.filepath}`, err)
          }
        }
        toRemove.push(id)
      }
    }
    for (const id of toRemove) {
      this.tasks.delete(id)
    }
    if (toRemove.length > 0) {
      this._saveTasks()
      this._notifyListeners('task-removed', { cleared: toRemove.length })
    }
    console.log(`[DownloadManager] clearCompleted: removed ${toRemove.length} tasks`)
    return { success: true, count: toRemove.length }
  }

  /**
   * Get download statistics computed from real task data
   */
  getStats() {
    const now = Date.now()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayMs = todayStart.getTime()
    const weekMs = todayMs - 6 * 86400000 // last 7 days including today

    const allTasks = Array.from(this.tasks.values())

    // Only count completed tasks for statistics
    const completedTasks = allTasks.filter(t => t.status === 'completed')

    // Basic counts
    const totalDownloads = completedTasks.length
    let totalBytes = 0
    let todayDownloads = 0
    let weekDownloads = 0

    // Source & format distribution counters
    const sourceMap = {}
    const formatMap = {}

    // Daily trend: last 30 days
    const dailyMap = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000)
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      dailyMap[key] = { downloads: 0, size: 0 }
    }

    for (const task of completedTasks) {
      const completedAt = task.completedAt || task.createdAt || 0
      const filesize = task.filesize || 0
      totalBytes += filesize

      // Today
      if (completedAt >= todayMs) todayDownloads++
      // This week
      if (completedAt >= weekMs) weekDownloads++

      // Source distribution
      const source = this._normalizeSource(task.sourceSite || task.url || '')
      sourceMap[source] = (sourceMap[source] || 0) + 1

      // Format distribution
      const fmt = (task.format || 'mp4').toUpperCase()
      formatMap[fmt] = (formatMap[fmt] || 0) + 1

      // Daily trend
      if (completedAt > 0) {
        const d = new Date(completedAt)
        const key = `${d.getMonth() + 1}/${d.getDate()}`
        if (dailyMap[key]) {
          dailyMap[key].downloads++
          dailyMap[key].size += filesize
        }
      }
    }

    // Also count active/failed tasks for totalDownloads display
    const allCount = allTasks.length

    // Format total size
    const totalSize = this._formatBytes(totalBytes)

    // Convert source distribution to sorted array with colors
    const sourceColors = {
      'YouTube': '#FF0000',
      'Bilibili': '#00A1D6',
      'Twitter/X': '#1DA1F2',
      'TikTok': '#010101',
      'Douyin': '#010101',
      'Vimeo': '#1AB7EA',
      'Instagram': '#E1306C',
      'Facebook': '#4267B2',
      'Reddit': '#FF4500',
      'Twitch': '#9146FF',
      'SoundCloud': '#FF5500',
      'NicoNico': '#252525',
      'Others': '#666666',
    }
    const sourceTotal = Object.values(sourceMap).reduce((a, b) => a + b, 0) || 1
    const sourceDistribution = Object.entries(sourceMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({
        name,
        value: Math.round((count / sourceTotal) * 100),
        color: sourceColors[name] || sourceColors['Others'],
      }))
    // If there are more sources beyond top 6, aggregate as "Others"
    if (Object.keys(sourceMap).length > 6) {
      const topCount = sourceDistribution.reduce((a, b) => a + b.value, 0)
      if (topCount < 100) {
        sourceDistribution.push({ name: 'Others', value: 100 - topCount, color: '#666666' })
      }
    }

    // Convert format distribution to sorted array with colors
    const formatColors = ['#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']
    const formatTotal = Object.values(formatMap).reduce((a, b) => a + b, 0) || 1
    const formatDistribution = Object.entries(formatMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count], i) => ({
        name,
        value: Math.round((count / formatTotal) * 100),
        color: formatColors[i % formatColors.length],
      }))

    // Convert daily trend to array
    const dailyTrend = Object.entries(dailyMap).map(([date, data]) => ({
      date,
      downloads: data.downloads,
      size: +(data.size / (1024 * 1024)).toFixed(1), // MB
    }))

    return {
      totalDownloads,
      totalSize,
      todayDownloads,
      weekDownloads,
      sourceDistribution,
      formatDistribution,
      dailyTrend,
    }
  }

  /**
   * Normalize source site name from URL or sourceSite field
   */
  _normalizeSource(source) {
    const s = source.toLowerCase()
    if (s.includes('youtube') || s.includes('youtu.be')) return 'YouTube'
    if (s.includes('bilibili') || s.includes('b23.tv')) return 'Bilibili'
    if (s.includes('twitter') || s.includes('x.com')) return 'Twitter/X'
    if (s.includes('tiktok')) return 'TikTok'
    if (s.includes('douyin') || s.includes('iesdouyin')) return 'Douyin'
    if (s.includes('vimeo')) return 'Vimeo'
    if (s.includes('instagram')) return 'Instagram'
    if (s.includes('facebook') || s.includes('fb.')) return 'Facebook'
    if (s.includes('reddit')) return 'Reddit'
    if (s.includes('twitch')) return 'Twitch'
    if (s.includes('soundcloud')) return 'SoundCloud'
    if (s.includes('nicovideo') || s.includes('nico')) return 'NicoNico'
    return 'Others'
  }

  /**
   * Format bytes to human-readable string
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
  }

  /**
   * Update settings (merges and persists)
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings }
    if (newSettings.maxConcurrent) {
      this.maxConcurrent = newSettings.maxConcurrent
    }
    this._saveSettings()
  }

  /**
   * Get current settings
   */
  getSettings() {
    return { ...this.settings }
  }

  /**
   * Register a listener for task events
   */
  onUpdate(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Shutdown - kill all processes
   */
  shutdown() {
    this.engine.killAll()
    this._saveTasks()
  }

  // ─── Internal ────────────────────────────

  /**
   * Process the download queue
   */
  _processQueue() {
    const activeCount = this.engine.getActiveCount()
    const slotsAvailable = this.maxConcurrent - activeCount

    if (slotsAvailable <= 0) return

    // Find queued tasks
    const queuedTasks = [...this.tasks.values()]
      .filter((t) => t.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt) // FIFO

    for (let i = 0; i < Math.min(slotsAvailable, queuedTasks.length); i++) {
      this._startTask(queuedTasks[i])
    }
  }

  /**
   * Start a single task
   */
  _startTask(task) {
    // Handle file conflict before starting
    const conflict = this._handleFileConflict(task.outputDir, task.filename)
    if (conflict.action === 'skip') {
      console.log(`[DownloadManager] File conflict: skip "${task.filename}"`)
      task.status = 'completed'
      task.progress = 100
      task.speed = '0 B/s'
      task.eta = '0:00'
      task.completedAt = Date.now()
      task.filepath = path.join(task.outputDir, task.filename)
      task.error = null
      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._sendDownloadNotification(task)
      this._processQueue()
      return
    }
    if (conflict.action === 'rename') {
      console.log(`[DownloadManager] File conflict: rename "${task.filename}" -> "${conflict.filename}"`)
      task.filename = conflict.filename
    }

    task.status = 'downloading'
    task.startedAt = task.startedAt || Date.now()
    this._saveTasks()
    this._notifyListeners('task-updated', task)

    // Check if this is a Douyin direct download (parsed by custom DouyinExtractor)
    if (task._douyinDirect && task._douyinVideoUrl) {
      this._startDouyinDirectDownload(task)
      return
    }

    const opts = task._downloadOptions || {}
    const fileConflict = this.settings.fileConflict || 'rename'
    this.engine.startDownload(task.id, task.url, {
      resolution: task.resolution,
      format: task.format,
      outputDir: task.outputDir,
      filename: task.filename,
      subtitleLangs: task.subtitleLang,
      settings: this.settings,
      cookieFile: opts.cookieFile,
      fileConflict,
    })

    // Watchdog: periodically check if yt-dlp process has exited but task status wasn't updated.
    // This catches rare edge cases where the 'close' event was missed or the complete/error
    // handler threw an exception silently.
    this._startWatchdog(task.id)
  }

  /**
   * Start a watchdog timer for a download task.
   * Checks every 10s if the yt-dlp process is still active.
   * If the process has exited but the task is still in an active state,
   * force-complete or force-fail it.
   */
  _startWatchdog(taskId) {
    const checkInterval = setInterval(() => {
      const task = this.tasks.get(taskId)
      if (!task) {
        clearInterval(checkInterval)
        return
      }

      // Task is no longer in an active state — watchdog can stop
      if (task.status !== 'downloading' && task.status !== 'post_processing') {
        clearInterval(checkInterval)
        return
      }

      // Check if the yt-dlp process is still running
      if (!this.engine.isActive(taskId)) {
        console.warn(`[DownloadManager] WATCHDOG: Task ${taskId} "${task.title}" is in '${task.status}' but yt-dlp process is not active! Force-completing...`)

        // Check if the output file exists (to decide between complete and error)
        const outputDir = (task._downloadOptions && task._downloadOptions.outputDir) || task.outputDir || '.'
        const outputFile = task.filepath && fs.existsSync(task.filepath)
          ? task.filepath
          : this._findOutputFile(outputDir, task.title, task.filename)

        if (outputFile) {
          task.status = 'completed'
          task.progress = 100
          task.speed = '0 B/s'
          task.eta = '0:00'
          task.completedAt = Date.now()
          task.filepath = outputFile
          try {
            const stats = fs.statSync(outputFile)
            task.filesize = stats.size
            task.downloadedSize = stats.size
          } catch {}
          this._saveTasks()
          this._notifyListeners('task-updated', task)
          this._sendDownloadNotification(task)
          this._processQueue()
        } else {
          // No output file found — mark as failed
          task.status = 'download_failed'
          task.error = 'Download process exited unexpectedly (watchdog recovery)'
          task.speed = '0 B/s'
          task.eta = '--:--'
          this._saveTasks()
          this._notifyListeners('task-updated', task)
          this._processQueue()
        }

        clearInterval(checkInterval)
      }
    }, 10000) // Check every 10 seconds
  }

  /**
   * Start a Douyin direct download (bypassing yt-dlp)
   */
  async _startDouyinDirectDownload(task) {
    const outputPath = path.join(task.outputDir, task.filename)
    console.log(`[DownloadManager] Starting Douyin direct download: ${task.id}`)
    console.log(`[DownloadManager] Douyin video URL: ${(task._douyinVideoUrl || '').substring(0, 100)}`)
    console.log(`[DownloadManager] Output: ${outputPath}`)

    try {
      const result = await this.engine.douyinExtractor.downloadVideo(
        task._douyinVideoUrl,
        outputPath,
        this.settings, // proxy settings
        (percent, downloadedBytes, totalBytes) => {
          // Emit progress events compatible with the engine event system
          if (task.status !== 'downloading') return
          task.progress = Math.min(percent, 100)
          task.downloadedSize = downloadedBytes
          if (totalBytes > 0) task.filesize = totalBytes
          
          // Calculate speed (rough estimate)
          const elapsed = (Date.now() - task.startedAt) / 1000
          const speed = elapsed > 0 ? downloadedBytes / elapsed : 0
          task.speed = this._formatSpeed(speed)
          
          // Estimate ETA
          if (speed > 0 && totalBytes > 0) {
            const remaining = totalBytes - downloadedBytes
            const etaSec = Math.round(remaining / speed)
            task.eta = this._formatEta(etaSec)
          }

          this._notifyListeners('task-progress', {
            id: task.id,
            progress: task.progress,
            speed: task.speed,
            eta: task.eta,
            filesize: task.filesize,
            downloadedSize: task.downloadedSize,
          })
        }
      )

      // Download complete
      task.status = 'completed'
      task.progress = 100
      task.speed = '0 B/s'
      task.eta = '0:00'
      task.completedAt = Date.now()
      task.filepath = result

      // Get actual file size from disk
      if (fs.existsSync(result)) {
        try {
          const stats = fs.statSync(result)
          task.filesize = stats.size
          task.downloadedSize = stats.size
        } catch {}
      }

      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._sendDownloadNotification(task)
      this._processQueue()
      console.log(`[DownloadManager] Douyin direct download complete: ${task.id} -> ${result}`)
    } catch (err) {
      console.error(`[DownloadManager] Douyin direct download failed: ${task.id}`, err.message)
      task.status = 'download_failed'
      task.error = err.message
      task.speed = '0 B/s'
      task.eta = '--:--'
      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._processQueue()
    }
  }

  /**
   * Format speed in bytes/sec to human readable
   */
  _formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  }

  /**
   * Format ETA seconds to MM:SS or HH:MM:SS
   */
  _formatEta(seconds) {
    if (seconds < 60) return `0:${String(seconds).padStart(2, '0')}`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins < 60) return `${mins}:${String(secs).padStart(2, '0')}`
    const hours = Math.floor(mins / 60)
    const remainMins = mins % 60
    return `${hours}:${String(remainMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  /**
   * Setup engine event listeners
   */
  _setupEngineEvents() {
    this.engine.on('progress', ({ taskId, progress, speed, eta, downloaded, total }) => {
      const task = this.tasks.get(taskId)
      if (!task) return

      // Ignore progress events for tasks that are no longer actively downloading.
      // After pauseTask() sets status to 'paused', the yt-dlp process may still
      // emit buffered progress data before it fully exits. Without this guard,
      // the status would be overwritten back to 'downloading'.
      if (task.status !== 'downloading') return

      task.progress = Math.min(progress, 100)
      task.speed = speed
      task.eta = eta
      // Update file sizes from yt-dlp progress data (e.g. "350.00MiB", "5.20GiB")
      const parsedTotal = this._parseSizeString(total)
      const parsedDownloaded = this._parseSizeString(downloaded)
      if (parsedTotal > 0) {
        task.filesize = parsedTotal
      }
      if (parsedDownloaded > 0) {
        task.downloadedSize = parsedDownloaded
      } else if (parsedTotal > 0 && progress > 0) {
        // Estimate downloaded from progress percentage
        task.downloadedSize = Math.round(parsedTotal * progress / 100)
      }
      this._notifyListeners('task-progress', {
        id: taskId,
        progress: task.progress,
        speed,
        eta,
        filesize: task.filesize,
        downloadedSize: task.downloadedSize,
      })
    })

    this.engine.on('destination', ({ taskId, filepath }) => {
      const task = this.tasks.get(taskId)
      if (task && filepath) {
        // Always update to the latest destination (Merger/MoveFiles overrides download dest)
        task.filepath = filepath
        console.log(`[DownloadManager] Task ${taskId} filepath set to: ${filepath}`)
      }
    })

    this.engine.on('postprocess', ({ taskId, message }) => {
      const task = this.tasks.get(taskId)
      // Only transition to post_processing from downloading state
      if (task && task.status === 'downloading') {
        task.status = 'post_processing'
        this._notifyListeners('task-updated', task)
      }
    })

    this.engine.on('complete', ({ taskId }) => {
      const task = this.tasks.get(taskId)
      if (!task) {
        console.log(`[DownloadManager] complete: task ${taskId} not found in Map, ignoring`)
        return
      }
      // Ignore complete events for tasks that are paused/cancelled
      // (can happen due to buffered stdout being processed after kill)
      if (task.status !== 'downloading' && task.status !== 'post_processing') {
        console.log(`[DownloadManager] Ignoring 'complete' for task ${taskId} in status '${task.status}'`)
        return
      }

      console.log(`[DownloadManager] ✓ Task COMPLETE: ${taskId} "${task.title}" (was: ${task.status})`)

      task.status = 'completed'
      task.progress = 100
      task.speed = '0 B/s'
      task.eta = '0:00'
      task.completedAt = Date.now()

      // Fix filepath: if null OR garbled (file doesn't exist on disk), try to re-locate
      const needsFilepathFix = !task.filepath || !fs.existsSync(task.filepath)
      if (needsFilepathFix) {
        if (task.filepath) {
          console.log(`[DownloadManager] Task ${taskId} filepath doesn't exist (possibly GBK garbled): ${task.filepath}`)
        }
        const outputDir = (task._downloadOptions && task._downloadOptions.outputDir) || task.outputDir || '.'
        const guessedPath = this._findOutputFile(outputDir, task.title, task.filename)
        if (guessedPath) {
          task.filepath = guessedPath
          console.log(`[DownloadManager] Task ${taskId} filepath ${task.filepath ? 'fixed' : 'inferred'}: ${guessedPath}`)
        }
      }

      // Get actual file size from disk
      if (task.filepath && fs.existsSync(task.filepath)) {
        try {
          const stats = fs.statSync(task.filepath)
          task.filesize = stats.size
          task.downloadedSize = stats.size
        } catch {}
      }
      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._sendDownloadNotification(task)
      this._processQueue()

      // Safety net: send a second notification after 1s in case the first one was lost
      // (e.g. IPC serialization race, renderer not ready, etc.)
      setTimeout(() => {
        const t = this.tasks.get(taskId)
        if (t && t.status === 'completed') {
          this._notifyListeners('task-updated', t)
        }
      }, 1000)
    })

    this.engine.on('error', ({ taskId, error }) => {
      const task = this.tasks.get(taskId)
      if (!task) return
      // Ignore error events for tasks already paused/cancelled
      // (SIGTERM kill causes non-zero exit code which triggers 'error' via cancelled path)
      if (task.status === 'paused' || task.status === 'cancelled') {
        console.log(`[DownloadManager] Ignoring 'error' for task ${taskId} in status '${task.status}'`)
        return
      }

      task.status = 'download_failed'
      task.error = error
      task.speed = '0 B/s'
      task.eta = '--:--'
      this._saveTasks()
      this._notifyListeners('task-updated', task)
      this._processQueue()
    })

    this.engine.on('cancelled', ({ taskId }) => {
      // Already handled in cancelTask/pauseTask — status was set before kill
    })
  }

  /**
   * Strip internal/non-serializable fields from a task object
   * for safe IPC transmission to the renderer process.
   */
  _cleanTaskForIPC(task) {
    if (!task || typeof task !== 'object') return task
    const clean = { ...task }
    delete clean._downloadOptions
    delete clean._douyinDirect
    delete clean._douyinVideoUrl
    delete clean._douyinVideoUri
    delete clean._douyinHeaders
    return clean
  }

  /**
   * Notify all listeners of a state change
   */
  _notifyListeners(event, data) {
    // Clean task data before sending to avoid IPC serialization issues
    // (e.g. _downloadOptions may contain large/non-serializable objects)
    const cleanData = (event === 'task-updated' || event === 'task-added')
      ? this._cleanTaskForIPC(data)
      : data

    for (const cb of this.listeners) {
      try {
        cb(event, cleanData)
      } catch (e) {
        console.error('[DownloadManager] Listener error:', e)
      }
    }
  }

  // ─── Persistence ────────────────────────────

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  _saveSettings() {
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (e) {
      console.error('[DownloadManager] Failed to save settings:', e)
    }
  }

  _loadSettings() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const data = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8'))
        this.settings = { ...this.settings, ...data }
        if (data.maxConcurrent) {
          this.maxConcurrent = data.maxConcurrent
        }

        // Fix hardcoded username in defaultDir/cookieFile:
        // If the path contains a different username than the current user, reset it
        const currentUser = process.env.USERNAME || process.env.USER || ''
        const downloadsPath = app.getPath('downloads')
        if (this.settings.defaultDir && currentUser) {
          // Check if path contains a Windows user dir with a different username
          const userDirMatch = this.settings.defaultDir.match(/[\\/]Users[\\/](.+?)[\\/]/)
          if (userDirMatch && userDirMatch[1] !== currentUser) {
            console.log(`[DownloadManager] Resetting defaultDir: old user "${userDirMatch[1]}" != current "${currentUser}"`)
            this.settings.defaultDir = downloadsPath
            this._saveSettings() // Persist the fix
          }
        }
        if (this.settings.cookieFile && currentUser) {
          const cookieMatch = this.settings.cookieFile.match(/[\\/]Users[\\/](.+?)[\\/]/)
          if (cookieMatch && cookieMatch[1] !== currentUser) {
            console.log(`[DownloadManager] Resetting cookieFile: old user "${cookieMatch[1]}" != current "${currentUser}"`)
            delete this.settings.cookieFile
            this._saveSettings()
          }
        }

        console.log('[DownloadManager] Loaded settings from', this.settingsFile)
      }
    } catch (e) {
      console.error('[DownloadManager] Failed to load settings:', e)
    }
  }

  _saveTasks() {
    try {
      const data = {}
      for (const [id, task] of this.tasks) {
        // Don't save internal fields
        const saved = { ...task }
        delete saved._downloadOptions
        data[id] = saved
      }
      fs.writeFileSync(this.tasksFile, JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      console.error('[DownloadManager] Failed to save tasks:', e)
    }
  }

  _loadTasks() {
    try {
      if (fs.existsSync(this.tasksFile)) {
        const data = JSON.parse(fs.readFileSync(this.tasksFile, 'utf-8'))
        let fixedCount = 0
        for (const [id, task] of Object.entries(data)) {
          // Reset active states on load (app was closed)
          if (task.status === 'downloading' || task.status === 'parsing' || task.status === 'post_processing') {
            task.status = 'queued' // Re-queue interrupted downloads
            task.speed = '0 B/s'
            task.eta = '--:--'
          }

          // Fix garbled filepath from GBK encoding issue:
          // If task has a filepath but the file doesn't exist on disk, try to re-locate it
          if (task.status === 'completed' && task.filepath && !fs.existsSync(task.filepath)) {
            console.log(`[DownloadManager] Filepath broken (file not found): ${task.filepath}`)
            const outputDir = task.outputDir || app.getPath('downloads')
            const found = this._findOutputFile(outputDir, task.title, task.filename)
            if (found) {
              console.log(`[DownloadManager] Re-located file for "${task.title}": ${found}`)
              task.filepath = found
              fixedCount++
            } else {
              console.warn(`[DownloadManager] Could not re-locate file for "${task.title}"`)
            }
          }

          this.tasks.set(id, task)
        }
        console.log(`[DownloadManager] Loaded ${this.tasks.size} tasks` + (fixedCount > 0 ? `, fixed ${fixedCount} broken filepaths` : ''))
        if (fixedCount > 0) {
          this._saveTasks() // Persist the fixes
        }
      }
    } catch (e) {
      console.error('[DownloadManager] Failed to load tasks:', e)
    }
  }

  _generateId() {
    return crypto.randomUUID()
  }

  /**
   * Build filename from template.
   * Supported variables: {title} {author} {date} {resolution} {id}
   * Sanitizes special characters for filesystem compatibility.
   */
  _buildFilename(videoInfo, options = {}) {
    const template = this.settings.filenameTemplate || '{title}'
    const ext = options.format || 'mp4'

    const vars = {
      title: videoInfo.title || 'video',
      author: videoInfo.author || 'Unknown',
      date: videoInfo.uploadDate || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      resolution: options.resolution || 'best',
      id: videoInfo.id || '',
    }

    let name = template
    for (const [key, val] of Object.entries(vars)) {
      name = name.replace(new RegExp(`\\{${key}\\}`, 'g'), val)
    }

    // Sanitize filename: remove characters illegal on Windows/macOS
    name = name.replace(/[<>:"/\\|?*]/g, '_').trim()
    // Limit filename length (leave room for extension and potential rename suffix)
    if (name.length > 200) name = name.substring(0, 200)
    // Remove trailing dots/spaces (Windows doesn't allow them)
    name = name.replace(/[. ]+$/, '')

    return `${name}.${ext}`
  }

  /**
   * Handle file conflict according to settings.
   * @param {string} outputDir
   * @param {string} filename
   * @returns {{ action: 'proceed' | 'skip' | 'rename', filename: string }}
   */
  _handleFileConflict(outputDir, filename) {
    const filepath = path.join(outputDir, filename)
    if (!fs.existsSync(filepath)) {
      return { action: 'proceed', filename }
    }

    const strategy = this.settings.fileConflict || 'rename'

    if (strategy === 'skip') {
      return { action: 'skip', filename }
    }

    if (strategy === 'overwrite') {
      return { action: 'proceed', filename }
    }

    // Default: rename — append (1), (2), etc.
    const ext = path.extname(filename)
    const base = path.basename(filename, ext)
    let counter = 1
    let newName = `${base} (${counter})${ext}`
    while (fs.existsSync(path.join(outputDir, newName))) {
      counter++
      newName = `${base} (${counter})${ext}`
    }
    return { action: 'rename', filename: newName }
  }

  /**
   * Send a system notification for completed download
   */
  _sendDownloadNotification(task) {
    // Default to 'notify' if afterComplete not set
    const afterComplete = this.settings.afterComplete || 'notify'
    if (afterComplete !== 'notify') return
    if (!Notification.isSupported()) return

    try {
      const notification = new Notification({
        title: '下载完成 / Download Complete',
        body: task.title || 'Video downloaded',
        silent: false,
      })
      notification.show()
    } catch (e) {
      console.error('[DownloadManager] Notification error:', e.message)
    }
  }

  /**
   * Parse yt-dlp size strings like "350.00MiB", "1.50GiB", "500KiB" to bytes
   */
  _parseSizeString(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string') return 0
    const match = sizeStr.trim().match(/([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB|B)/i)
    if (!match) return 0
    const val = parseFloat(match[1])
    if (isNaN(val)) return 0
    const unit = match[2].toUpperCase()
    if (unit === 'GIB' || unit === 'GB') return Math.round(val * 1024 * 1024 * 1024)
    if (unit === 'MIB' || unit === 'MB') return Math.round(val * 1024 * 1024)
    if (unit === 'KIB' || unit === 'KB') return Math.round(val * 1024)
    return Math.round(val)
  }

  /**
   * Try to find the output file in the download directory.
   * Used as fallback when yt-dlp destination event is missed.
   */
  _findOutputFile(outputDir, title, filename) {
    try {
      if (!outputDir || !fs.existsSync(outputDir)) return null

      // Try exact filename match first
      if (filename) {
        const exactPath = path.join(outputDir, filename)
        if (fs.existsSync(exactPath)) return exactPath
        // Try with common extensions
        for (const ext of ['.mp4', '.mkv', '.webm', '.mp3', '.m4a', '.opus']) {
          const withExt = path.join(outputDir, filename.replace(/\.[^.]+$/, '') + ext)
          if (fs.existsSync(withExt)) return withExt
        }
      }

      // Try title-based matching
      if (title) {
        const files = fs.readdirSync(outputDir)
        // Sanitize title same way yt-dlp does (replace special chars)
        const sanitized = title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200)
        for (const file of files) {
          if (file.startsWith(sanitized)) {
            return path.join(outputDir, file)
          }
        }
        // Fuzzy match: check if any recently modified file contains part of the title
        const recentFiles = files
          .map((f) => {
            try {
              const stats = fs.statSync(path.join(outputDir, f))
              return { name: f, mtime: stats.mtimeMs }
            } catch { return null }
          })
          .filter(Boolean)
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, 10) // Check top 10 most recent files

        const titleLower = title.toLowerCase().substring(0, 50)
        for (const f of recentFiles) {
          if (f.name.toLowerCase().includes(titleLower.substring(0, 20))) {
            return path.join(outputDir, f.name)
          }
        }
      }

      return null
    } catch {
      return null
    }
  }
}

module.exports = { DownloadManager }
