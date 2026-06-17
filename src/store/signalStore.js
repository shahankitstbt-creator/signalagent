import { create } from 'zustand'
import { scanStrategies } from '../components/Strategies/strategies'

export const useSignalStore = create((set, get) => ({
  signals: [],
  selected: null, // signal id shown on chart
  minGrade: 'B',  // panel filter
  log: [],        // historical fired signals (A+ and above)

  scan(bars) {
    const signals = scanStrategies(bars)
    const prev = get().signals
    // append newly-appeared high-grade signals to the log (dedup by id)
    const known = new Set(get().log.map(s => s.id))
    const fresh = signals.filter(s => ['A++', 'A+', 'A'].includes(s.grade) && !known.has(s.id))
    const log = fresh.length ? [...fresh, ...get().log].slice(0, 100) : get().log
    const selected = get().selected && signals.find(s => s.id === get().selected) ? get().selected : signals[0]?.id ?? null
    set({ signals, log, selected })
    return fresh
  },
  select(id) { set({ selected: id }) },
  setMinGrade(g) { set({ minGrade: g }) },
}))
