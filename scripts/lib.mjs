// Self-contained math + helpers for the Node screener (no app imports — keeps
// the CLI robust and free of bundler/ESM-resolution coupling).

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

export async function getText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' } })
      if (r.ok) return await r.text()
      if (r.status === 404) return null
    } catch { /* retry */ }
    await sleep(400 * (i + 1))
  }
  return null
}
export const getJSON = async (url, tries = 3) => { const t = await getText(url, tries); try { return t && JSON.parse(t) } catch { return null } }
export const sleep = ms => new Promise(r => setTimeout(r, ms))

// bounded-concurrency map with progress
export async function pool(items, n, fn, onProgress) {
  const out = new Array(items.length)
  let idx = 0, done = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i], i)
      done++
      if (onProgress && done % 20 === 0) onProgress(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

// ── indicators ──
export const sma = (a, len, i) => { if (i < len - 1) return null; let s = 0; for (let j = i - len + 1; j <= i; j++) s += a[j]; return s / len }
export function rsiSeries(close, len = 14) {
  const out = new Array(close.length).fill(null)
  let ag = 0, al = 0
  for (let i = 1; i < close.length; i++) {
    const ch = close[i] - close[i - 1], g = Math.max(0, ch), l = Math.max(0, -ch)
    if (i <= len) { ag += g; al += l; if (i === len) { ag /= len; al /= len; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al) } }
    else { ag = (ag * (len - 1) + g) / len; al = (al * (len - 1) + l) / len; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al) }
  }
  return out
}
export function atrSeries(h, l, c, len = 14) {
  const tr = c.map((_, i) => i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])))
  const out = new Array(c.length).fill(null)
  let prev = null
  for (let i = 0; i < tr.length; i++) {
    if (i < len) { if (i === len - 1) { prev = tr.slice(0, len).reduce((a, b) => a + b, 0) / len; out[i] = prev } }
    else { prev = (prev * (len - 1) + tr[i]) / len; out[i] = prev }
  }
  return out
}

// swing pivots (fractal) → for structure + harmonic proxy
export function pivots(h, l, k = 3) {
  const p = []
  for (let i = k; i < h.length - k; i++) {
    let hi = true, lo = true
    for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (h[j] >= h[i]) hi = false; if (l[j] <= l[i]) lo = false }
    if (hi) p.push({ i, type: 'H', price: h[i] })
    if (lo) p.push({ i, type: 'L', price: l[i] })
  }
  return p.sort((a, b) => a.i - b.i)
}
