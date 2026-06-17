// Single stable server for ProTrader OS (no Vite dev server, no HMR restarts).
//  - serves the built app from dist/
//  - proxies /yahoo/* to Yahoo Finance (server-side, no CORS)
//  - serves /picks.json & /universe.json (written by the screener)
//  - runs the screener automatically: hourly (quick) + daily (full)
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { runScan } from './screener.mjs'
import { spawn } from 'node:child_process'

const PORT = 6767
const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const PUBLIC = join(ROOT, 'public')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }

async function sendFile(res, path) {
  const body = await readFile(path)
  res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
  res.end(body)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    let path = decodeURIComponent(url.pathname)

    // Yahoo proxy
    if (path.startsWith('/yahoo/')) {
      const target = 'https://query1.finance.yahoo.com' + path.slice('/yahoo'.length) + url.search
      const r = await fetch(target, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
      const text = await r.text()
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      return res.end(text)
    }

    // generated data files (live in public/, may not be in dist)
    if (['/picks.json', '/universe.json', '/breadth.json', '/signals.json', '/content.json', '/board.json', '/track_record.json', '/learning.json', '/news.json'].includes(path)) {
      try { return await sendFile(res, join(PUBLIC, path)) }
      catch { res.writeHead(404); return res.end('{}') }
    }
    // generated content images live in public/, not dist/
    if (path.startsWith('/content-images/')) {
      try { return await sendFile(res, join(PUBLIC, path)) }
      catch { res.writeHead(404); return res.end('not found') }
    }

    // static from dist/ with SPA fallback
    if (path === '/') path = '/index.html'
    const filePath = join(DIST, path)
    try {
      const s = await stat(filePath)
      if (s.isFile()) return await sendFile(res, filePath)
    } catch { /* fall through to SPA */ }
    return await sendFile(res, join(DIST, 'index.html'))
  } catch (e) {
    res.writeHead(500); res.end('server error: ' + e.message)
  }
})

server.listen(PORT, () => {
  console.log(`\n  ProTrader OS  →  http://localhost:${PORT}\n`)
  startScheduler()
})

// ── automatic screener: quick scan hourly, full scan daily ──
let scanning = false
async function scan(opts, label) {
  if (scanning) { console.log(`[scan] skip ${label} (already running)`); return }
  scanning = true
  console.log(`[scan] ${label} started ${new Date().toLocaleString()}`)
  try { await runScan(opts) } catch (e) { console.error('[scan] failed:', e.message) }
  // render content + branded images (atomic) so content.json always has images
  try {
    await new Promise((resolve) => {
      const c = spawn(process.execPath, ['scripts/contentImages.mjs'], { cwd: ROOT, stdio: 'inherit' })
      c.on('exit', resolve); c.on('error', resolve)
    })
  } catch { /* content render best-effort */ }
  scanning = false
}

function startScheduler() {
  // Run once on boot so picks are fresh when the server starts.
  // Recurring hourly + daily scans are owned by Windows Task Scheduler
  // (see scripts/install-tasks — survives reboots, runs even if this server is down).
  scan({ top: 40 }, 'startup')
}
