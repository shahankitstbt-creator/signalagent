// Binance market data: REST history + live WebSocket klines.
// OHLCV format: { time: unix_seconds, open, high, low, close, volume }

const REST = 'https://api.binance.com/api/v3'
const WS = 'wss://stream.binance.com:9443/ws'

// Binance interval strings map 1:1 to our timeframes
export const INTERVALS = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','1w','1M']

export async function fetchKlines(symbol, interval, limit = 1000) {
  const url = `${REST}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`)
  const raw = await res.json()
  return raw.map(k => ({
    time: Math.floor(k[0] / 1000),
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
  }))
}

export async function searchSymbols(query) {
  // exchangeInfo is large; cache once and filter client-side.
  if (!searchSymbols._cache) {
    const res = await fetch(`${REST}/exchangeInfo`)
    const data = await res.json()
    searchSymbols._cache = data.symbols
      .filter(s => s.status === 'TRADING')
      .map(s => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset }))
  }
  const q = query.toUpperCase()
  return searchSymbols._cache
    .filter(s => s.symbol.includes(q))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .slice(0, 50)
}

// Subscribe to live kline stream. onBar(bar, isFinal) fires on every tick.
export function subscribeKlines(symbol, interval, onBar) {
  const stream = `${symbol.toLowerCase()}@kline_${interval}`
  let ws = new WebSocket(`${WS}/${stream}`)
  let closed = false

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    const k = m.k
    onBar({
      time: Math.floor(k.t / 1000),
      open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v,
    }, k.x)
  }
  ws.onclose = () => {
    if (!closed) setTimeout(() => { ws = reconnect() }, 2000)
  }
  function reconnect() {
    const r = subscribeKlines(symbol, interval, onBar)
    ws = r._ws
    return ws
  }

  const handle = {
    _ws: ws,
    close() { closed = true; ws.close() },
  }
  return handle
}
