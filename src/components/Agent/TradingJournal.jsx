import { useEffect, useState, useMemo } from 'react'
import { useViewStore } from '../../store/viewStore'

// conviction as a % out of 100 — use the stored confidence if present, else map the grade
const gradeToPct = g => ({ 'A++': 96, 'A+': 88, 'A': 75, 'B': 60, 'C': 45 })[g] ?? null
const convPct = s => (s?.confidence != null ? Math.round(s.confidence) : gradeToPct(s?.grade))
const hiConv = s => (convPct(s) ?? 0) >= 80        // high-conviction → highlighted row
// column-header sorting for the journal tables
const JACC = {
  symbol: r => r.symbol || '', qty: r => r.qty, entry: r => r.entryPrice, entryDate: r => r.entryDate,
  ltp: r => r.ltp, unreal: r => r.unrealizedPct, sl: r => r.sl, t1: r => r.targets?.[0]?.price, grade: r => r.grade || '', conv: r => convPct(r) ?? -1,
  exit: r => r.exitPrice, exitDate: r => r.exitDate, held: r => r.daysHeld, result: r => r.result || '', pnl: r => r.realizedPnl, ret: r => r.realizedPct,
}
function useColSort(rows) {
  const [key, setKey] = useState(null), [dir, setDir] = useState('desc')
  const toggle = k => { if (key === k) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setKey(k); setDir('desc') } }
  const sorted = useMemo(() => { if (!key) return rows; const g = JACC[key] || (r => r[key]); return [...rows].sort((a, b) => { const av = g(a), bv = g(b); let c; if (typeof av === 'string' || typeof bv === 'string') c = String(av || '').localeCompare(String(bv || '')); else c = (av ?? -Infinity) - (bv ?? -Infinity); return dir === 'asc' ? c : -c }) }, [rows, key, dir])
  return { sorted, key, dir, toggle }
}
function JTh({ label, k, s, cls = '' }) {
  return <th onClick={() => k && s.toggle(k)} className={`${cls} ${k ? 'cursor-pointer select-none hover:text-txt' : ''}`} title={k ? 'Click to sort' : ''}>{label}{k ? <span className="text-[8px] opacity-60">{s.key === k ? (s.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span> : ''}</th>
}

const inr = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN')
const px = n => n == null ? '—' : (+(+n).toFixed(2)).toLocaleString('en-IN')   // clean price (2 dp, no float noise)
// full trade detail for hover tooltip (reason, entry date/time, SL, targets + dates, R:R…)
const tradeTitle = (s, entryPx) => [
  `${s.symbol}${s.name ? ' — ' + s.name : ''}   [${s.gen || s.generator || 'signal'}]`,
  `${s.direction === 'SHORT' ? 'SELL' : 'BUY'} · ${s.kind}${s.optType ? ' ' + s.optType : ''}   qty ${s.qty}${s.lots ? ` (${s.lots} lot)` : ''}${convPct(s) != null ? `   ·   Conviction ${convPct(s)}%${hiConv(s) ? ' (HIGH)' : ''}` : ''}`,
  `Entered: ${dIST(s.entryAt, s.entryDate)} ${tIST(s.entryAt)}`,
  `Entry ₹${px(entryPx)}   Stop ₹${px(s.sl)}${s.slPct ? ` (${s.slPct}%)` : ''}`,
  ...(Array.isArray(s.targets) ? s.targets.map((t, i) => `Target ${i + 1}: ₹${px(t.price)}${t.pct != null ? ` (+${t.pct}%)` : ''}${t.by ? ` — by ${t.by}` : ''}`) : []),
  s.rr ? `Risk:Reward  1:${s.rr}` : '',
  s.delivery != null ? `NSE delivery ${s.delivery}%` : '',
  s.reason ? `\nWhy: ${s.reason}` : '',
].filter(Boolean).join('\n')
// options are priced by PREMIUM, not the underlying — show the premium and keep the underlying as a hint
const isOpt = p => p.kind === 'OPT'
const entryPx = p => isOpt(p) ? p.entryPremium : p.entryPrice
const curPx = p => isOpt(p) ? Math.round((p.entryPremium || 0) + (p.unrealizedPnl || 0) / (p.qty || 1)) : p.ltp
const exitPx = p => isOpt(p) ? Math.round((p.entryPremium || 0) + (p.realizedPnl || 0) / (p.qty || 1)) : p.exitPrice
const pctCls = v => v > 0 ? 'text-green' : v < 0 ? 'text-red' : 'text-txt-sec'
const sign = v => (v > 0 ? '+' : '') + v
const dt = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toISOString().slice(0, 10) }
const tm = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(11, 16) + ' UTC' }
// entry/exit shown in IST (scan-detection time, not live tick fills)
const _ist = iso => { const ms = Date.parse(iso); return isNaN(ms) ? null : new Date(ms + 5.5 * 3600 * 1000) }
const dIST = (iso, fb) => { const d = _ist(iso); return d ? d.toISOString().slice(0, 10) : (fb || '—') }
const tIST = iso => { const d = _ist(iso); return d ? d.toISOString().slice(11, 16) + ' IST' : '' }
// per-segment monthly goal line for a sleeve tile
const goalSub = sl => { const g = sl.goal; if (!g) return `${sign(sl.pct)}% · ${sl.open} open`; return `goal ${g.min}–${g.max}%/mo · MTD ${sign(g.mtdPct)}% · ${g.status}` }

export default function TradingJournal() {
  const setView = useViewStore(s => s.setView)
  const [book, setBook] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('open')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')       // all | CASH | FNO | OPT
  const [sortBy, setSortBy] = useState('recent') // recent | pnl | symbol | ret
  const [refreshing, setRefreshing] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [improveOpen, setImproveOpen] = useState(false)

  const load = () => {
    setRefreshing(true)
    return fetch('/trade_book.json?t=' + Date.now(), { cache: 'no-store' })
      .then(async r => { const t = await r.text(); if (!r.ok || t.trim().startsWith('<')) throw new Error('Journal builds with the next daily scan — check back shortly.'); return JSON.parse(t) })
      .then(b => { setBook(b); setErr(null) }).catch(e => setErr(e.message))
      .finally(() => setRefreshing(false))
  }
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [])
  const updatedIST = book?.updatedAt ? new Date(book.updatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : null

  const st = book?.stats
  // search + kind filter + sort, shared by both tabs
  const view = (arr, closedTab) => {
    let r = arr
    if (kind !== 'all') r = r.filter(p =>
      kind === 'DAILY' ? p.sleeve === 'DAILY'
        : kind === 'OPT' ? p.kind === 'OPT'
          : kind === 'FNO' ? (p.kind === 'FNO' || p.kind === 'OPT') && p.sleeve !== 'DAILY'
            : /* CASH */ p.kind === 'CASH' && p.sleeve !== 'DAILY')
    if (q.trim()) { const s = q.trim().toLowerCase(); r = r.filter(p => (`${p.symbol || ''} ${p.name || ''}`).toLowerCase().includes(s)) }
    const cmp = {
      recent: (a, b) => (closedTab ? (b.exitDate || '') : (b.entryDate || '')).localeCompare(closedTab ? (a.exitDate || '') : (a.entryDate || '')),
      pnl: (a, b) => ((closedTab ? b.realizedPnl : b.unrealizedPnl) || 0) - ((closedTab ? a.realizedPnl : a.unrealizedPnl) || 0),
      ret: (a, b) => ((closedTab ? b.realizedPct : b.unrealizedPct) || 0) - ((closedTab ? a.realizedPct : a.unrealizedPct) || 0),
      symbol: (a, b) => String(a.symbol || '').localeCompare(String(b.symbol || '')),
    }[sortBy]
    return cmp ? [...r].sort(cmp) : r
  }
  const open = view(Object.values(book?.open || {}), false)
  const closed = view([...(book?.closed || [])], true)
  const thisMonth = st?.monthly?.[st.monthly.length - 1]

  return (
    <div className="h-full flex flex-col bg-bg-base text-txt overflow-hidden">
      {/* header */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 border-b border-border glass flex items-center gap-3 flex-wrap z-20">
        <button onClick={() => setView('board')} className="mono text-xs text-txt-sec hover:text-accent">← Board</button>
        <div className="mono text-base sm:text-lg font-bold brand-grad tracking-tight">📓 Trading Journal</div>
        <span className="mono text-[10px] text-txt-muted">₹10L cash + ₹10L F&O + ⚡₹10L daily-income (safe cash) · hard ₹10L cap per book · times in IST</span>
        <div className="ml-auto flex items-center gap-2">
          {updatedIST && <span className="mono text-[10px] text-txt-muted hidden sm:inline">updated {updatedIST} IST</span>}
          <button onClick={() => setImproveOpen(true)} title="Daily self-improvement — what the engine learned & changed"
            className="mono text-[11px] font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 card-hover"
            style={{ background: 'linear-gradient(90deg,#AA00FF,#2962FF)' }}>
            🧠 Improvement
          </button>
          <button onClick={() => setLogOpen(true)} title="Daily & Monthly log books"
            className="mono text-[11px] font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 card-hover"
            style={{ background: 'linear-gradient(90deg,#0E9F6E,#2962FF)' }}>
            📒 Log Book
          </button>
          <button onClick={load} disabled={refreshing} title="Refresh positions now"
            className="mono text-[11px] font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 card-hover disabled:opacity-70"
            style={{ background: 'linear-gradient(90deg,#2962FF,#3B6BFF)' }}>
            <span className="inline-block" style={{ animation: refreshing ? 'ptSpin .8s linear infinite' : 'none' }}>⟳</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      {logOpen && <LogBook st={st} onClose={() => setLogOpen(false)} />}
      {improveOpen && <SelfImprove onClose={() => setImproveOpen(false)} />}

      {err && !book && <div className="p-6 mono text-sm text-yellow">{err}</div>}

      {book && (
        <>
          {/* stat tiles */}
          <div className="shrink-0 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 p-3 border-b border-border">
            <Tile label="Total Equity" value={inr(st.equity)} sub={`start ${inr(book.capitalStart)}`} tone={st.totalPct >= 0 ? 'text-green' : 'text-red'} grad="linear-gradient(135deg,#3B6BFF,#7C3AED)" onClick={() => setKind('all')} active={kind === 'all'} />
            <Tile label="Total P&L" value={`${sign(st.totalPct)}%`} sub={inr(st.equity - book.capitalStart)} tone={pctCls(st.totalPct)} grad={st.totalPct >= 0 ? 'linear-gradient(135deg,#10A56E,#3B6BFF)' : 'linear-gradient(135deg,#E5384A,#E8590C)'} onClick={() => setKind('all')} active={kind === 'all'} />
            {st.cashSleeve && <Tile label="💰 Cash book" value={inr(st.cashSleeve.equity)} sub={goalSub(st.cashSleeve)} tone={pctCls(st.cashSleeve.pct)} grad="linear-gradient(135deg,#10A56E,#0E7FA3)" onClick={() => setKind('CASH')} active={kind === 'CASH'} />}
            {st.foSleeve && <Tile label="⚡ F&O book" value={inr(st.foSleeve.equity)} sub={goalSub(st.foSleeve)} tone={pctCls(st.foSleeve.pct)} grad="linear-gradient(135deg,#7C3AED,#DB2777)" onClick={() => setKind('FNO')} active={kind === 'FNO'} />}
            {st.dailySleeve && <Tile label="⚡ Daily income" value={inr(st.dailySleeve.equity)} sub={`goal ₹10k/day · today ${st.dailySleeve.goal ? inr(st.dailySleeve.goal.todayPnl) : '—'}${st.dailySleeve.monitor?.tradingDays ? ` · ${st.dailySleeve.monitor.daysHitMin}/${st.dailySleeve.monitor.tradingDays}d hit` : ''}`} tone={pctCls(st.dailySleeve.pct)} grad="linear-gradient(135deg,#22D3EE,#8B5CF6)" onClick={() => setKind('DAILY')} active={kind === 'DAILY'} />}
            <Tile label="This month" value={thisMonth ? `${sign(thisMonth.pct)}%` : '—'} sub={`aim ${st.monthTarget.min}–${st.monthTarget.max}%`} tone={thisMonth ? pctCls(thisMonth.pct) : ''} />
            <Tile label="Win rate" value={st.winRate != null ? `${st.winRate}%` : '—'} sub={`${st.wins}W / ${st.losses}L`} />
            <Tile label="Open / Closed" value={`${st.open} / ${st.closedCount}`} sub={`${inr(st.cash)} cash free`} onClick={() => setKind('all')} active={kind === 'all'} />
            <Tile label="Profit factor" value={st.profitFactor != null ? st.profitFactor : '—'} sub={st.onTimeWinRate != null ? `${st.onTimeWinRate}% on time` : 'building'} />
          </div>

          {/* what the engine learned from losses (avoids repeating) */}
          {st.lessons?.length > 0 && (
            <div className="shrink-0 px-3 sm:px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap mono text-[10px]">
              <span className="font-bold text-txt-sec">🧠 Learned from losses:</span>
              {st.lessons.slice(0, 5).map((l, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full cursor-help" style={{ background: 'color-mix(in srgb, var(--color-red) 12%, transparent)', color: 'var(--color-red)' }} title={`${l.category} — avg ${l.avgLossPct}% · last ${l.lastSymbol || '—'}\nFIX: ${l.fix || '—'}`}>{l.category} ×{l.count}</span>
              ))}
              {st.activeCooldowns > 0 && <span className="px-2 py-0.5 rounded-full text-txt-sec" style={{ background: 'var(--color-bg-base)' }}>⏸ {st.activeCooldowns} names in post-loss cooldown (won't re-enter)</span>}
            </div>
          )}

          {/* per-trade post-mortems — collapsible (default CLOSED so it never pushes the trades table down) */}
          {st.lossJournal?.length > 0 && (
            <details className="group shrink-0 px-3 sm:px-5 py-2 border-b border-border mono text-[10px]">
              <summary className="font-bold text-txt-sec cursor-pointer select-none list-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90 text-txt-muted">▸</span>
                🔎 Loss post-mortems (what we missed → fix, kept in memory) · {st.lossJournal.length}
              </summary>
              <div className="flex flex-col gap-1 mt-1.5">
                {st.lossJournal.slice(0, 5).map((l, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="shrink-0 text-txt-muted w-[128px]">{l.date} · {l.symbol} ({l.sleeve})</span>
                    <span className="shrink-0" style={{ color: 'var(--color-red)' }}>missed: {l.missed}</span>
                    <span className="text-txt-sec">→ fix: {l.fix}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* segment leaderboard — which book is consistent + highest-returning */}
          {st.segmentRank?.length > 0 && (
            <div className="shrink-0 px-3 sm:px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap mono text-[10px]">
              <span className="font-bold text-txt-sec">🏆 Segment leaderboard:</span>
              {st.segmentRank.map((sg, i) => (
                <span key={sg.key} className="px-2 py-0.5 rounded-full" title={`${sg.trades} closed trades`}
                  style={{ background: i === 0 ? 'color-mix(in srgb,var(--color-green) 14%,transparent)' : 'var(--color-bg-base)', color: i === 0 ? 'var(--color-green)' : 'var(--color-txt-sec)', fontWeight: i === 0 ? 700 : 400 }}>
                  #{sg.rank} {sg.name} {sg.pct >= 0 ? '+' : ''}{sg.pct}%{sg.winRate != null ? ` · ${sg.winRate}% win` : ''}{sg.consistent ? ' ✓consistent' : ''}
                </span>
              ))}
            </div>
          )}

          {/* COMPLIANCE SCORECARD — the trust layer: proves every desk rule was followed this run.
              Must stay CLEAN for a full monitored month before any real-money step. */}
          {st.compliance && (
            <details className="group shrink-0 px-3 sm:px-5 py-2 border-b border-border mono text-[10px]" open={!st.compliance.clean}>
              <summary className="cursor-pointer select-none list-none flex items-center gap-2 flex-wrap [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90 text-txt-muted">▸</span>
                <span className="font-bold" style={{ color: st.compliance.clean ? 'var(--color-green)' : 'var(--color-red)' }}>
                  {st.compliance.clean ? '🛡️ Rule compliance: ALL CLEAR' : `⚠️ Rule compliance: ${st.compliance.total - st.compliance.passed} VIOLATION(S)`}
                </span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: st.compliance.clean ? 'color-mix(in srgb,var(--color-green) 14%,transparent)' : 'color-mix(in srgb,var(--color-red) 14%,transparent)', color: st.compliance.clean ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 700 }}>
                  {st.compliance.passed}/{st.compliance.total} rules
                </span>
                {st.compliance.activity && (
                  <span className="text-txt-muted">avg-ins this month: {st.compliance.activity.averagedThisMonth} · pyramided open: {st.compliance.activity.pyramidedOpen}</span>
                )}
              </summary>
              <div className="flex flex-col gap-1 mt-1.5">
                {st.compliance.rules.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="shrink-0" style={{ color: r.pass ? 'var(--color-green)' : 'var(--color-red)' }}>{r.pass ? '✓' : '✕'}</span>
                    <span className="shrink-0 text-txt-sec w-[300px]">{r.label}</span>
                    <span className={r.pass ? 'text-txt-muted' : ''} style={r.pass ? {} : { color: 'var(--color-red)' }}>{r.detail}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* tabs */}
          <div className="shrink-0 flex gap-1 px-3 pt-2 bg-bg-panel border-b border-border">
            {[['open', `Open (${open.length})`], ['closed', `Closed (${closed.length})`]].map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`mono text-xs px-3 py-2 rounded-t-lg border-b-2 ${tab === k ? 'text-accent border-accent font-bold' : 'text-txt-sec border-transparent'}`}
                style={tab === k ? { background: 'rgba(41,98,255,0.08)' } : {}}>{lbl}</button>
            ))}
          </div>

          {/* search + filter + sort */}
          <div className="shrink-0 px-3 sm:px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-bg-panel">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search symbol…"
              className="mono text-xs px-3 py-1.5 rounded-lg bg-bg-card border border-border focus:border-accent outline-none w-40" />
            <span className="mono text-[10px] text-txt-muted ml-1">Type:</span>
            {[['all', 'All'], ['CASH', 'Cash'], ['FNO', 'F&O'], ['OPT', 'Options'], ['DAILY', '⚡ Daily']].map(([k, lbl]) => (
              <button key={k} onClick={() => setKind(k)} className={`mono text-[10px] px-2 py-1 rounded ${kind === k ? 'bg-accent-primary text-white font-bold' : 'text-txt-sec bg-bg-card'}`}>{lbl}</button>
            ))}
            <span className="mono text-[10px] text-txt-muted ml-1">Sort:</span>
            {[['recent', 'Recent'], ['pnl', 'P&L ₹'], ['ret', 'Return %'], ['symbol', 'A–Z']].map(([k, lbl]) => (
              <button key={k} onClick={() => setSortBy(k)} className={`mono text-[10px] px-2 py-1 rounded ${sortBy === k ? 'bg-accent-primary text-white font-bold' : 'text-txt-sec bg-bg-card'}`}>{lbl}</button>
            ))}
            <span className="mono text-[10px] text-txt-muted ml-auto">{(tab === 'open' ? open : closed).length} shown</span>
          </div>

          <div className="flex-1 overflow-auto">
            {tab === 'open' ? <OpenTable rows={open} /> : <ClosedTable rows={closed} />}
          </div>

          <div className="shrink-0 px-4 py-1.5 border-t border-border mono text-[10px] text-txt-muted">
            Paper trades — educational only, not advice. Entry/exit times are signal detection times (daily/intraday scans), not live tick fills. Not SEBI-registered.
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, sub, tone, grad, onClick, active }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to view these trades' : undefined}
      className={`kpi elev card-hover px-3 py-2.5 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ ...(grad ? { '--kpi-grad': grad } : {}), ...(active ? { outline: '2px solid var(--color-accent)', outlineOffset: '-1px' } : {}) }}>
      <div className="text-[9px] text-txt-muted uppercase tracking-wide font-semibold truncate">{label}{onClick && <span className="text-accent"> ▾</span>}</div>
      <div className={`mono text-sm sm:text-base font-bold ${tone || 'text-txt'}`}>{value}</div>
      {sub && <div className="text-[9px] text-txt-sec mt-0.5 leading-tight">{sub}</div>}
    </div>
  )
}

function KindTag({ s }) {
  if (s.sleeve === 'DAILY') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: 'linear-gradient(90deg,#22D3EE,#8B5CF6)' }}>⚡ DAILY</span>
  const label = s.kind === 'OPT' ? (s.optType || 'OPT') : s.kind === 'FNO' ? 'F&O' : 'CASH'
  const bg = s.kind === 'OPT' ? (s.optType === 'PE' ? 'bg-red' : 'bg-green') : s.kind === 'FNO' ? 'bg-accent-purple' : 'bg-accent-primary'
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${bg}`}>{label}</span>
}

function OpenTable({ rows: raw }) {
  const s = useColSort(raw)
  const rows = s.sorted
  if (!rows.length) return <Empty msg="No open paper positions yet — they open as new high-conviction signals fire." />
  const L = 'px-3 py-2 font-semibold text-left', R = 'px-3 py-2 font-semibold text-right'
  return (
    <table className="w-full mono text-xs border-collapse">
      <thead><tr className="text-txt-sec text-[10px] uppercase sticky top-0 bg-bg-panel">
        <JTh label="Symbol" k="symbol" s={s} cls={L} /><th className={L}></th><JTh label="Dir" k="result" s={s} cls={L} />
        <JTh label="Qty" k="qty" s={s} cls={R} /><JTh label="Entry ₹" k="entry" s={s} cls={R} /><th className={L}>Time (IST)</th>
        <JTh label="LTP" k="ltp" s={s} cls={R} /><JTh label="Unrealised" k="unreal" s={s} cls={R} /><JTh label="SL" k="sl" s={s} cls={R} />
        <JTh label="T1" k="t1" s={s} cls={R} /><JTh label="Conviction" k="conv" s={s} cls={R} /><th className={L}>Setup</th>
      </tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.id + i} className="border-b border-border hover:bg-bg-card cursor-help" title={tradeTitle(s, entryPx(s))}
            style={hiConv(s) ? { background: 'color-mix(in srgb, #1E40AF 34%, transparent)', boxShadow: 'inset 3px 0 0 #2962FF' } : undefined}>
            <td className="px-3 py-2 font-bold">{s.symbol} <span className="text-txt-muted text-[9px]">ⓘ</span></td>
            <td className="px-3 py-2"><KindTag s={s} /></td>
            <td className="px-3 py-2"><span className={s.direction === 'SHORT' ? 'text-red' : 'text-green'}>{s.direction === 'SHORT' ? 'SELL' : 'BUY'}</span></td>
            <td className="px-3 py-2 text-right">{s.qty}{s.lots ? <span className="text-txt-muted"> ({s.lots}L)</span> : ''}</td>
            <td className="px-3 py-2 text-right">₹{px(entryPx(s))}{isOpt(s) && <span className="text-[9px] text-txt-muted"> prem</span>}</td>
            <td className="px-3 py-2 text-[10px] text-txt-sec whitespace-nowrap">
              <div><span className="text-green font-bold">Entry:</span> {dIST(s.entryAt, s.entryDate)} {tIST(s.entryAt)}</div>
              <div><span className="text-yellow font-bold">Exit:</span> — holding</div>
            </td>
            <td className="px-3 py-2 text-right text-txt-sec">₹{px(curPx(s))}</td>
            <td className={`px-3 py-2 text-right font-bold ${pctCls(s.unrealizedPnl)}`}>{inr(s.unrealizedPnl)}<span className="text-[10px]"> ({sign(s.unrealizedPct)}%)</span></td>
            <td className="px-3 py-2 text-right text-red">₹{px(s.sl)}</td>
            <td className="px-3 py-2 text-right text-green">₹{px(s.targets?.[0]?.price)}</td>
            <td className="px-3 py-2 text-right">{convPct(s) != null
              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums" style={{ background: hiConv(s) ? '#2962FF' : 'var(--color-bg-card)', color: hiConv(s) ? '#fff' : 'var(--color-txt-sec)' }}>{convPct(s)}%</span>
              : '—'}{s.footprint && !s.footprint.weak ? ' 🕵️' : ''}</td>
            <td className="px-3 py-2 text-txt-sec max-w-[220px] truncate" title={s.reason}>{s.reason || s.gen}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ClosedTable({ rows: raw }) {
  const s = useColSort(raw)
  const rows = s.sorted
  if (!rows.length) return <Empty msg="No closed trades yet — outcomes journal here as targets/stops are hit." />
  const L = 'px-3 py-2 font-semibold text-left', R = 'px-3 py-2 font-semibold text-right'
  return (
    <table className="w-full mono text-xs border-collapse">
      <thead><tr className="text-txt-sec text-[10px] uppercase sticky top-0 bg-bg-panel">
        <JTh label="Symbol" k="symbol" s={s} cls={L} /><th className={L}></th><th className={L}>Dir</th>
        <JTh label="Qty" k="qty" s={s} cls={R} /><JTh label="Entry ₹" k="entry" s={s} cls={R} /><JTh label="Exit ₹" k="exit" s={s} cls={R} /><th className={L}>Time (IST)</th>
        <JTh label="Held" k="held" s={s} cls={L} /><JTh label="Result" k="result" s={s} cls={L} /><JTh label="P&L" k="pnl" s={s} cls={R} />
        <th className={L}>Target / on time</th><th className={L}>Notes</th>
      </tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.id + i} className="border-b border-border hover:bg-bg-card align-top cursor-help" title={tradeTitle(s, entryPx(s))}
            style={hiConv(s) ? { background: 'color-mix(in srgb, #1E40AF 30%, transparent)', boxShadow: 'inset 3px 0 0 #2962FF' } : undefined}>
            <td className="px-3 py-2 font-bold">{s.symbol} <span className="text-txt-muted text-[9px]">ⓘ</span></td>
            <td className="px-3 py-2"><KindTag s={s} /></td>
            <td className="px-3 py-2"><span className={s.direction === 'SHORT' ? 'text-red' : 'text-green'}>{s.direction === 'SHORT' ? 'SELL' : 'BUY'}</span></td>
            <td className="px-3 py-2 text-right">{s.qty}{s.lots ? ` (${s.lots}L)` : ''}</td>
            <td className="px-3 py-2 text-right">₹{px(entryPx(s))}{isOpt(s) && <span className="text-[9px] text-txt-muted"> prem</span>}</td>
            <td className="px-3 py-2 text-right">₹{px(exitPx(s))}</td>
            <td className="px-3 py-2 text-[10px] text-txt-sec whitespace-nowrap">
              <div><span className="text-green font-bold">Entry:</span> {dIST(s.entryAt, s.entryDate)} {tIST(s.entryAt)}</div>
              <div><span className="text-yellow font-bold">Exit:</span> {dIST(s.exitAt, s.exitDate)} {tIST(s.exitAt)}</div>
            </td>
            <td className="px-3 py-2 text-right text-txt-sec">{s.daysHeld != null ? `${s.daysHeld}d` : '—'}</td>
            <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${s.result === 'WIN' ? 'bg-green' : s.result === 'LOSS' ? 'bg-red' : 'bg-yellow'}`}>{s.result === 'WIN' ? '🎯 WIN' : s.result === 'LOSS' ? '🔴 LOSS' : '⏳ EXPIRED'}</span></td>
            <td className={`px-3 py-2 text-right font-bold ${pctCls(s.realizedPnl)}`}>{inr(s.realizedPnl)}<div className="text-[10px]">{sign(s.realizedPct)}%</div></td>
            <td className="px-3 py-2 text-txt-sec">{s.result === 'WIN' ? `T${s.maxTarget}` : '—'}{s.hitOnTime === true ? <span className="text-green"> ✓ on time</span> : s.hitOnTime === false ? <span className="text-yellow"> ⧗ late</span> : ''}<div className="text-[10px] text-txt-muted">{s.targetPredictedBy ? `pred ${s.targetPredictedBy}` : ''}</div></td>
            <td className="px-3 py-2 text-txt-sec max-w-[280px]">{s.failureReason || s.expectationMatch}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Empty({ msg }) { return <div className="p-8 mono text-sm text-txt-muted text-center">{msg}</div> }

// ── LOG BOOK — Daily & Monthly record of start capital, end capital, P&L, trades + mistakes ──
function pnlCls(n) { return (n || 0) > 0 ? 'text-green' : (n || 0) < 0 ? 'text-red' : 'text-txt-sec' }
function sgn(n) { return (n || 0) >= 0 ? '+' : '' }
function LogBook({ st, onClose }) {
  const [tab, setTab] = useState('daily')
  const daily = st?.dailyLog || []
  const monthly = st?.monthlyLog || []
  const rows = tab === 'daily' ? daily : monthly
  const keyOf = r => tab === 'daily' ? r.day : r.month
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(4,8,14,.66)' }} onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[86vh] flex flex-col rounded-2xl border border-border overflow-hidden elev" style={{ background: 'var(--color-bg-card)' }} onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border">
          <span className="mono text-base font-bold brand-grad">📒 Log Book</span>
          <div className="flex items-center gap-1 ml-1">
            {[['daily', 'Daily'], ['monthly', 'Monthly']].map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`mono text-[11px] font-bold px-3 py-1.5 rounded-lg ${tab === k ? 'text-white' : 'text-txt-sec bg-bg-base border border-border'}`}
                style={tab === k ? { background: 'linear-gradient(90deg,#0E9F6E,#2962FF)' } : {}}>{lbl}</button>
            ))}
          </div>
          <button onClick={onClose} className="ibtn ml-auto" title="Close">✕</button>
        </div>
        {/* body */}
        <div className="overflow-auto p-3 sm:p-4">
          {rows.length === 0
            ? <div className="p-10 mono text-sm text-txt-muted text-center leading-relaxed">
                No {tab} entries yet.<br />
                <span className="text-[12px]">{tab === 'daily'
                  ? 'The first daily entry is written after today’s session rolls into tomorrow (start capital → end capital → P&L, with that day’s trades).'
                  : 'The first monthly entry is written when the month rolls over — each sleeve then also restarts fresh at ₹10L.'}</span>
              </div>
            : <div className="overflow-x-auto">
                <table className="w-full mono text-[11px]" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-txt-sec text-left" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th className="px-2 py-2">{tab === 'daily' ? 'Day' : 'Month'}</th>
                      <th className="px-2 py-2 text-right">Start ₹</th>
                      <th className="px-2 py-2 text-right">End ₹</th>
                      <th className="px-2 py-2 text-right">P&L</th>
                      <th className="px-2 py-2 text-right">Cash</th>
                      <th className="px-2 py-2 text-right">F&O</th>
                      <th className="px-2 py-2 text-right">Daily</th>
                      <th className="px-2 py-2 text-right">Trades</th>
                      <th className="px-2 py-2">Top mistakes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const sv = r.sleeves || {}
                      const tradeN = tab === 'daily' ? (r.trades?.length ?? 0) : (r.tradeCount ?? 0)
                      return (
                        <tr key={keyOf(r) + i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td className="px-2 py-2 font-bold">{keyOf(r)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{inr(r.startCapital)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{inr(r.endCapital)}</td>
                          <td className={`px-2 py-2 text-right tabular-nums font-bold ${pnlCls(r.pnl)}`}>{sgn(r.pnl)}{inr(r.pnl).replace('₹', '₹')}<span className="text-[9px] opacity-70"> ({sgn(r.pct)}{r.pct}%)</span></td>
                          <td className={`px-2 py-2 text-right tabular-nums ${pnlCls(sv.CASH?.pnl)}`}>{sgn(sv.CASH?.pnl)}{inr(sv.CASH?.pnl)}</td>
                          <td className={`px-2 py-2 text-right tabular-nums ${pnlCls(sv.FO?.pnl)}`}>{sgn(sv.FO?.pnl)}{inr(sv.FO?.pnl)}</td>
                          <td className={`px-2 py-2 text-right tabular-nums ${pnlCls(sv.DAILY?.pnl)}`}>{sgn(sv.DAILY?.pnl)}{inr(sv.DAILY?.pnl)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-txt-sec">{tradeN}</td>
                          <td className="px-2 py-2 text-txt-sec max-w-[220px]">{(r.mistakes || []).length ? (r.mistakes || []).map(m => `${m.category} ×${m.count}`).join(' · ') : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>}
        </div>
        <div className="shrink-0 px-4 py-2 border-t border-border mono text-[10px] text-txt-muted">
          Start = capital at the open · End = capital at the close · Monthly rolls each sleeve back to ₹10L; Daily records only. Paper — educational, not advice.
        </div>
      </div>
    </div>
  )
}

// ── SELF-IMPROVEMENT — what the engine learned & changed each day (from /learning.json) ──
function SelfImprove({ onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    fetch('/learning.json?t=' + Date.now(), { cache: 'no-store' })
      .then(async r => { const t = await r.text(); if (!r.ok || t.trim().startsWith('<')) throw new Error('Self-improvement runs after the market close (~17:32 IST) — check back this evening.'); return JSON.parse(t) })
      .then(setD).catch(e => setErr(e.message))
  }, [])
  const g = d?.goal
  const hist = (d?.history || []).slice().reverse()
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(4,8,14,.66)' }} onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[86vh] flex flex-col rounded-2xl border border-border overflow-hidden elev" style={{ background: 'var(--color-bg-card)' }} onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border">
          <span className="mono text-base font-bold brand-grad">🧠 Daily Self-Improvement</span>
          {d?.date && <span className="mono text-[10px] text-txt-muted">{d.date}</span>}
          <button onClick={onClose} className="ibtn ml-auto" title="Close">✕</button>
        </div>
        <div className="overflow-auto p-4 sm:p-5 flex flex-col gap-4 mono">
          {err && <div className="p-6 text-sm text-txt-muted text-center">{err}</div>}
          {d && <>
            {/* goal trajectory */}
            {g && <div className="rounded-xl border border-border p-3" style={{ background: 'var(--color-bg-base)' }}>
              <div className="text-[10px] uppercase text-txt-muted mb-1">Accuracy goal</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold" style={{ color: g.current >= g.target ? 'var(--color-green)' : 'var(--color-yellow)' }}>{g.current ?? '–'}%</span>
                <span className="text-xs text-txt-sec">measured → target {g.target}%</span>
              </div>
              <div className="text-[11px] text-txt-sec mt-1">{g.status}</div>
            </div>}
            {/* today's review */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border p-2"><div className="text-[9px] uppercase text-txt-muted">Movers checked</div><div className="text-lg font-bold">{d.moversChecked}</div></div>
              <div className="rounded-lg border border-border p-2"><div className="text-[9px] uppercase text-txt-muted">Caught</div><div className="text-lg font-bold text-green">{d.caught} <span className="text-[11px]">({d.catchRate}%)</span></div></div>
              <div className="rounded-lg border border-border p-2"><div className="text-[9px] uppercase text-txt-muted">Missed</div><div className="text-lg font-bold text-red">{d.missed}</div></div>
            </div>
            {/* what it CHANGED today */}
            <div>
              <div className="text-[10px] uppercase text-txt-muted mb-1">✦ What it changed today (auto-tuning)</div>
              {d.adjustments?.length ? d.adjustments.map((a, i) => <div key={i} className="text-[11px] text-cyan mb-1">• {a}</div>)
                : <div className="text-[11px] text-txt-sec">No change needed today — selectivity already at target; kept the current gates.</div>}
              {d.tuning && <div className="text-[10px] text-txt-muted mt-1">current gates → pre-move score ≥ {d.tuning.minMoveScore} · quality bar {d.tuning.qualityBar}</div>}
            </div>
            {/* why it missed */}
            {d.reasonTally?.length > 0 && <div>
              <div className="text-[10px] uppercase text-txt-muted mb-1">Why movers were missed (feeds the tuning)</div>
              <div className="flex flex-wrap gap-1.5">{d.reasonTally.slice(0, 6).map((r, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-bg-base)', color: 'var(--color-txt-sec)' }}>{r.reason} ×{r.count}</span>)}</div>
            </div>}
            {/* trajectory history */}
            {hist.length > 0 && <div>
              <div className="text-[10px] uppercase text-txt-muted mb-1">Improvement trajectory (recent days)</div>
              <div className="overflow-x-auto"><table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                <thead><tr className="text-txt-sec text-left" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th className="px-2 py-1">Day</th><th className="px-2 py-1 text-right">Accuracy</th><th className="px-2 py-1 text-right">Catch%</th><th className="px-2 py-1 text-right">Quality bar</th><th className="px-2 py-1">Changed</th>
                </tr></thead>
                <tbody>{hist.map((h, i) => <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td className="px-2 py-1 font-bold">{h.date}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{h.accuracy ?? '–'}%</td>
                  <td className="px-2 py-1 text-right tabular-nums">{h.catchRate ?? '–'}%</td>
                  <td className="px-2 py-1 text-right tabular-nums">{h.qualityBar}</td>
                  <td className="px-2 py-1 text-txt-sec max-w-[260px] truncate" title={h.topChange || ''}>{h.changed ? (h.topChange || `${h.changed} change(s)`) : '—'}</td>
                </tr>)}</tbody>
              </table></div>
            </div>}
          </>}
        </div>
        <div className="shrink-0 px-4 py-2 border-t border-border mono text-[10px] text-txt-muted">
          Runs every evening (~17:32 IST): reviews the day's ≥5% movers it missed & why, then bounded auto-tuning toward the {g?.target ?? 85}% aim. Educational — accuracy is measured-historical, never a guarantee.
        </div>
      </div>
    </div>
  )
}
