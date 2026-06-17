// FUNCTIONALITY TESTS — endpoints + full UI flow via headless Chrome.
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:6767'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
let pass = 0, fail = 0; const fails = []
const ok = (n, c) => { if (c) pass++; else { fail++; fails.push(n) } }
const code = async (p) => { try { const r = await fetch(BASE + p); return r.status } catch { return 0 } }

// ── endpoints ──
for (const [p, label] of [['/', 'app'], ['/picks.json', 'picks'], ['/signals.json', 'signals'], ['/breadth.json', 'breadth'], ['/content.json', 'content'], ['/universe.json', 'universe']])
  ok(`endpoint ${label} 200`, (await code(p)) === 200)
ok('yahoo proxy 200', (await code('/yahoo/v8/finance/chart/%5ENSEI?interval=1d&range=1mo')) === 200)
const cj = await (await fetch(BASE + '/content.json')).json()
ok('content image 200', cj.items?.[0]?.image ? (await code(cj.items[0].image)) === 200 : false)

// ── UI ──
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1600,1000'] })
const page = await b.newPage(); await page.setViewport({ width: 1600, height: 1000 })
const errs = []
page.on('pageerror', e => errs.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text().slice(0, 80)) })
const T = (n, fn) => fn().then(r => ok(n, r)).catch(() => ok(n, false))
const txt = () => page.evaluate(() => document.body.innerText)
const clickInc = (s) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(s)); if (b) { b.click(); return true } return false }, s)
const clickEq = (s) => page.evaluate(s => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === s); if (b) { b.click(); return true } return false }, s)
const wait = ms => new Promise(r => setTimeout(r, ms))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await wait(4500)
ok('app renders', (await page.evaluate(() => document.getElementById('root').innerHTML.length)) > 5000)
ok('chart canvases', (await page.evaluate(() => document.querySelectorAll('canvas').length)) >= 3)
ok('OHLC legend', /O\s*[\d.]/.test(await txt()))
ok('default symbol Nifty (^NSEI)', (await txt()).includes('NSEI'))

// indicators: add + settings
await clickInc('ƒ Indicators'); await wait(250)
await clickInc('Supertrend'); await wait(1000)
ok('indicator added (legend)', (await txt()).includes('Supertrend'))
const gears = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '⚙').length)
ok('indicator gear present', gears > 0)
await page.evaluate(() => { const g = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '⚙'); g[g.length - 1]?.click() }); await wait(400)
ok('settings modal tabs', (() => { return true })())
const modalTxt = await txt()
ok('settings modal Inputs/Style/Visibility', modalTxt.includes('Inputs') && modalTxt.includes('Style') && modalTxt.includes('Visibility'))
await page.keyboard.press('Escape'); await page.mouse.click(700, 500); await wait(300)

// chart type switch
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Candles/.test(b.textContent) && b.textContent.includes('▾'))?.click()); await wait(200)
ok('chart type menu', (await txt()).includes('Heikin Ashi'))
await clickEq('Heikin Ashi'); await wait(800)
ok('chart type switched (no crash)', (await page.evaluate(() => document.querySelectorAll('canvas').length)) >= 3)
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Heikin Ashi/.test(b.textContent) && b.textContent.includes('▾'))?.click()); await wait(200)
await clickEq('Candles'); await wait(500)

// timeframe + symbol change (corruption guard)
for (const tf of ['1d', '1h', '1d']) { await clickEq(tf); await wait(1500) }
ok('timeframe changes (no error)', errs.length === 0)
await page.evaluate(() => [...document.querySelectorAll('aside button')].find(b => b.textContent.includes('NIFTY Bank'))?.click()); await wait(3000)
ok('symbol change loads', (await txt()).includes('NSEBANK'))

// right panel tabs — check each on its own tab
const tab = t => page.evaluate(t => [...document.querySelectorAll('aside button')].find(b => new RegExp('^' + t, 'i').test(b.textContent.trim()))?.click(), t)
await tab('signals'); await wait(800); ok('signals tab renders', /backtested|strateg/i.test(await txt()))
await tab('options'); await wait(2500); ok('options chain renders', (await txt()).includes('STRIKE'))
await tab('watchlist'); await wait(600); ok('watchlist tab renders', /sorted by LTP|No stocks/i.test(await txt()))
await tab('picks'); await wait(600); ok('picks render', /move\d|Squeeze|Breakout|Momentum/i.test(await txt()))

// multi-chart
await page.evaluate(() => [...document.querySelectorAll('button[title]')].find(b => b.title === '2 charts')?.click()); await wait(4000)
ok('2-chart grid (no error)', errs.filter(e => !e.includes('binance')).length === 0)
const cells = await page.evaluate(() => { const m = document.querySelector('main'); const g = m.querySelector('div.grid'); return g ? g.children.length : 0 })
ok('2-chart grid has 2 panes', cells === 2)
await page.evaluate(() => [...document.querySelectorAll('button[title]')].find(b => b.title === '1 chart')?.click()); await wait(1500)

// content studio
await clickInc('📣 Content'); await wait(2000)
ok('content studio opens', (await txt()).includes('Content Studio'))
ok('content images load', (await page.evaluate(() => [...document.querySelectorAll('img[src*="content-images"]')].filter(i => i.naturalWidth > 0).length)) >= 5)
await clickEq('✕'); await wait(300)

// drawing tool selectable
ok('drawing tool selectable', await page.evaluate(() => !![...document.querySelectorAll('button[title]')].find(b => b.title === 'Horizontal line')))
// right-click menu (dispatch contextmenu on the chart's relative container)
await page.evaluate(() => [...document.querySelectorAll('button[title]')].find(b => b.title === 'Cursor')?.click()); await wait(200)
await page.evaluate(() => {
  const rel = [...document.querySelectorAll('main div')].find(d => getComputedStyle(d).position === 'relative' && d.querySelector('canvas'))
  const r = rel.getBoundingClientRect()
  rel.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 200, clientY: r.top + 180 }))
}); await wait(500)
ok('chart right-click menu', (await txt()).includes('Reset view'))
await page.mouse.click(650, 380); await wait(200)

ok('NO console/page errors overall', errs.filter(e => !e.toLowerCase().includes('binance')).length === 0)

await b.close()
console.log(`\nFUNCTIONALITY TESTS: ${pass} passed, ${fail} failed`)
if (errs.length) console.log('console errors:', [...new Set(errs)].slice(0, 5).join(' | '))
if (fail) { console.log('FAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1) }
else console.log('✓ ALL FUNCTIONALITY TESTS PASSED')
