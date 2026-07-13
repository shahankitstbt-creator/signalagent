import { create } from 'zustand'

// Tracks which signals are NEW (first seen recently). Persists across reloads so
// a signal is flagged "NEW" for ~2h after it first appears, then quietly ages out.
// On the very first ever visit (empty storage) nothing is flagged, so the board
// doesn't light up entirely — only signals that appear AFTER that get the badge.
const LS = 'pt_new_flags'
export const NEW_WINDOW = 2 * 3600 * 1000
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {} } catch { return {} } }
const save = f => { try { localStorage.setItem(LS, JSON.stringify(f)) } catch {} }

export const isFresh = t => !!t && t > 1 && (Date.now() - t) < NEW_WINDOW

export const useNewFlags = create((set, get) => ({
  flags: load(),
  wasEmpty: Object.keys(load()).length === 0,
  done: false,
  ingest(keys) {
    const f = { ...get().flags }
    const now = Date.now()
    const seedOld = get().wasEmpty && !get().done   // first-ever load → seed silently
    let changed = false
    for (const k of keys) if (k && !(k in f)) { f[k] = seedOld ? 1 : now; changed = true }
    for (const k in f) if (f[k] > 1 && now - f[k] > 7 * 864e5) { delete f[k]; changed = true } // prune >7d
    if (changed) save(f)
    if (changed || !get().done) set({ flags: f, done: true })
  },
}))

export function useIsNew(key) {
  return useNewFlags(s => isFresh(s.flags[key]))
}
