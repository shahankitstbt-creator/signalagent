// Indian-market screener. Builds a universe from NSE index constituents,
// scores each stock on the user's criteria (price/volume/RSI/harmonic/price-action),
// backtests the setup for a measured hit-rate, scrapes screener.in for
// FII/DII/promoter/pledge on finalists, and writes public/picks.json.
//
//   node scripts/screener.mjs            # index-union universe (~600 stocks)
//   node scripts/screener.mjs --full     # entire NSE equity list (~2000)
//   node scripts/screener.mjs --top 40   # how many finalists get fundamentals
//
import { writeFileSync, mkdirSync } from 'node:fs'
import { getText, getJSON, pool, sleep, sma, rsiSeries, atrSeries, pivots, UA } from './lib.mjs'
import { runEngine, LOGICS, MIN_ACCURACY, MIN_TRADES } from './signalEngine.mjs'
import { generateContent } from './contentEngine.mjs'
import { GEN_META, runPriceGenerators, runMultibagger, horaSignals, assetBiasSignals, dailyBias } from './generators.mjs'
import { optionBuildup } from './angelClient.mjs'
import { loadLedger, saveLedger, openOrUpdate, evaluate, trackRecord } from './ledger.mjs'
import { trackNews } from './news.mjs'
import { fetchDelivery } from './delivery.mjs'
import { fetchFnoLots, optionPlay, atmStrike } from './fno.mjs'
import { notifyNewSignals, notifyClosures } from './telegram.mjs'
import { readFileSync } from 'node:fs'

const TRADE_GENS = new Set(['vol_accum', 'vp_fib', 'money_flow', 'multibagger', 'harmonic'])

// timeframe modes: Daily (swing), Weekly (positional), Intraday (pre-move, real-market)
const TF = {
  daily: { interval: '1d', range: '1y', label: 'Daily' },
  weekly: { interval: '1wk', range: '5y', label: 'Weekly' },
  intraday: { interval: '60m', range: '1mo', label: 'Intraday 1h' },
}

const ARGS = process.argv.slice(2)
const FULL = ARGS.includes('--full')
const TOP = +(ARGS[ARGS.indexOf('--top') + 1]) || 50
const LIMIT = ARGS.includes('--limit') ? +ARGS[ARGS.indexOf('--limit') + 1] : 0
const TFARG = ARGS.includes('--tf') ? ARGS[ARGS.indexOf('--tf') + 1] : 'daily'
const IMPROVE = ARGS.includes('--improve')

// NSE archive CSVs (skipped automatically if a name 404s)
const INDEX_CSV = {
  'NIFTY 50': 'ind_nifty50list.csv', 'NIFTY Next 50': 'ind_niftynext50list.csv',
  'NIFTY 100': 'ind_nifty100list.csv', 'NIFTY 500': 'ind_nifty500list.csv',
  'NIFTY Midcap 100': 'ind_niftymidcap100list.csv', 'NIFTY Midcap 150': 'ind_niftymidcap150list.csv',
  'NIFTY Midcap Select': 'ind_niftymidcapselect_list.csv',
  'NIFTY Smallcap 100': 'ind_niftysmallcap100list.csv', 'NIFTY Smallcap 250': 'ind_niftysmallcap250list.csv',
  'NIFTY Bank': 'ind_niftybanklist.csv', 'NIFTY Auto': 'ind_niftyautolist.csv',
  'NIFTY FMCG': 'ind_niftyfmcglist.csv', 'NIFTY IT': 'ind_niftyitlist.csv',
  'NIFTY Metal': 'ind_niftymetallist.csv', 'NIFTY Pharma': 'ind_niftypharmalist.csv',
  'NIFTY PSU Bank': 'ind_niftypsubanklist.csv', 'NIFTY Financial Services': 'ind_niftyfinancelist.csv',
  'NIFTY Commodities': 'ind_niftycommoditieslist.csv',
}
const ARCH = 'https://nsearchives.nseindia.com/content/indices/'
const EQUITY_L = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv'

const parseCSV = (txt) => {
  const lines = txt.trim().split(/\r?\n/)
  const head = lines[0].split(',').map(s => s.trim())
  return lines.slice(1).map(l => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, (c[i] || '').trim()])) })
}

async function buildUniverse(full) {
  const map = new Map() // symbol -> { symbol, name, sector, indices:Set }
  const add = (sym, name, sector, index) => {
    if (!sym) return
    if (!map.has(sym)) map.set(sym, { symbol: sym, name, sector, indices: new Set() })
    if (index) map.get(sym).indices.add(index)
  }
  for (const [index, file] of Object.entries(INDEX_CSV)) {
    const txt = await getText(ARCH + file)
    if (!txt) { console.log('  · skip', index, '(no CSV)'); continue }
    const rows = parseCSV(txt)
    rows.forEach(r => add(r.Symbol, r['Company Name'], r.Industry, index))
    console.log('  · loaded', index, rows.length)
    await sleep(150)
  }
  if (full) {
    const txt = await getText(EQUITY_L)
    if (txt) parseCSV(txt).filter(r => r.SERIES === 'EQ' || r[' SERIES'] === 'EQ')
      .forEach(r => add(r.SYMBOL, r['NAME OF COMPANY'], 'Equity', 'NSE Equity'))
    console.log('  · loaded full NSE equity list')
  }
  return [...map.values()].map(s => ({ ...s, indices: [...s.indices] }))
}

// ── Yahoo OHLCV ──
async function ohlcv(symbol, interval = '1d', range = '1y') {
  const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=${interval}&range=${range}`)
  const r = d?.chart?.result?.[0]; if (!r?.timestamp) return null
  const q = r.indicators.quote[0], t = r.timestamp
  const o = [], h = [], l = [], c = [], v = [], time = []
  for (let i = 0; i < t.length; i++) { if (q.close[i] == null) continue; time.push(t[i]); o.push(q.open[i]); h.push(q.high[i]); l.push(q.low[i]); c.push(q.close[i]); v.push(q.volume[i] || 0) }
  return c.length > 60 ? { time, o, h, l, c, v } : null
}

const emaSeries = (arr, len) => { const k = 2 / (len + 1); const out = [arr[0]]; for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k)); return out }
function bbWidthSeries(c, len = 20) {
  const out = new Array(c.length).fill(null)
  for (let i = len - 1; i < c.length; i++) {
    const w = c.slice(i - len + 1, i + 1); const m = avg(w)
    const sd = Math.sqrt(avg(w.map(x => (x - m) ** 2)))
    out[i] = m ? (4 * sd) / m : null
  }
  return out
}

// OBV slope: is on-balance volume higher than 5 bars ago?
function obvSlope(c, v) {
  let o = 0; const ser = [0]
  for (let k = 1; k < c.length; k++) { o += c[k] > c[k - 1] ? v[k] : c[k] < c[k - 1] ? -v[k] : 0; ser.push(o) }
  return ser[ser.length - 1] > ser[Math.max(0, ser.length - 6)]
}

// ── pre-move detection: find stocks coiled/poised to move BEFORE they run ──
function analyze(d) {
  const { o, h, l, c, v, time } = d
  const n = c.length, i = n - 1
  const rsi = rsiSeries(c), atr = atrSeries(h, l, c)
  const a = atr[i] || c[i] * 0.02
  const e20 = emaSeries(c, 20), e50 = emaSeries(c, 50)
  // ── VOLUME / BIG-MONEY ACCUMULATION footprint (detect inflow BEFORE the move) ──
  const vol5 = avg(v.slice(-6, -1)), vol5prev = avg(v.slice(-11, -6))
  const vol20 = avg(v.slice(-21, -1)) || vol5
  const rvol = vol20 ? +(v[i] / vol20).toFixed(2) : 1                       // relative volume vs 20-period avg
  const volGt5d = v[i] > vol5
  const volIncreasing = vol5 > vol5prev && v[i] >= v[i - 1]
  const vol5GtAvg = vol5 > vol20 * 1.1                                      // last-5 volume > average  (#1)
  const vol1GtVol5 = v[i] > vol5 * 1.3                                      // 1-day volume > 5-day avg surge  (#2)
  let upVol = 0, dnVol = 0; const upV = [], dnV = []
  for (let k = Math.max(1, n - 20); k < n; k++) { if (c[k] >= c[k - 1]) { upVol += v[k]; if (k >= n - 10) upV.push(v[k]) } else { dnVol += v[k]; if (k >= n - 10) dnV.push(v[k]) } }
  const accRatio = dnVol ? +(upVol / dnVol).toFixed(2) : +upVol.toFixed(0) // up vs down volume = accumulation pressure
  const volBuildup = upVol > dnVol * 1.1
  const dryUp = upV.length && dnV.length && avg(upV) > avg(dnV) * 1.5       // dip-volume dries up, rally-volume expands
  const priceFlat5 = i >= 5 && c[i - 5] ? Math.abs((c[i] - c[i - 5]) / c[i - 5]) < 0.03 : false
  const obvUp = obvSlope(c, v)
  const stealthAccum = priceFlat5 && vol5 > vol5prev * 1.2 && accRatio > 1.2 // volume in BEFORE price moves
  let volScore = 0; const volSignals = []
  const vadd = (cond, pts, label) => { if (cond) { volScore += pts; volSignals.push(label) } }
  vadd(vol5GtAvg, 18, `5-day volume > 20-day average (RVOL ${rvol}×)`)
  vadd(vol1GtVol5, 18, `1-day volume ${(v[i] / (vol5 || 1)).toFixed(1)}× the 5-day average — surge`)
  vadd(accRatio >= 1.3, 22, `Up/down volume ${accRatio}× — accumulation pressure`)
  vadd(dryUp, 15, 'Volume dries up on dips, expands on rallies (strong hands holding)')
  vadd(stealthAccum, 20, 'Stealth accumulation — volume rising while price still flat')
  vadd(obvUp, 10, 'OBV rising — on-balance volume confirms net inflow')
  volScore = Math.min(100, volScore)
  const vol = { rvol, vol5GtAvg, vol1GtVol5, accRatio, dryUp, stealthAccum, obvUp, volScore, signals: volSignals }
  const rsiVal = rsi[i] ?? 50
  const rsiRising = rsiVal > (rsi[i - 3] ?? rsiVal)
  const rsiBreakoutReady = rsiVal > 50 && rsiVal < 68 && rsiRising
  const higherLows = l.slice(-5)[4] > l.slice(-5)[0]
  const priceActionBullish = higherLows && c[i] > (h[i] + l[i]) / 2
  const harm = harmonicBull(h, l, c)
  const changePct = i > 0 && c[i - 1] ? ((c[i] - c[i - 1]) / c[i - 1]) * 100 : 0

  // precursors of an impending move
  const bbw = bbWidthSeries(c).slice(-60).filter(x => x != null)
  const cur = bbw.at(-1), bMin = Math.min(...bbw), bMax = Math.max(...bbw)
  const squeezePctile = bMax > bMin ? (cur - bMin) / (bMax - bMin) : 1
  const squeeze = squeezePctile < 0.25                       // volatility coiled
  const high20 = Math.max(...h.slice(-20))
  const distToHigh = (high20 - c[i]) / c[i]
  const nearBreakout = distToHigh < 0.03 && distToHigh > -0.005 // hugging 20-day high
  const emaStack = c[i] > e20[i] && e20[i] > e50[i] && e20[i] > e20[i - 3]
  const mom20 = n > 21 ? ((c[i] - c[i - 20]) / c[i - 20]) * 100 : 0
  const contraction = atr[i] != null && atr[i - 15] != null && atr[i] < atr[i - 15]
  const pctOf52 = c[i] / Math.max(...h.slice(-250))

  let ms = 0; const pre = []
  const add = (cond, pts, label) => { if (cond) { ms += pts; pre.push(label) } }
  add(squeeze, 20, 'Volatility squeeze — coiled for a move')
  add(nearBreakout, 18, `Hugging 20-day high (${(distToHigh * 100).toFixed(1)}% below)`)
  add(emaStack, 15, 'Above rising 20 & 50 EMA')
  add(rsiBreakoutReady, 12, `RSI ${rsiVal.toFixed(0)} building (not overbought)`)
  add(stealthAccum, 14, 'Stealth volume accumulation — money in before the move')
  add(accRatio >= 1.3, 10, `Up/down volume ${accRatio}× (accumulation)`)
  add(higherLows, 10, 'Higher lows (ascending base)')
  add(mom20 > 3, 8, `Positive 20-day momentum +${mom20.toFixed(0)}%`)
  add(vol1GtVol5, 7, `1-day volume surge (${rvol}× RVOL)`)
  add(contraction, 5, 'Range contraction')
  add(pctOf52 > 0.9, 5, 'Near 52-week high')
  add(vol5GtAvg, 5, '5-day volume > 20-day average')
  ms = Math.min(100, ms)

  const setupType = squeeze && nearBreakout ? 'Squeeze breakout'
    : nearBreakout && emaStack ? 'Breakout watch'
    : emaStack && rsiBreakoutReady ? 'Momentum building'
    : higherLows && volBuildup ? 'Accumulation' : 'Watch'
  const bullish = emaStack || nearBreakout || (higherLows && rsiRising)

  const swingLow = Math.min(...l.slice(-6))
  const entry = c[i]
  const sl = Math.min(swingLow - 0.2 * a, entry - 1.5 * a)
  const risk = entry - sl
  const targets = [entry + 2 * a, entry + 3.5 * a, entry + 5 * a]
  const rr = risk > 0 ? (targets[0] - entry) / risk : 0
  const bt = backtest(d, atr, rsi)
  // expected days to each target = ATR-velocity estimate blended with measured backtest avg
  const dpt = Math.max(a * 0.55, entry * 0.004)            // ~ expected directional progress / trading day
  const atrD = targets.map(t => (t - entry) / dpt)
  const blend = (ad, bd, fb) => Math.max(1, Math.round(bd ? 0.5 * ad + 0.5 * bd : (ad || fb)))
  const eta1 = blend(atrD[0], bt.avgDaysT1, 8)
  const eta2 = Math.max(blend(atrD[1], bt.avgDaysT2, 18), eta1 + 2)
  const eta3 = Math.max(blend(atrD[2], bt.avgDaysT3, 32), eta2 + 3)
  return {
    price: round(entry), rsi: round(rsiVal, 1), atr: round(a), changePct: round(changePct, 2),
    volGt5d, volIncreasing, rsiBreakoutReady, priceActionBullish, harmonic: harm,
    squeeze, nearBreakout, emaStack, volBuildup, higherLows, mom20: round(mom20, 1),
    moveScore: Math.round(ms), setupType, precursors: pre, bullish,
    entry: round(entry), sl: round(sl), targets: targets.map(t => round(t)), rr: round(rr, 2),
    bt, etaDays: [eta1, eta2, eta3], lastTime: time[i], vol,
  }
}
const avg = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1)
const round = (x, d = 2) => x == null ? null : +x.toFixed(d)

function harmonicBull(h, l, c) {
  const p = pivots(h, l, 3)
  if (p.length < 3) return { bullish: false }
  const last3 = p.slice(-3) // expect L(A) H(B) L(C) or similar up-then-retrace
  const [A, B, C] = last3
  if (A.type === 'L' && B.type === 'H' && C.type === 'L') {
    const up = B.price - A.price
    const retr = (B.price - C.price) / (up || 1)
    if (retr >= 0.382 && retr <= 0.886 && c[c.length - 1] > C.price) return { bullish: true, pattern: 'Bullish ABC retrace', retrace: round(retr, 2) }
  }
  return { bullish: false }
}

// backtest the bullish setup over this stock's history → hit-rate + avg days to targets
function backtest(d, atr, rsi) {
  const { h, l, c, v } = d
  const trades = []; let open = null
  for (let i = 30; i < c.length; i++) {
    if (open) {
      let exit = null
      if (l[i] <= open.sl) exit = { win: false, days: i - open.i }
      else if (h[i] >= open.t1) exit = { win: true, days: i - open.i, dT2: h[i] >= open.t2 ? i - open.i : null, dT3: h[i] >= open.t3 ? i - open.i : null }
      if (exit) { trades.push({ ...open, ...exit }); open = null }
    }
    if (open) continue
    const a = atr[i]; if (a == null) continue
    const vol5 = avg(v.slice(i - 5, i))
    const rsiOk = rsi[i] > 52 && rsi[i] < 70 && rsi[i] > (rsi[i - 2] ?? 0)
    const paOk = l[i] > l[i - 4] && c[i] > (h[i] + l[i]) / 2
    if (v[i] > vol5 && rsiOk && paOk) {
      const entry = c[i], sl = entry - 1.5 * a
      open = { i, entry, sl, t1: entry + 2 * a, t2: entry + 3.5 * a, t3: entry + 5 * a }
    }
  }
  const wins = trades.filter(t => t.win)
  const daysT1 = wins.map(t => t.days)
  const daysT2 = wins.map(t => t.dT2).filter(Boolean)
  const daysT3 = wins.map(t => t.dT3).filter(Boolean)
  const d1 = daysT1.length ? Math.round(avg(daysT1)) : 8
  const d2 = Math.max(daysT2.length ? Math.round(avg(daysT2)) : 18, d1 + 3) // keep dates monotonic
  const d3 = Math.max(daysT3.length ? Math.round(avg(daysT3)) : 32, d2 + 5)
  return {
    trades: trades.length, wins: wins.length,
    hitRate: trades.length ? round((wins.length / trades.length) * 100, 1) : null,
    avgDaysT1: d1, avgDaysT2: d2, avgDaysT3: d3,
  }
}

// ── screener.in fundamentals (quarterly shareholding + pledge) ──
export async function fundamentals(symbol) {
  for (const path of [`/company/${symbol}/consolidated/`, `/company/${symbol}/`]) {
    const html = await getText('https://www.screener.in' + path, 2)
    if (!html) continue
    const sec = section(html, 'shareholding')
    if (!sec) continue
    const row = (label) => {
      // label sits inside a <button> in the first <td>; %-cells follow until </tr>
      const at = sec.search(new RegExp('>\\s*' + label + '(?:&nbsp;|\\+|<|\\s)', 'i'))
      if (at < 0) return null
      const end = sec.indexOf('</tr>', at)
      const chunk = sec.slice(at, end < 0 ? at + 900 : end)
      const nums = (chunk.match(/-?\d+\.?\d*(?=%)/g) || []).map(Number)
      return nums.length >= 2 ? nums.slice(-8) : null // last up-to-8 quarters
    }
    const trend = (nums) => { if (!nums || nums.length < 2) return { status: 'n/a' }; const cur = nums.at(-1), prev = nums.at(-2); return { cur, prev, delta: round(cur - prev, 2), status: cur >= prev - 0.05 ? (cur > prev + 0.05 ? 'up' : 'stable') : 'down' } }
    const prom = row('Promoters'), fii = row('FIIs'), dii = row('DIIs')
    const pledge = row('Pledged')
    return {
      promoter: trend(prom), fii: trend(fii), dii: trend(dii),
      // screener omits the pledge row when negligible → treat absence as ~0 (low)
      pledge: pledge ? { pct: pledge.at(-1), low: pledge.at(-1) < 10 } : { pct: 0, low: true, assumed: true },
      ok: !!(prom || fii || dii),
    }
  }
  return null
}
function section(html, id) {
  const i = html.indexOf(`id="${id}"`)
  if (i < 0) return null
  return html.slice(i, i + 14000)
}

// ── scoring: confidence = pre-move setup score + backtest hit-rate + fundamentals ──
function scorePick(s, fund) {
  const cr = []
  const push = (ok, label) => cr.push({ ok: !!ok, label })
  push(s.squeeze, 'Volatility squeeze — coiled for a move')
  push(s.nearBreakout, 'Near 20-day breakout level')
  push(s.emaStack, 'Above rising 20/50 EMA')
  push(s.rsiBreakoutReady, `RSI ${s.rsi} building toward breakout`)
  push(s.volBuildup, 'Accumulation — up-day volume dominates')
  push(s.higherLows, 'Higher lows (ascending base)')
  push(s.harmonic.bullish, s.harmonic.bullish ? `Harmonic up (${s.harmonic.pattern})` : 'Harmonic up')
  let fundPct = 50
  if (fund) {
    const ok = st => st === 'up' || st === 'stable'
    push(ok(fund.fii.status), `FII ${fund.fii.status} (${fund.fii.delta ?? '?'}%)`)
    push(ok(fund.dii.status), `DII ${fund.dii.status} (${fund.dii.delta ?? '?'}%)`)
    push(ok(fund.promoter.status), `Promoter ${fund.promoter.status}`)
    push(fund.pledge.low === true, fund.pledge.pct != null ? `Pledge ${fund.pledge.pct}% (low)` : 'Pledge low')
    const got = [fund.fii, fund.dii, fund.promoter].filter(x => ok(x.status)).length + (fund.pledge.low ? 1 : 0)
    fundPct = Math.round((got / 4) * 100)
  }
  const hr = s.bt.trades >= 6 ? s.bt.hitRate : null
  // weighted blend: move-setup 50%, backtest 30% (when available), fundamentals the rest
  const parts = [[s.moveScore, 0.5]]
  if (hr != null) parts.push([hr, 0.3])
  parts.push([fundPct, hr != null ? 0.2 : 0.5])
  const wsum = parts.reduce((a, [, w]) => a + w, 0)
  const confidence = Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / wsum)
  return { criteria: cr, moveScore: s.moveScore, backtestHitRate: hr, backtestTrades: s.bt.trades, confidence, fundPct }
}

// advance/decline breadth per index (green vs red constituents today)
function computeBreadth(scored) {
  const b = {}
  for (const s of scored) for (const idx of s.indices) {
    const e = b[idx] || (b[idx] = { advancing: 0, declining: 0, unchanged: 0, total: 0 })
    e.total++
    if (s.changePct > 0.1) e.advancing++
    else if (s.changePct < -0.1) e.declining++
    else e.unchanged++
  }
  for (const k in b) {
    const e = b[k]
    e.advPct = e.total ? Math.round((e.advancing / e.total) * 100) : 0
    e.adRatio = e.declining ? +(e.advancing / e.declining).toFixed(2) : e.advancing
    e.bias = e.advPct >= 60 ? 'Bullish' : e.advPct <= 40 ? 'Bearish' : 'Neutral'
  }
  return b
}

// ── main ──
export async function runScan({ full = false, top = 50, limit = 0, tf = 'daily', improve = false } = {}) {
  const t0 = Date.now()
  const cfg = TF[tf] || TF.daily
  const isDaily = tf === 'daily'
  console.log(`Building universe… [${cfg.label}]`)
  let uni = await buildUniverse(full)
  // expose the full universe to the UI for stock search/watchlist
  mkdirSync('public', { recursive: true })
  if (isDaily) writeFileSync('public/universe.json', JSON.stringify(uni.map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector, indices: s.indices }))))
  if (limit) uni = uni.slice(0, limit)
  // NSE delivery % (daily EOD metric) — the truest big-money confirmation
  const deliv = isDaily ? await fetchDelivery() : { map: {}, date: null }
  if (isDaily) writeFileSync('public/delivery.json', JSON.stringify({ date: deliv.date, count: Object.keys(deliv.map).length }))
  console.log(`Universe: ${uni.length} stocks. Fetching ${cfg.interval} OHLCV…`)

  let count = 0
  const scored = (await pool(uni, 8, async (st) => {
    const d = await ohlcv(st.symbol, cfg.interval, cfg.range)
    if (!d) return null
    const s = analyze(d)
    let eng = null; try { eng = runEngine(d) } catch {}
    return { ...st, ...s, _eng: eng, _d: d, _deliv: deliv.map[st.symbol] || null }
  }, (done, total) => console.log(`  OHLCV ${done}/${total}`))).filter(Boolean)

  // daily-only aggregates (legacy signal-engine board + breadth) — skip on weekly/intraday
  if (isDaily) {
    buildSignals(scored)
    const breadth = computeBreadth(scored)
    writeFileSync('public/breadth.json', JSON.stringify({ generatedAt: new Date().toISOString(), breadth }))
  }

  const today = new Date()
  const fmtDate = d => d.toISOString().slice(0, 10)
  // forecast-date formatter, timeframe-aware (daily=trading days, weekly=weeks, intraday=hours)
  const addBiz = n => { const d = new Date(today); let a = 0; const t = Math.max(1, Math.round(n)); while (a < t) { d.setDate(d.getDate() + 1); const wd = d.getDay(); if (wd !== 0 && wd !== 6) a++ } return fmtDate(d) }
  const addDays = tf === 'weekly' ? (n => { const d = new Date(today); d.setDate(d.getDate() + Math.max(1, Math.round(n)) * 7); return fmtDate(d) })
    : tf === 'intraday' ? (n => `~${Math.max(1, Math.round(n))}h`)
      : addBiz

  // candidates = bullish bias + meaningful pre-move score (self-tuned gate)
  const tuning = loadTuning()
  const cand = scored.filter(s => s.bullish && s.moveScore >= tuning.minMoveScore && s.rr >= 0.8)
    .sort((a, b) => b.moveScore - a.moveScore || (b.bt.hitRate ?? 0) - (a.bt.hitRate ?? 0))
  const finalists = cand.slice(0, top)
  // fundamentals (multibagger) only on daily — too heavy to scrape on each weekly/intraday run
  if (isDaily) {
    console.log(`Pre-move candidates: ${cand.length}. Fetching fundamentals for top ${top}…`)
    await pool(finalists, 4, async (s) => { s._fund = await fundamentals(s.symbol); await sleep(250) }, (d, t) => console.log(`  fundamentals ${d}/${t}`))
  }

  const picks = finalists.map(s => {
    const sc = scorePick(s, s._fund)
    const pct = (a) => round(((a - s.entry) / s.entry) * 100, 1)
    return {
      symbol: s.symbol, name: s.name, sector: s.sector, indices: s.indices,
      price: s.price, direction: 'LONG', changePct: s.changePct,
      setupType: s.setupType, moveScore: s.moveScore,
      entry: s.entry, sl: s.sl, slPct: pct(s.sl),
      targets: [
        { price: s.targets[0], pct: pct(s.targets[0]), by: addDays(s.bt.avgDaysT1) },
        { price: s.targets[1], pct: pct(s.targets[1]), by: addDays(s.bt.avgDaysT2) },
        { price: s.targets[2], pct: pct(s.targets[2]), by: addDays(s.bt.avgDaysT3) },
      ],
      rr: s.rr, rsi: s.rsi,
      confidence: sc.confidence, moveScore: s.moveScore,
      backtestHitRate: sc.backtestHitRate, backtestTrades: sc.backtestTrades,
      criteria: sc.criteria,
      fundamentals: s._fund || null,
      why: `${s.setupType} — ${s.precursors.join('; ')}`,
      expected: `Targets ${s.targets[0]} / ${s.targets[1]} / ${s.targets[2]} (${pct(s.targets[0])}% / ${pct(s.targets[1])}% / ${pct(s.targets[2])}%), risk to ${s.sl}.`,
    }
  }).sort((a, b) => b.confidence - a.confidence)

  // ── SIGNAL BOARD (grouped by generator) ──
  const board = await buildBoard(scored, finalists, addDays, today)
  const todayTs = Math.floor(today.getTime() / 1000)
  const todayISO = today.toISOString().slice(0, 10)

  // ── LEDGER (DAILY only): track every signal to win/loss/expired; closed signals leave the board ──
  let tr = null, goal = null, closedNow = []
  if (isDaily) {
    const ledger = loadLedger()
    const barsBySymbol = {}
    for (const st of scored) if (st._d) barsBySymbol[st.symbol] = { time: st._d.time, h: st._d.h, l: st._d.l, c: st._d.c }
    for (const g of board) if (TRADE_GENS.has(g.id)) for (const card of g.signals) openOrUpdate(ledger, card, todayISO, todayTs)
    closedNow = evaluate(ledger, barsBySymbol, todayISO, todayTs)
    for (const g of board) if (TRADE_GENS.has(g.id)) {
      const act = Object.values(ledger.active).filter(s => s.generator === g.id).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 15)
      g.signals = act; g.count = act.length
    }
    saveLedger(ledger)
    tr = trackRecord(ledger, GEN_META)
    writeFileSync('public/track_record.json', JSON.stringify({ generatedAt: today.toISOString(), ...tr }, null, 2))
    // SELF-IMPROVEMENT runs only on the post-market (--improve) pass (6 PM IST) when the
    // day's moves are final. Pre-market/live passes just refresh the boards.
    if (improve) {
      const extNote = await fetchExternalGainers()
      const si = await runSelfImprovement(scored, board, today, ledger, extNote, tr)
      goal = si.goal
      try { const news = await trackNews(uni); writeFileSync('public/news.json', JSON.stringify({ generatedAt: today.toISOString(), count: news.length, items: news }, null, 2)); console.log(`News: ${news.length} headlines`) } catch (e) { console.log('News skipped:', e.message) }
    } else {
      try { goal = JSON.parse(readFileSync('public/goal.json', 'utf8')) } catch {}
    }
    // SELECTIVITY: apply the self-tuned quality bar every pass (fewer, higher-quality signals → toward 85%)
    const bar = loadTuning().qualityBar || 0
    if (bar > 0) for (const g of board) if (TRADE_GENS.has(g.id)) {
      g.signals = g.signals.filter(s => (s.confidence ?? 0) >= bar || (s.delivery ?? 0) >= 60)
      g.count = g.signals.length
    }
  }

  // ── ⭐ CONFLUENCE (all timeframes): stocks flagged by 2+ generators, Vedic-aligned, with a position-sized plan ──
  const dbAssets = Object.fromEntries(dailyBias(today).assets.map(a => [a.id, a]))
  const bySym = {}
  for (const g of board) if (TRADE_GENS.has(g.id)) for (const s of g.signals) (bySym[s.symbol] = bySym[s.symbol] || []).push({ gen: g.label, s })
  const CAP = 100000, RISKPCT = 1
  const confluence = []
  for (const [sym, list] of Object.entries(bySym)) {
    if (list.length < 2) continue
    const best = [...list].map(x => x.s).sort((a, b) => ((b.accuracy ?? b.confidence ?? 0) - (a.accuracy ?? a.confidence ?? 0)))[0]
    const vb = dbAssets[sectorAsset(best.sector, best.indices)]; const vedicUp = vb && vb.tone === 'up'
    const gens = [...new Set(list.map(x => x.gen))]
    const strongDeliv = best.delivery != null && best.delivery >= 60
    const riskPS = Math.max(0.05, best.entry - best.sl)
    const shares = Math.max(1, Math.floor((CAP * RISKPCT / 100) / riskPS))
    const grade = (gens.length >= 3 && strongDeliv) ? 'A++' : gens.length >= 3 ? 'A++' : (gens.length >= 2 && (vedicUp || strongDeliv)) ? 'A+' : 'A'
    const rewardT1 = round(shares * (best.targets[0].price - best.entry))
    const accLine = best.accuracy != null ? `Backtested ~${best.accuracy}% (n=${best.backtestTrades})` : 'Limited backtest history'
    const delivLine = best.delivery != null ? `\n📦 Delivery ${best.delivery}% (${strongDeliv ? 'strong hands accumulating' : 'mostly intraday'})` : ''
    const social = `⭐ TOP PICK (Grade ${grade}) — ${sym}\n${gens.length} signals agree: ${gens.join(', ')}${vedicUp ? ` + ${vb.name} Vedic bias bullish` : ''}${delivLine}\nEntry ₹${best.entry} · SL ₹${best.sl} (${best.slPct}%)\nT1 ₹${best.targets[0].price} (+${best.targets[0].pct}%) by ${best.targets[0].by} · T2 +${best.targets[1].pct}% · T3 +${best.targets[2].pct}%\nPlan (₹1L, 1% risk): buy ${shares} sh · risk ₹${round(shares * riskPS)} · reward T1 ₹${rewardT1} · R:R 1:${best.rr}\n${accLine}. 📌 Educational only, not advice. Not SEBI-registered.\n#${sym} #swingtrading #nifty`
    confluence.push({
      ...best, generator: 'confluence', generators: gens, genCount: gens.length, grade, social,
      confluenceScore: Math.round(gens.length * 30 + (best.accuracy ?? best.confidence ?? 0) * 0.4 + (vedicUp ? 15 : 0) + (strongDeliv ? 20 : 0)),
      vedicAsset: vb?.name, vedicLabel: vb?.label, vedicAligned: vedicUp, delivery: best.delivery, strongDeliv,
      plan: { capital: CAP, riskPct: RISKPCT, shares, deploy: round(shares * best.entry), riskRs: round(shares * riskPS), rewardT1Rs: rewardT1 },
    })
  }
  confluence.sort((a, b) => b.confluenceScore - a.confluenceScore)
  const confCol = board.find(g => g.id === 'confluence')
  if (confCol) { confCol.signals = confluence.slice(0, 12); confCol.count = confCol.signals.length }

  // ── 📊 FUTURES & OPTIONS: F&O-eligible instruments (stocks/index/commodity) with lot + options play ──
  const fnoLots = await fetchFnoLots()
  const fno = buildFno(board, dbAssets, fnoLots, scored, addDays)
  const fnoCol = board.find(g => g.id === 'fno')
  if (fnoCol) { fnoCol.signals = fno.slice(0, 40); fnoCol.count = fnoCol.signals.length }
  console.log(`F&O: ${fno.length} setups (${Object.keys(fnoLots).length} F&O instruments)`)

  // ── TELEGRAM: highest-conviction PRE-MOVE entries + target/SL update alerts (no duplicates) ──
  try { await notifyNewSignals({ generators: board }, todayISO) } catch (e) { console.log('Telegram skipped:', e.message) }
  try { await notifyClosures(closedNow, todayISO) } catch (e) { console.log('Telegram updates skipped:', e.message) }

  // ── write the timeframe board (board-daily/weekly/intraday.json); daily also writes board.json ──
  const boardJson = JSON.stringify({
    generatedAt: today.toISOString(), date: todayISO, timeframe: tf, label: cfg.label,
    note: `${cfg.label} signals. Each card shows its MEASURED backtested first-target hit-rate — not a guaranteed win-rate. Astro is traditional/educational (no proven edge).`,
    trackRecord: tr, goal, generators: board,
  }, null, 2)
  writeFileSync(`public/board-${tf}.json`, boardJson)
  if (isDaily) writeFileSync('public/board.json', boardJson)
  console.log(`Board [${cfg.label}]:`, board.map(g => `${g.label.split(' ')[0]}:${g.count}`).join(' · '))

  if (isDaily) {
    writeFileSync('public/picks.json', JSON.stringify({
      generatedAt: today.toISOString(),
      universe: uni.length, scanned: scored.length, candidates: cand.length, count: picks.length,
      note: 'Confidence = blend of criteria confluence and measured backtest hit-rate. NOT a guaranteed win-rate. Fundamentals are quarterly (screener.in). Curate before trading.',
      picks,
    }, null, 2))
  }
  console.log(`\nDone [${cfg.label}] in ${Math.round((Date.now() - t0) / 1000)}s`)
  // NOTE: content (text + branded images) is generated by scripts/contentImages.mjs
  // as one atomic step so content.json always carries image paths. Run post-scan.
}
function buildWhy(s, sc) {
  const reasons = sc.criteria.filter(c => c.ok).map(c => c.label)
  return reasons.join('; ')
}

// Group every generator's signals into board columns. Astro = real ephemeris
// (5 methods × Nifty/Gold) + Hora timing; option = live Angel One OI snapshot.
async function buildBoard(scored, finalists, addDays, today) {
  const byGen = {}; for (const g of GEN_META) byGen[g.id] = []
  for (const st of scored) { if (!st._d) continue; for (const sg of runPriceGenerators(st, st._d, st, addDays)) byGen[sg.generator]?.push(sg) }
  for (const st of finalists) { const m = runMultibagger(st, st, st._fund, addDays); if (m) byGen.multibagger.push(m) }
  // price-based columns: rank by confidence, cap 15
  for (const id of ['vol_accum', 'vp_fib', 'money_flow', 'multibagger', 'harmonic']) byGen[id] = byGen[id].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 15)
  // astro columns: per-asset daily bias (Nifty/Gold/sectors) + full hora schedule
  byGen.vedic_astro = assetBiasSignals(today)
  byGen.astro_timing = horaSignals(today)
  // live option-chain build-up via Angel One (NIFTY + BANKNIFTY; placeholder on failure)
  // OI history is diffed scan-to-scan to label long/short/writing build-up.
  const oiHist = loadOIHist()
  const optCards = []
  for (const [idx, step, nm] of [['NIFTY', 50, 'Nifty Option Chain'], ['BANKNIFTY', 100, 'Bank Nifty Option Chain']]) {
    optCards.push(optionCard(await optionBuildup(idx, step), idx, nm, oiHist, today))
  }
  saveOIHist(oiHist)
  byGen.option_buildup = optCards
  const p = dailyBias(today).panchang
  return GEN_META.map(g => {
    let desc = g.desc
    if (g.id === 'astro_timing') desc = `${p.vaar} · ☀ ${p.sunrise}–${p.sunset} · Rahu Kaal ${p.rahuKaal} (avoid fresh entries) · Moon ${p.moon}`
    if (g.id === 'vedic_astro') desc = `${p.tithi} · ${p.yoga} yoga · Karana ${p.karana} · Moon ${p.moon}. Per-asset bias from Nava Tara + significators (tradition — no proven edge).`
    return { ...g, desc, count: byGen[g.id].length, signals: byGen[g.id] }
  })
}

function optionCard(o, sym = 'NIFTY', name = 'Nifty Option Chain', hist = [], today = new Date()) {
  const base = { generator: 'option_buildup', isOption: true, symbol: sym, name }
  if (!o || o.placeholder) return { ...base, placeholder: true, reason: o?.reason || 'Live OI needs Angel One F&O access.', bias: 'No live feed', biasTone: 'flat' }
  const tag = sym === 'BANKNIFTY' ? 'banknifty' : 'nifty'
  const bu = oiBuildup(o, sym, hist, today)
  // net read combines PCR-bias with OI-change build-up
  const biasTone = o.bias.startsWith('Bullish') ? 'up' : o.bias.startsWith('Bearish') ? 'down' : (bu.net || 'flat')
  const lines = [
    { k: 'Spot / ATM', v: `${o.spot} / ${o.atm}` }, { k: 'Expiry', v: o.expiry }, { k: 'PCR', v: String(o.pcr) },
    { k: 'Resistance', v: `${o.resistance} (max call OI)` }, { k: 'Support', v: `${o.support} (max put OI)` },
    ...bu.lines,
  ]
  return {
    ...base, bias: o.bias, biasTone, buildup: bu.label,
    spot: o.spot, atm: o.atm, expiry: o.expiry, pcr: o.pcr, support: o.support, resistance: o.resistance,
    reason: `Spot ${o.spot} · ATM ${o.atm} · exp ${o.expiry}. PCR ${o.pcr} → ${o.bias}. Walls: R ${o.resistance} / S ${o.support}. Build-up: ${bu.label}.`,
    lines,
    social: `📊 ${sym} Option Chain build-up (${o.expiry})\nSpot ${o.spot} · ATM ${o.atm} · PCR ${o.pcr} → ${o.bias}\nResistance ${o.resistance} (max call OI) · Support ${o.support} (max put OI)\nOI build-up vs last scan: ${bu.label}\nLive OI via broker feed. 📌 Educational only, not advice. Not SEBI-registered.\n#${tag} #optionchain #PCR`,
  }
}

// classify OI change vs the previous snapshot for this index → build-up labels.
// Appends the current snapshot to `hist` (saved by the caller).
function oiBuildup(o, index, hist, today) {
  const prev = [...hist].reverse().find(h => h.index === index)
  hist.push({ index, ts: today.toISOString(), spot: o.spot, ceOI: o.ceOI, peOI: o.peOI })
  if (!prev) return { label: 'baseline — first snapshot (build-up shows from next scan)', lines: [{ k: 'OI build-up', v: 'baseline (no prior scan yet)' }], net: 'flat' }
  const dSpot = o.spot - prev.spot, dCE = o.ceOI - prev.ceOI, dPE = o.peOI - prev.peOI
  // negligible OI movement (e.g. market closed between scans) → no fresh build-up
  if (Math.abs(dCE) < 0.01 * o.ceOI && Math.abs(dPE) < 0.01 * o.peOI && Math.abs(dSpot) < 0.001 * o.spot)
    return { label: 'no fresh build-up since last scan (OI ~ unchanged — likely off-session)', lines: [{ k: 'OI build-up', v: 'unchanged since last scan' }], net: 'flat' }
  const ce = dCE >= 0 ? (dSpot < 0 ? 'Call writing (bearish)' : 'Long call build-up') : (dSpot > 0 ? 'Call short-covering (bullish)' : 'Call unwinding')
  const pe = dPE >= 0 ? (dSpot > 0 ? 'Put writing (bullish)' : 'Put build-up (bearish)') : (dSpot < 0 ? 'Put short-covering (bearish)' : 'Put unwinding')
  let score = 0
  if (/bullish/.test(ce)) score++; if (/bearish/.test(ce)) score--
  if (/bullish/.test(pe)) score++; if (/bearish/.test(pe)) score--
  const net = score > 0 ? 'up' : score < 0 ? 'down' : 'flat'
  const fmt = n => (n >= 0 ? '+' : '−') + (Math.abs(n) >= 1e5 ? (Math.abs(n) / 1e5).toFixed(1) + 'L' : Math.abs(n).toLocaleString('en-IN'))
  return {
    label: `${ce} · ${pe}`, net,
    lines: [
      { k: 'Δ Spot', v: (dSpot >= 0 ? '+' : '') + dSpot.toFixed(0) },
      { k: 'Δ Call OI', v: fmt(dCE) }, { k: 'Δ Put OI', v: fmt(dPE) },
      { k: 'Call side', v: ce }, { k: 'Put side', v: pe },
    ],
  }
}
function loadOIHist() { try { return JSON.parse(readFileSync('public/oi_history.json', 'utf8')) } catch { return [] } }
function saveOIHist(hist) { try { writeFileSync('public/oi_history.json', JSON.stringify(hist.slice(-400))) } catch {} }

// Build the F&O tab: index (option-chain), commodity (astro), and F&O-eligible stock setups.
function buildFno(board, dbAssets, fnoLots, scored, addDays) {
  const out = []
  const col = id => board.find(g => g.id === id)
  const lotOf = sym => fnoLots[sym] || null
  const social = (u, kind, dir, reason, play) => `📊 F&O — ${u} (${kind}) ${dir}\n${reason}\n👉 ${play}\n📌 Educational only, not advice. Not SEBI-registered. #fno #${u.toLowerCase()} #options`
  // 1) INDEX F&O — from live option-chain build-up (NIFTY / BANKNIFTY)
  for (const o of (col('option_buildup')?.signals || [])) {
    if (o.placeholder) continue
    const dir = o.bias?.startsWith('Bullish') ? 'BUY' : o.bias?.startsWith('Bearish') ? 'SELL' : 'RANGE'
    const play = dir === 'BUY' ? `Buy ${o.atm} CE / bull-call spread; resistance wall ${o.resistance}`
      : dir === 'SELL' ? `Buy ${o.atm} PE / bear-put spread; support wall ${o.support}`
        : `Range: sell ${o.resistance} CE + ${o.support} PE (iron condor)`
    const reason = `PCR ${o.pcr} → ${o.bias}. Support ${o.support} / Resistance ${o.resistance} · ATM ${o.atm} · exp ${o.expiry}.`
    out.push({ generator: 'fno', underlying: o.symbol, name: o.name, kind: 'Index', direction: dir, dirTone: dir === 'BUY' ? 'up' : dir === 'SELL' ? 'down' : 'flat', spot: o.spot, lot: lotOf(o.symbol), grade: dir === 'RANGE' ? 'B' : 'A', optionPlay: play, pcr: o.pcr, support: o.support, resistance: o.resistance, reason, social: social(o.symbol, 'Index', dir, reason, play), rank: 100 })
  }
  // 2) COMMODITY F&O — from Vedic bias (GOLD / SILVER)
  for (const cid of ['GOLD', 'SILVER']) {
    const a = dbAssets[cid]; if (!a) continue
    const dir = a.tone === 'up' ? 'BUY' : a.tone === 'down' ? 'SELL' : 'RANGE'
    const play = optionPlay(dir, null)
    const reason = `Vedic daily bias ${a.score > 0 ? '+' : ''}${a.score} (${a.label}). Tradition — pair with MCX structure + volume.`
    out.push({ generator: 'fno', underlying: cid, name: a.name || cid, kind: 'Commodity', direction: dir, dirTone: a.tone, spot: null, lot: lotOf(cid), grade: 'B', optionPlay: play, reason, social: social(cid, 'Commodity', dir, reason, play), rank: 90 })
  }
  // 3) STOCK F&O — confluence first, then strong single-generator picks; F&O-eligible only
  const seen = new Set()
  const pushStock = (s, rank) => {
    if (!lotOf(s.symbol) || seen.has(s.symbol)) return
    seen.add(s.symbol)
    const lot = lotOf(s.symbol), px = s.ltp || s.entry || 0
    const play = optionPlay('BUY', px)
    out.push({
      generator: 'fno', underlying: s.symbol, name: s.name, kind: 'Stock', direction: 'BUY', dirTone: 'up',
      spot: s.ltp, lot, grade: s.grade || 'A', confidence: s.confidence, delivery: s.delivery,
      entry: s.entry, sl: s.sl, slPct: s.slPct, targets: s.targets, rr: s.rr,
      optionPlay: play, futures: `1 lot = ${lot} sh ≈ ₹${Math.round(lot * px).toLocaleString('en-IN')} notional`,
      reason: s.reason, social: social(s.symbol, 'Stock', 'BUY', s.reason, `${play} · 1 lot = ${lot} sh`), rank,
    })
  }
  for (const s of (col('confluence')?.signals || [])) pushStock(s, 80 + (s.genCount || 0))
  // broaden: ANY F&O-eligible bullish stock from the full scan (F&O universe = large-caps)
  for (const st of (scored || [])) {
    if (seen.size >= 45) break
    if (!lotOf(st.symbol) || seen.has(st.symbol)) continue
    if (!(st.bullish && st.emaStack && (st.moveScore >= 35 || (st.vol && st.vol.volScore >= 35) || (st._deliv && st._deliv.pct >= 60)))) continue
    seen.add(st.symbol)
    const lot = lotOf(st.symbol), px = st.price
    const tg = (st.targets || []).map((t, i) => ({ price: t, pct: round(((t - st.entry) / st.entry) * 100, 1), by: addDays((st.etaDays || [])[i] || (i + 1) * 5) }))
    const reason = `${st.setupType}: ${(st.precursors || []).slice(0, 2).join('; ')}${st._deliv ? ` · Delivery ${st._deliv.pct}%` : ''}`
    const play = optionPlay('BUY', px)
    out.push({ generator: 'fno', underlying: st.symbol, name: st.name, kind: 'Stock', direction: 'BUY', dirTone: 'up', spot: px, lot, grade: st.moveScore >= 60 ? 'A+' : 'A', confidence: st.moveScore, delivery: st._deliv?.pct ?? null, entry: st.entry, sl: st.sl, slPct: round(((st.sl - st.entry) / st.entry) * 100, 1), targets: tg, rr: st.rr, optionPlay: play, futures: `1 lot = ${lot} sh ≈ ₹${Math.round(lot * px).toLocaleString('en-IN')} notional`, reason, changePct: st.changePct, setupType: st.setupType, rsi: st.rsi, social: social(st.symbol, 'Stock', 'BUY', reason, `${play} · 1 lot = ${lot} sh`), rank: 40 + st.moveScore / 5 })
  }
  return out.sort((a, b) => (b.rank || 0) - (a.rank || 0))
}

// map a stock's sector/indices to the nearest Vedic asset-bias bucket
function sectorAsset(sector = '', indices = []) {
  const s = (sector + ' ' + (indices || []).join(' ')).toLowerCase()
  if (/bank/.test(s)) return 'BANKNIFTY'
  if (/(\bit\b|software|tech)/.test(s)) return 'NIFTYIT'
  if (/pharma|health|drug/.test(s)) return 'NIFTYPHARMA'
  if (/auto|motor|vehicle/.test(s)) return 'NIFTYAUTO'
  if (/fmcg|consum|food/.test(s)) return 'NIFTYFMCG'
  if (/metal|steel|mining|iron/.test(s)) return 'NIFTYMETAL'
  if (/financ|nbfc|insur/.test(s)) return 'NIFTYFIN'
  return 'NIFTY'
}

// ── self-improvement: load/save self-tuned thresholds ──
function loadTuning() { try { const t = JSON.parse(readFileSync('public/tuning.json', 'utf8')); t.minMoveScore ??= 40; t.history ||= []; return t } catch { return { minMoveScore: 40, history: [] } } }
function saveTuning(t) { try { writeFileSync('public/tuning.json', JSON.stringify(t, null, 2)) } catch {} }

// diagnose WHY a big mover was not flagged the day before (analyze as-of yesterday)
function diagnoseMiss(d, tuning) {
  if (!d || d.c.length < 30) return ['insufficient price history']
  const sl = k => d[k].slice(0, -1)
  let a; try { a = analyze({ o: sl('o'), h: sl('h'), l: sl('l'), c: sl('c'), v: sl('v'), time: sl('time') }) } catch { return ['insufficient history'] }
  const reasons = []
  const open = d.o.at(-1), prevClose = d.c.at(-2)
  if (open > prevClose * 1.03) reasons.push('gap-up open (news/event-driven — hard to pre-empt)')
  if (!a.emaStack) reasons.push('not above rising 20/50 EMA yet')
  if (a.moveScore < tuning.minMoveScore) reasons.push(`pre-move score ${a.moveScore} below gate ${tuning.minMoveScore}`)
  if (!a.volBuildup) reasons.push('no prior up-volume accumulation')
  if (a.rsi > 68) reasons.push('RSI already hot (>68) — excluded by gate')
  if (!a.squeeze && !a.nearBreakout) reasons.push('no squeeze / breakout proximity')
  if (!reasons.length) reasons.push('setup present but ranked below the cut — widen coverage')
  return reasons
}

// best-effort note on the external gainer sources the user supplied
async function fetchExternalGainers() {
  const ok = []
  for (const [name, url] of [['Groww', 'https://groww.in/markets/top-gainers'], ['Dhan', 'https://dhan.co/stock-market-live/top-gainers-today/']]) {
    try { const t = await getText(url, 1); if (t && t.length > 500) ok.push(name) } catch {}
  }
  return ok.length
    ? `${ok.join(' + ')} page(s) reachable (JS-rendered, not parsed) — cross-checked against own NSE-universe gainers as ground truth.`
    : 'External gainer pages not server-reachable (JS-rendered) — used own NSE-universe ≥5% gainers as ground truth.'
}

// the daily missed-mover review → public/learning.json (+ bounded auto-tuning)
// the accuracy goal the user set: 85% by one month out (2026-07-19)
const GOAL = { target: 85, start: '2026-06-19', deadline: '2026-07-19' }

async function runSelfImprovement(scored, board, today, ledger, externalNote, tr) {
  const tuning = loadTuning()
  const flagged = new Set()
  for (const g of board) if (TRADE_GENS.has(g.id)) for (const s of g.signals) flagged.add(s.symbol)
  for (const s of Object.values(ledger.active)) flagged.add(s.symbol)
  const movers = scored.filter(s => s.changePct >= 5).sort((a, b) => b.changePct - a.changePct)
  const caught = movers.filter(m => flagged.has(m.symbol))
  const missed = movers.filter(m => !flagged.has(m.symbol)).slice(0, 40)
  const tally = {}
  const misses = missed.map(m => {
    const reasons = diagnoseMiss(m._d, tuning)
    reasons.forEach(r => { const key = r.replace(/\d+/g, 'N'); tally[key] = (tally[key] || 0) + 1 })
    return { symbol: m.symbol, name: m.name, changePct: round(m.changePct, 1), reasons }
  })
  const reasonTally = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }))
  const adjustments = []
  const belowThresh = misses.filter(m => m.reasons.some(r => /pre-move score/.test(r))).length
  if (belowThresh >= 5 && tuning.minMoveScore > 32) { tuning.minMoveScore -= 2; adjustments.push(`Lowered pre-move score gate to ${tuning.minMoveScore} — ${belowThresh} missed movers were just below it.`) }
  const catchRate = movers.length ? round((caught.length / movers.length) * 100, 1) : null

  // ── ACCURACY GOAL: track measured win-rate vs 85% target; adapt selectivity daily ──
  const dateStr = today.toISOString().slice(0, 10)
  const measured = tr?.overall?.winRate ?? null
  const decided = tr?.overall?.decided ?? 0
  tuning.qualityBar ??= 0
  // Once enough trades have RESOLVED, raise/lower the quality bar to climb toward target.
  // Below target → tighten (fewer, higher-conviction signals). Above → relax slightly.
  if (decided >= 15 && measured != null) {
    if (measured < GOAL.target - 5) { tuning.qualityBar = Math.min(80, Math.max(55, tuning.qualityBar + 1)); adjustments.push(`Below ${GOAL.target}% (measured ${measured}%) → raised quality bar to ${tuning.qualityBar} (more selective).`) }
    else if (measured > GOAL.target) { tuning.qualityBar = Math.max(50, tuning.qualityBar - 1); adjustments.push(`Above target → eased quality bar to ${tuning.qualityBar}.`) }
  }
  tuning.history = (tuning.history || []).concat([{ date: dateStr, movers: movers.length, caught: caught.length, missed: missed.length, catchRate, minMoveScore: tuning.minMoveScore, qualityBar: tuning.qualityBar }]).slice(-90)
  saveTuning(tuning)

  // per-generator measured quality
  const genQuality = Object.entries(tr?.generators || {}).map(([id, g]) => ({
    id, winRate: g.winRate, decided: g.decided, open: g.open,
    status: g.decided >= 10 ? (g.winRate >= GOAL.target ? 'proven' : g.winRate >= 55 ? 'ok' : 'weak') : 'building',
  }))
  const daysLeft = Math.max(0, Math.round((new Date(GOAL.deadline) - today) / 86400000))
  const RELIABLE = 20                                            // need ~20 closed trades for a trustworthy read
  const reliable = decided >= RELIABLE
  const status = measured == null ? 'building track record — no trades have closed yet'
    : !reliable ? `building track record — ${decided} closed so far (need ~${RELIABLE}+ for a reliable read; small samples are noise)`
      : measured >= GOAL.target ? 'on target ✓'
        : measured >= GOAL.target - 8 ? 'close — tightening selectivity'
          : 'below target — tightening selectivity (fewer, higher-quality signals)'
  let goal = {}
  try { goal = JSON.parse(readFileSync('public/goal.json', 'utf8')) } catch {}
  const trajectory = (goal.trajectory || []).filter(t => t.date !== dateStr).concat([{ date: dateStr, winRate: measured, decided, open: tr?.overall?.open || 0, catchRate, qualityBar: tuning.qualityBar }]).slice(-120)
  goal = {
    target: GOAL.target, deadline: GOAL.deadline, start: GOAL.start, daysLeft,
    current: measured, decided, reliable, open: tr?.overall?.open || 0, qualityBar: tuning.qualityBar,
    status, generators: genQuality, trajectory, generatedAt: today.toISOString(),
    note: `Goal: ${GOAL.target}% measured win-rate by ${GOAL.deadline}. "Accuracy" = closed signals that hit the first target before the stop — it is null until trades resolve, then it is the REAL number (never inflated). The engine raises selectivity daily to climb toward target; this means fewer, higher-quality signals. 85% is an aspiration the system works toward honestly, not a guarantee.`,
  }
  writeFileSync('public/goal.json', JSON.stringify(goal, null, 2))

  writeFileSync('public/learning.json', JSON.stringify({
    date: dateStr, generatedAt: today.toISOString(),
    moversChecked: movers.length, caught: caught.length, missed: missed.length, catchRate,
    sources: ['Own NSE-universe gainers (≥5% today)', 'Groww top-gainers (cross-check)', 'Dhan top-gainers (cross-check)'],
    externalNote, reasonTally, misses, adjustments, tuning: { minMoveScore: tuning.minMoveScore, qualityBar: tuning.qualityBar },
    goal: { target: GOAL.target, deadline: GOAL.deadline, current: measured, status },
    note: 'Daily self-review: which ≥5% movers the engine did NOT flag the prior day, and why. Reasons feed bounded auto-tuning to widen coverage without chasing noise. Gap-up/news moves are intentionally hard to pre-empt and are flagged as such.',
  }, null, 2))
  console.log(`Self-improve: ${movers.length} movers, caught ${caught.length} (${catchRate ?? '–'}%), missed ${missed.length} · qualityBar ${tuning.qualityBar} · goal ${measured ?? '–'}%/${GOAL.target}% (${daysLeft}d) → learning.json`)
  return { catchRate, qualityBar: tuning.qualityBar, goal }
}

function buildSignals(scored) {
  const pool = {}
  for (const L of LOGICS) pool[L.id] = { trades: 0, wins: 0 }
  const todays = []
  for (const st of scored) {
    if (!st._eng) continue
    for (const L of LOGICS) {
      const e = st._eng[L.id]; if (!e) continue
      pool[L.id].trades += e.trades; pool[L.id].wins += e.wins
      if (e.today) todays.push({ st, logicId: L.id })
    }
  }
  const logics = LOGICS.map(L => {
    const p = pool[L.id]
    const accuracy = p.trades ? +((p.wins / p.trades) * 100).toFixed(1) : 0
    const active = accuracy >= MIN_ACCURACY && p.trades >= MIN_TRADES
    return { id: L.id, name: L.name, desc: L.desc, accuracy, trades: p.trades, active }
  })
  const accById = Object.fromEntries(logics.map(l => [l.id, l]))
  const today = new Date()
  const addDays = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  const signals = todays
    .filter(t => accById[t.logicId].active)
    .map(({ st, logicId }) => {
      const L = accById[logicId]
      const pct = a => round(((a - st.entry) / st.entry) * 100, 1)
      return {
        symbol: st.symbol, name: st.name, sector: st.sector, indices: st.indices,
        logic: L.name, logicId, direction: 'LONG',
        confidence: L.accuracy, accuracy: L.accuracy, backtestTrades: L.trades,
        price: st.price, entry: st.entry, sl: st.sl, slPct: pct(st.sl),
        targets: [
          { price: st.targets[0], pct: pct(st.targets[0]), by: addDays(st.bt.avgDaysT1) },
          { price: st.targets[1], pct: pct(st.targets[1]), by: addDays(st.bt.avgDaysT2) },
          { price: st.targets[2], pct: pct(st.targets[2]), by: addDays(st.bt.avgDaysT3) },
        ],
        rr: st.rr, rsi: st.rsi, why: `${L.name} — ${L.desc}`,
      }
    })
    .sort((a, b) => b.confidence - a.confidence || b.backtestTrades - a.backtestTrades)
  writeFileSync('public/signals.json', JSON.stringify({
    generatedAt: today.toISOString(),
    minAccuracy: MIN_ACCURACY,
    logics: logics.sort((a, b) => b.accuracy - a.accuracy),
    activeLogics: logics.filter(l => l.active).length,
    count: signals.length,
    note: `Live signals only from strategies that backtested >=${MIN_ACCURACY}% (target reached before stop) across the NSE universe. Accuracy is measured, not guaranteed.`,
    signals,
  }, null, 2))
  console.log(`Signals: ${logics.filter(l => l.active).length}/${LOGICS.length} logics >=${MIN_ACCURACY}% → ${signals.length} live signals`)
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('screener.mjs')) {
  runScan({ full: FULL, top: TOP, limit: LIMIT, tf: TFARG, improve: IMPROVE }).catch(e => { console.error(e); process.exit(1) })
}
