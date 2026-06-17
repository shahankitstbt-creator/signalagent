import { useEffect, useState } from 'react'
import { useViewStore } from '../../store/viewStore'
import { useChartStore } from '../../store/chartStore'
import { useHitAlerts } from '../../store/hitAlerts'
import HitPopups from '../Alerts/HitPopups'

const confColor = c => c >= 80 ? 'text-green' : c >= 65 ? 'text-cyan' : c >= 50 ? 'text-yellow' : 'text-txt-sec'
const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` }
const isTrade = s => s && s.entry != null && Array.isArray(s.targets) && !s.isAstro && !s.isOption && !s.placeholder

export default function SignalsBoard() {
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState(0)
  const setView = useViewStore(s => s.setView)
  const alertsOn = useHitAlerts(s => s.enabled)
  const enableAlerts = useHitAlerts(s => s.enable)
  const disableAlerts = useHitAlerts(s => s.disable)
  const startAlerts = useHitAlerts(s => s.start)

  const load = () => { setLoading(true); fetch('/board.json?t=' + Date.now()).then(r => r.ok ? r.json() : Promise.reject(new Error('No board yet — runs with the scan'))).then(d => { setBoard(d); setLoading(false) }).catch(e => { setErr(e.message); setLoading(false) }) }
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [])
  useEffect(() => { if (alertsOn) startAlerts() }, [alertsOn, startAlerts])

  const gens = board?.generators || []
  const total = gens.reduce((a, g) => a + g.count, 0)
  const active = gens[tab] || gens[0]

  return (
    <div className="h-full flex flex-col bg-bg-base text-txt overflow-hidden">
      <HitPopups />
      {/* header */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 border-b border-border bg-bg-panel flex items-center gap-2 sm:gap-4 flex-wrap elev">
        <div>
          <div className="mono text-base sm:text-lg font-bold brand-grad tracking-tight">◆ ProTrader Signal Board</div>
          <div className="mono text-[10px] sm:text-[11px] text-txt-sec">{total} signals · {gens.length} generators{board?.date ? ` · ${board.date}` : ''} · <span className="text-green font-bold">● live</span></div>
        </div>
        <button onClick={load} className="mono text-xs text-txt-sec hover:text-accent">⟳</button>
        <div className="ml-auto flex gap-1.5 sm:gap-2">
          <button onClick={() => alertsOn ? disableAlerts() : enableAlerts()}
            className={`mono text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border card-hover ${alertsOn ? 'border-green text-green' : 'border-border text-txt-sec hover:border-accent'}`}>
            {alertsOn ? '🔔 Alerts on' : '🔕 Alerts'}
          </button>
          <button onClick={() => setView('agent')} className="mono text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent card-hover">📣</button>
          <button onClick={() => setView('chart')} className="mono text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent card-hover">📈</button>
        </div>
      </div>

      {/* nav tabs — one per generator (the card title is the tab) */}
      <div className="shrink-0 flex gap-1 px-3 pt-2 bg-bg-panel border-b border-border overflow-x-auto">
        {gens.map((g, i) => {
          const on = i === tab
          return (
            <button key={g.id} onClick={() => setTab(i)}
              className="mono text-xs whitespace-nowrap px-3 py-2 rounded-t-lg border-b-2 transition-colors"
              style={on
                ? { color: g.color, borderBottomColor: g.color, background: tint(g.color, 0.10), fontWeight: 700 }
                : { color: 'var(--color-txt-sec)', borderBottomColor: 'transparent' }}>
              {g.label}
              <span className="ml-1.5 px-1.5 rounded-full text-[10px]" style={on ? { background: g.color, color: '#fff' } : { background: 'var(--color-bg-card)', color: 'var(--color-txt-muted)' }}>{g.count}</span>
            </button>
          )
        })}
      </div>

      {loading && !board && <div className="p-4 mono text-sm text-txt-sec">Loading board…</div>}
      {err && <div className="p-4 mono text-sm text-yellow">{err}</div>}

      {/* active tab content */}
      {active && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-2.5 text-[11px] mono text-txt-sec border-b border-border" style={{ background: tint(active.color, 0.05) }}>
            <span className="font-bold" style={{ color: active.color }}>{active.label}</span> — {active.desc}
          </div>
          {active.signals.length === 0
            ? <div className="p-8 mono text-sm text-txt-muted text-center">No signals in this generator today.</div>
            : isTrade(active.signals[0])
              ? <>
                  <div className="hidden md:block"><TradeTable signals={active.signals} color={active.color} setView={setView} /></div>
                  <div className="md:hidden"><TradeCards signals={active.signals} color={active.color} setView={setView} /></div>
                </>
              : <InfoList signals={active.signals} color={active.color} setView={setView} />}
        </div>
      )}
    </div>
  )
}

function TradeTable({ signals, color, setView }) {
  const [open, setOpen] = useState(-1)
  const rows = [...signals].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  return (
    <table className="w-full mono text-xs border-collapse">
      <thead>
        <tr className="text-txt-sec text-[10px] uppercase tracking-wide" style={{ background: tint(color, 0.06) }}>
          {['Symbol', 'Signal', 'LTP', 'Entry', 'Stop', 'T1', 'T2', 'T3', 'Conf', '']
            .map((h, i) => <th key={i} className={`px-3 py-2 font-semibold ${i >= 2 && i <= 8 ? 'text-right' : 'text-left'}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => {
          const isBuy = (s.direction || 'LONG') === 'LONG'
          const t = s.targets
          return (
            <RowGroup key={s.symbol + i} s={s} i={i} isBuy={isBuy} t={t} color={color} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} setView={setView} />
          )
        })}
      </tbody>
    </table>
  )
}

function RowGroup({ s, i, isBuy, t, color, open, onToggle, setView }) {
  const [copied, setCopied] = useState(false)
  const openSymbol = useChartStore(st => st.openSymbol)
  const copy = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const chart = (e) => { e.stopPropagation(); openSymbol('stocks', s.symbol + '.NS'); setView('chart') }
  return (
    <>
      <tr onClick={onToggle} className="border-b border-border hover:bg-bg-card cursor-pointer">
        <td className="px-3 py-2 font-bold text-txt">{s.symbol}<span className="ml-1 text-txt-muted">{open ? '▾' : '▸'}</span></td>
        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${isBuy ? 'bg-green' : 'bg-red'}`}>{isBuy ? 'BUY' : 'SELL'}</span></td>
        <td className="px-3 py-2 text-right text-txt-sec">{s.ltp}</td>
        <td className="px-3 py-2 text-right">{s.entry}</td>
        <td className="px-3 py-2 text-right text-red">{s.sl}</td>
        <td className="px-3 py-2 text-right text-green">{t[0]?.price}</td>
        <td className="px-3 py-2 text-right text-green">{t[1]?.price}</td>
        <td className="px-3 py-2 text-right text-green">{t[2]?.price}</td>
        <td className={`px-3 py-2 text-right font-bold ${confColor(s.confidence)}`}>{s.confidence}%</td>
        <td className="px-3 py-2 text-right">
          <button onClick={copy} className="px-2 py-1 rounded text-white text-[10px]" style={{ background: color }}>{copied ? '✓' : '📋'}</button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border" style={{ background: tint(color, 0.04) }}>
          <td colSpan={10} className="px-5 py-3">
            <div className="text-txt-sec mb-2">{s.reason}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
              <Field label="Entry" value={`₹${s.entry}`} />
              <Field label="Stop loss" value={`₹${s.sl} (${s.slPct}%)`} tone="text-red" />
              <Field label="R:R" value={`1:${s.rr}`} />
              <Field label={s.accuracy != null ? `Backtested (n=${s.backtestTrades})` : 'Setup score'} value={s.accuracy != null ? `~${s.accuracy}%` : `${s.confidence}/100`} tone="text-cyan" />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {t.map((x, k) => <Field key={k} label={`Target ${k + 1} · by ${x.by}`} value={`₹${x.price} (+${x.pct}%)`} tone="text-green" />)}
            </div>
            <div className="flex gap-2">
              <button onClick={copy} className="mono text-[11px] px-3 py-1.5 rounded-lg text-white" style={{ background: color }}>{copied ? '✓ Copied caption' : '📋 Copy social post'}</button>
              <button onClick={chart} className="mono text-[11px] px-3 py-1.5 rounded-lg border border-border hover:border-accent">📈 Open chart</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
function Field({ label, value, tone }) {
  return <div><div className="text-[10px] text-txt-muted uppercase">{label}</div><div className={`text-xs font-bold ${tone || 'text-txt'}`}>{value}</div></div>
}

// mobile: stacked trade cards instead of a wide table
function TradeCards({ signals, color, setView }) {
  const rows = [...signals].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  return <div className="p-3 space-y-2.5">{rows.map((s, i) => <MobileTradeCard key={s.symbol + i} s={s} color={color} setView={setView} />)}</div>
}
function MobileTradeCard({ s, color, setView }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const openSymbol = useChartStore(st => st.openSymbol)
  const isBuy = (s.direction || 'LONG') === 'LONG'
  const copy = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const chart = (e) => { e.stopPropagation(); openSymbol('stocks', s.symbol + '.NS'); setView('chart') }
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3 elev" style={{ borderLeft: `4px solid ${color}` }} onClick={() => setOpen(o => !o)}>
      <div className="flex items-center gap-2">
        <span className="mono text-base font-bold text-txt">{s.symbol}</span>
        <span className={`mono text-[10px] font-bold px-2 py-0.5 rounded text-white ${isBuy ? 'bg-green' : 'bg-red'}`}>{isBuy ? 'BUY' : 'SELL'}</span>
        <span className="ml-auto mono text-[11px] text-txt-sec">₹{s.ltp}</span>
        <span className={`mono text-sm font-bold ${confColor(s.confidence)}`}>{s.confidence}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 mono text-[11px]">
        <div><div className="text-[9px] text-txt-muted uppercase">Entry</div><div className="font-bold">{s.entry}</div></div>
        <div><div className="text-[9px] text-txt-muted uppercase">Stop</div><div className="font-bold text-red">{s.sl}</div></div>
        <div><div className="text-[9px] text-txt-muted uppercase">R:R</div><div className="font-bold">1:{s.rr}</div></div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1.5 mono text-[11px]">
        {s.targets.map((t, k) => <div key={k}><div className="text-[9px] text-txt-muted uppercase">T{k + 1}</div><div className="font-bold text-green">{t.price} <span className="text-[9px]">+{t.pct}%</span></div></div>)}
      </div>
      {open && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="mono text-[11px] text-txt-sec mb-1.5">{s.reason}</div>
          <div className="mono text-[10px] text-cyan mb-2">{s.accuracy != null ? `backtested ~${s.accuracy}% (n=${s.backtestTrades})` : `setup score ${s.confidence}/100`} · targets by {s.targets.map(t => t.by).join(' / ')}</div>
        </div>
      )}
      <div className="flex gap-2 mt-2.5">
        <button onClick={copy} className="flex-1 mono text-[11px] py-2 rounded-lg text-white" style={{ background: color }}>{copied ? '✓ Copied' : '📋 Copy post'}</button>
        <button onClick={chart} className="mono text-[11px] px-3 py-2 rounded-lg border border-border">📈</button>
      </div>
    </div>
  )
}

// astro / option / timing tabs — richer info cards in a roomy grid
function InfoList({ signals, color, setView }) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {signals.map((s, i) => <InfoCard key={s.symbol + (s.method || '') + i} s={s} color={color} setView={setView} />)}
    </div>
  )
}
function InfoCard({ s, color, setView }) {
  const [copied, setCopied] = useState(false)
  const openSymbol = useChartStore(st => st.openSymbol)
  const copy = () => { navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const tone = s.biasTone === 'up' ? 'text-green' : s.biasTone === 'down' ? 'text-red' : 'text-yellow'
  const chart = () => { const sym = s.symbol === 'NIFTY' ? '^NSEI' : s.symbol === 'GOLD' ? 'GC=F' : s.symbol === 'BANKNIFTY' ? '^NSEBANK' : s.symbol + '.NS'; openSymbol(s.symbol === 'NIFTY' || s.symbol === 'GOLD' || s.symbol === 'BANKNIFTY' ? 'indices' : 'stocks', sym); setView('chart') }
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3 elev card-hover" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-1.5">
        <button onClick={chart} className="mono text-sm font-bold text-txt hover:text-accent">{s.symbol}</button>
        {s.method && <span className="mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: tint(color, 0.12), color }}>{s.method}</span>}
        {s.bias && <span className={`mono text-[10px] ml-auto font-bold ${tone}`}>{s.bias}</span>}
      </div>
      {s.name && <div className="mono text-[10px] text-txt-muted mt-0.5">{s.name}</div>}
      <div className="mono text-[11px] text-txt-sec mt-1.5 leading-snug">{s.reason}</div>
      {s.lines && (
        <div className="mt-2 space-y-0.5 border-t border-border pt-1.5">
          {s.lines.map((l, i) => (
            <div key={i} className="flex justify-between mono text-[10px]">
              <span className="text-txt-muted">{l.k}</span>
              <span className="text-txt-sec text-right ml-2">{l.v}</span>
            </div>
          ))}
        </div>
      )}
      {s.social && <button onClick={copy} className="w-full mt-2.5 mono text-[11px] py-1.5 rounded-lg text-white" style={{ background: color }}>{copied ? '✓ Copied' : '📋 Copy social post'}</button>}
    </div>
  )
}
