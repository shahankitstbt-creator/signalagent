// Shared numeric helpers. All functions take/return plain number arrays,
// aligned to the input length with `null` for warmup periods.

export const sma = (src, len) => src.map((_, i) =>
  i < len - 1 ? null : avg(src.slice(i - len + 1, i + 1)))

export function ema(src, len) {
  const k = 2 / (len + 1)
  const out = new Array(src.length).fill(null)
  let prev = null
  for (let i = 0; i < src.length; i++) {
    const v = src[i]
    if (v == null) continue
    if (prev == null) {
      // seed with SMA once enough data
      if (i >= len - 1) { prev = avg(src.slice(i - len + 1, i + 1)); out[i] = prev }
    } else {
      prev = v * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

export function rma(src, len) {
  // Wilder's smoothing (used by RSI, ATR)
  const a = 1 / len
  const out = new Array(src.length).fill(null)
  let prev = null
  for (let i = 0; i < src.length; i++) {
    const v = src[i]
    if (v == null) continue
    if (prev == null) {
      if (i >= len - 1) { prev = avg(src.slice(i - len + 1, i + 1)); out[i] = prev }
    } else { prev = a * v + (1 - a) * prev; out[i] = prev }
  }
  return out
}

export function stdev(src, len) {
  return src.map((_, i) => {
    if (i < len - 1) return null
    const win = src.slice(i - len + 1, i + 1)
    const m = avg(win)
    return Math.sqrt(avg(win.map(x => (x - m) ** 2)))
  })
}

export function trueRange(bars) {
  return bars.map((b, i) => i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)))
}

export const atr = (bars, len) => rma(trueRange(bars), len)

export const avg = a => a.reduce((s, x) => s + x, 0) / a.length
export const highest = (src, len, i) => Math.max(...src.slice(Math.max(0, i - len + 1), i + 1))
export const lowest = (src, len, i) => Math.min(...src.slice(Math.max(0, i - len + 1), i + 1))
export const closes = bars => bars.map(b => b.close)
export const hl2 = bars => bars.map(b => (b.high + b.low) / 2)

// Linear regression value at the last point of each window (endpoint)
export function linreg(src, len, offset = 0) {
  return src.map((_, idx) => {
    if (idx < len - 1) return null
    let sx = 0, sy = 0, sxx = 0, sxy = 0
    for (let j = 0; j < len; j++) {
      const x = j, y = src[idx - len + 1 + j]
      sx += x; sy += y; sxx += x * x; sxy += x * y
    }
    const slope = (len * sxy - sx * sy) / (len * sxx - sx * sx)
    const intercept = (sy - slope * sx) / len
    return intercept + slope * (len - 1 - offset)
  })
}
