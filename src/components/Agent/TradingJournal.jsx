import { useEffect, useState, useMemo } from 'react'
import { useViewStore } from '../../store/viewStore'

// column-header sorting for the journal tables
const JACC = {
  symbol: r => r.symbol || '', qty: r => r.qty, entry: r => r.entryPrice, entryDate: r => r.entryDate,
  ltp: r => r.ltp, unreal: r => r.unrealizedPct, sl: r => r.sl, t1: r => r.targets?.[0]?.price, grade: r => r.grade || '',
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

  const load = () => fetch('/trade_book.json?t=' + Date.now(), { cache: 'no-store' })
    .then(async r => { const t = await r.text(); if (!r.ok || t.trim().startsWith('<')) throw new Error('Journal builds with the next daily scan — check back shortly.'); return JSON.parse(t) })
    .then(setBook).catch(e => setErr(e.message))
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [])

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
        <button onClick={load} className="mono text-xs text-txt-sec hover:text-accent ml-auto">⟳</button>
      </div>

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
                <span key={i} className="px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--color-red) 12%, transparent)', color: 'var(--color-red)' }} title={`avg ${l.avgLossPct}% · last ${l.lastSymbol || '—'}`}>{l.category} ×{l.count}</span>
              ))}
              {st.activeCooldowns > 0 && <span className="px-2 py-0.5 rounded-full text-txt-sec" style={{ background: 'var(--color-bg-base)' }}>⏸ {st.activeCooldowns} names in post-loss cooldown (won't re-enter)</span>}
            </div>
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
        <JTh label="Qty" k="qty" s={s} cls={R} /><JTh label="Entry" k="entry" s={s} cls={R} /><JTh label="Entry date · time" k="entryDate" s={s} cls={L} />
        <JTh label="LTP" k="ltp" s={s} cls={R} /><JTh label="Unrealised" k="unreal" s={s} cls={R} /><JTh label="SL" k="sl" s={s} cls={R} />
        <JTh label="T1" k="t1" s={s} cls={R} /><JTh label="Grade" k="grade" s={s} cls={L} /><th className={L}>Setup</th>
      </tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.id + i} className="border-b border-border hover:bg-bg-card">
            <td className="px-3 py-2 font-bold">{s.symbol}</td>
            <td className="px-3 py-2"><KindTag s={s} /></td>
            <td className="px-3 py-2"><span className={s.direction === 'SHORT' ? 'text-red' : 'text-green'}>{s.direction === 'SHORT' ? 'SELL' : 'BUY'}</span></td>
            <td className="px-3 py-2 text-right">{s.qty}{s.lots ? <span className="text-txt-muted"> ({s.lots}L)</span> : ''}</td>
            <td className="px-3 py-2 text-right">₹{entryPx(s)}{isOpt(s) && <span className="text-[9px] text-txt-muted"> prem</span>}</td>
            <td className="px-3 py-2 text-txt-sec">{dIST(s.entryAt, s.entryDate)}<div className="text-[10px] text-txt-muted">{tIST(s.entryAt)}</div></td>
            <td className="px-3 py-2 text-right text-txt-sec">₹{curPx(s)}</td>
            <td className={`px-3 py-2 text-right font-bold ${pctCls(s.unrealizedPnl)}`}>{inr(s.unrealizedPnl)}<span className="text-[10px]"> ({sign(s.unrealizedPct)}%)</span></td>
            <td className="px-3 py-2 text-right text-red">₹{s.sl}</td>
            <td className="px-3 py-2 text-right text-green">₹{s.targets?.[0]?.price}</td>
            <td className="px-3 py-2">{s.grade ? <span className="px-1.5 rounded bg-bg-card text-[10px]">{s.grade}</span> : '—'}{s.footprint && !s.footprint.weak ? ' 🕵️' : ''}</td>
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
        <JTh label="Qty" k="qty" s={s} cls={R} /><JTh label="Entry · time" k="entry" s={s} cls={R} /><JTh label="Exit · time" k="exit" s={s} cls={R} />
        <JTh label="Held" k="held" s={s} cls={L} /><JTh label="Result" k="result" s={s} cls={L} /><JTh label="P&L" k="pnl" s={s} cls={R} />
        <th className={L}>Target / on time</th><th className={L}>Notes</th>
      </tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.id + i} className="border-b border-border hover:bg-bg-card align-top">
            <td className="px-3 py-2 font-bold">{s.symbol}</td>
            <td className="px-3 py-2"><KindTag s={s} /></td>
            <td className="px-3 py-2"><span className={s.direction === 'SHORT' ? 'text-red' : 'text-green'}>{s.direction === 'SHORT' ? 'SELL' : 'BUY'}</span></td>
            <td className="px-3 py-2 text-right">{s.qty}{s.lots ? ` (${s.lots}L)` : ''}</td>
            <td className="px-3 py-2 text-right">₹{entryPx(s)}{isOpt(s) && <span className="text-[9px] text-txt-muted"> prem</span>}<div className="text-[10px] text-txt-muted">{dIST(s.entryAt, s.entryDate)} · {tIST(s.entryAt)}</div></td>
            <td className="px-3 py-2 text-right">₹{exitPx(s)}<div className="text-[10px] text-txt-muted">{dIST(s.exitAt, s.exitDate)} · {tIST(s.exitAt)}</div></td>
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
