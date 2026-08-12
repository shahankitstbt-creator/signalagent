import { useEffect, useState, useMemo } from 'react'
import { useViewStore } from '../../store/viewStore'
import { useChartStore } from '../../store/chartStore'
import { useHitAlerts } from '../../store/hitAlerts'
import { useLiveLtp } from '../../store/liveLtp'
import { useNewFlags, useIsNew, isFresh } from '../../store/newFlags'
import Ltp from './Ltp'
import HitPopups from '../Alerts/HitPopups'
import { getTheme, toggleTheme } from '../../store/theme'

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

// KPI hero — portfolio summary tiles (mockup layout). Each tile glows with its own accent.
function KpiTile({ label, value, sub, subTone, glow }) {
  return (
    <div className="kpi p-4 sm:p-[18px]" style={{ '--kpi-grad': `radial-gradient(160px 110px at 100% 0%, ${glow}, transparent 70%)` }}>
      <div className="mono text-[10.5px] uppercase tracking-wide text-txt-sec font-semibold">{label}</div>
      <div className="mono text-2xl sm:text-[27px] font-bold mt-2 leading-none">{value}</div>
      {sub && <div className={`mono text-[11.5px] font-semibold mt-2 ${subTone || 'text-txt-sec'}`}>{sub}</div>}
    </div>
  )
}
// compact INR: ₹1.23L / ₹45.6k (signed)
function inr(n) {
  if (n == null || isNaN(n)) return '—'
  const s = n < 0 ? '−' : '+', a = Math.abs(n)
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)}L`
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}k`
  return `${s}₹${a.toFixed(0)}`
}
const MAX_OPEN = 70
function KpiHero({ book, o, total, newCount, gensCount, active }) {
  // MAIN portfolio (₹20L swing book: cash + F&O). Daily-income sleeve shown separately below.
  const mainCap = book ? (book.cashSleeve?.capital || 0) + (book.foSleeve?.capital || 0) : 2000000
  const mainEq = book ? (book.cashSleeve?.equity || 0) + (book.foSleeve?.equity || 0) : null
  const mainPnl = mainEq != null ? mainEq - mainCap : null
  const mainPct = mainPnl != null ? +((mainPnl / mainCap) * 100).toFixed(2) : null
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <KpiTile glow="#22E39A" label="Portfolio win rate"
        value={book?.closedCount ? `${book.winRate}%` : '—'}
        sub={book?.closedCount ? `${book.wins}W / ${book.losses}L · ${book.closedCount} closed` : 'builds as trades close'}
        subTone={book?.closedCount && book.winRate >= 55 ? 'text-green' : 'text-txt-sec'} />
      <KpiTile glow="#22D3EE" label="Open positions"
        value={book ? `${book.open}` : '—'}
        sub={book ? `of ${MAX_OPEN} · ${book.cashSleeve?.open ?? 0} cash · ${book.foSleeve?.open ?? 0} F&O` : 'paper book'} />
      <KpiTile glow="#8B5CF6" label="Net P&L · ₹20L book"
        value={mainPnl != null ? inr(mainPnl) : '—'}
        sub={mainPct != null ? `${mainPct >= 0 ? '+' : ''}${mainPct}% · realized ${book.realizedPct >= 0 ? '+' : ''}${book.realizedPct}%` : 'cash + F&O sleeves'}
        subTone={mainPnl >= 0 ? 'text-green' : 'text-red'} />
      <KpiTile glow={active?.color || '#4F7DFF'} label="Signals today"
        value={total}
        sub={`${gensCount} desks${newCount > 0 ? ` · ${newCount} new` : ''} · signals ${o?.decided ? o.winRate + '%' : '—'}`}
        subTone={newCount > 0 ? 'text-green' : 'text-txt-sec'} />
    </div>
  )
}
// Daily-Income sleeve — the separate ₹10L experiment aiming for a consistent 1–2%/day, monitored 30 days.
function DailyStrip({ d }) {
  if (!d) return null
  const m = d.monitor || {}
  const pnl = d.equity - d.capital
  const cell = (label, val, tone) => (
    <div className="flex flex-col">
      <span className="mono text-[9.5px] uppercase tracking-wide text-txt-muted">{label}</span>
      <span className={`mono text-sm font-bold ${tone || ''}`}>{val}</span>
    </div>
  )
  return (
    <div className="card elev p-4 sm:p-5" style={{ background: 'linear-gradient(100deg, color-mix(in srgb, var(--color-cyan) 10%, var(--color-bg-card)), var(--color-bg-card) 60%)' }}>
      {(() => { const occ = d.deployed ?? Math.max(0, d.capital - d.cash), occPct = Math.round((occ / (occ + d.cash || 1)) * 100); return (
      <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="mono text-[13px] font-bold">⚡ Daily-Income Sleeve</span>
        <span className="pill text-[10px] px-2 py-0.5" style={{ background: 'color-mix(in srgb, var(--color-cyan) 18%, transparent)', color: 'var(--color-cyan)' }}>₹10L safe cash · aim ₹10k/day</span>
        <span className="mono text-[10px] text-green font-bold">● live</span>
        {/* live occupancy bar */}
        <span className="hidden sm:flex items-center gap-1.5 ml-1">
          <span className="mono text-[9px] text-txt-muted">occupied</span>
          <span style={{ width: 90, height: 6, borderRadius: 999, background: 'color-mix(in srgb,var(--color-txt-muted) 25%,transparent)', overflow: 'hidden', display: 'inline-block' }}><i style={{ display: 'block', height: '100%', width: occPct + '%', background: 'linear-gradient(90deg,var(--color-cyan),var(--color-purple))' }} /></span>
          <span className="mono text-[9px] font-bold">{occPct}%</span>
        </span>
        <span className="mono text-[10px] text-txt-muted ml-auto">updates every scan · not a guarantee</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {cell('Sleeve equity', inr(d.equity).replace('+', ''), '')}
        {cell('Occupied', inr(occ).replace('+', '') + ` · ${occPct}%`, '')}
        {cell('Free cash', inr(d.cash).replace('+', ''), d.cash < d.capital * 0.1 ? 'text-yellow' : 'text-green')}
        {cell('Open now', `${d.open} / 8`, '')}
        {cell('Net P&L', inr(pnl), pnl >= 0 ? 'text-green' : 'text-red')}
        {cell('Return', `${d.pct >= 0 ? '+' : ''}${d.pct}%`, d.pct >= 0 ? 'text-green' : 'text-red')}
        {cell('Avg/day', m.avgDayPct != null ? `${m.avgDayPct >= 0 ? '+' : ''}${m.avgDayPct}%` : '—', m.avgDayPct >= 1 ? 'text-green' : '')}
        {cell('Days ≥ ₹10k', `${m.daysHitMin ?? 0}/${m.tradingDays ?? 0}`, (m.daysHitMin ?? 0) > 0 ? 'text-green' : '')}
      </div>
      </>
      ) })()}
    </div>
  )
}

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
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [theme, setTheme] = useState(getTheme())
  const [book, setBook] = useState(null)   // real paper-portfolio stats from trade_book.json
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
  // real paper-portfolio stats (the ₹10L+₹10L book) — for the KPI hero; independent of timeframe
  useEffect(() => {
    const f = () => fetch('/trade_book.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(t => setBook(t?.stats || null)).catch(() => {})
    f(); const id = setInterval(f, 60000); return () => clearInterval(id)
  }, [])
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
      <div className="shrink-0 border-b border-border glass elev z-20">
        {/* tier 1 — brand · centered search · action cluster */}
        <div className="px-3 sm:px-5 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-white font-black text-lg shrink-0"
              style={{ background: 'linear-gradient(135deg,#22D3EE,#8B5CF6)', boxShadow: '0 0 16px rgba(34,211,238,.35)' }}>◆</div>
            <div className="hidden md:block leading-tight">
              <div className="mono text-[15px] font-bold brand-grad tracking-tight">ProTrader</div>
              <div className="mono text-[10px] text-txt-muted">Signal Board{board?.date ? ` · ${board.date}` : ''}</div>
            </div>
          </div>

          {/* central search — grows and centers */}
          <div className="flex-1 flex justify-center px-1 sm:px-3">
            <GlobalSearch gens={gens} tabs={tabs} onJump={(idx, sym) => { if (idx >= 0) setTab(idx); setSearch(sym); setNavCollapsed(false) }} />
          </div>

          {/* action cluster — top right */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setView('journal')} title="Trading Journal — ₹20L paper portfolio & performance"
              className="mono text-[11px] px-3 py-1.5 rounded-lg text-white font-bold card-hover flex items-center gap-1.5" style={{ background: 'linear-gradient(90deg,#0E9F6E,#2962FF)' }}>
              📓 <span className="hidden lg:inline">Journal</span>
            </button>
            <span className="hdiv hidden sm:block" />
            <button onClick={load} className="ibtn" title="Refresh board">⟳</button>
            <button onClick={scanNow} disabled={scanning} className="ibtn" title="Run a fresh scan now">{scanning ? '⏳' : '🔄'}</button>
            <button onClick={() => alertsOn ? disableAlerts() : enableAlerts()} className={`ibtn ${alertsOn ? 'on' : ''}`} title={alertsOn ? 'Alerts on' : 'Alerts off'}>{alertsOn ? '🔔' : '🔕'}</button>
            <button onClick={() => setModal('news')} className="ibtn" title="Market news">📰</button>
            <button onClick={() => setModal('learning')} className="ibtn" title="Self-improvement log">🧠</button>
            <button onClick={() => setTheme(toggleTheme())} className="ibtn" title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>{theme === 'dark' ? '☀️' : '🌙'}</button>
            <span className="hdiv hidden sm:block" />
            <button onClick={() => setView('agent')} className="ibtn" title="Content agent">📣</button>
            <button onClick={() => setView('chart')} className="ibtn" title="Charts">📈</button>
          </div>
        </div>

        {/* tier 2 — context strip: timeframe · status · regime · goal */}
        <div className="px-3 sm:px-5 py-1.5 border-t border-border flex items-center gap-2 flex-wrap mono text-[10px]">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[['daily', 'Daily'], ['weekly', 'Weekly'], ['intraday', 'Intraday']].map(([k, lbl]) => (
              <button key={k} onClick={() => { setTf(k); setTab(0) }} className={`px-2.5 py-1 ${tf === k ? 'text-white' : 'text-txt-sec hover:text-txt'}`}
                style={tf === k ? { background: 'linear-gradient(90deg,#2962FF,#7C3AED)' } : {}}>{lbl}</button>
            ))}
          </div>
          <span className="text-txt-muted">{total} signals · {gens.length} desks · {liveOn ? <span className="text-green font-bold">● LTP live</span> : <span className="text-txt-muted">○ prices at scan</span>}</span>
          {newCount > 0 && <span className="px-2 py-0.5 rounded-full bg-green text-white font-bold">🟢 {newCount} NEW</span>}
          {scanMsg && <span className="text-txt-sec">{scanMsg}</span>}
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            {regime?.available && (
              <span title={(regime.reasons || []).join(' · ')} className="px-2 py-0.5 rounded-full text-white font-bold" style={{ background: regime.bias === 'bearish' ? '#F23645' : regime.bias === 'bullish' ? '#0E9F6E' : '#8896a6' }}>
                {regime.bias === 'bearish' ? '🔻' : regime.bias === 'bullish' ? '🔺' : '⏸'} {regime.bias.toUpperCase()}
              </span>
            )}
            {goal && (
              <span className="px-2 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(90deg,#2962FF,#7C3AED)' }} title={goal.status}>
                🎯 {goal.current != null ? goal.current + '%' : '—'} / {goal.target}% goal
              </span>
            )}
            {o?.decided ? <span className="text-txt-muted">signals {o.winRate}% ({o.win}/{o.decided}) · {o.open} tracked open</span> : null}
          </div>
        </div>
      </div>
      {modal && <InsightModal kind={modal} onClose={() => setModal(null)} />}

      {/* body: vertical tab nav (left, distinct + collapsible) + content (right) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <nav className={`${navCollapsed ? 'w-14' : 'w-64'} shrink-0 overflow-y-auto transition-all duration-150 border-r border-border flex flex-col py-2`}
          style={{ background: 'var(--color-bg-panel)' }}>
          <button onClick={() => setNavCollapsed(c => !c)} title={navCollapsed ? 'Expand menu' : 'Collapse menu'}
            className="navitem text-txt-muted hover:text-accent font-semibold mb-1">
            <span className="text-base w-5 text-center shrink-0">{navCollapsed ? '»' : '«'}</span>
            {!navCollapsed && <span className="flex-1 text-[11px]">Collapse menu</span>}
          </button>
          {!navCollapsed && <div className="navsec">Signal Desks</div>}
          {tabs.map((g, i) => {
            const on = i === tab
            const gt = tr?.generators?.[g.id]
            const wr = gt && gt.decided >= 10 ? gt.winRate : null
            const icon = (SHORT[g.id] || g.label).split(' ')[0]
            const label = (SHORT[g.id] || g.label).replace(/^\S+\s/, '')
            return (
              <button key={g.id} onClick={() => setTab(i)} title={`${g.label}${wr != null ? ` · ${wr}% win` : ''}`}
                className="navitem" style={on ? { background: tint(g.color, 0.16), color: 'var(--color-txt)', fontWeight: 700 } : { color: 'var(--color-txt-sec)' }}>
                {on && <span className="navbar-accent" style={{ background: g.color }} />}
                {navCollapsed
                  ? <span className="mx-auto relative text-base">{icon}{g.count > 0 && <span className="absolute -top-1.5 -right-2.5 text-[8px] font-bold px-1 rounded-full" style={{ background: on ? g.color : 'var(--color-bg-card)', color: on ? '#fff' : 'var(--color-txt-muted)' }}>{g.count}</span>}</span>
                  : <>
                      <span className="text-base w-5 text-center shrink-0">{icon}</span>
                      <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium">{label}</span>
                      {g.id === topId && <span className="text-[10px] shrink-0" style={{ color: '#FF6D00' }} title={`Top accuracy ${topWin}%`}>★</span>}
                      <span className="w-11 text-right text-[10px] font-bold tabular-nums shrink-0" style={{ color: wr == null ? 'var(--color-txt-muted)' : wr >= 60 ? '#0E9F6E' : wr >= 45 ? '#FFB300' : '#8896a6' }} title="confidence (measured win-rate)">{wr != null ? Math.round(wr) + '%' : '—'}</span>
                      {newPerTab[i] > 0 && <span className="px-1.5 rounded-full text-[9px] font-bold shrink-0 bg-green text-white" title={`${newPerTab[i]} new today`}>+{newPerTab[i]}</span>}
                    </>}
              </button>
            )
          })}
        </nav>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ background: 'var(--color-bg-base)' }}>
          {loading && !board && <div className="p-4 mono text-sm text-txt-sec">Loading board…</div>}
          {err && <div className="p-4 mono text-sm text-yellow">{err}</div>}
          {active && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 sm:p-5 flex flex-col gap-4 sm:gap-5">
                {/* KPI hero — portfolio summary above the detail (mockup layout) */}
                <KpiHero book={book} o={o} total={total} newCount={newCount} gensCount={gens.length} active={active} />
                <DailyStrip d={book?.dailySleeve} />

                {/* panel card wrapping the active desk's header + search + table */}
                <div className="card elev data-panel">
                  <div className="px-4 sm:px-5 py-3.5 text-[11px] mono text-txt-sec border-b border-border flex items-center gap-3 flex-wrap rounded-t-2xl" style={{ background: tint(active.color, 0.06) }}>
                    <span className="text-[13px]"><span className="font-bold" style={{ color: active.color }}>{active.label}</span> <span className="text-txt-muted">— {active.desc}</span></span>
                    {genTR && genTR.decided >= 20 && (genTR.winRate < 45
                      ? <span className="pill text-[10px] px-2 py-0.5 font-bold" style={{ background: 'color-mix(in srgb, var(--color-red) 16%, transparent)', color: 'var(--color-red)' }} title="Measured win-rate below 45% on a real sample → auto-benched from live trading by the self-improvement engine. Shown for discovery only.">⚠ benched — not traded</span>
                      : genTR.winRate >= 55
                        ? <span className="pill text-[10px] px-2 py-0.5 font-bold" style={{ background: 'color-mix(in srgb, var(--color-green) 16%, transparent)', color: 'var(--color-green)' }} title="Proven on a real closed sample → actively traded">✓ proven · traded</span>
                        : <span className="pill text-[10px] px-2 py-0.5" style={{ background: 'color-mix(in srgb, var(--color-yellow) 16%, transparent)', color: 'var(--color-yellow)' }} title="Around breakeven — traded lightly while it proves out">• developing</span>)}
                    {genTR && (genTR.decided > 0
                      ? <span className="ml-auto shrink-0 px-2.5 py-1 rounded-full" style={{ background: tint(active.color, 0.14) }}>track record <b className={genTR.winRate >= 80 ? 'text-green' : 'text-txt'}>{genTR.winRate}%</b> ({genTR.win}/{genTR.decided}) · {genTR.open} open</span>
                      : genTR.open > 0 ? <span className="ml-auto shrink-0 text-txt-muted">{genTR.open} open · accuracy builds as trades close</span> : null)}
                  </div>
                  {/* search + sort — applies to the active tab */}
                  <div className="px-4 sm:px-5 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search symbol / name…"
                      className="mono text-xs px-3 py-1.5 rounded-lg bg-bg-base border border-border focus:border-accent outline-none w-44" />
                    <span className="mono text-[10px] text-txt-muted">Sort:</span>
                    {[['default', 'Default'], ['strength', 'Strength'], ['change', 'Change %'], ['rr', 'R:R'], ['symbol', 'A–Z']].map(([k, lbl]) => (
                      <button key={k} onClick={() => setSortBy(k)} className={`mono text-[10px] px-2.5 py-1 rounded-full ${sortBy === k ? 'text-white font-bold' : 'text-txt-sec bg-bg-base border border-border'}`} style={sortBy === k ? { background: active.color } : {}}>{lbl}</button>
                    ))}
                    {(search || sortBy !== 'default') && <span className="mono text-[10px] text-txt-muted">· {rows.length} shown</span>}
                  </div>
                  {rows.length === 0
                    ? <div className="p-10 mono text-sm text-txt-muted text-center">{search ? `No matches for "${search}" in this tab.` : 'No signals in this generator today.'}</div>
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// GLOBAL search — finds a stock across ALL tabs; if it's not in any list, runs a fresh on-demand
// analysis via /api/analyze and shows the engine's view (matches-engine → tradeable signal).
function GlobalSearch({ gens, tabs, onJump }) {
  const [q, setQ] = useState('')
  const [analysis, setAnalysis] = useState(null)   // { loading } | { result }
  const [openList, setOpenList] = useState(false)
  const query = q.trim()
  // LIVE matches across every tab as you type (no API, instant)
  const matches = useMemo(() => {
    if (!query) return []
    const Q = query.toUpperCase(), seen = new Set(), out = []
    for (const g of gens) for (const s of (g.signals || [])) {
      const sym = String(s.symbol || s.underlying || '')
      if (sym.toUpperCase().includes(Q)) { const k = g.id + sym; if (!seen.has(k)) { seen.add(k); out.push({ sym, tab: g.label, color: g.color, tabIdx: tabs.findIndex(t => t.id === g.id) }) } }
    }
    return out.slice(0, 25)
  }, [query, gens, tabs])
  const analyze = async () => {
    setAnalysis({ loading: true })
    try { const r = await fetch('/api/analyze?symbol=' + encodeURIComponent(query)).then(r => r.json()); setAnalysis({ result: r }) }
    catch { setAnalysis({ result: { found: false, message: 'Analysis failed — try again in a moment.' } }) }
  }
  const show = openList && query.length > 0
  return (
    <div className="relative w-full max-w-xl">
      <input value={q} onFocus={() => setOpenList(true)} onChange={e => { setQ(e.target.value); setAnalysis(null); setOpenList(true) }}
        placeholder="🔎 Search any stock — RELIANCE, TITAN, AAPL… we analyse it live"
        className="mono text-xs px-3.5 py-2 rounded-xl bg-bg-base border border-border focus:border-accent outline-none w-full" />
      {show && (
        <div className="absolute z-40 mt-1.5 left-0 right-0 rounded-xl border border-border glass elev-lg p-3 max-h-[75vh] overflow-y-auto">
          <div className="flex justify-between items-center mono text-[10px] text-txt-muted mb-1.5"><span>"{query}"</span><button onClick={() => { setQ(''); setAnalysis(null); setOpenList(false) }} className="hover:text-txt">✕</button></div>
          {matches.length > 0 ? <>
            <div className="mono text-[11px] text-green mb-1">In {matches.length} list{matches.length > 1 ? 's' : ''} — click to open:</div>
            {matches.map((m, i) => <button key={i} onClick={() => { onJump(m.tabIdx, m.sym); setOpenList(false); setQ('') }} className="w-full text-left mono text-xs px-2 py-1.5 rounded-lg hover:bg-bg-card flex justify-between items-center"><span className="font-bold" style={{ color: m.color }}>{m.sym}</span><span className="text-txt-muted">{m.tab} →</span></button>)}
          </> : analysis?.loading ? <div className="mono text-xs text-txt-sec py-3">Analysing <b>{query}</b>… fetching fresh data & running the engine.</div>
            : analysis?.result ? <AnalyzeResult a={analysis.result} />
              : <div className="py-1">
                <div className="mono text-[11px] text-txt-sec mb-2">No signal for "<b>{query}</b>" in any tab.</div>
                <button onClick={analyze} className="btn-primary mono text-[11px] px-3 py-1.5 font-bold">🔬 Analyse "{query.toUpperCase()}" with fresh data →</button>
                <div className="mono text-[9px] text-txt-muted mt-1.5">Runs our engine on live Yahoo data. Indian → NSE symbol; US → ticker.</div>
              </div>}
        </div>
      )}
    </div>
  )
}
function AnalyzeResult({ a }) {
  if (!a.found) return <div className="mono text-xs text-yellow py-2">{a.message || 'Not found.'}</div>
  const dc = a.direction === 'LONG' ? '#0E9F6E' : a.direction === 'SHORT' ? '#F23645' : '#8896a6'
  return (
    <div className="mono text-[11px] space-y-1.5">
      <div className="flex items-center gap-2"><span className="font-bold text-sm text-txt">{a.symbol}</span><span className="text-txt-muted truncate">{a.name}</span><span className="ml-auto px-2 py-0.5 rounded-full text-white font-bold shrink-0" style={{ background: dc }}>{a.direction}</span></div>
      <div className="text-txt-sec">Not in today's signals — here's a fresh read:</div>
      <div className="grid grid-cols-4 gap-1">
        <div><div className="text-txt-muted">Price</div><div className="font-bold">{a.ccy}{a.price}</div></div>
        <div><div className="text-txt-muted">Trend</div><div>{a.trend}</div></div>
        <div><div className="text-txt-muted">RSI</div><div>{a.rsi}</div></div>
        <div><div className="text-txt-muted">vs mean</div><div>{a.distFromMean >= 0 ? '+' : ''}{a.distFromMean}%</div></div>
      </div>
      <div className="font-bold" style={{ color: dc }}>{a.setup} {a.matchesEngine ? '· ✅ matches our engine' : '· ⚪ no edge right now'}</div>
      {a.targets && <div className="grid grid-cols-4 gap-1"><div><div className="text-txt-muted">Entry</div><div>{a.ccy}{a.entry}</div></div><div><div className="text-txt-muted">SL</div><div className="text-red">{a.ccy}{a.sl}</div></div><div className="col-span-2"><div className="text-txt-muted">Targets</div><div className="text-green">{a.targets.map(t => a.ccy + t).join(' · ')}</div></div></div>}
      <div className="text-txt p-2 rounded-lg bg-bg-base">🎯 {a.play}</div>
      <div className="text-[9px] text-txt-muted">Fresh Yahoo data · educational only, not advice.</div>
    </div>
  )
}
function TradeTable({ signals, color, setView }) {
  const [open, setOpen] = useState(-1)
  const s = useSortable(signals)
  const rows = s.sorted
  const L = 'px-3 py-2 font-semibold text-left', R = 'px-3 py-2 font-semibold text-right'
  return (
    <table className="w-full mono text-xs border-collapse stbl">
      <thead>
        <tr className="sticky top-0 z-10 text-txt-sec text-[10px] uppercase tracking-wide border-b-2" style={{ background: 'var(--color-bg-panel)', borderColor: tint(color, 0.35) }}>
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
        <td className="px-3 py-2"><span className={`tpill ${isBuy ? 'tpill-buy' : 'tpill-sell'}`}>{isBuy ? 'BUY' : 'SELL'}</span></td>
        <td className="px-3 py-2 text-right text-txt-sec"><Ltp symbol={s.symbol} base={s.ltp} /></td>
        <td className="px-3 py-2 text-right font-semibold">{s.entry}</td>
        <td className="px-3 py-2 text-right text-red">{s.sl}</td>
        <td className="px-3 py-2 text-right text-green">{t?.[0]?.price}{t?.[0]?.pct != null && <span className="text-[9px] text-txt-muted"> +{t[0].pct}%</span>}<div className="text-[9px] text-txt-muted">{t?.[0]?.by || ''}</div></td>
        <td className="px-3 py-2 text-right text-green">{t?.[1]?.price}<div className="text-[9px] text-txt-muted">{t?.[1]?.by || ''}</div></td>
        <td className="px-3 py-2 text-right text-green">{t?.[2]?.price}<div className="text-[9px] text-txt-muted">{t?.[2]?.by || ''}</div></td>
        <td className="px-3 py-2 text-right"><div className={`font-bold ${confColor(s.confidence)}`}>{s.confidence}%</div><span className="confbar mt-1"><i style={{ width: Math.min(100, Math.max(4, s.confidence || 0)) + '%' }} /></span></td>
        <td className="px-3 py-2 text-right">
          <button onClick={copy} className="px-2 py-1 rounded-lg text-white text-[10px]" style={{ background: color }}>{copied ? '✓' : '📋'}</button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border" style={{ background: tint(color, 0.04) }}>
          <td colSpan={10} className="px-5 py-3">
            <div className="text-txt-sec mb-2">{s.reason}</div>
            {s.play && <div className="text-[11px] text-txt mb-2 p-2 rounded-lg" style={{ background: tint(color, 0.08), borderLeft: `2px solid ${color}` }}>🎯 <b>How to play:</b> {s.play}</div>}
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
      <table className="hidden md:table w-full mono text-xs border-collapse stbl">
        <thead><tr className="sticky top-0 z-10 text-txt-sec text-[10px] uppercase tracking-wide border-b-2" style={{ background: 'var(--color-bg-panel)', borderColor: tint(color, 0.35) }}>
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
        <td className="px-3 py-2"><span className={`tpill text-white ${dirCls(s.dirTone)}`}>{s.direction}</span></td>
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
      <table className="hidden md:table w-full mono text-xs border-collapse stbl">
        <thead><tr className="sticky top-0 z-10 text-txt-sec text-[10px] uppercase tracking-wide border-b-2" style={{ background: 'var(--color-bg-panel)', borderColor: tint(color, 0.35) }}>
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
        <td className="px-3 py-2"><span className="tpill text-white" style={{ background: gradeBg(s.grade) }}>{s.grade}</span></td>
        <td className="px-3 py-2 text-accent font-bold">{s.genCount}×</td>
        <td className="px-3 py-2 text-right text-txt-sec"><Ltp symbol={s.symbol} base={s.ltp} /></td>
        <td className="px-3 py-2 text-right font-semibold">{s.entry}</td>
        <td className="px-3 py-2 text-right text-red">{s.sl}</td>
        <td className="px-3 py-2 text-right text-green">{s.targets[0]?.price}</td>
        <td className="px-3 py-2 text-right"><div className={`font-bold ${confColor(s.confidence)}`}>{s.confidence}%</div><span className="confbar mt-1"><i style={{ width: Math.min(100, Math.max(4, s.confidence || 0)) + '%' }} /></span></td>
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
      <table className="hidden md:table w-full mono text-xs border-collapse stbl">
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
      <table className="hidden md:table w-full mono text-xs border-collapse stbl">
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
