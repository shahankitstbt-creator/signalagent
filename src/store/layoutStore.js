import { create } from 'zustand'

// Multi-chart grid: 1 / 2 / 4 panes, each with its own symbol/interval.
export const useLayoutStore = create((set) => ({
  layout: 1,   // 1 | 2 | 4
  active: 0,
  panes: [
    { assetClass: 'indices', symbol: '^NSEI', interval: '1d' },
    { assetClass: 'indices', symbol: '^NSEBANK', interval: '1d' },
    { assetClass: 'stocks', symbol: 'RELIANCE.NS', interval: '1d' },
    { assetClass: 'stocks', symbol: 'TCS.NS', interval: '1d' },
  ],
  setLayout(n) { set({ layout: n }) },
  setActive(i) { set({ active: i }) },
  setPane(i, patch) { set(s => ({ panes: s.panes.map((p, k) => k === i ? { ...p, ...patch } : p) })) },
}))
