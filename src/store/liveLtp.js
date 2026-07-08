import { create } from 'zustand'

// live LTP polling for the currently-viewed signals (during market hours).
// True per-second-per-symbol isn't possible on free data (rate limits) — this
// refreshes visible prices every few seconds, which is effectively real-time.
const YMAP = { NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK', FINNIFTY: '^CNXFIN', MIDCPNIFTY: '^NSEMDCP50', SENSEX: '^BSESN', GOLD: 'GC=F', SILVER: 'SI=F' }
const yTicker = sym => YMAP[sym] || (sym + '.NS')

// Indian market live window (IST 09:15–23:30 Mon–Fri: equity + MCX commodities)
function marketOpen() {
  const ist = new Date(Date.now() + 330 * 60000)
  const d = ist.getUTCDay(); if (d === 0 || d === 6) return false
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return m >= 555 && m <= 1410
}

let timer = null, seq = 0
export const useLiveLtp = create((set, get) => ({
  prices: {},        // { SYMBOL: { ltp, prev, ts } }
  live: false,
  symbols: [],
  start(symbols) {
    set({ symbols: (symbols || []).filter(Boolean).slice(0, 50) })
    if (!timer) { get().tick(); timer = setInterval(() => get().tick(), 5000) }
  },
  stop() { if (timer) { clearInterval(timer); timer = null } set({ live: false }) },
  async tick() {
    if (!marketOpen()) { set({ live: false }); return }
    const syms = get().symbols; if (!syms.length) return
    const mine = ++seq
    const prices = { ...get().prices }
    for (let i = 0; i < syms.length; i += 8) {
      if (mine !== seq) return
      await Promise.all(syms.slice(i, i + 8).map(async sym => {
        try {
          const d = await fetch(`/yahoo/v8/finance/chart/${encodeURIComponent(yTicker(sym))}?interval=1m&range=1d`).then(r => r.json())
          const r = d?.chart?.result?.[0]
          const ltp = r?.meta?.regularMarketPrice
          if (ltp != null) prices[sym] = { ltp: +(+ltp).toFixed(2), prev: prices[sym]?.ltp, ts: Date.now() }
        } catch {}
      }))
      await new Promise(r => setTimeout(r, 200))
    }
    if (mine === seq) set({ prices, live: true })
  },
}))
