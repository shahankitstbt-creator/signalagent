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

  // ── TREND CONTEXT (where price is) — this alone made the old desk buy tops & sell bottoms ──
  const h = b.h, l = b.l, o = b.o || c, v = b.v || [], last = n - 1
  let trend = 0
  const upStack = price > e20 && e20 > e50, dnStack = price < e20 && e20 < e50
  if (upStack) trend += 2; else if (dnStack) trend -= 2
  if (price > vw.vwap) trend += 1; else trend -= 1
  if (price > vp.poc) trend += 1; else trend -= 1
  if (higherLows && !lowerHighs) trend += 1; else if (lowerHighs && !higherLows) trend -= 1

  // ── SMART-MONEY FOOTPRINT (what they're DOING) — accumulation vs distribution. Strong enough to
  // OVERRIDE the trend at exhaustion, so the desk flags a top BEFORE the drop and a bottom BEFORE the
  // bounce, instead of chasing. This is the Wyckoff read: markup → distribution → markdown → accumulation. ──
  const rng = Math.max(h[last] - l[last], atr * 0.1)
  const upWick = (h[last] - Math.max(o[last], c[last])) / rng          // rejection from above (sellers)
  const dnWick = (Math.min(o[last], c[last]) - l[last]) / rng          // rejection from below (buyers)
  const stretch = atr ? (price - e20) / atr : 0                        // how far above/below the mean (ATR units)
  const sweptHigh = h[last] >= swingHi * 0.999 && c[last] < swingHi     // ran the highs (stop-hunt) then closed back under
  const sweptLow = l[last] <= swingLo * 1.001 && c[last] > swingLo      // ran the lows then closed back above
  const priorHH = Math.max(...c.slice(-11, -1)), priorRHH = Math.max(...rsiArr.slice(-11, -1))
  const priorLL = Math.min(...c.slice(-11, -1)), priorRLL = Math.min(...rsiArr.slice(-11, -1))
  const bearDiv = price >= priorHH && rsi < priorRHH && rsi > 58        // price higher high, momentum weaker → distribution
  const bullDiv = price <= priorLL && rsi > priorRLL && rsi < 42        // price lower low, momentum stronger → accumulation
  const volAvg = v.length ? v.slice(-20).reduce((a, x) => a + x, 0) / Math.min(20, v.length) : 0
  const climaxUp = volAvg && v[last] > volAvg * 1.8 && c[last] < o[last] && stretch > 2   // heavy volume + red bar at highs
  const climaxDn = volAvg && v[last] > volAvg * 1.8 && c[last] > o[last] && stretch < -2   // heavy volume + green bar at lows

  let dist = 0, accu = 0; const sm = []
  if (sweptHigh && upWick > 0.33) { dist += 3; sm.push('buy-side liquidity swept + rejection wick → smart money DISTRIBUTING') }
  if (rsi > 75 && stretch > 4) { dist += 4; sm.push(`EXTREME overbought (RSI ${rsi.toFixed(0)}) & ${stretch.toFixed(1)}×ATR above mean — parabolic / late-stage distribution, chasing here is how you buy the top`) }
  else if (rsi > 70 && stretch > 2.5) { dist += 2; sm.push(`overbought & ${stretch.toFixed(1)}×ATR above mean → exhaustion / distribution risk`) }
  if (bearDiv) { dist += 2; sm.push(`bearish divergence (price HH, RSI ${rsi.toFixed(0)} lower) → buyers weakening`) }
  if (climaxUp) { dist += 2; sm.push('climax volume + reversal bar at highs → selling into strength') }
  if (sweptLow && dnWick > 0.33) { accu += 3; sm.push('sell-side liquidity swept + hammer → smart money ACCUMULATING') }
  if (rsi < 25 && stretch < -4) { accu += 4; sm.push(`EXTREME oversold (RSI ${rsi.toFixed(0)}) & ${Math.abs(stretch).toFixed(1)}×ATR below mean — capitulation flush, shorting here is how you sell the bottom`) }
  else if (rsi < 30 && stretch < -2.5) { accu += 2; sm.push(`oversold & ${Math.abs(stretch).toFixed(1)}×ATR below mean → accumulation`) }
  if (bullDiv) { accu += 2; sm.push(`bullish divergence (price LL, RSI ${rsi.toFixed(0)} higher) → sellers exhausting`) }
  if (climaxDn) { accu += 2; sm.push('climax volume + reversal bar at lows → buying the flush') }

  // ── PHASE — the smart-money cycle stage ──
  let phase
  if (dist >= 3 && trend >= 0) phase = 'DISTRIBUTION'         // topping into strength — fade the trend
  else if (accu >= 3 && trend <= 0) phase = 'ACCUMULATION'    // bottoming into weakness — fade the trend
  else if (trend >= 2) phase = 'MARKUP'
  else if (trend <= -2) phase = 'MARKDOWN'
  else phase = 'RANGE'

  const s = trend + accu - dist                               // smart-money overlay can flip the trend read
  const why = []
  if (phase === 'DISTRIBUTION') why.push('⚠️ DISTRIBUTION — smart money selling into the rally')
  else if (phase === 'ACCUMULATION') why.push('✅ ACCUMULATION — smart money buying the dip')
  else if (phase === 'MARKUP') why.push('markup — trend up, no distribution yet')
  else if (phase === 'MARKDOWN') why.push('markdown — trend down, no accumulation yet')
  why.push(...sm)
  if (upStack) why.push('rising EMA stack'); else if (dnStack) why.push('falling EMA stack')
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
    dir, phase, score: s, trend, dist, accu, entry, sl, targets, etaDates, rr,
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
  // dominant smart-money phase across timeframes (what they're doing overall) — distribution/accumulation
  // on the higher TFs is the tell; count them and surface the strongest.
  const phaseCount = {}; for (const r of rows) if (r.phase) phaseCount[r.phase] = (phaseCount[r.phase] || 0) + 1
  const distN = phaseCount.DISTRIBUTION || 0, accuN = phaseCount.ACCUMULATION || 0
  const phase = distN >= 2 ? 'DISTRIBUTION' : accuN >= 2 ? 'ACCUMULATION'
    : (phaseCount.MARKUP || 0) >= (phaseCount.MARKDOWN || 0) && (phaseCount.MARKUP || 0) > 0 ? 'MARKUP'
    : (phaseCount.MARKDOWN || 0) > 0 ? 'MARKDOWN' : 'RANGE'
  return { symbol, spot, aligned, net, longs, shorts, phase, phaseCount, timeframes: rows }
}
