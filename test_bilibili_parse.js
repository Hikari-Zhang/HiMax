/**
 * 测试 B 站视频解析 - 检查 yt-dlp JSON 输出的结构
 * 由于浏览器数据库锁定问题，尝试多种方式
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const YTDLP = path.join(process.env.APPDATA, 'Downie', 'bin', 'yt-dlp.exe')
const URL = 'https://www.bilibili.com/video/BV1cJQ1BZEZ9/'

// 尝试不同浏览器和模式
const attempts = [
  { name: 'chrome', args: ['--cookies-from-browser', 'chrome'] },
  { name: 'edge', args: ['--cookies-from-browser', 'edge'] },
  { name: 'firefox', args: ['--cookies-from-browser', 'firefox'] },
  { name: 'no-cookie', args: [] },
]

async function tryParse(attempt) {
  return new Promise((resolve) => {
    console.log(`\n--- Trying: ${attempt.name} ---`)
    const args = [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--no-playlist',
      ...attempt.args,
      URL,
    ]
    
    const proc = spawn(YTDLP, args, { windowsHide: true, timeout: 30000 })
    let stdout = ''
    let stderr = ''
    
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    
    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        console.log(`SUCCESS with ${attempt.name}!`)
        try {
          const info = JSON.parse(stdout)
          // 保存完整 JSON
          fs.writeFileSync(
            path.join(__dirname, `bilibili_raw_${attempt.name}.json`),
            JSON.stringify(info, null, 2),
            'utf-8'
          )
          
          // 打印关键字段
          console.log('\n=== KEY FIELDS ===')
          console.log('id:', info.id)
          console.log('title:', info.title)
          console.log('uploader:', info.uploader)
          console.log('channel:', info.channel)
          console.log('creator:', info.creator)
          console.log('duration:', info.duration)
          console.log('thumbnail:', info.thumbnail)
          console.log('extractor_key:', info.extractor_key)
          console.log('webpage_url:', info.webpage_url)
          console.log('upload_date:', info.upload_date)
          console.log('view_count:', info.view_count)
          console.log('description:', (info.description || '').substring(0, 200))
          
          console.log('\n=== FORMATS ===')
          console.log('Total formats:', (info.formats || []).length)
          if (info.formats && info.formats.length > 0) {
            // 打印前5个和后5个格式
            const fmts = info.formats
            const show = fmts.slice(0, 5).concat(fmts.length > 10 ? fmts.slice(-5) : [])
            for (const f of show) {
              console.log(`  format_id=${f.format_id}, resolution=${f.resolution}, ext=${f.ext}, vcodec=${f.vcodec}, acodec=${f.acodec}, height=${f.height}, width=${f.width}, filesize=${f.filesize}, filesize_approx=${f.filesize_approx}, format_note=${f.format_note}, quality=${f.quality}`)
            }
          }
          
          console.log('\n=== SUBTITLES ===')
          console.log('subtitles keys:', Object.keys(info.subtitles || {}))
          console.log('automatic_captions keys:', Object.keys(info.automatic_captions || {}).slice(0, 10))
          
          // 额外打印B站特有字段
          console.log('\n=== BILIBILI SPECIFIC ===')
          console.log('_type:', info._type)
          console.log('playlist:', info.playlist)
          console.log('playlist_count:', info.playlist_count)
          console.log('playlist_index:', info.playlist_index)
          console.log('n_entries:', info.n_entries)
          console.log('chapters:', info.chapters ? `${info.chapters.length} chapters` : 'none')
          console.log('requested_formats:', info.requested_formats ? info.requested_formats.length : 'none')
          
          resolve(info)
        } catch (e) {
          console.log('JSON parse error:', e.message)
          resolve(null)
        }
      } else {
        console.log(`FAILED with ${attempt.name}: code=${code}`)
        if (stderr) console.log('stderr:', stderr.substring(0, 500))
        resolve(null)
      }
    })
    
    proc.on('error', (err) => {
      console.log(`ERROR with ${attempt.name}:`, err.message)
      resolve(null)
    })
  })
}

async function main() {
  for (const attempt of attempts) {
    const result = await tryParse(attempt)
    if (result) {
      console.log('\n\n=== DONE - Got valid result ===')
      break
    }
  }
}

main().catch(console.error)
