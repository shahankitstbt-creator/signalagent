// Chart + candlestick pattern detection (bullish, for LONG signals). Operates on
// {o,h,l,c,v} arrays + ZigZag pivots. Returns the strongest bullish pattern or null.
import { pivots } from './lib.mjs'

const near = (a, b, tol) => Math.abs(a - b) / b <= tol

export function detectPatterns(d) {
  const { o, h, l, c } = d
  const n = c.length
  if (n < 25) return null
  const px = c[n - 1]
  const found = []
  const piv = pivots(h, l, 3)
  const highs = piv.filter(p => p.type === 'H'), lows = piv.filter(p => p.type === 'L')

  // Double Bottom (W) — two similar lows, break above intervening high
  if (lows.length >= 2 && highs.length >= 1) {
    const [L1, L2] = lows.slice(-2)
    const between = highs.filter(p => p.index > L1.index && p.index < L2.index)
    const neck = between.length ? Math.max(...between.map(p => p.price)) : null
    if (neck && near(L1.price, L2.price, 0.035) && px > neck) found.push({ pattern: 'Double Bottom', score: 3 })
  }
  // Inverse Head & Shoulders — head lowest, shoulders similar, break above neckline
  if (lows.length >= 3 && highs.length >= 2) {
    const [s1, head, s2] = lows.slice(-3)
    if (head.price < s1.price && head.price < s2.price && near(s1.price, s2.price, 0.05)) {
      const necks = highs.filter(p => p.index > s1.index).map(p => p.price)
      const neck = necks.length ? Math.max(...necks) : null
      if (neck && px > neck) found.push({ pattern: 'Inverse Head & Shoulders', score: 4 })
    }
  }
  // Ascending Triangle — flat resistance + rising lows, price testing top
  if (highs.length >= 2 && lows.length >= 2) {
    const h2 = highs.slice(-2), l2 = lows.slice(-2)
    if (near(h2[0].price, h2[1].price, 0.02) && l2[1].price > l2[0].price && px >= h2[1].price * 0.985) found.push({ pattern: 'Ascending Triangle', score: 3 })
  }
  // Falling Wedge — converging lower highs & lows, break above
  if (highs.length >= 2 && lows.length >= 2) {
    const h2 = highs.slice(-2), l2 = lows.slice(-2)
    const downH = h2[1].price < h2[0].price, downL = l2[1].price < l2[0].price
    const conv = (h2[0].price - l2[0].price) > (h2[1].price - l2[1].price)
    if (downH && downL && conv && px > h2[1].price) found.push({ pattern: 'Falling Wedge', score: 3 })
  }
  // Bull Flag — strong pole then tight consolidation near the highs
  if (n > 20) {
    const surged = (c[n - 6] - c[n - 16]) / c[n - 16] > 0.07
    const range = (Math.max(...h.slice(-6)) - Math.min(...l.slice(-6))) / px
    if (surged && range < 0.05 && px >= Math.max(...h.slice(-6)) * 0.985) found.push({ pattern: 'Bull Flag', score: 3 })
  }
  // Rounding Bottom — smooth U: mid-window low is the trough, both ends higher, rising now
  if (n >= 40) {
    const w = c.slice(-40), midIdx = w.indexOf(Math.min(...w))
    if (midIdx > 12 && midIdx < 28 && w[0] > Math.min(...w) * 1.03 && px > Math.min(...w) * 1.03 && px > w[w.length - 6]) found.push({ pattern: 'Rounding Bottom', score: 2 })
  }
  // Candlesticks (last bar)
  const i = n - 1
  const body = Math.abs(c[i] - o[i]), lowWick = Math.min(o[i], c[i]) - l[i], upWick = h[i] - Math.max(o[i], c[i])
  if (c[i] > o[i] && o[i] <= c[i - 1] && c[i] >= o[i - 1] && c[i - 1] < o[i - 1]) found.push({ pattern: 'Bullish Engulfing', score: 2 })
  if (lowWick > body * 2 && upWick < body && c[i - 1] < c[i - 3]) found.push({ pattern: 'Hammer', score: 2 })
  if (n >= 3 && c[i - 2] < o[i - 2] && Math.abs(c[i - 1] - o[i - 1]) < (h[i - 1] - l[i - 1]) * 0.4 && c[i] > o[i] && c[i] > (o[i - 2] + c[i - 2]) / 2) found.push({ pattern: 'Morning Star', score: 2 })

  if (!found.length) return null
  found.sort((a, b) => b.score - a.score)
  return { bullish: true, pattern: found[0].pattern, all: [...new Set(found.map(f => f.pattern))], score: found[0].score }
}
