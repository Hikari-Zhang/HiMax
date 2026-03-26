/**
 * App Paths - Centralized path management
 * 
 * All application data (config, binaries, cookies, debug logs) is stored
 * in a persistent, writable location:
 *
 * - Windows (NSIS):     <install_dir>/appdata/
 * - Windows (Portable): <exe_dir>/appdata/
 * - macOS:              ~/Library/Application Support/HiMax/
 * - Linux:              ~/.config/HiMax/
 * - Development:        <project_root>/appdata/
 *
 * Directory layout:
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
 * - In production (NSIS installer, Windows):
 *     process.resourcesPath → <install_dir>/resources
 *     So the install root is one level up: path.dirname(process.resourcesPath)
 * 
 * - In production (portable exe, Windows):
 *     The exe unpacks to a temp dir, so process.resourcesPath points to temp.
 *     We use the exe's actual location (process.env.PORTABLE_EXECUTABLE_DIR or
 *     path.dirname(process.execPath)) as the root so data persists next to the exe.
 */
function getAppRoot() {
  if (app.isPackaged) {
    // Portable mode (Windows only): env var PORTABLE_EXECUTABLE_DIR is set by electron-builder portable
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
 * 
 * macOS:    ~/Library/Application Support/HiMax/
 * Linux:    ~/.config/HiMax/ (via app.getPath('userData'))
 * Windows:  <install_dir>/appdata/ (lives inside the install directory for clean uninstall)
 * Dev:      <project_root>/appdata/
 */
function getAppDataDir() {
  if (app.isPackaged && process.platform === 'darwin') {
    // macOS: .app bundles are read-only, use ~/Library/Application Support/HiMax/
    return app.getPath('userData')
  }
  if (app.isPackaged && process.platform === 'linux') {
    // Linux: ~/.config/HiMax/
    return app.getPath('userData')
  }
  // Windows (installed or portable) & development: <root>/appdata/
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
