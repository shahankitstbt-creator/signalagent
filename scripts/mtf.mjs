// ─────────────────────────────────────────────────────────────────────────
// MULTI-TIMEFRAME DIRECTIONAL DESK — for NIFTY / BANKNIFTY / GOLD / F&O stocks.
// Per timeframe (15m,35m,45m,75m,90m,1h,2h,3h,4h,1D) it reads the confluence of:
//   1) Volume Profile (POC / value-area)   2) Fibonacci levels   3) Price action
//   4) VWAP (fair value + bands)            5) (index) live smart-money OI positioning
//   6) (index) far-expiry accumulation
// → a two-sided call (LONG/SHORT) with entry, SL, targets, target DATE and the reason.
// Yahoo gives 5m/15m/60m/1d natively; the odd TFs are resampled from those.
// ─────────────────────────────────────────────────────────────────────────
import { getJSON, rsiSeries, atrSeries } from './lib.mjs'

export const TF_MIN = { '15m': 15, '35m': 35, '45m': 45, '75m': 75, '90m': 90, '1h': 60, '2h': 120, '3h': 180, '4h': 240, '1D': 1440 }
// each TF = [base interval, aggregation factor]
const TF_SRC = { '15m': ['15m', 1], '35m': ['5m', 7], '45m': ['15m', 3], '75m': ['15m', 5], '90m': ['15m', 6], '1h': ['60m', 1], '2h': ['60m', 2], '3h': ['60m', 3], '4h': ['60m', 4], '1D': ['1d', 1] }
const round = (x, d = 2) => x == null ? null : +(+x).toFixed(d)

async function fetchBars(symbol, interval, range) {
  try {
    const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`)
    const r = d?.chart?.result?.[0]; if (!r?.timestamp) return null
    const q = r.indicators.quote[0], t = r.timestamp, o = [], h = [], l = [], c = [], v = [], time = []
    for (let i = 0; i < t.length; i++) { if (q.close[i] == null) continue; time.push(t[i]); o.push(q.open[i]); h.push(q.high[i]); l.push(q.low[i]); c.push(q.close[i]); v.push(q.volume[i] || 0) }
    return c.length ? { time, o, h, l, c, v } : null
  } catch { return null }
}

// aggregate k consecutive base bars into one
function resample(b, k) {
  if (!b || !b.c.length) return null
  if (k === 1) return b
  const o = [], h = [], l = [], c = [], v = [], time = []
  for (let i = 0; i < b.c.length; i += k) {
    const end = Math.min(i + k, b.c.length)
    o.push(b.o[i]); c.push(b.c[end - 1]); time.push(b.time[i])
    let hi = -Infinity, lo = Infinity, vol = 0
    for (let j = i; j < end; j++) { if (b.h[j] > hi) hi = b.h[j]; if (b.l[j] < lo) lo = b.l[j]; vol += b.v[j] }
    h.push(hi); l.push(lo); v.push(vol)
  }
  return { time, o, h, l, c, v }
}

// fetch the 4 base series once, build all 10 timeframes
export async function fetchTimeframes(symbol) {
  const [b5, b15, b60, b1d] = await Promise.all([
    fetchBars(symbol, '5m', '5d'), fetchBars(symbol, '15m', '60d'),
    fetchBars(symbol, '60m', '730d'), fetchBars(symbol, '1d', '1y'),
  ])
  const base = { '5m': b5, '15m': b15, '60m': b60, '1d': b1d }
  const out = {}
  for (const [tf, [src, k]] of Object.entries(TF_SRC)) { const s = base[src]; if (s) { const r = resample(s, k); if (r && r.c.length >= 30) out[tf] = r } }
  return out
}

function volProfile(b, bins = 40) {
  const N = Math.min(b.c.length, 160), h = b.h.slice(-N), l = b.l.slice(-N), v = b.v.slice(-N)
  const hi = Math.max(...h), lo = Math.min(...l), bs = (hi - lo) / bins || 1
  const acc = new Array(bins).fill(0)
  for (let i = 0; i < h.length; i++) { const a = Math.max(0, Math.floor((l[i] - lo) / bs)), z = Math.min(bins - 1, Math.ceil((h[i] - lo) / bs)); const per = v[i] / ((z - a) || 1); for (let k = a; k <= z; k++) acc[k] += per }
  const pocIdx = acc.indexOf(Math.max(...acc)); const poc = lo + (pocIdx + 0.5) * bs
  // value area = 70% of volume expanding out from POC
  const total = acc.reduce((a, x) => a + x, 0), target = total * 0.7
  let loI = pocIdx, hiI = pocIdx, got = acc[pocIdx]
  while (got < target && (loI > 0 || hiI < bins - 1)) {
    const down = loI > 0 ? acc[loI - 1] : -1, up = hiI < bins - 1 ? acc[hiI + 1] : -1
    if (up >= down) { hiI++; got += acc[hiI] } else { loI--; got += acc[loI] }
  }
  return { poc, vah: lo + (hiI + 1) * bs, val: lo + loI * bs, hi, lo }
}

function vwapBands(b, len = 40) {
  const n = b.c.length; let pv = 0, vv = 0; const tps = []
  for (let i = Math.max(0, n - len); i < n; i++) { const tp = (b.h[i] + b.l[i] + b.c[i]) / 3; pv += tp * b.v[i]; vv += b.v[i]; tps.push({ tp, v: b.v[i] }) }
  const vw = vv ? pv / vv : b.c[n - 1]
  const sd = Math.sqrt(tps.reduce((a, x) => a + x.v * (x.tp - vw) ** 2, 0) / (vv || 1))
  return { vwap: vw, upper: vw + sd, lower: vw - sd }
}
const emaLast = (arr, len) => { const k = 2 / (len + 1); let e = arr[0]; for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k); return e }

// analyse ONE timeframe → two-sided directional read with levels + reason
function analyzeTF(b, tfMin, addBiz) {
  const c = b.c, n = c.length, price = c[n - 1]
  const vp = volProfile(b), vw = vwapBands(b)
  const rsiArr = rsiSeries(c), rsi = rsiArr[n - 1] ?? 50
  const atr = (atrSeries(b.h, b.l, c)[n - 1]) || price * 0.01
  const e20 = emaLast(c.slice(-60), 20), e50 = emaLast(c.slice(-80), 50)
  const swingHi = Math.max(...b.h.slice(-40)), swingLo = Math.min(...b.l.slice(-40))
  const fibs = [[0.382, '38.2%'], [0.5, '50%'], [0.618, '61.8%'], [0.786, '78.6%']].map(([f, lbl]) => [swingHi - (swingHi - swingLo) * f, lbl])
  const nearestFib = fibs.reduce((best, x) => Math.abs(x[0] - price) < Math.abs(best[0] - price) ? x : best, fibs[0])
  const higherLows = b.l.slice(-5)[4] > b.l.slice(-5)[0], lowerHighs = b.h.slice(-5)[4] < b.h.slice(-5)[0]

  let s = 0; const why = []
  // trend (EMA stack) is the primary driver; VWAP/POC/structure/RSI confirm or temper
  if (price > e20 && e20 > e50) { s += 2; why.push('rising EMA stack') } else if (price < e20 && e20 < e50) { s -= 2; why.push('falling EMA stack') }
  if (price > vw.vwap) { s += 1; why.push('above VWAP') } else { s -= 1; why.push('below VWAP') }
  if (price > vp.poc) { s += 1; why.push(`above POC ${round(vp.poc)}`) } else { s -= 1; why.push(`below POC ${round(vp.poc)}`) }
  if (higherLows && !lowerHighs) { s += 1; why.push('higher lows') } else if (lowerHighs && !higherLows) { s -= 1; why.push('lower highs') }
  if (rsi > 72) { s -= 1; why.push(`RSI ${rsi.toFixed(0)} overbought`) } else if (rsi < 28) { s += 1; why.push(`RSI ${rsi.toFixed(0)} oversold`) } else if (rsi > 55) { s += 1 } else if (rsi < 45) { s -= 1 }
  if (Math.abs(nearestFib[0] - price) / price < 0.008) why.push(`at ${nearestFib[1]} Fib ${round(nearestFib[0])}`)

  const dir = s >= 2 ? 'LONG' : s <= -2 ? 'SHORT' : 'NEUTRAL'
  const entry = round(price)
  let sl = null, targets = null
  // ATR-anchored SL/targets (scales with the timeframe → consistent ~1:1.3 / 1:2.3 / 1:3.3 R:R);
  // VP/Fib levels are used as context in the reason, not as the stop (they distort R:R across TFs).
  if (dir === 'LONG') { sl = round(price - 1.5 * atr); targets = [round(price + 2 * atr), round(price + 3.5 * atr), round(price + 5 * atr)] }
  else if (dir === 'SHORT') { sl = round(price + 1.5 * atr); targets = [round(price - 2 * atr), round(price - 3.5 * atr), round(price - 5 * atr)] }
  // target DATES: ATR-velocity ETA in bars → calendar (375 trading min/day intraday; 1 bar/day daily)
  const etaDates = targets ? targets.map((t, i) => {
    const bars = Math.max(1, Math.round(Math.abs(t - entry) / (atr * 0.7)))
    const days = tfMin >= 1440 ? bars : Math.max(1, Math.ceil((bars * tfMin) / 375))
    return addBiz(days)
  }) : null
  const rr = (dir !== 'NEUTRAL' && sl != null) ? round(Math.abs(targets[0] - entry) / Math.abs(entry - sl), 2) : null
  return {
    dir, score: s, entry, sl, targets, etaDates, rr,
    poc: round(vp.poc), vah: round(vp.vah), val: round(vp.val), vwap: round(vw.vwap),
    rsi: round(rsi, 0), fib: nearestFib[1], reason: why.slice(0, 4).join(' · '),
  }
}

// full multi-TF desk for one instrument
export async function mtfDesk(symbol, ySymbol, opts = {}) {
  const tfs = await fetchTimeframes(ySymbol)
  const addBiz = opts.addBiz || (n => `+${n}d`)
  const rows = []
  for (const tf of Object.keys(TF_MIN)) { const b = tfs[tf]; if (!b) continue; const a = analyzeTF(b, TF_MIN[tf], addBiz); rows.push({ tf, ...a }) }
  // overall alignment across timeframes
  const net = rows.reduce((a, r) => a + (r.dir === 'LONG' ? 1 : r.dir === 'SHORT' ? -1 : 0), 0)
  const longs = rows.filter(r => r.dir === 'LONG').length, shorts = rows.filter(r => r.dir === 'SHORT').length
  const aligned = net >= 4 ? 'LONG' : net <= -4 ? 'SHORT' : net >= 2 ? 'LEAN LONG' : net <= -2 ? 'LEAN SHORT' : 'MIXED'
  const spot = rows.length ? rows[rows.length - 1].entry : (opts.spot || null)
  return { symbol, spot, aligned, net, longs, shorts, timeframes: rows }
}
