// Vercel serverless — ON-DEMAND analysis of ANY ticker (Indian .NS or US) the user searches.
// Self-contained (no heavy imports): fetches Yahoo OHLCV and returns the engine's read + a plan.
const YF = 'https://query1.finance.yahoo.com/v8/finance/chart/'

async function fetchOHLC(sym) {
  try {
    const r = await fetch(`${YF}${encodeURIComponent(sym)}?interval=1d&range=1y`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const d = await r.json()
    const res = d?.chart?.result?.[0]; if (!res?.timestamp) return null
    const q = res.indicators.quote[0], o = [], h = [], l = [], c = [], v = []
    for (let i = 0; i < res.timestamp.length; i++) { if (q.close[i] == null) continue; o.push(q.open[i]); h.push(q.high[i]); l.push(q.low[i]); c.push(q.close[i]); v.push(q.volume[i] || 0) }
    return c.length > 60 ? { o, h, l, c, v, name: res.meta?.longName || res.meta?.shortName } : null
  } catch { return null }
}
const ema = (a, n) => { const k = 2 / (n + 1); let e = a[0]; for (let i = 1; i < a.length; i++) e = a[i] * k + e * (1 - k); return e }
function rsi(c, n = 14) { let g = 0, ls = 0; for (let i = c.length - n; i < c.length; i++) { const ch = c[i] - c[i - 1]; if (ch >= 0) g += ch; else ls -= ch } const rs = ls === 0 ? 100 : g / ls; return 100 - 100 / (1 + rs) }
function atr(h, l, c, n = 14) { let s = 0; for (let i = c.length - n; i < c.length; i++) s += Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])); return s / n }
const R = (x, d = 2) => x == null ? null : +(+x).toFixed(d)

function analyzeTicker(d, ccy) {
  const { o, h, l, c } = d, n = c.length, i = n - 1, price = c[i]
  const e20 = ema(c.slice(-60), 20), e50 = ema(c.slice(-80), 50)
  const rs = rsi(c), a = atr(h, l, c) || price * 0.02
  const swingHi = Math.max(...h.slice(-40)), swingLo = Math.min(...l.slice(-40))
  const chg = i > 0 ? ((c[i] - c[i - 1]) / c[i - 1]) * 100 : 0
  const near20Hi = (Math.max(...h.slice(-20)) - price) / price < 0.02
  const up = price > e20 && e20 > e50, down = price < e20 && e20 < e50
  const dist = ((price - e20) / e20) * 100   // % from the mean
  const body = Math.abs(c[i] - o[i]) || a * 0.05
  const lowerWick = Math.min(o[i], c[i]) - l[i], upperWick = h[i] - Math.max(o[i], c[i])
  const sym = (t, dir) => R(t)
  let setup = null, direction = 'NEUTRAL', entry = price, sl = null, targets = null, matchesEngine = false, play = ''

  if (up && rs > 50 && rs < 70 && near20Hi) {                       // core: momentum / breakout LONG
    setup = 'Momentum / breakout (LONG)'; direction = 'LONG'; matchesEngine = true
    sl = R(Math.max(swingLo, price - 1.5 * a)); const risk = price - sl
    targets = [R(price + 2 * a), R(price + 3.5 * a), R(price + 5 * a)]
    play = `In an uptrend, hugging the 20-day high with room (RSI ${rs.toFixed(0)}). Buy ${ccy}${R(price)}, SL ${ccy}${sl}, book partial at T1 & trail.`
  } else if (rs <= 35 && dist < -3) {                               // reversal: oversold bounce LONG
    setup = 'Oversold bounce (LONG reversal)'; direction = 'LONG'; matchesEngine = true
    sl = R(Math.min(l[i], swingLo) - 0.3 * a); const risk = price - sl
    targets = [R(price + 1.5 * risk), R(price + 2.5 * risk), R(e20)]
    play = `Oversold (RSI ${rs.toFixed(0)}, ${dist.toFixed(0)}% below mean)${lowerWick > body * 1.5 ? ' with a hammer' : ''}. Counter-trend bounce toward the mean ${ccy}${R(e20)}. SL below the low.`
  } else if (rs >= 70 && dist > 3) {                                // reversal: overbought fade SHORT
    setup = 'Overbought fade (SHORT reversal)'; direction = 'SHORT'; matchesEngine = true
    sl = R(Math.max(h[i], swingHi) + 0.3 * a); const risk = sl - price
    targets = [R(price - 1.5 * risk), R(price - 2.5 * risk), R(e20)]
    play = `Overbought (RSI ${rs.toFixed(0)}, +${dist.toFixed(0)}% above mean)${upperWick > body * 1.5 ? ' with a shooting star' : ''}. Mean-reversion / fade toward ${ccy}${R(e20)}. F&O: buy PUT. SL above the high.`
  } else {
    setup = 'No clean setup'; direction = 'NEUTRAL'
    play = `${down ? 'Downtrend' : up ? 'Uptrend' : 'Range'}, RSI ${rs.toFixed(0)}, ${dist >= 0 ? '+' : ''}${dist.toFixed(0)}% vs 20-day mean. Not at an edge our engine trades — wait for a breakout (long) or an RSI extreme + reversal candle.`
  }
  return {
    setup, direction, matchesEngine, price: R(price), rsi: R(rs, 0), trend: down ? 'Downtrend' : up ? 'Uptrend' : 'Range',
    distFromMean: R(dist, 1), ema20: R(e20), ema50: R(e50), swingHigh: R(swingHi), swingLow: R(swingLo), changePct: R(chg, 2),
    entry: R(entry), sl, targets, play,
  }
}

export default async function handler(req, res) {
  const raw = (req.query.symbol || '').toUpperCase().trim().replace(/[^A-Z0-9.\-]/g, '')
  if (!raw) { res.status(400).json({ error: 'symbol required' }); return }
  const market = (req.query.market || '').toUpperCase()
  const tries = market === 'US' ? [raw] : market === 'IN' ? [raw.endsWith('.NS') ? raw : raw + '.NS'] : [raw + '.NS', raw]
  let d = null, used = null
  for (const t of tries) { d = await fetchOHLC(t); if (d) { used = t; break } }
  if (!d) { res.status(200).json({ found: false, symbol: raw, message: 'No price data on Yahoo for that symbol. Check the ticker (US names work directly; Indian names use NSE symbols).' }); return }
  const ccy = used.endsWith('.NS') ? '₹' : '$'
  res.setHeader('Cache-Control', 's-maxage=120')
  res.status(200).json({ found: true, symbol: raw, yahoo: used, name: d.name || raw, ccy, ...analyzeTicker(d, ccy) })
}
