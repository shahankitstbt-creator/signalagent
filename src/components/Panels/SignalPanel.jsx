import { useSignalStore } from '../../store/signalStore'

const GRADE_COLOR = { 'A++': 'text-gold', 'A+': 'text-green', 'A': 'text-cyan', 'B': 'text-txt-sec', 'C': 'text-txt-muted' }
const GRADE_ORDER = { 'A++': 5, 'A+': 4, 'A': 3, 'B': 2, 'C': 1 }

export default function SignalPanel() {
  const signals = useSignalStore(s => s.signals)
  const selected = useSignalStore(s => s.selected)
  const select = useSignalStore(s => s.select)
  const minGrade = useSignalStore(s => s.minGrade)
  const setMinGrade = useSignalStore(s => s.setMinGrade)

  const shown = signals.filter(s => GRADE_ORDER[s.grade] >= GRADE_ORDER[minGrade])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-txt-sec text-xs uppercase tracking-wide">Signals · {shown.length}</div>
        <select value={minGrade} onChange={e => setMinGrade(e.target.value)}
          className="bg-bg-card border border-border rounded text-xs mono px-1 py-0.5">
          {['A++', 'A+', 'A', 'B', 'C'].map(g => <option key={g} value={g}>≥{g}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {shown.length === 0 && <div className="text-txt-muted text-xs mono">No active setups. Scanning…</div>}
        {shown.map(s => (
          <button key={s.id} onClick={() => select(s.id)}
            className={`w-full text-left rounded border p-2 ${selected === s.id ? 'border-accent bg-bg-card' : 'border-border bg-bg-panel hover:bg-bg-card'}`}>
            <div className="flex items-center justify-between mono text-xs">
              <span className={`font-bold ${GRADE_COLOR[s.grade]}`}>{s.grade}</span>
              <span className={s.direction === 'LONG' ? 'text-green' : 'text-red'}>{s.direction}</span>
            </div>
            <div className="text-txt text-[11px] mt-0.5 leading-tight">{s.strategy}</div>
            <div className="mono text-[10px] text-txt-sec mt-1">
              E {fmt(s.entry)} · SL {fmt(s.stop)} · R:R 1:{s.rr}
            </div>
            {s.techniques.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {s.techniques.map(t => <span key={t} className="text-[9px] mono px-1 rounded bg-purple/20 text-purple">{t}</span>)}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
const fmt = n => n < 10 ? n.toFixed(4) : n.toFixed(2)
