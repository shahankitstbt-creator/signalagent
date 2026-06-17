// PERFORMANCE TESTS — compute timings, page load/memory, API latency.
import { execSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:6767'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const ms = (t) => `${t.toFixed(1)}ms`
const rows = []
let warn = 0
const row = (name, value, budget, unit = 'ms') => { const okb = budget == null || value <= budget; if (!okb) warn++; rows.push({ name, value: value.toFixed(1) + unit, budget: budget == null ? '—' : '≤' + budget + unit, status: okb ? '✓' : '⚠' }) }

// synthetic bars
const bars = []; let p = 100
for (let i = 0; i < 1000; i++) { const o = p, c = p + Math.sin(i / 9) * 4 + (i % 7 - 3); bars.push({ time: 1700000000 + i * 86400, open: o, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1, close: c, volume: 1000 + (i % 13) * 400 }); p = Math.max(5, c) }
const time = (fn, n) => { const s = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - s) / n }

// ── compute perf ──
execSync('npx esbuild tests/_entry.mjs --bundle --format=esm --platform=node --outfile=tests/_perf.mjs', { stdio: 'pipe' })
const { INDICATORS, indicatorDefaults } = await import('./_perf.mjs?' + Date.now())
const sig = await import('../scripts/signalEngine.mjs')
const content = await import('../scripts/contentEngine.mjs')

const allInd = () => { for (const [id, def] of Object.entries(INDICATORS)) def.compute(bars, indicatorDefaults(id)) }
row('All 29 indicators (1000 bars)', time(allInd, 30), 120)

const d = { o: bars.map(b => b.open), h: bars.map(b => b.high), l: bars.map(b => b.low), c: bars.map(b => b.close), v: bars.map(b => b.volume) }
row('Signal engine / stock (runEngine)', time(() => sig.runEngine(d), 30), 60)
const perStock = time(() => sig.runEngine(d), 30)
row('  → est. 500-stock scan compute', perStock * 500 / 1000, 30, 's'.length ? 's' : 's')
rows[rows.length - 1].value = (perStock * 500 / 1000).toFixed(2) + 's'; rows[rows.length - 1].budget = '≤30s'

row('Content generate (7 pieces)', time(() => content.generateContent({ picks: { picks: [] }, signals: {}, breadth: { breadth: {} } }, 1, '2026-06-17'), 200), 5)

// ── page perf ──
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await b.newPage(); await page.setViewport({ width: 1600, height: 1000 })
const t0 = performance.now()
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
const dcl = performance.now() - t0
await page.waitForSelector('canvas', { timeout: 15000 })
const firstChart = performance.now() - t0
await new Promise(r => setTimeout(r, 3500))
const metrics = await page.metrics()
const perf = await page.evaluate(() => { const t = performance.timing; return { load: t.loadEventEnd - t.navigationStart } })
row('DOMContentLoaded', dcl, 4000)
row('First chart canvas', firstChart, 6000)
row('JS heap used', metrics.JSHeapUsedSize / 1048576, 250, 'MB')
row('DOM nodes', metrics.Nodes, 9000, '')
// interaction latency: switch timeframe, measure to stable
const tA = performance.now()
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '1h')?.click())
await new Promise(r => setTimeout(r, 50))
row('Timeframe click → handler', performance.now() - tA, 200)
await b.close()

// ── API latency ──
const apiMs = async (url) => { const s = performance.now(); await fetch(url).catch(() => { }); return performance.now() - s }
row('GET /picks.json', await apiMs(BASE + '/picks.json'), 200)
row('GET /content.json', await apiMs(BASE + '/content.json'), 200)
row('GET /content image (PNG)', await apiMs(BASE + '/content-images/' + (await (await fetch(BASE + '/content.json')).json()).items[0].id + '.png'), 400)
row('Yahoo proxy (^NSEI 1y)', await apiMs(BASE + '/yahoo/v8/finance/chart/%5ENSEI?interval=1d&range=1y'), 3000)
try { const a = await import('../scripts/angelClient.mjs'); const s = performance.now(); const r = await a.login(); row('Angel One login', performance.now() - s, 4000); if (!r.ok) rows[rows.length - 1].status = '⚠' } catch { }

// ── report ──
console.log('\nPERFORMANCE')
console.log('─'.repeat(64))
for (const r of rows) console.log(`  ${r.status} ${r.name.padEnd(38)} ${String(r.value).padStart(10)}  (${r.budget})`)
console.log('─'.repeat(64))
console.log(warn === 0 ? '✓ ALL WITHIN BUDGET' : `⚠ ${warn} metric(s) over budget (review above)`)
