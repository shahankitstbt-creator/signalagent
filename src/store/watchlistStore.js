// User watchlists — multiple named lists, each a list of { symbol, name, assetClass }. Add/remove any
// symbol, create/rename/delete lists. Persisted to localStorage so your lists survive reloads.
import { create } from 'zustand'
import { INDIAN_INDICES } from '../data/YahooFeed'

const KEY = 'pt_watchlists_v1'
const seedIndices = INDIAN_INDICES.map(([symbol, name]) => ({ symbol, name, assetClass: 'indices' }))
const DEFAULT = { lists: { 'Indices': seedIndices, 'My List': [] }, active: 'Indices' }

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.lists && Object.keys(s.lists).length) return s } catch { }
  return DEFAULT
}
const persist = s => { try { localStorage.setItem(KEY, JSON.stringify({ lists: s.lists, active: s.active })) } catch { } }

export const useWatchlistStore = create((set) => ({
  ...load(),
  addSymbol(symbol, name, assetClass = 'stocks') {
    set(s => {
      const lists = { ...s.lists }; const arr = [...(lists[s.active] || [])]
      if (!arr.some(x => x.symbol === symbol)) arr.unshift({ symbol, name: name || symbol, assetClass })
      lists[s.active] = arr; const ns = { ...s, lists }; persist(ns); return ns
    })
  },
  removeSymbol(symbol) {
    set(s => { const lists = { ...s.lists }; lists[s.active] = (lists[s.active] || []).filter(x => x.symbol !== symbol); const ns = { ...s, lists }; persist(ns); return ns })
  },
  addList(name) {
    set(s => { name = (name || '').trim(); if (!name || s.lists[name]) return s; const ns = { ...s, lists: { ...s.lists, [name]: [] }, active: name }; persist(ns); return ns })
  },
  removeList(name) {
    set(s => { const lists = { ...s.lists }; delete lists[name]; if (!Object.keys(lists).length) lists['My List'] = []; const ns = { ...s, lists, active: Object.keys(lists)[0] }; persist(ns); return ns })
  },
  setActive(name) { set(s => { const ns = { ...s, active: name }; persist(ns); return ns }) },
}))
