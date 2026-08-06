import { useEffect, useState, useMemo } from 'react'
import { useViewStore } from '../../store/viewStore'
import { useChartStore } from '../../store/chartStore'
import { useHitAlerts } from '../../store/hitAlerts'
import { useLiveLtp } from '../../store/liveLtp'
import { useNewFlags, useIsNew, isFresh } from '../../store/newFlags'
import Ltp from './Ltp'
import HitPopups from '../Alerts/HitPopups'

// short tab labels so the nav bar wraps cleanly instead of scrolling
const SHORT = {
  confluence: '⭐ Top Picks', fno: '📊 F&O', momentum: '🚀 Momentum', reversal: '🔄 Reversal', us_stocks: '🇺🇸 US Stocks',
  us_index: '🇺🇸 US Idx', vol_accum: '📈 Volume', vp_fib: '📐 VP·Fib·VWAP', money_flow: '💧 Money Flow',
  multibagger: '💎 Multibagger', harmonic: '🔺 Harmonic', vedic_astro: '🔯 Vedic + Hora', astro_timing: '🕐 Hora',
  option_buildup: '🎯 Desk', gex: '🧲 Gamma Map',
}
const sigKey = (s, gid) => (s.generator || gid) + ':' + (s.symbol || s.underlying)
// search + sort applied to any tab's signals
const SORTS = {
  default: null,
  strength: (a, b) => (b._momScore ?? b.confluenceScore ?? b.confidence ?? b.moveScore ?? 0) - (a._momScore ?? a.confluenceScore ?? a.confidence ?? a.moveScore ?? 0),
  change: (a, b) => (b.changePct ?? -1e9) - (a.changePct ?? -1e9),
  rr: (a, b) => (b.rr ?? 0) - (a.rr ?? 0),
  symbol: (a, b) => String(a.symbol || a.underlying || '').localeCompare(String(b.symbol || b.underlying || '')),
}
// column-header sorting for any table
const ACC = {
  symbol: r => r.symbol || r.underlying || '', ltp: r => r.ltp ?? r.spot, entry: r => r.entry, sl: r => r.sl,
  t1: r => r.targets?.[0]?.price, t2: r => r.targets?.[1]?.price, t3: r => r.targets?.[2]?.price,
  conf: r => r.confidence ?? r.moveScore ?? 0, rr: r => r.rr, change: r => r.changePct, grade: r => r.grade || '',
  spot: r => r.spot ?? r.ltp, lot: r => r.lot, delivery: r => r.delivery,
}
function useSortable(rows, initialKey = null) {
  const [key, setKey] = useState(initialKey)
  const [dir, setDir] = useState('desc')
  const toggle = k => { if (key === k) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setKey(k); setDir('desc') } }
  const sorted = useMemo(() => {
    if (!key) return rows
    const g = ACC[key] || (r => r[key])
    return [...rows].sort((a, b) => { const av = g(a), bv = g(b); let c; if (typeof av === 'string' || typeof bv === 'string') c = String(av || '').localeCompare(String(bv || '')); else c = (av ?? -Infinity) - (bv ?? -Infinity); return dir === 'asc' ? c : -c })
  }, [rows, key, dir])
  return { sorted, key, dir, toggle }
}
function Sth({ label, k, s, cls = '' }) {
  const active = s.key === k
  return <th onClick={() => s.toggle(k)} className={`${cls} cursor-pointer select-none hover:text-txt`} title="Click to sort">{label}<span className="text-[8px] opacity-60">{active ? (s.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span></th>
}

function applyView(signals, q, sortBy) {
  let r = signals || []
  if (q && q.trim()) { const s = q.trim().toLowerCase(); r = r.filter(x => (`${x.symbol || ''} ${x.underlying || ''} ${x.name || ''} ${x.sector || ''}`).toLowerCase().includes(s)) }
  const cmp = SORTS[sortBy]
  if (cmp) r = [...r].sort(cmp)
  return r
}
// board date, set once per render so NewTag can flag anything generated TODAY (server-authoritative,
// works all day) — not just the fragile 2h client-side "seen since last visit" window.
let BOARD_DATE = null
const isNewSig = (s, gid, flags) => (!!s?.openedAt && s.openedAt === BOARD_DATE) || isFresh(flags?.[sigKey(s, gid)])
function NewTag({ s, gid }) {
  const clientNew = useIsNew(sigKey(s, gid))
  const serverNew = !!s?.openedAt && s.openedAt === BOARD_DATE
  if (!serverNew && !clientNew) return null
  return <span className="ml-1 mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-green text-white align-middle">NEW</span>
}

const confColor = c => c >= 80 ? 'text-green' : c >= 65 ? 'text-cyan' : c >= 50 ? 'text-yellow' : 'text-txt-sec'
const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` }
const isTrade = s => s && s.entry != null && Array.isArray(s.targets) && !s.isAstro && !s.isOption && !s.placeholder

export default function SignalsBoard() {
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState(0)
  const [modal, setModal] = useState(null)
  const [tf, setTf] = useState('daily')
  const [scanMsg, setScanMsg] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('default')
  const setView = useViewStore(s => s.setView)

  const scanNow = async () => {
    if (scanning) return
    setScanning(true); setScanMsg('Starting scan…')
    try {
      const r = await fetch('/api/scan?tf=' + tf, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      setScanMsg(r.ok && j.ok ? '✓ Scan started — board auto-refreshes in a few minutes' : '⚠ ' + (j.error || 'Could not start scan'))
    } catch (e) { setScanMsg('⚠ ' + e.message) }
    setScanning(false)
    setTimeout(() => setScanMsg(null), 9000)
  }
  const alertsOn = useHitAlerts(s => s.enabled)
  const enableAlerts = useHitAlerts(s => s.enable)
  const disableAlerts = useHitAlerts(s => s.disable)
  const startAlerts = useHitAlerts(s => s.start)

  const file = tf === 'daily' ? '/board.json' : `/board-${tf}.json`
  const load = () => {
    setLoading(true); setErr(null)
    fetch(file + '?t=' + Date.now(), { cache: 'no-store' })
      .then(async r => {
        const txt = await r.text()
        if (!r.ok || txt.trim().startsWith('<')) throw new Error(`No ${tf} board yet — it generates with the ${tf} scan. Refresh in a moment.`)
        try { return JSON.parse(txt) } catch { throw new Error('Board is updating — refresh in a moment.') }
      })
      .then(d => { setBoard(d); setLoading(false) })
      .catch(e => { setErr(e.message); setBoard(null); setLoading(false) })
  }
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [tf])
  useEffect(() => { if (alertsOn) startAlerts() }, [alertsOn, startAlerts])
  // live LTP ticker for the currently-viewed tab's symbols (market hours only)
  const startLive = useLiveLtp(s => s.start)
  const liveOn = useLiveLtp(s => s.live)
  const gens = board?.generators || []
  // Hora is folded into the Vedic tab → not its own tab
  const tabs = gens.filter(g => g.id !== 'astro_timing')
  const horaGen = gens.find(g => g.id === 'astro_timing')
  useEffect(() => {
    const sigs = tabs[tab]?.signals || []
    const syms = [...new Set(sigs.map(s => s.symbol || s.underlying).filter(Boolean))]
    if (syms.length) startLive(syms)
  }, [board, tab, startLive])

  const total = gens.reduce((a, g) => a + g.count, 0)
  // track NEW signals across all tabs (badge + header count)
  BOARD_DATE = board?.date || BOARD_DATE
  const ingest = useNewFlags(s => s.ingest)
  const flags = useNewFlags(s => s.flags)
  const allKeys = gens.flatMap(g => (g.signals || []).map(s => sigKey(s, g.id)))
  useEffect(() => { if (gens.length) ingest(allKeys) }, [board])
  const newCount = gens.reduce((n, g) => n + (g.signals || []).filter(s => isNewSig(s, g.id, flags)).length, 0)
  const newPerTab = tabs.map(g => (g.signals || []).filter(s => isNewSig(s, g.id, flags)).length)
  const active = tabs[tab] || tabs[0]
  const rows = applyView(active?.signals, search, sortBy)
  const tr = board?.trackRecord
  const o = tr?.overall
  const topId = tr?.topGenerator?.id           // most-accurate tab (measured, reliable sample)
  const topWin = tr?.topGenerator?.winRate
  const genTR = tr?.generators?.[active?.id]
  const goal = board?.goal
  const regime = board?.regime

  return (
    <div className="h-full flex flex-col bg-bg-base text-txt overflow-hidden">
      <HitPopups />
      {/* header */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 border-b border-border bg-bg-panel flex items-center gap-2 sm:gap-4 flex-wrap elev">
        <div>
          <div className="mono text-base sm:text-lg font-bold brand-grad tracking-tight">◆ ProTrader Signal Board</div>
          <div className="mono text-[10px] sm:text-[11px] text-txt-sec">
            {total} signals · {gens.length} generators{board?.date ? ` · ${board.date}` : ''} · {liveOn ? <span className="text-green font-bold">● LTP live</span> : <span className="text-txt-muted">○ prices at scan</span>}{newCount > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-green text-white font-bold text-[10px]">🟢 {newCount} NEW</span>}
            {o && <span className="ml-2 text-txt-muted">📊 {o.decided ? <>track record <b className={o.winRate >= 80 ? 'text-green' : 'text-txt'}>{o.winRate}%</b> ({o.win}/{o.decided}) · {o.open} open</> : <>{o.open} open · accuracy builds as trades close</>}</span>}
          </div>
          {goal && (
            <div className="mono text-[10px] mt-1">
              <span className="px-2 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(90deg,#2962FF,#7C3AED)' }}>🎯 Goal {goal.target}% by {goal.deadline} · {goal.daysLeft}d left</span>
              <span className="ml-2 text-txt-sec">now <b className={goal.reliable && goal.current >= goal.target ? 'text-green' : 'text-txt-sec'}>{goal.current != null ? goal.current + '%' : '—'}</b>{goal.decided ? ` (${goal.decided} closed${goal.reliable ? '' : ' — building'})` : ''} · {goal.status}</span>
            </div>
          )}
          {regime?.available && (
            <div className="mono text-[10px] mt-1" title={(regime.reasons || []).join(' · ')}>
              <span className="px-2 py-0.5 rounded-full text-white font-bold" style={{ background: regime.bias === 'bearish' ? '#F23645' : regime.bias === 'bullish' ? '#0E9F6E' : '#8896a6' }}>
                {regime.bias === 'bearish' ? '🔻' : regime.bias === 'bullish' ? '🔺' : '⏸'} MARKET REGIME: {regime.bias.toUpperCase()}
              </span>
              <span className="ml-2 text-txt-sec">{regime.reasons?.[0]}{regime.fii?.futIdxNet != null ? ` · FII idx-fut net ${regime.fii.futIdxNet > 0 ? '+' : ''}${Math.round(regime.fii.futIdxNet / 1000)}k` : ''}</span>
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          {scanMsg && <span className="mono text-[10px] text-txt-sec w-full sm:w-auto text-right">{scanMsg}</span>}
          <button onClick={() => setView('journal')} title="Trading Journal — ₹10L paper portfolio & performance"
            className="mono text-[11px] px-3 py-1.5 rounded-lg text-white font-bold card-hover" style={{ background: 'linear-gradient(90deg,#0E9F6E,#2962FF)' }}>
            📓 Trading Journal
          </button>
          <button onClick={load} className="mono text-xs text-txt-sec hover:text-accent">⟳</button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[['daily', 'Daily'], ['weekly', 'Weekly'], ['intraday', 'Intraday']].map(([k, lbl]) => (
              <button key={k} onClick={() => { setTf(k); setTab(0) }}
                className={`mono text-[11px] px-2.5 py-1.5 ${tf === k ? 'text-white' : 'text-txt-sec hover:text-txt'}`}
                style={tf === k ? { background: 'linear-gradient(90deg,#2962FF,#7C3AED)' } : {}}>{lbl}</button>
            ))}
          </div>
          <button onClick={scanNow} disabled={scanning} title="Run a fresh scan now"
            className="mono text-[11px] px-3 py-1.5 rounded-lg border border-green text-green hover:bg-green/10 card-hover disabled:opacity-50 font-bold">
            {scanning ? '⏳ Scanning…' : '🔄 ScanNow'}
          </button>
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

      {/* nav tabs — short labels, single row (scrolls sideways if needed) */}
      <div className="shrink-0 flex gap-1 px-3 pt-2 bg-bg-panel border-b border-border overflow-x-auto whitespace-nowrap">
        {tabs.map((g, i) => {
          const on = i === tab
          return (
            <button key={g.id} onClick={() => setTab(i)} title={g.label}
              className="mono text-[11px] whitespace-nowrap px-2.5 py-1.5 rounded-t-lg border-b-2 transition-colors"
              style={on
                ? { color: g.color, borderBottomColor: g.color, background: tint(g.color, 0.10), fontWeight: 700 }
                : { color: 'var(--color-txt-sec)', borderBottomColor: 'transparent' }}>
              {SHORT[g.id] || g.label}
              <span className="ml-1 px-1.5 rounded-full text-[10px]" style={on ? { background: g.color, color: '#fff' } : { background: 'var(--color-bg-card)', color: 'var(--color-txt-muted)' }}>{g.count}</span>
              {newPerTab[i] > 0 && <span className="ml-1 px-1 rounded-full text-[9px] font-bold bg-green text-white">+{newPerTab[i]}</span>}
              {g.id === topId && <span className="ml-1 px-1 rounded-full text-[9px] font-bold text-white" style={{ background: '#FF6D00' }} title={`Highest measured accuracy: ${topWin}%`}>★{topWin}%</span>}
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
          {/* search + sort — applies to the active tab */}
          <div className="px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-bg-panel">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search symbol / name…"
              className="mono text-xs px-3 py-1.5 rounded-lg bg-bg-card border border-border focus:border-accent outline-none w-44" />
            <span className="mono text-[10px] text-txt-muted">Sort:</span>
            {[['default', 'Default'], ['strength', 'Strength'], ['change', 'Change %'], ['rr', 'R:R'], ['symbol', 'A–Z']].map(([k, lbl]) => (
              <button key={k} onClick={() => setSortBy(k)} className={`mono text-[10px] px-2 py-1 rounded ${sortBy === k ? 'text-white font-bold' : 'text-txt-sec bg-bg-card'}`} style={sortBy === k ? { background: active.color } : {}}>{lbl}</button>
            ))}
            {(search || sortBy !== 'default') && <span className="mono text-[10px] text-txt-muted">· {rows.length} shown</span>}
          </div>
          {rows.length === 0
            ? <div className="p-8 mono text-sm text-txt-muted text-center">{search ? `No matches for "${search}" in this tab.` : 'No signals in this generator today.'}</div>
            : active.id === 'fno'
              ? <FnoTable signals={rows} color={active.color} setView={setView} />
            : active.id === 'confluence'
              ? <ConfluenceTable signals={rows} color={active.color} setView={setView} />
            : active.id === 'vedic_astro'
              ? <><AssetBiasTable signals={rows} color={active.color} />
                  {horaGen?.signals?.length > 0 && <><div className="px-5 pt-4 pb-1 mono text-xs font-bold" style={{ color: active.color }}>🕐 Hora & Rahu-Kaal Timing</div><HoraTable signals={horaGen.signals} color={active.color} /></>}</>
              : active.id === 'gex'
              ? <div className="grid gap-3 p-4 md:grid-cols-2">{rows.map((s, i) => <GexCard key={s.symbol + i} s={s} color={active.color} setView={setView} />)}</div>
            : active.id === 'astro_timing'
                ? <HoraTable signals={rows} color={active.color} />
                : isTrade(rows[0])
                  ? <>
                      <div className="hidden md:block"><TradeTable signals={rows} color={active.color} setView={setView} /></div>
                      <div className="md:hidden"><TradeCards signals={rows} color={active.color} setView={setView} /></div>
                    </>
                  : <InfoList signals={rows} color={active.color} setView={setView} />}
        </div>
      )}
    </div>
  )
}

function TradeTable({ signals, color, setView }) {
  const [open, setOpen] = useState(-1)
  const s = useSortable(signals)
  const rows = s.sorted
  const L = 'px-3 py-2 font-semibold text-left', R = 'px-3 py-2 font-semibold text-right'
  return (
    <table className="w-full mono text-xs border-collapse">
      <thead>
        <tr className="text-txt-sec text-[10px] uppercase tracking-wide" style={{ background: tint(color, 0.06) }}>
          <Sth label="Symbol" k="symbol" s={s} cls={L} />
          <th className={L}>Signal</th>
          <Sth label="LTP" k="ltp" s={s} cls={R} />
          <Sth label="Entry" k="entry" s={s} cls={R} />
          <Sth label="Stop" k="sl" s={s} cls={R} />
          <Sth label="T1" k="t1" s={s} cls={R} />
          <Sth label="T2" k="t2" s={s} cls={R} />
          <Sth label="T3" k="t3" s={s} cls={R} />
          <Sth label="Conf" k="conf" s={s} cls={R} />
          <th className={R}></th>
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
        <td className="px-3 py-2 font-bold text-txt">{s.symbol}<NewTag s={s} />
          {s.movingNow && <span className="ml-1 px-1.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#F59E0B' }}>🚀 MOVING</span>}
          {s.footprint && !s.footprint.weak && <span className="ml-1 px-1.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#0E9F6E' }} title={s.footprint.flags?.join(' · ')}>🕵️ FOOTPRINT {s.footprint.score}</span>}
          {s.news && <span className="ml-1 px-1.5 rounded-full text-[10px] font-bold text-white bg-accent-primary" title={`${s.news}${s.newsSource ? ' — ' + s.newsSource : ''}`}>📰 NEWS</span>}
          <span className="ml-1 text-txt-muted">{open ? '▾' : '▸'}</span></td>
        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${isBuy ? 'bg-green' : 'bg-red'}`}>{isBuy ? 'BUY' : 'SELL'}</span></td>
        <td className="px-3 py-2 text-right text-txt-sec"><Ltp symbol={s.symbol} base={s.ltp} /></td>
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
            {s.footprint && !s.footprint.weak && (
              <div className="mb-2 p-2 rounded-lg" style={{ background: tint('#0E9F6E', 0.08) }}>
                <div className="text-[10px] font-bold text-green uppercase">🕵️ Smart-Money Footprint · {s.footprint.score}/100{s.rs?.leader ? ' · RS leader vs NIFTY' : ''}</div>
                <ul className="text-[11px] text-txt-sec mt-0.5 list-disc list-inside">{s.footprint.flags?.map((f, k) => <li key={k}>{f}</li>)}</ul>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
              <Field label="Entry" value={`${s.ccy || '₹'}${s.entry}`} />
              <Field label="Stop loss" value={`${s.ccy || '₹'}${s.sl} (${s.slPct}%)`} tone="text-red" />
              <Field label="R:R" value={`1:${s.rr}`} />
              {s.delivery != null
                ? <Field label="NSE Delivery" value={`${s.delivery}%`} tone={s.delivery >= 60 ? 'text-green' : 'text-txt-sec'} />
                : <Field label={s.accuracy != null ? `Backtested (n=${s.backtestTrades})` : 'Setup score'} value={s.accuracy != null ? `~${s.accuracy}%` : `${s.confidence}/100`} tone="text-cyan" />}
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {t.map((x, k) => <Field key={k} label={`Target ${k + 1} · by ${x.by}`} value={`${s.ccy || '₹'}${x.price} (+${x.pct}%)`} tone="text-green" />)}
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

// ── 📊 Futures & Options: index / commodity / stock F&O setups with lot + options play ──
const dirCls = t => t === 'up' ? 'bg-green' : t === 'down' ? 'bg-red' : 'bg-yellow'
function FnoTable({ signals, color, setView }) {
  const [open, setOpen] = useState(0)
  const s = useSortable(signals)
  const rows = s.sorted
  if (!rows.length) return <div className="p-8 mono text-sm text-txt-muted text-center">No F&O setups right now — appears with the scan.</div>
  const H = 'px-3 py-2 text-left font-semibold'
  return (
    <>
      <table className="hidden md:table w-full mono text-xs border-collapse">
        <thead><tr className="text-txt-sec text-[10px] uppercase tracking-wide" style={{ background: tint(color, 0.06) }}>
          <Sth label="Underlying" k="symbol" s={s} cls={H} />
          <th className={H}>Type</th>
          <th className={H}>Signal</th>
          <Sth label="Spot/LTP" k="spot" s={s} cls={H} />
          <Sth label="Lot" k="lot" s={s} cls={H} />
          <th className={H}>Suggested options play</th>
          <th className={H}></th>
        </tr></thead>
        <tbody>{rows.map((s, i) => <FnoRow key={s.underlying + i} s={s} color={color} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} setView={setView} />)}</tbody>
      </table>
      <div className="md:hidden p-3 space-y-2.5">{rows.map((s, i) => <FnoCard key={s.underlying + i} s={s} color={color} />)}</div>
    </>
  )
}
function FnoDetail({ s }) {
  return (
    <>
      <div className="text-txt-sec text-[11px] mb-2">{s.reason}</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className="mono text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: '#7C3AED' }}>👉 {s.optionPlay}</span>
        {s.futures && <span className="mono text-[10px] px-2 py-0.5 rounded-full bg-bg-panel border border-border text-txt-sec">{s.futures}</span>}
        {s.grade && <span className="mono text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: gradeBg(s.grade) }}>{s.grade}</span>}
        {s.delivery != null && <span className="mono text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: s.delivery >= 60 ? '#0E9F6E' : '#9AA7BC' }}>📦 Deliv {s.delivery}%</span>}
      </div>
      {s.kind === 'Index' && <div className="grid grid-cols-3 gap-2 mb-1">
        <Field label="PCR" value={s.pcr} /><Field label="Support" value={s.support} tone="text-green" /><Field label="Resistance" value={s.resistance} tone="text-red" />
      </div>}
      {Array.isArray(s.targets) && <div className="grid grid-cols-3 gap-2 mt-1">
        <Field label="Entry" value={`₹${s.entry}`} /><Field label="Stop" value={`₹${s.sl} (${s.slPct}%)`} tone="text-red" /><Field label="R:R" value={`1:${s.rr}`} />
      </div>}
      {Array.isArray(s.targets) && <div className="grid grid-cols-3 gap-2 mt-1">{s.targets.map((t, k) => <Field key={k} label={`T${k + 1} · ${t.by}`} value={`₹${t.price} (+${t.pct}%)`} tone="text-green" />)}</div>}
    </>
  )
}
function FnoRow({ s, color, open, onToggle }) {
  const [copied, setCopied] = useState(false)
  const copy = e => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <>
      <tr onClick={onToggle} className="border-b border-border hover:bg-bg-card cursor-pointer">
        <td className="px-3 py-2 font-bold text-txt">{s.underlying}<NewTag s={s} /><span className="ml-1 text-txt-muted">{open ? '▾' : '▸'}</span></td>
        <td className="px-3 py-2 text-txt-sec">{s.kind}</td>
        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${dirCls(s.dirTone)}`}>{s.direction}</span></td>
        <td className="px-3 py-2 text-right text-txt-sec"><Ltp symbol={s.underlying} base={s.spot} /></td>
        <td className="px-3 py-2 text-txt-sec">{s.lot ?? '—'}</td>
        <td className="px-3 py-2 text-[11px]" style={{ color: '#7C3AED' }}>{s.optionPlay}</td>
        <td className="px-3 py-2"><button onClick={copy} className="px-2 py-1 rounded text-white text-[10px]" style={{ background: color }}>{copied ? '✓' : '📋'}</button></td>
      </tr>
      {open && <tr className="border-b border-border" style={{ background: tint(color, 0.04) }}><td colSpan={7} className="px-5 py-3"><FnoDetail s={s} /></td></tr>}
    </>
  )
}
function FnoCard({ s, color }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = e => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3 elev" style={{ borderLeft: `4px solid ${color}` }} onClick={() => setOpen(o => !o)}>
      <div className="flex items-center gap-2">
        <span className="mono text-sm font-bold text-txt">{s.underlying}</span><NewTag s={s} />
        <span className="mono text-[9px] px-1.5 py-0.5 rounded bg-bg-panel text-txt-sec">{s.kind}</span>
        <span className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${dirCls(s.dirTone)}`}>{s.direction}</span>
        <span className="ml-auto mono text-[10px] text-txt-sec">Lot {s.lot ?? '—'}</span>
      </div>
      <div className="mono text-[11px] mt-1.5" style={{ color: '#7C3AED' }}>👉 {s.optionPlay}</div>
      {open && <div className="mt-2 pt-2 border-t border-border"><FnoDetail s={s} /></div>}
      <button onClick={copy} className="w-full mt-2.5 mono text-[11px] py-2 rounded-lg text-white" style={{ background: color }}>{copied ? '✓ Copied' : '📋 Copy F&O post'}</button>
    </div>
  )
}

// ── ⭐ Top Confluence Picks: multi-generator agreement + Vedic + trade plan ──
const gradeBg = g => g === 'A++' ? '#0E9F6E' : g === 'A+' ? '#0E7FA3' : '#2962FF'
function ConfluenceTable({ signals, color, setView }) {
  const [open, setOpen] = useState(0)
  const s = useSortable(signals)
  const rows = s.sorted
  if (!rows.length) return (
    <div className="p-8 mono text-sm text-txt-muted text-center max-w-xl mx-auto">
      No 2-generator confluence today — the market didn't give a high-conviction overlap.<br />The individual generator tabs still have setups. Confluence picks appear when ≥2 engines agree on the same stock.
    </div>
  )
  const L = 'px-3 py-2 font-semibold text-left', R = 'px-3 py-2 font-semibold text-right'
  return (
    <>
      <table className="hidden md:table w-full mono text-xs border-collapse">
        <thead><tr className="text-txt-sec text-[10px] uppercase tracking-wide" style={{ background: tint(color, 0.06) }}>
          <Sth label="Stock" k="symbol" s={s} cls={L} />
          <Sth label="Grade" k="grade" s={s} cls={L} />
          <th className={L}>Agree</th>
          <Sth label="LTP" k="ltp" s={s} cls={R} />
          <Sth label="Entry" k="entry" s={s} cls={R} />
          <Sth label="Stop" k="sl" s={s} cls={R} />
          <Sth label="T1" k="t1" s={s} cls={R} />
          <Sth label="Conf" k="conf" s={s} cls={R} />
          <th className={R}></th>
        </tr></thead>
        <tbody>{rows.map((s, i) => <ConfRow key={s.symbol + i} s={s} color={color} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} setView={setView} />)}</tbody>
      </table>
      <div className="md:hidden p-3 space-y-2.5">{rows.map((s, i) => <ConfCard key={s.symbol + i} s={s} setView={setView} />)}</div>
    </>
  )
}
function PlanGrid({ s }) {
  const p = s.plan || {}
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {s.generators?.map(g => <span key={g} className="mono text-[10px] px-2 py-0.5 rounded-full bg-bg-panel border border-border text-txt-sec">✓ {g}</span>)}
        {s.vedicAligned && <span className="mono text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: '#9333EA' }}>🔮 {s.vedicAsset} bias aligned</span>}
        {s.delivery != null && <span className="mono text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: s.strongDeliv ? '#0E9F6E' : '#9AA7BC' }}>📦 Delivery {s.delivery}%{s.strongDeliv ? ' · strong hands' : ''}</span>}
      </div>
      <div className="mono text-[10px] uppercase text-txt-muted mb-1">Trade plan · ₹{(p.capital || 0).toLocaleString('en-IN')} capital · {p.riskPct}% risk</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <Field label="Buy qty" value={`${p.shares} sh`} />
        <Field label="Deploy" value={`₹${(p.deploy || 0).toLocaleString('en-IN')}`} />
        <Field label="Risk (to SL)" value={`₹${(p.riskRs || 0).toLocaleString('en-IN')}`} tone="text-red" />
        <Field label="Reward (T1)" value={`₹${(p.rewardT1Rs || 0).toLocaleString('en-IN')}`} tone="text-green" />
      </div>
      <div className="grid grid-cols-3 gap-2">{s.targets.map((t, k) => <Field key={k} label={`T${k + 1} · by ${t.by}`} value={`₹${t.price} (+${t.pct}%)`} tone="text-green" />)}</div>
    </>
  )
}
function ConfRow({ s, color, open, onToggle, setView }) {
  const [copied, setCopied] = useState(false)
  const openSymbol = useChartStore(st => st.openSymbol)
  const copy = e => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const chart = e => { e.stopPropagation(); openSymbol('stocks', s.symbol + '.NS'); setView('chart') }
  return (
    <>
      <tr onClick={onToggle} className="border-b border-border hover:bg-bg-card cursor-pointer">
        <td className="px-3 py-2 font-bold text-txt">{s.symbol}<NewTag s={s} /><span className="ml-1 text-txt-muted">{open ? '▾' : '▸'}</span></td>
        <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-white text-[10px] font-bold" style={{ background: gradeBg(s.grade) }}>{s.grade}</span></td>
        <td className="px-3 py-2 text-accent font-bold">{s.genCount}×</td>
        <td className="px-3 py-2 text-right text-txt-sec"><Ltp symbol={s.symbol} base={s.ltp} /></td>
        <td className="px-3 py-2 text-right">{s.entry}</td>
        <td className="px-3 py-2 text-right text-red">{s.sl}</td>
        <td className="px-3 py-2 text-right text-green">{s.targets[0]?.price}</td>
        <td className={`px-3 py-2 text-right font-bold ${confColor(s.confidence)}`}>{s.confidence}%</td>
        <td className="px-3 py-2 text-right"><button onClick={copy} className="px-2 py-1 rounded text-white text-[10px]" style={{ background: color }}>{copied ? '✓' : '📋'}</button></td>
      </tr>
      {open && (
        <tr className="border-b border-border" style={{ background: tint(color, 0.04) }}>
          <td colSpan={9} className="px-5 py-3">
            <div className="text-txt-sec text-[11px] mb-2">{s.reason}</div>
            <PlanGrid s={s} />
            <div className="flex gap-2 mt-3">
              <button onClick={copy} className="mono text-[11px] px-3 py-1.5 rounded-lg text-white" style={{ background: color }}>{copied ? '✓ Copied' : '📋 Copy social post'}</button>
              <button onClick={chart} className="mono text-[11px] px-3 py-1.5 rounded-lg border border-border hover:border-accent">📈 Open chart</button>
            </div>
            <div className="mono text-[10px] text-txt-muted mt-2">{s.accuracy != null ? `Measured backtest ~${s.accuracy}% (n=${s.backtestTrades})` : `Setup score ${s.confidence}/100`} · R:R 1:{s.rr}. Not advice. Manage risk.</div>
          </td>
        </tr>
      )}
    </>
  )
}
function ConfCard({ s, setView }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = e => { e.stopPropagation(); navigator.clipboard?.writeText(s.social || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3 elev" style={{ borderLeft: `4px solid ${gradeBg(s.grade)}` }} onClick={() => setOpen(o => !o)}>
      <div className="flex items-center gap-2">
        <span className="mono text-base font-bold text-txt">{s.symbol}</span><NewTag s={s} />
        <span className="px-2 py-0.5 rounded text-white text-[10px] font-bold" style={{ background: gradeBg(s.grade) }}>{s.grade}</span>
        <span className="mono text-[10px] text-accent font-bold">{s.genCount}× agree</span>
        <span className={`ml-auto mono text-sm font-bold ${confColor(s.confidence)}`}>{s.confidence}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 mono text-[11px]">
        <div><div className="text-[9px] text-txt-muted uppercase">Entry</div><div className="font-bold">{s.entry}</div></div>
        <div><div className="text-[9px] text-txt-muted uppercase">Stop</div><div className="font-bold text-red">{s.sl}</div></div>
        <div><div className="text-[9px] text-txt-muted uppercase">Buy qty</div><div className="font-bold">{s.plan?.shares} sh</div></div>
      </div>
      {open && <div className="mt-2 pt-2 border-t border-border"><PlanGrid s={s} /></div>}
      <button onClick={copy} className="w-full mt-2.5 mono text-[11px] py-2 rounded-lg text-white" style={{ background: gradeBg(s.grade) }}>{copied ? '✓ Copied' : '📋 Copy social post'}</button>
    </div>
  )
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
        <span className="mono text-base font-bold text-txt">{s.symbol}</span><NewTag s={s} />
        <span className={`mono text-[10px] font-bold px-2 py-0.5 rounded text-white ${isBuy ? 'bg-green' : 'bg-red'}`}>{isBuy ? 'BUY' : 'SELL'}</span>
        <span className="ml-auto mono text-[11px] text-txt-sec">₹<Ltp symbol={s.symbol} base={s.ltp} /></span>
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
        <td className="px-3 py-2 font-bold text-txt">{s.symbol}<NewTag s={s} /><span className="ml-1 text-txt-muted">{open ? '▾' : '▸'}</span></td>
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
function Directional({ d, sym }) {
  const up = d.direction === 'BULLISH', down = d.direction === 'BEARISH'
  const bg = up ? 'rgba(14,159,110,0.12)' : down ? 'rgba(242,54,69,0.12)' : 'rgba(255,214,0,0.10)'
  const bd = up ? '#0E9F6E' : down ? '#F23645' : '#FFD600'
  return (
    <div className="mt-2 rounded-lg p-2" style={{ background: bg, border: `1px solid ${bd}` }}>
      <div className="flex items-center gap-2">
        <span className="mono text-xs font-bold" style={{ color: bd }}>{up ? '🔺 BULLISH' : down ? '🔻 BEARISH' : '⏸ NEUTRAL'}</span>
        {d.grade && <span className="mono text-[9px] px-1.5 rounded text-white" style={{ background: bd }}>{d.grade}</span>}
        <span className="mono text-[10px] text-txt-muted ml-auto">conviction {d.conviction}%</span>
      </div>
      <div className="mono text-[11px] font-bold text-txt mt-1">{d.optionPlay}</div>
      {d.direction !== 'NEUTRAL' && (
        <div className="grid grid-cols-4 gap-1 mt-1.5 mono text-[10px]">
          <div><div className="text-txt-muted">Entry</div><div className="text-txt font-bold">{d.entry}</div></div>
          <div><div className="text-txt-muted">Stop</div><div className="text-red font-bold">{d.sl}</div></div>
          <div><div className="text-txt-muted">T1 / T2</div><div className="text-green font-bold">{d.targets?.[0]} / {d.targets?.[1]}</div></div>
          <div><div className="text-txt-muted">T3</div><div className="text-green font-bold">{d.targets?.[2]}</div></div>
        </div>
      )}
      {d.reasons?.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 mono text-[10px] text-txt-sec list-disc list-inside">
          {d.reasons.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      {d.note && <div className="mono text-[9px] text-txt-muted mt-1 italic">{d.note}</div>}
    </div>
  )
}

function InfoList({ signals, color, setView }) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {signals.map((s, i) => <InfoCard key={s.symbol + (s.method || '') + i} s={s} color={color} setView={setView} />)}
    </div>
  )
}
const dirColor = d => /LONG|BULLISH/.test(d) ? '#0E9F6E' : /SHORT|BEARISH/.test(d) ? '#F23645' : '#8896a6'
// Gamma Exposure / dealer-positioning dashboard (SpotGamma-style): regime, walls, gamma flip,
// locked range, and per-strike dealer strength (support below / resistance above) — the levels
// price is drawn to or accelerates through, on ANY timeframe.
function GexPanel({ g }) {
  const neg = g.regime === 'NEG GAMMA'
  return (
    <div className="mt-2 rounded-lg p-2 border" style={{ background: 'rgba(124,58,237,0.08)', borderColor: '#7C3AED' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="mono text-[11px] font-bold" style={{ color: '#A78BFA' }}>🧲 GAMMA / DEALER MAP</span>
        <span className="mono text-[9px] px-1.5 rounded-full text-white font-bold" style={{ background: neg ? '#F23645' : '#0E9F6E' }}>{g.regime}{neg ? ' 🔴' : ' 🟢'}</span>
        <span className="mono text-[9px] px-1.5 rounded-full text-white" style={{ background: dirColor(g.bias) }}>{g.bias}</span>
        <span className="mono text-[9px] text-txt-muted ml-auto">exp {g.expiry} · PCR {g.pcr}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2 mono text-[10px]">
        <div><div className="text-txt-muted">Gamma Flip</div><div className="font-bold text-yellow">{g.gammaFlip}</div></div>
        <div><div className="text-txt-muted">Call Wall (res)</div><div className="font-bold text-red">{g.callWall}</div></div>
        <div><div className="text-txt-muted">Put Wall (sup)</div><div className="font-bold text-green">{g.putWall}</div></div>
        <div><div className="text-txt-muted">Locked Range</div><div className="font-bold text-txt">{g.lockedLow}–{g.lockedHigh}</div></div>
      </div>
      {/* per-strike dealer strength — green support below spot, red resistance above */}
      <div className="mt-2 space-y-0.5">
        {[...(g.strikes || [])].sort((a, b) => b.k - a.k).map((r, i) => {
          const res = r.role === 'RES'
          const above = r.k >= g.spot
          return (
            <div key={i} className="flex items-center gap-2">
              <span className={`mono text-[10px] w-14 text-right ${Math.abs(r.k - g.spot) < 25 ? 'font-bold text-cyan' : 'text-txt-sec'}`}>{r.k}{Math.abs(r.k - g.spot) < 25 ? ' ◄spot' : ''}</span>
              <div className="flex-1 h-2.5 rounded-sm bg-bg-base overflow-hidden">
                <div className="h-full rounded-sm" style={{ width: r.strength + '%', background: res ? '#F23645' : '#0E9F6E' }} />
              </div>
              <span className="mono text-[9px] w-8" style={{ color: res ? '#F23645' : '#0E9F6E' }}>{res ? 'RES' : 'SUP'}</span>
            </div>
          )
        })}
      </div>
      <div className="mono text-[9px] text-txt-muted mt-1.5 italic">{g.note}</div>
    </div>
  )
}
function GexCard({ s, color, setView }) {
  const openSymbol = useChartStore(st => st.openSymbol)
  const chart = () => { openSymbol('indices', s.symbol === 'NIFTY' ? '^NSEI' : '^NSEBANK'); setView('chart') }
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3 elev" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-2">
        <button onClick={chart} className="mono text-sm font-bold text-txt hover:text-accent">{s.symbol}</button>
        <span className="mono text-[10px] text-txt-muted">{s.name} · spot {s.spot}</span>
        <button onClick={chart} className="mono text-[10px] px-2 py-0.5 rounded border border-border hover:border-accent ml-auto">📈 Levels on chart</button>
      </div>
      {s.gex ? <GexPanel g={s.gex} /> : <div className="mono text-[11px] text-txt-muted mt-2">Gamma map builds from live option OI (market hours).</div>}
    </div>
  )
}
function DeskCard({ s, color, setView }) {
  const openSymbol = useChartStore(st => st.openSymbol)
  const m = s.mtf || {}
  const chart = () => { const sym = s.symbol === 'NIFTY' ? '^NSEI' : s.symbol === 'GOLD' ? 'GC=F' : s.symbol === 'BANKNIFTY' ? '^NSEBANK' : s.symbol + '.NS'; openSymbol(s.symbol === 'NIFTY' || s.symbol === 'GOLD' || s.symbol === 'BANKNIFTY' ? 'indices' : 'stocks', sym); setView('chart') }
  const d = s.directional
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3 elev" style={{ borderLeft: `3px solid ${dirColor(m.aligned || '')}` }}>
      <div className="flex items-center gap-2">
        <button onClick={chart} className="mono text-sm font-bold text-txt hover:text-accent">{s.symbol}</button>
        {s.kind && <span className="mono text-[9px] px-1.5 rounded" style={{ background: tint(color, 0.15), color }}>{s.kind}</span>}
        <span className="mono text-[10px] px-2 py-0.5 rounded-full text-white font-bold ml-auto" style={{ background: dirColor(m.aligned || '') }}>{m.aligned || '—'} ({m.longs}L/{m.shorts}S)</span>
      </div>
      {s.spot != null && <div className="mono text-[10px] text-txt-muted mt-0.5">{s.name} · spot {s.spot}</div>}

      {/* index: live option positioning + far-expiry accumulation */}
      {d && <Directional d={d} sym={s.symbol} />}
      {s.footprint && !s.footprint.weak && <div className="mt-1.5 mono text-[10px] text-green">🕵️ Footprint {s.footprint.score}: {s.footprint.flags?.[0]}</div>}

      {/* multi-timeframe confluence table */}
      {m.timeframes?.length > 0 && (
        <div className="mt-2 overflow-x-auto border-t border-border pt-1.5">
          <table className="w-full mono text-[10px] border-collapse">
            <thead><tr className="text-txt-muted uppercase">
              {['TF', 'Dir', 'Entry', 'SL', 'T1', 'T2', 'T3', 'By', 'R:R', 'Why'].map((h, i) => <th key={i} className={`px-1.5 py-1 ${[2, 3, 4, 5, 6, 8].includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {m.timeframes.map((r, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="px-1.5 py-1 font-bold">{r.tf}</td>
                  <td className="px-1.5 py-1 font-bold" style={{ color: dirColor(r.dir) }}>{r.dir === 'LONG' ? '▲' : r.dir === 'SHORT' ? '▼' : '–'} {r.dir}</td>
                  <td className="px-1.5 py-1 text-right">{r.entry}</td>
                  <td className="px-1.5 py-1 text-right text-red">{r.sl ?? '—'}</td>
                  <td className="px-1.5 py-1 text-right text-green">{r.targets?.[0] ?? '—'}</td>
                  <td className="px-1.5 py-1 text-right text-green">{r.targets?.[1] ?? '—'}</td>
                  <td className="px-1.5 py-1 text-right text-green">{r.targets?.[2] ?? '—'}</td>
                  <td className="px-1.5 py-1 text-txt-muted">{r.etaDates?.[0] ?? '—'}</td>
                  <td className="px-1.5 py-1 text-right">{r.rr ? '1:' + r.rr : '—'}</td>
                  <td className="px-1.5 py-1 text-txt-sec max-w-[180px] truncate" title={r.reason}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InfoCard({ s, color, setView }) {
  if (s.isDesk) return <DeskCard s={s} color={color} setView={setView} />
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
      {s.directional && <Directional d={s.directional} sym={s.symbol} />}
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
