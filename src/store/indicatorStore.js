import { create } from 'zustand'
import { indicatorDefaults } from '../components/Indicators/indicators'

let seq = 1

export const useIndicatorStore = create((set, get) => ({
  // active indicator instances: { uid, id, opts }
  active: [
    { uid: 'i-ema', id: 'ema', opts: indicatorDefaults('ema') },
    { uid: 'i-rsi', id: 'rsi', opts: indicatorDefaults('rsi') },
  ],
  add(id) {
    set(s => ({ active: [...s.active, { uid: `i-${id}-${seq++}`, id, opts: indicatorDefaults(id) }] }))
  },
  remove(uid) { set(s => ({ active: s.active.filter(a => a.uid !== uid) })) },
  setOpt(uid, key, value) {
    set(s => ({ active: s.active.map(a => a.uid === uid ? { ...a, opts: { ...a.opts, [key]: value } } : a) }))
  },
}))
