import { useEffect, useState } from 'react'
import { useViewStore } from '../../store/viewStore'
import { useChartStore } from '../../store/chartStore'

const confColor = c => c >= 80 ? 'text-green' : c >= 65 ? 'text-cyan' : c >= 50 ? 'text-yellow' : 'text-txt-sec'
// hex → rgba tint for the multi-color column theming
const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` }

export default function SignalsBoard() {
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const setView = useViewStore(s => s.setView)

  const load = () => { setLoading(true); fetch('/board.json?t=' + Date.now()).then(r => r.ok ? r.json() : Promise.reject(new Error('No board yet — runs with the scan'))).then(d => { setBoard(d); setLoading(false) }).catch(e => { setErr(e.message); setLoading(false) }) }
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [])

  const gens = board?.generators || []
  const total = gens.reduce((a, g) => a + g.count, 0)

  return (
    <div className="h-full flex flex-col bg-bg-base text-txt overflow-hidden">
      <div className="shrink-0 px-5 py-3 border-b border-border bg-bg-panel flex items-center gap-4 elev">
        <div>
          <div className="mono text-lg font-bold brand-grad tracking-tight">◆ ProTrader Signal Board</div>
          <div className="mono text-[11px] text-txt-sec">{total} signals · {gens.length} generators{board?.date ? ` · ${board.date}` : ''} · <span className="text-green font-bold">● live</span></div>
        </div>
        <button onClick={load} className="mono text-xs text-txt-sec hover:text-accent">⟳ refresh</button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setView('agent')} className="mono text-xs px-3 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent card-hover">📣 Content</button>
          <button onClick={() => setView('chart')} className="mono text-xs px-3 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent card-hover">📈 Chart</button>
        </div>
      </div>

      {loading && <div className="p-4 mono text-sm text-txt-sec">Loading board…</div>}
      {err && <div className="p-4 mono text-sm text-yellow">{err}</div>}

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-3 h-full" style={{ minWidth: 'max-content' }}>
          {gens.map(g => (
            <div key={g.id} className="w-[304px] shrink-0 flex flex-col rounded-xl border border-border elev overflow-hidden" style={{ background: tint(g.color, 0.04) }}>
              <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: tint(g.color, 0.13), borderBottom: `2px solid ${g.color}` }}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                <span className="mono text-xs font-bold leading-tight" style={{ color: g.color }}>{g.label}</span>
                <span className="mono text-[10px] px-2 py-0.5 rounded-full text-white ml-auto shrink-0 font-bold" style={{ background: g.color }}>{g.count}</span>
              </div>
              <div className="px-3 py-1.5 text-[10px] mono text-txt-muted leading-tight">{g.desc}</div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {g.signals.length === 0 && <div className="mono text-[11px] text-txt-muted p-1">No signals today.</div>}
                {g.signals.map((s, i) => <Card key={s.symbol + i} s={s} color={g.color} setView={setView} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Card({ s, color, setView }) {
  const [copied, setCopied] = useState(false)
  const openSymbol = useChartStore(st => st.openSymbol)
  const copy = () => { navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const chart = () => { const sym = s.symbol === 'NIFTY' ? '^NSEI' : s.symbol === 'GOLD' ? 'GC=F' : s.symbol + '.NS'; openSymbol(s.symbol === 'NIFTY' || s.symbol === 'GOLD' ? 'indices' : 'stocks', sym); setView('chart') }

  if (s.placeholder || s.isAstro || s.isOption) {
    const tone = s.biasTone === 'up' ? 'text-green' : s.biasTone === 'down' ? 'text-red' : 'text-yellow'
    return (
      <div className="rounded-lg border border-border bg-bg-card p-2 elev card-hover" style={{ borderLeft: `3px solid ${color}` }}>
        <div className="flex items-center gap-1.5">
          <span className="mono text-xs font-bold text-txt">{s.symbol}</span>
          {s.method && <span className="mono text-[9px] px-1 rounded bg-bg-panel text-txt-sec">{s.method}</span>}
          {s.bias && <span className={`mono text-[9px] ml-auto font-bold ${tone}`}>{s.bias}</span>}
        </div>
        {s.name && <div className="mono text-[9px] text-txt-muted">{s.name}</div>}
        <div className="mono text-[10px] text-txt-sec mt-1 leading-snug">{s.reason}</div>
        {s.lines && (
          <div className="mt-1.5 space-y-0.5 border-t border-border/50 pt-1">
            {s.lines.map((l, i) => (
              <div key={i} className="flex justify-between mono text-[9px]">
                <span className="text-txt-muted">{l.k}</span>
                <span className="text-txt-sec text-right ml-2">{l.v}</span>
              </div>
            ))}
          </div>
        )}
        {s.social && <button onClick={copy} className="w-full mt-2 mono text-[10px] py-1 rounded bg-accent/90 text-white hover:bg-accent">{copied ? '✓ Copied' : '📋 Copy social post'}</button>}
      </div>
    )
  }
  const isBuy = (s.direction || 'LONG') === 'LONG'
  return (
    <div className="rounded-lg border border-border bg-bg-card p-2 elev card-hover" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-1.5">
        <button onClick={chart} className="mono text-sm font-bold text-txt hover:text-accent">{s.symbol}</button>
        <span className={`mono text-[10px] font-bold px-2 py-0.5 rounded text-white ${isBuy ? 'bg-green' : 'bg-red'}`}>{isBuy ? 'BUY' : 'SELL'}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="mono text-[11px] text-txt-sec">₹{s.ltp}</span>
          <span className={`mono text-xs font-bold ${confColor(s.confidence)}`}>{s.confidence}%</span>
        </span>
      </div>
      <div className="mono text-[10px] text-txt-sec mt-0.5 leading-snug">{s.reason}</div>
      <div className="grid grid-cols-2 gap-x-2 mt-1.5 mono text-[10px]">
        <span className="text-txt-muted">Entry <span className="text-txt">{s.entry}</span></span>
        <span className="text-txt-muted">SL <span className="text-red">{s.sl} ({s.slPct}%)</span></span>
      </div>
      <div className="mt-1 space-y-0.5">
        {s.targets.map((t, i) => (
          <div key={i} className="flex justify-between mono text-[10px]">
            <span className="text-txt-sec">T{i + 1} {t.price}</span>
            <span className="text-green">+{t.pct}%</span>
            <span className="text-txt-muted">{t.by}</span>
          </div>
        ))}
      </div>
      <div className="mono text-[9px] text-cyan mt-1">{s.accuracy != null ? `backtested ~${s.accuracy}% (n=${s.backtestTrades})` : `setup score ${s.confidence}/100`} · R:R 1:{s.rr}</div>
      <button onClick={copy} className="w-full mt-1.5 mono text-[10px] py-1 rounded bg-accent/90 text-white hover:bg-accent">{copied ? '✓ Copied caption' : '📋 Copy social post'}</button>
    </div>
  )
}
