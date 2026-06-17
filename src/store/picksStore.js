import { create } from 'zustand'

const WKEY = 'protrader.watchlist'
const loadWL = () => { try { return JSON.parse(localStorage.getItem(WKEY)) || [] } catch { return [] } }
const saveWL = (wl) => localStorage.setItem(WKEY, JSON.stringify(wl))

export const usePicksStore = create((set, get) => ({
  picks: [],
  meta: null,
  loading: false,
  error: null,
  watchlist: loadWL(),
  signals: [],
  engine: null,

  async loadPicks() {
    set({ loading: true, error: null })
    try {
      const r = await fetch('/picks.json?t=' + Date.now())
      if (!r.ok) throw new Error('picks.json not found — run `npm run scan`')
      const d = await r.json()
      set({ picks: d.picks || [], meta: d, loading: false })
    } catch (e) { set({ loading: false, error: e.message }) }
    try {
      const r = await fetch('/signals.json?t=' + Date.now())
      if (r.ok) { const d = await r.json(); set({ signals: d.signals || [], engine: d }) }
    } catch { /* no signals yet */ }
  },

  inWatchlist(symbol) { return get().watchlist.some(w => w.symbol === symbol) },
  addToWatchlist(p) {
    if (get().inWatchlist(p.symbol)) return
    const wl = [{ ...p, addedAt: new Date().toISOString() }, ...get().watchlist]
    saveWL(wl); set({ watchlist: wl })
  },
  removeFromWatchlist(symbol) {
    const wl = get().watchlist.filter(w => w.symbol !== symbol)
    saveWL(wl); set({ watchlist: wl })
  },
}))
