import { create } from 'zustand'

// Drawings are keyed per symbol so each chart keeps its own annotations.
export const useDrawingStore = create((set, get) => ({
  tool: 'cursor', // cursor | hline | trend | ray | fib | rect
  pending: null,  // first click point awaiting second
  byKey: {},      // { 'crypto:BTCUSDT': [shape,...] }

  setTool(tool) { set({ tool, pending: null }) },
  setPending(p) { set({ pending: p }) },

  shapes(key) { return get().byKey[key] || [] },
  add(key, shape) {
    set(s => ({ byKey: { ...s.byKey, [key]: [...(s.byKey[key] || []), shape] }, pending: null }))
  },
  removeLast(key) {
    set(s => ({ byKey: { ...s.byKey, [key]: (s.byKey[key] || []).slice(0, -1) } }))
  },
  removeAt(key, index) {
    set(s => ({ byKey: { ...s.byKey, [key]: (s.byKey[key] || []).filter((_, i) => i !== index) } }))
  },
  clear(key) { set(s => ({ byKey: { ...s.byKey, [key]: [] }, pending: null })) },
}))
