// Renders each content piece into a branded 1080×1350 PNG (Instagram-ready),
// using the local Chrome via puppeteer-core. Output: public/content-images/.
import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { generateContent } from './contentEngine.mjs'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BRAND = process.env.BRAND_HANDLE || '@protrader.os'

const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function cardHTML(item) {
  const bodyLines = esc(item.body).split('\n').map(l => l.trim() ? `<div class="line">${l}</div>` : '<div class="sp"></div>').join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box;font-family:'Segoe UI','Inter',system-ui,sans-serif}
  body{width:1080px;height:1350px;background:linear-gradient(160deg,#0A0E17,#0F1623 60%,#101a2e);color:#E0E8F0;padding:70px 64px;display:flex;flex-direction:column}
  .top{display:flex;align-items:center;gap:14px;margin-bottom:36px}
  .logo{font-family:'Consolas',monospace;font-weight:800;font-size:30px;color:#2962FF}
  .logo span{color:#E0E8F0}
  .chip{margin-left:auto;font-family:'Consolas',monospace;font-size:18px;color:#0A0E17;background:#2962FF;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1px}
  .hook{font-size:58px;font-weight:800;line-height:1.12;margin-bottom:30px;letter-spacing:-1px}
  .body{flex:1;font-size:30px;line-height:1.5;color:#b9c6d6;overflow:hidden}
  .line{margin:2px 0}.sp{height:18px}
  .foot{margin-top:24px;border-top:1px solid #1E2D42;padding-top:18px}
  .disc{font-size:17px;color:#6B7F99;line-height:1.4}
  .handle{font-family:'Consolas',monospace;font-size:22px;color:#FFB300;margin-top:10px}
  .accent{color:#00C853;font-weight:700}
  </style></head><body>
    <div class="top"><div class="logo">ProTrader<span>OS</span></div><div class="chip">${esc(item.format || 'post')}</div></div>
    <div class="hook">${esc(item.hook)}</div>
    <div class="body">${bodyLines}</div>
    <div class="foot"><div class="disc">${esc(item.disclaimer)}</div><div class="handle">${esc(BRAND)} · save & follow</div></div>
  </body></html>`
}

async function run() {
  // 1) generate today's content text from the latest data (atomic with rendering)
  const rj = p => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
  const now = new Date(), dateStr = now.toISOString().slice(0, 10)
  const data = { picks: rj('public/picks.json'), signals: rj('public/signals.json'), breadth: rj('public/breadth.json') }
  const items0 = generateContent(data, Math.floor(now.getTime() / 86400000), dateStr)
  mkdirSync('public', { recursive: true })
  writeFileSync('public/content.json', JSON.stringify({ generatedAt: now.toISOString(), date: dateStr, count: items0.length, items: items0 }, null, 2))

  // 2) render branded images + annotate content.json with their paths
  const content = JSON.parse(readFileSync('public/content.json', 'utf8'))
  mkdirSync('public/content-images', { recursive: true })
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
  const p = await b.newPage()
  await p.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 })
  const out = []
  for (const item of content.items) {
    try {
      await p.setContent(cardHTML(item), { waitUntil: 'domcontentloaded', timeout: 15000 })
      await new Promise(r => setTimeout(r, 120))
      const file = `content-images/${item.id}.png`
      await p.screenshot({ path: `public/${file}` })
      out.push({ id: item.id, image: '/' + file })
    } catch (e) { console.log('  skip', item.id, e.message.slice(0, 60)) }
  }
  await b.close()
  // annotate content.json with image paths
  content.items = content.items.map(it => ({ ...it, image: '/content-images/' + it.id + '.png' }))
  writeFileSync('public/content.json', JSON.stringify(content, null, 2))
  console.log(`Rendered ${out.length} branded images → public/content-images/`)
}
run().catch(e => { console.error(e); process.exit(1) })
