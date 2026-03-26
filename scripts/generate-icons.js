/**
 * Generate all icon formats from the source 1024x1024 PNG.
 * 
 * Outputs:
 *   build/icon.ico        - Windows icon (multi-size)
 *   build/icon.png        - Source 1024x1024 PNG (electron-builder auto-converts to .icns on macOS)
 *   build/icon.iconset/   - macOS iconset (for `iconutil -c icns` on macOS)
 *   build/icons/          - Linux multi-size PNGs
 *   electron/tray-icon.png - 16x16 tray icon
 */
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const SOURCE = path.join(__dirname, '..', 'build', 'icon.png')
const BUILD_DIR = path.join(__dirname, '..', 'build')
const ICONS_DIR = path.join(BUILD_DIR, 'icons')

const LINUX_SIZES = [512, 256, 128, 64, 48, 32, 16]

/**
 * Build ICO file from an array of PNG buffers.
 * ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
function buildIco(pngBuffers, sizes) {
  const numImages = pngBuffers.length
  const headerSize = 6
  const dirEntrySize = 16
  const dirSize = dirEntrySize * numImages
  
  let offset = headerSize + dirSize
  const entries = []
  
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i]
    const data = pngBuffers[i]
    entries.push({
      width: size >= 256 ? 0 : size,  // 0 means 256
      height: size >= 256 ? 0 : size,
      dataSize: data.length,
      offset: offset,
      data: data,
    })
    offset += data.length
  }
  
  const totalSize = offset
  const buf = Buffer.alloc(totalSize)
  
  // ICO Header
  buf.writeUInt16LE(0, 0)       // Reserved
  buf.writeUInt16LE(1, 2)       // Type: 1 = ICO
  buf.writeUInt16LE(numImages, 4) // Number of images
  
  // Directory entries
  for (let i = 0; i < numImages; i++) {
    const e = entries[i]
    const pos = headerSize + i * dirEntrySize
    buf.writeUInt8(e.width, pos)        // Width
    buf.writeUInt8(e.height, pos + 1)   // Height
    buf.writeUInt8(0, pos + 2)          // Color palette
    buf.writeUInt8(0, pos + 3)          // Reserved
    buf.writeUInt16LE(1, pos + 4)       // Color planes
    buf.writeUInt16LE(32, pos + 6)      // Bits per pixel
    buf.writeUInt32LE(e.dataSize, pos + 8)  // Image data size
    buf.writeUInt32LE(e.offset, pos + 12)   // Offset to data
  }
  
  // Image data
  for (const e of entries) {
    e.data.copy(buf, e.offset)
  }
  
  return buf
}

async function main() {
  // Ensure directories
  if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true })

  const meta = await sharp(SOURCE).metadata()
  console.log(`Source: ${meta.width}x${meta.height} ${meta.format}`)

  // ─── Generate Linux multi-size PNGs ───
  console.log('\n[Linux] Generating multi-size PNGs...')
  for (const size of LINUX_SIZES) {
    const outPath = path.join(ICONS_DIR, `${size}x${size}.png`)
    await sharp(SOURCE).resize(size, size, { fit: 'contain' }).png().toFile(outPath)
    console.log(`  ${size}x${size}.png`)
  }

  // ─── Generate ICO (Windows) ───
  console.log('\n[Windows] Generating icon.ico...')
  const ICO_SIZES = [256, 128, 64, 48, 32, 16]
  const icoBuffers = []
  for (const size of ICO_SIZES) {
    const buf = await sharp(SOURCE).resize(size, size, { fit: 'contain' }).png().toBuffer()
    icoBuffers.push(buf)
  }
  const icoBuffer = buildIco(icoBuffers, ICO_SIZES)
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer)
  console.log('  icon.ico created (' + (icoBuffer.length / 1024).toFixed(1) + ' KB)')

  // ─── Generate tray icon (16x16) ───
  console.log('\n[Tray] Generating tray-icon.png...')
  const trayPath = path.join(__dirname, '..', 'electron', 'tray-icon.png')
  await sharp(SOURCE).resize(16, 16, { fit: 'contain' }).png().toFile(trayPath)
  console.log('  tray-icon.png created')

  // Also generate @2x tray icon for Retina displays (macOS)
  const tray2xPath = path.join(__dirname, '..', 'electron', 'tray-icon@2x.png')
  await sharp(SOURCE).resize(32, 32, { fit: 'contain' }).png().toFile(tray2xPath)
  console.log('  tray-icon@2x.png created')

  // ─── macOS iconset PNGs ───
  console.log('\n[macOS] Generating iconset PNGs...')
  const iconsetDir = path.join(BUILD_DIR, 'icon.iconset')
  if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true })

  const iconsetSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ]

  for (const item of iconsetSizes) {
    await sharp(SOURCE).resize(item.size, item.size, { fit: 'contain' }).png()
      .toFile(path.join(iconsetDir, item.name))
    console.log(`  ${item.name}`)
  }

  console.log('\n--- Done ---')
  console.log('  build/icon.png        → Source icon (electron-builder auto-converts to .icns on macOS)')
  console.log('  build/icon.ico        → Windows icon')
  console.log('  build/icon.iconset/   → macOS iconset (run `iconutil -c icns` on macOS, or electron-builder handles it)')
  console.log('  build/icons/          → Linux multi-size PNGs')
  console.log('  electron/tray-icon.png → System tray icon')
}

main().catch(console.error)
