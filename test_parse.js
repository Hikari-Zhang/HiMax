// Quick test to parse a bilibili URL with yt-dlp
const { spawn } = require('child_process')

const ytdlpPath = 'C:\\Users\\itachizhang\\AppData\\Roaming\\Downie\\bin\\yt-dlp.exe'
const url = 'https://www.bilibili.com/video/BV1cJQ1BZEZ9/'

const args = [
  '--dump-json',
  '--no-download',
  '--no-warnings',
  '--no-playlist',
  '--cookies-from-browser', 'edge',
  url
]

console.log('Running:', ytdlpPath, args.join(' '))
console.log('---')

const proc = spawn(ytdlpPath, args, {
  timeout: 120000,
  windowsHide: true,
})

let stdout = ''
let stderr = ''

proc.stdout.on('data', (data) => {
  stdout += data.toString()
})

proc.stderr.on('data', (data) => {
  stderr += data.toString()
  console.error('[stderr]', data.toString())
})

proc.on('close', (code) => {
  console.log('\nExit code:', code)
  
  if (stderr) {
    console.log('\nStderr:', stderr)
  }
  
  if (code !== 0) {
    console.log('FAILED')
    return
  }
  
  try {
    const info = JSON.parse(stdout)
    
    // Print key fields to understand the structure
    console.log('\n=== Key Fields ===')
    console.log('id:', info.id)
    console.log('title:', info.title)
    console.log('uploader:', info.uploader)
    console.log('channel:', info.channel)
    console.log('creator:', info.creator)
    console.log('duration:', info.duration)
    console.log('thumbnail:', info.thumbnail)
    console.log('description:', (info.description || '').substring(0, 200))
    console.log('webpage_url:', info.webpage_url)
    console.log('extractor_key:', info.extractor_key)
    console.log('extractor:', info.extractor)
    console.log('upload_date:', info.upload_date)
    console.log('view_count:', info.view_count)
    console.log('like_count:', info.like_count)
    console.log('comment_count:', info.comment_count)
    
    console.log('\n=== Formats ===')
    console.log('Total formats:', (info.formats || []).length)
    for (const f of (info.formats || []).slice(0, 10)) {
      console.log(`  ${f.format_id} | ${f.format_note || '-'} | ${f.resolution || '-'} | vcodec=${f.vcodec} acodec=${f.acodec} | ext=${f.ext} | size=${f.filesize || f.filesize_approx || '?'}`)
    }
    if ((info.formats || []).length > 10) {
      console.log(`  ... and ${info.formats.length - 10} more formats`)
    }
    
    console.log('\n=== Subtitles ===')
    console.log('subtitles:', Object.keys(info.subtitles || {}))
    console.log('automatic_captions:', Object.keys(info.automatic_captions || {}))
    
    // Print all top-level keys
    console.log('\n=== All Top-Level Keys ===')
    console.log(Object.keys(info).join(', '))
    
    // Write full JSON to file for inspection
    const fs = require('fs')
    fs.writeFileSync('D:\\AI\\projects\\Downie\\temp_parse_full.json', JSON.stringify(info, null, 2), 'utf8')
    console.log('\nFull JSON written to temp_parse_full.json')
    
  } catch (e) {
    console.error('Parse error:', e.message)
    console.log('Raw stdout (first 2000 chars):', stdout.substring(0, 2000))
  }
})

proc.on('error', (err) => {
  console.error('Process error:', err)
})
