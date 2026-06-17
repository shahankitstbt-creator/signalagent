// Vercel serverless function — CORS proxy for Yahoo Finance (mirrors server.mjs /yahoo).
// Frontend calls /yahoo/v8/finance/chart/SYMBOL?interval=..&range=..  → rewritten here.
export default async function handler(req, res) {
  try {
    const { path = '', ...q } = req.query
    const p = Array.isArray(path) ? path.join('/') : path
    const qs = new URLSearchParams(q).toString()
    const url = `https://query1.finance.yahoo.com/${p}${qs ? '?' + qs : ''}`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' } })
    const body = await r.text()
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=120')
    res.status(r.status).send(body)
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) })
  }
}
