/**
 * App Paths - Centralized path management
 * 
 * All application data (config, binaries, cookies, debug logs) is stored
 * WITHIN the installation directory so that uninstalling the app removes
 * everything cleanly — no orphan files in %APPDATA%.
 *
 * Directory layout (relative to install root):
 *   appdata/
 *   ├── bin/          yt-dlp, ffmpeg, ffprobe
 *   ├── data/         settings.json, tasks.json
 *   ├── debug/        parse_*.json (dev only)
 *   └── cookies.txt   Netscape cookie file
 */
const { app } = require('electron')
const path = require('path')
const fs = require('fs')

/**
 * Get the application root directory.
 * 
 * - In development (npm run dev:electron):
 *     app.getAppPath() → project root (D:\AI\projects\Downie)
 * 
 * - In production (NSIS installer):
 *     process.resourcesPath → <install_dir>/resources
 *     So the install root is one level up: path.dirname(process.resourcesPath)
 * 
 * - In production (portable exe):
 *     The exe unpacks to a temp dir, so process.resourcesPath points to temp.
 *     We use the exe's actual location (process.env.PORTABLE_EXECUTABLE_DIR or
 *     path.dirname(process.execPath)) as the root so data persists next to the exe.
 */
function getAppRoot() {
  if (app.isPackaged) {
    // Portable mode: env var PORTABLE_EXECUTABLE_DIR is set by electron-builder portable
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      return process.env.PORTABLE_EXECUTABLE_DIR
    }
    // NSIS / normal install: <install_dir>/resources → go up to <install_dir>
    return path.dirname(process.resourcesPath)
  }
  // Development: use project root
  return app.getAppPath()
}

/**
 * Get the base directory for all persistent application data.
 * This is <app_root>/appdata/ — lives inside the install directory.
 */
function getAppDataDir() {
  return path.join(getAppRoot(), 'appdata')
}

/**
 * Get the binary directory (yt-dlp, ffmpeg, ffprobe).
 * → <app_root>/appdata/bin/
 */
function getBinDir() {
  return path.join(getAppDataDir(), 'bin')
}

/**
 * Get the data directory (settings.json, tasks.json).
 * → <app_root>/appdata/data/
 */
function getDataDir() {
  return path.join(getAppDataDir(), 'data')
}

/**
 * Get the debug directory (parse_*.json).
 * → <app_root>/appdata/debug/
 */
function getDebugDir() {
  return path.join(getAppDataDir(), 'debug')
}

/**
 * Get the cookie file path.
 * → <app_root>/appdata/cookies.txt
 */
function getCookiePath() {
  return path.join(getAppDataDir(), 'cookies.txt')
}

/**
 * Ensure a directory exists (create recursively if needed).
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

module.exports = {
  getAppRoot,
  getAppDataDir,
  getBinDir,
  getDataDir,
  getDebugDir,
  getCookiePath,
  ensureDir,
}
