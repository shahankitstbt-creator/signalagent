// Yahoo Finance feed — stocks, forex, indices, commodities, ETFs worldwide.
// Yahoo sends no CORS headers, so browser requests go through a CORS proxy.
// REST only (no public WS) → callers poll for the latest candle.

// Routed through the Vite dev-server proxy (server-side fetch → no CORS, no key).
// See server.proxy['/yahoo'] in vite.config.js.
const Y = '/yahoo'

// Binance-style interval → Yahoo interval (nearest supported)
const IMAP = { '1m':'1m','3m':'5m','5m':'5m','15m':'15m','30m':'30m','1h':'60m','2h':'60m','4h':'1h','6h':'1d','8h':'1d','12h':'1d','1d':'1d','1w':'1wk','1M':'1mo' }
// how much history to request per interval
const RANGE = { '1m':'5d','5m':'1mo','15m':'1mo','30m':'1mo','60m':'3mo','1h':'2y','1d':'5y','1wk':'10y','1mo':'max' }

export async function fetchYahoo(symbol, interval, limit = 1000) {
  const yi = IMAP[interval] || '1d'
  const range = RANGE[yi] || '2y'
  const url = `${Y}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${yi}&range=${range}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Yahoo ${res.status}`)
  const data = await res.json()
  const r = data?.chart?.result?.[0]
  if (!r) throw new Error(data?.chart?.error?.description || 'No data for ' + symbol)
  const ts = r.timestamp || []
  const q = r.indicators?.quote?.[0] || {}
  const bars = []
  for (let i = 0; i < ts.length; i++) {
    if (q.open?.[i] == null || q.close?.[i] == null) continue
    bars.push({ time: ts[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] || 0 })
  }
  return bars.slice(-limit)
}

// India-only. Indian index price series available on Yahoo (name → ticker).
export const INDIAN_INDICES = [
  ['^NSEI', 'NIFTY 50'], ['^NSEBANK', 'NIFTY Bank'], ['^CNXFIN', 'Nifty Financial Services'],
  ['^CNX100', 'NIFTY 100'], ['^CRSLDX', 'NIFTY 500'], ['^NSEMDCP50', 'NIFTY Midcap 50'],
  ['^CNXIT', 'NIFTY IT'], ['^CNXAUTO', 'NIFTY Auto'], ['^CNXFMCG', 'NIFTY FMCG'],
  ['^CNXMETAL', 'NIFTY Metal'], ['^CNXPHARMA', 'NIFTY Pharma'], ['^CNXPSUBANK', 'NIFTY PSU Bank'],
  ['^CNXENERGY', 'NIFTY Energy'], ['^CNXREALTY', 'NIFTY Realty'], ['^CNXINFRA', 'NIFTY Infra'],
  ['^CNXMEDIA', 'NIFTY Media'], ['^BSESN', 'BSE Sensex'],
  ['GC=F', 'Gold (XAUUSD)'],
]

// Stock universe loaded at runtime from /universe.json (written by the screener).
let STOCK_UNIVERSE = []
export async function loadStockUniverse() {
  if (STOCK_UNIVERSE.length) return STOCK_UNIVERSE
  try {
    const r = await fetch('/universe.json?t=' + Date.now())
    if (r.ok) STOCK_UNIVERSE = await r.json()
  } catch { /* not scanned yet */ }
  return STOCK_UNIVERSE
}
export const getStockUniverse = () => STOCK_UNIVERSE
