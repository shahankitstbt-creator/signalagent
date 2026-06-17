import { create } from 'zustand'
import { getHistory, subscribe, defaultSymbol } from '../data/DataManager'
import { useAlertStore } from '../components/Alerts/AlertEngine'

let sub = null
let loadToken = 0

export const useChartStore = create((set, get) => ({
  assetClass: 'indices',
  symbol: '^NSEI',
  interval: '1d',
  bars: [],
  loading: false,
  error: null,
  lastPrice: null,

  setAssetClass(assetClass) {
    set({ assetClass, symbol: defaultSymbol(assetClass) })
    get().load()
  },
  setSymbol(symbol) { set({ symbol }); get().load() },
  setInterval(interval) { set({ interval }); get().load() },
  // set asset class + symbol together → a single load (avoids the double-load race)
  openSymbol(assetClass, symbol) { set({ assetClass, symbol }); get().load() },

  async load() {
    const token = ++loadToken
    const { assetClass, symbol, interval } = get()
    set({ loading: true, error: null })
    if (sub) { sub.close(); sub = null }
    try {
      const bars = await getHistory(assetClass, symbol, interval, 3000)
      if (token !== loadToken) return // a newer load superseded this one
      if (!bars.length) throw new Error('No data returned')
      set({ bars, loading: false, lastPrice: bars.at(-1)?.close ?? null })
      sub = subscribe(assetClass, symbol, interval, (bar) => {
        if (token !== loadToken) return
        const cur = get().bars
        const last = cur.at(-1)
        let next
        if (last && last.time === bar.time) next = [...cur.slice(0, -1), bar]
        else if (!last || bar.time > last.time) next = [...cur, bar]
        else return
        const prevPrice = get().lastPrice
        set({ bars: next, lastPrice: bar.close })
        try { useAlertStore.getState().checkPrice(get().symbol, prevPrice, bar.close) } catch {}
      })
    } catch (e) {
      if (token === loadToken) set({ loading: false, error: e.message, bars: [] })
    }
  },
}))
