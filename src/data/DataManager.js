// India-only data layer. Both asset classes use Yahoo Finance (via the server's
// /yahoo proxy). Indices use ^ tickers; stocks use SYMBOL.NS.
import { fetchYahoo, INDIAN_INDICES, loadStockUniverse, getStockUniverse } from './YahooFeed'

export const ASSET_CLASSES = ['indices', 'stocks']
export const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '1d', '1w', '1M']

// kick off universe load
loadStockUniverse()

export async function getHistory(assetClass, symbol, interval, limit = 1000) {
  return fetchYahoo(symbol, interval, limit)
}

// Non-crypto: poll the latest candle every 15s (markets are slower; lighter load).
export function subscribe(assetClass, symbol, interval, onBar) {
  let stop = false
  const poll = async () => {
    if (stop) return
    try { const bars = await fetchYahoo(symbol, interval, 3); const last = bars.at(-1); if (last) onBar(last, true) }
    catch { /* ignore transient errors */ }
  }
  const id = setInterval(poll, 15000)
  return { close() { stop = true; clearInterval(id) } }
}

export async function search(assetClass, query) {
  const q = (query || '').toUpperCase()
  if (assetClass === 'indices') {
    return INDIAN_INDICES.filter(([sym, name]) => sym.includes(q) || name.toUpperCase().includes(q))
      .map(([symbol, name]) => ({ symbol, name }))
  }
  await loadStockUniverse()
  const uni = getStockUniverse()
  const matches = (q ? uni.filter(s => s.symbol.includes(q) || (s.name || '').toUpperCase().includes(q)) : uni)
  return matches.slice(0, 60).map(s => ({ symbol: s.symbol + '.NS', name: s.name }))
}

export const defaultSymbol = (assetClass) => assetClass === 'indices' ? '^NSEI' : 'RELIANCE.NS'
