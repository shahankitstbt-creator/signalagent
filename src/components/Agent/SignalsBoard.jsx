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
  const [modal, setModal] = useState(null)
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
  const tr = board?.trackRecord
  const o = tr?.overall
  const genTR = tr?.generators?.[active?.id]

  return (
    <div className="h-full flex flex-col bg-bg-base text-txt overflow-hidden">
      <HitPopups />
      {/* header */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 border-b border-border bg-bg-panel flex items-center gap-2 sm:gap-4 flex-wrap elev">
        <div>
          <div className="mono text-base sm:text-lg font-bold brand-grad tracking-tight">◆ ProTrader Signal Board</div>
          <div className="mono text-[10px] sm:text-[11px] text-txt-sec">
            {total} signals · {gens.length} generators{board?.date ? ` · ${board.date}` : ''} · <span className="text-green font-bold">● live</span>
            {o && <span className="ml-2 text-txt-muted">📊 {o.decided ? <>track record <b className={o.winRate >= 80 ? 'text-green' : 'text-txt'}>{o.winRate}%</b> ({o.win}/{o.decided}) · {o.open} open</> : <>{o.open} open · accuracy builds as trades close</>}</span>}
          </div>
        </div>
        <button onClick={load} className="mono text-xs text-txt-sec hover:text-accent">⟳</button>
        <div className="ml-auto flex gap-1.5 sm:gap-2">
          <button onClick={() => setModal('learning')} className="mono text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent card-hover" title="Self-improvement log">🧠</button>
          <button onClick={() => setModal('news')} className="mono text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent card-hover" title="Market news">📰</button>
          <button onClick={() => alertsOn ? disableAlerts() : enableAlerts()}
            className={`mono text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border card-hover ${alertsOn ? 'border-green text-green' : 'border-border text-txt-sec hover:border-accent'}`}>
            {alertsOn ? '🔔 On' : '🔕'}
          </button>
          <button onClick={() => setView('agent')} className="mono text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent card-hover">📣</button>
          <button onClick={() => setView('chart')} className="mono text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-bg-card border border-border hover:border-accent card-hover">📈</button>
        </div>
      </div>
      {modal && <InsightModal kind={modal} onClose={() => setModal(null)} />}

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
          <div className="px-5 py-2.5 text-[11px] mono text-txt-sec border-b border-border flex items-center gap-3 flex-wrap" style={{ background: tint(active.color, 0.05) }}>
            <span><span className="font-bold" style={{ color: active.color }}>{active.label}</span> — {active.desc}</span>
            {genTR && (genTR.decided > 0
              ? <span className="ml-auto shrink-0 px-2 py-0.5 rounded-full" style={{ background: tint(active.color, 0.12) }}>track record <b className={genTR.winRate >= 80 ? 'text-green' : 'text-txt'}>{genTR.winRate}%</b> ({genTR.win}/{genTR.decided}) · {genTR.open} open</span>
              : genTR.open > 0 ? <span className="ml-auto shrink-0 text-txt-muted">{genTR.open} open · accuracy builds as trades close</span> : null)}
          </div>
          {active.signals.length === 0
            ? <div className="p-8 mono text-sm text-txt-muted text-center">No signals in this generator today.</div>
            : active.id === 'vedic_astro'
              ? <AssetBiasTable signals={active.signals} color={active.color} />
              : active.id === 'astro_timing'
                ? <HoraTable signals={active.signals} color={active.color} />
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

// ── Vedic Astro tab: ALL-ASSETS daily bias (score + bullish/bearish time windows) ──
const biasToneCls = t => t === 'up' ? 'text-green' : t === 'down' ? 'text-red' : 'text-yellow'
function AssetBiasTable({ signals, color }) {
  const [open, setOpen] = useState(-1)
  const rows = [...signals].sort((a, b) => b.score - a.score)
  return (
    <>
      <table className="hidden md:table w-full mono text-xs border-collapse">
        <thead><tr className="text-txt-sec text-[10px] uppercase tracking-wide" style={{ background: tint(color, 0.06) }}>
          {['Asset', 'Daily bias', '▲ Bullish windows', '▼ Bearish windows', 'Nava Tara', ''].map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((s, i) => <AssetBiasRow key={s.symbol} s={s} color={color} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />)}</tbody>
      </table>
      <div className="md:hidden p-3 space-y-2.5">{rows.map(s => <AssetBiasCard key={s.symbol} s={s} color={color} />)}</div>
    </>
  )
}
function Windows({ s }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div><div className="text-[10px] uppercase text-green mb-1 font-bold">▲ Bullish windows (IST)</div>
        {s.bullWindows.length ? s.bullWindows.map((w, k) => <div key={k} className="flex justify-between text-[11px] py-0.5 border-b border-border/40"><span className="text-txt">{w.time}</span><span className={w.prime ? 'text-green font-bold' : 'text-txt-sec'}>{w.planet}{w.prime ? ' ★ PRIME' : ''}</span></div>) : <div className="text-[11px] text-txt-muted">none today</div>}</div>
      <div><div className="text-[10px] uppercase text-red mb-1 font-bold">▼ Bearish windows (IST)</div>
        {s.bearWindows.length ? s.bearWindows.map((w, k) => <div key={k} className="flex justify-between text-[11px] py-0.5 border-b border-border/40"><span className="text-txt">{w.time}</span><span className="text-txt-sec">{w.planet}</span></div>) : <div className="text-[11px] text-txt-muted">none today</div>}</div>
    </div>
  )
}
function AssetBiasRow({ s, color, open, onToggle }) {
  const [copied, setCopied] = useState(false)
  const copy = e => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const tcls = biasToneCls(s.biasTone)
  return (
    <>
      <tr onClick={onToggle} className="border-b border-border hover:bg-bg-card cursor-pointer">
        <td className="px-3 py-2 font-bold text-txt">{s.name}<span className="ml-1 text-txt-muted">{open ? '▾' : '▸'}</span></td>
        <td className="px-3 py-2"><span className={`font-bold ${tcls}`}>{s.score > 0 ? '+' : ''}{s.score}</span> <span className="text-txt-sec">{s.label}</span></td>
        <td className="px-3 py-2 text-green">▲ {s.bullCount}</td>
        <td className="px-3 py-2 text-red">▼ {s.bearCount}</td>
        <td className={`px-3 py-2 ${s.navaBad ? 'text-red font-bold' : 'text-txt-sec'}`}>{s.navaTara}</td>
        <td className="px-3 py-2"><button onClick={copy} className="px-2 py-1 rounded text-white text-[10px]" style={{ background: color }}>{copied ? '✓' : '📋'}</button></td>
      </tr>
      {open && (
        <tr className="border-b border-border" style={{ background: tint(color, 0.04) }}>
          <td colSpan={6} className="px-5 py-3">
            <Windows s={s} />
            <div className="mt-2 text-[11px] space-y-0.5">{s.reasonsBull?.map((r, k) => <div key={'b' + k} className="text-green">✔ {r}</div>)}{s.reasonsBear?.map((r, k) => <div key={'r' + k} className="text-red">✘ {r}</div>)}</div>
            <button onClick={copy} className="mt-2 mono text-[11px] px-3 py-1.5 rounded-lg text-white" style={{ background: color }}>{copied ? '✓ Copied caption' : '📋 Copy social post'}</button>
            <div className="text-[10px] text-txt-muted mt-1">⚠️ Astrology has no proven market edge — tradition/educational. Pair with structure + volume + risk.</div>
          </td>
        </tr>
      )}
    </>
  )
}
function AssetBiasCard({ s, color }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = e => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const tcls = biasToneCls(s.biasTone)
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3 elev" style={{ borderLeft: `4px solid ${color}` }} onClick={() => setOpen(o => !o)}>
      <div className="flex items-center gap-2">
        <span className="mono text-sm font-bold text-txt">{s.name}</span>
        <span className={`ml-auto mono text-sm font-bold ${tcls}`}>{s.score > 0 ? '+' : ''}{s.score}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5"><span className={`mono text-[11px] font-bold ${tcls}`}>{s.label}</span><span className="mono text-[10px] text-green ml-auto">▲{s.bullCount}</span><span className="mono text-[10px] text-red">▼{s.bearCount}</span></div>
      <div className={`mono text-[10px] mt-1 ${s.navaBad ? 'text-red' : 'text-txt-muted'}`}>Nava Tara: {s.navaTara}</div>
      {open && <div className="mt-2 pt-2 border-t border-border"><Windows s={s} /></div>}
      <button onClick={copy} className="w-full mt-2.5 mono text-[11px] py-2 rounded-lg text-white" style={{ background: color }}>{copied ? '✓ Copied' : '📋 Copy social post'}</button>
    </div>
  )
}
const convCls = c => c === 'High' ? 'text-green' : c === 'Medium' ? 'text-yellow' : 'text-txt-sec'
function VedicTable({ signals, color }) {
  const [open, setOpen] = useState(-1)
  return (
    <>
      {/* desktop */}
      <table className="hidden md:table w-full mono text-xs border-collapse">
        <thead>
          <tr className="text-txt-sec text-[10px] uppercase tracking-wide" style={{ background: tint(color, 0.06) }}>
            {['Market', 'Method', 'View', 'Conviction', 'Best entry (IST)', 'Avoid', 'Favoured days ahead', ''].map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {signals.map((s, i) => (
            <AstroRow key={i} s={s} i={i} color={color} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </tbody>
      </table>
      {/* mobile */}
      <div className="md:hidden p-3 space-y-2.5">
        {signals.map((s, i) => <AstroCard key={i} s={s} color={color} />)}
      </div>
    </>
  )
}
function AstroRow({ s, i, color, open, onToggle }) {
  const [copied, setCopied] = useState(false)
  const copy = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <>
      <tr onClick={onToggle} className="border-b border-border hover:bg-bg-card cursor-pointer">
        <td className="px-3 py-2 font-bold text-txt">{s.symbol}<span className="ml-1 text-txt-muted">{open ? '▾' : '▸'}</span></td>
        <td className="px-3 py-2">{s.method}</td>
        <td className={`px-3 py-2 font-bold ${biasToneCls(s.biasTone)}`}>{s.bias}</td>
        <td className={`px-3 py-2 font-bold ${convCls(s.conviction)}`}>{s.conviction}</td>
        <td className="px-3 py-2 text-green">{s.entryWindow}</td>
        <td className="px-3 py-2 text-red">{s.avoidWindow}</td>
        <td className="px-3 py-2 text-txt-sec">{(s.expectDates || []).join(', ') || '—'}</td>
        <td className="px-3 py-2"><button onClick={copy} className="px-2 py-1 rounded text-white text-[10px]" style={{ background: color }}>{copied ? '✓' : '📋'}</button></td>
      </tr>
      {open && (
        <tr className="border-b border-border" style={{ background: tint(color, 0.04) }}>
          <td colSpan={8} className="px-5 py-3">
            <div className="mono text-[11px] text-txt mb-1"><b>Trade:</b> {s.trade}</div>
            <div className="mono text-[11px] text-txt-sec mb-2"><b>What to expect:</b> {s.expect}</div>
            <div className="mono text-[11px] text-txt-sec mb-2">{s.reason}</div>
            {s.lines && <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 mb-1">{s.lines.map((l, k) => <div key={k} className="flex justify-between mono text-[10px]"><span className="text-txt-muted">{l.k}</span><span className="text-txt-sec ml-2">{l.v}</span></div>)}</div>}
            <div className="mono text-[10px] text-txt-muted mt-1">⚠️ Astrology has no proven market edge — shown as tradition. Pair with structure + volume + risk.</div>
          </td>
        </tr>
      )}
    </>
  )
}
function AstroCard({ s, color }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3 elev" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center gap-2">
        <span className="mono text-sm font-bold text-txt">{s.symbol}</span>
        <span className="mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: tint(color, 0.12), color }}>{s.method}</span>
        <span className={`ml-auto mono text-[11px] font-bold ${biasToneCls(s.biasTone)}`}>{s.bias}</span>
      </div>
      <div className="mono text-[11px] text-txt-sec mt-1.5">{s.expect}</div>
      <div className="mt-2 space-y-1 mono text-[10px]">
        <div className="flex justify-between"><span className="text-txt-muted">Conviction</span><span className={`font-bold ${convCls(s.conviction)}`}>{s.conviction}</span></div>
        <div className="flex justify-between"><span className="text-txt-muted">Enter (IST)</span><span className="text-green text-right ml-2">{s.entryWindow}</span></div>
        <div className="flex justify-between"><span className="text-txt-muted">Avoid</span><span className="text-red">{s.avoidWindow}</span></div>
        <div className="flex justify-between"><span className="text-txt-muted">Favoured days</span><span className="text-txt-sec text-right ml-2">{(s.expectDates || []).join(', ') || '—'}</span></div>
      </div>
      <button onClick={copy} className="w-full mt-2.5 mono text-[11px] py-2 rounded-lg text-white" style={{ background: color }}>{copied ? '✓ Copied' : '📋 Copy social post'}</button>
    </div>
  )
}

// ── Hora tab: clear intraday timing schedule (when to enter / avoid) ──
function HoraTable({ signals, color }) {
  return (
    <div className="p-3 sm:p-4 space-y-2 max-w-3xl">
      {signals.map((r, i) => {
        const tcls = r.stanceTone === 'up' ? 'text-green' : r.stanceTone === 'down' ? 'text-red' : 'text-yellow'
        const bg = r.stanceTone === 'up' ? tint('#0E9F6E', 0.06) : r.rahu ? tint('#E02424', 0.07) : 'transparent'
        return (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-2.5 elev" style={{ background: bg, borderLeft: `4px solid ${r.stanceTone === 'up' ? '#0E9F6E' : r.stanceTone === 'down' ? '#E02424' : color}` }}>
            <div className="mono text-sm font-bold text-txt w-28 shrink-0">{r.time}</div>
            <div className="mono text-xs text-txt-sec w-20 shrink-0">{r.lord}</div>
            <div className={`mono text-xs font-bold w-32 shrink-0 ${tcls}`}>{r.stance}</div>
            <div className="mono text-[11px] text-txt-sec flex-1">{r.note}</div>
          </div>
        )
      })}
      <div className="mono text-[10px] text-txt-muted pt-1">All times IST · NSE session 09:15–15:30. Planetary-hour (hora) tradition — timing aid only, no proven edge.</div>
    </div>
  )
}

// Learning (self-improvement log) + News modal
function InsightModal({ kind, onClose }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    const f = kind === 'learning' ? '/learning.json' : '/news.json'
    fetch(f + '?t=' + Date.now()).then(r => r.ok ? r.json() : Promise.reject(new Error('not generated yet'))).then(setData).catch(e => setErr(e.message))
  }, [kind])
  return (
    <div className="fixed inset-0 z-[90] bg-black/30 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-bg-panel rounded-xl border border-border elev-lg w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center px-4 py-3 border-b border-border">
          <div className="mono text-sm font-bold text-txt">{kind === 'learning' ? '🧠 Self-improvement log' : '📰 Market news'}</div>
          <button onClick={onClose} className="ml-auto mono text-txt-muted hover:text-txt">✕</button>
        </div>
        <div className="p-4 max-h-[75vh] overflow-y-auto">
          {err && <div className="mono text-xs text-yellow">{err} — runs with the daily scan.</div>}
          {!data && !err && <div className="mono text-xs text-txt-sec">Loading…</div>}
          {data && kind === 'learning' && <LearningBody d={data} />}
          {data && kind === 'news' && <NewsBody d={data} />}
        </div>
      </div>
    </div>
  )
}
function LearningBody({ d }) {
  return (
    <div className="mono text-xs space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat k="≥5% movers" v={d.moversChecked} />
        <Stat k="Caught" v={`${d.caught} (${d.catchRate ?? '–'}%)`} tone="text-green" />
        <Stat k="Missed" v={d.missed} tone="text-red" />
      </div>
      <div className="text-[11px] text-txt-sec">{d.note}</div>
      {d.adjustments?.length > 0 && <div><div className="text-[10px] uppercase text-txt-muted mb-1">Auto-tuning applied</div>{d.adjustments.map((a, i) => <div key={i} className="text-[11px] text-cyan">• {a}</div>)}</div>}
      {d.reasonTally?.length > 0 && <div><div className="text-[10px] uppercase text-txt-muted mb-1">Why moves were missed</div>{d.reasonTally.map((r, i) => <div key={i} className="flex justify-between text-[11px]"><span className="text-txt-sec">{r.reason}</span><span className="text-txt-muted">×{r.count}</span></div>)}</div>}
      {d.misses?.length > 0 && <div><div className="text-[10px] uppercase text-txt-muted mb-1">Missed movers</div>{d.misses.slice(0, 15).map((m, i) => <div key={i} className="border-b border-border/50 py-1"><span className="font-bold text-txt">{m.symbol}</span> <span className="text-green">+{m.changePct}%</span><div className="text-[10px] text-txt-muted">{m.reasons.join(' · ')}</div></div>)}</div>}
      <div className="text-[10px] text-txt-muted border-t border-border pt-2">Sources: {(d.sources || []).join(' · ')}<br />{d.externalNote}</div>
    </div>
  )
}
function NewsBody({ d }) {
  return (
    <div className="space-y-2">
      {(d.items || []).map((it, i) => (
        <a key={i} href={it.link} target="_blank" rel="noreferrer" className="block rounded-lg border border-border p-2.5 hover:border-accent card-hover">
          <div className="mono text-[12px] text-txt leading-snug">{it.title}</div>
          <div className="mono text-[10px] text-txt-muted mt-1 flex gap-2 flex-wrap">
            <span className="text-accent">{it.source}</span>
            {it.symbols?.map(s => <span key={s} className="px-1.5 rounded bg-bg-card text-txt-sec">{s}</span>)}
          </div>
        </a>
      ))}
      <div className="mono text-[10px] text-txt-muted pt-1">Top market-news sources (RSS). X/Twitter handles need the paid X API — RSS is the auth-free equivalent.</div>
    </div>
  )
}
function Stat({ k, v, tone }) {
  return <div className="rounded-lg border border-border bg-bg-card p-2"><div className="text-[9px] uppercase text-txt-muted">{k}</div><div className={`text-sm font-bold ${tone || 'text-txt'}`}>{v}</div></div>
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
