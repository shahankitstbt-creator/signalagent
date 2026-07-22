import { useEffect, useState } from 'react'
import { useViewStore } from '../../store/viewStore'

const inr = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN')
const pctCls = v => v > 0 ? 'text-green' : v < 0 ? 'text-red' : 'text-txt-sec'
const sign = v => (v > 0 ? '+' : '') + v
const dt = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toISOString().slice(0, 10) }
const tm = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(11, 16) + ' UTC' }

export default function TradingJournal() {
  const setView = useViewStore(s => s.setView)
  const [book, setBook] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('open')

  const load = () => fetch('/trade_book.json?t=' + Date.now(), { cache: 'no-store' })
    .then(async r => { const t = await r.text(); if (!r.ok || t.trim().startsWith('<')) throw new Error('Journal builds with the next daily scan — check back shortly.'); return JSON.parse(t) })
    .then(setBook).catch(e => setErr(e.message))
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [])

  const st = book?.stats
  const open = Object.values(book?.open || {}).sort((a, b) => (b.entryDate || '').localeCompare(a.entryDate || ''))
  const closed = [...(book?.closed || [])].reverse()
  const thisMonth = st?.monthly?.[st.monthly.length - 1]

  return (
    <div className="h-full flex flex-col bg-bg-base text-txt overflow-hidden">
      {/* header */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 border-b border-border bg-bg-panel flex items-center gap-3 flex-wrap">
        <button onClick={() => setView('board')} className="mono text-xs text-txt-sec hover:text-accent">← Board</button>
        <div className="mono text-base sm:text-lg font-bold brand-grad tracking-tight">📓 Trading Journal</div>
        <span className="mono text-[10px] text-txt-muted">₹10L paper portfolio · every high-conviction signal taken · sizing by risk · aim 5–7%/mo</span>
        <button onClick={load} className="mono text-xs text-txt-sec hover:text-accent ml-auto">⟳</button>
      </div>

      {err && !book && <div className="p-6 mono text-sm text-yellow">{err}</div>}

      {book && (
        <>
          {/* stat tiles */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-px bg-border border-b border-border">
            <Tile label="Equity" value={inr(st.equity)} sub={`start ${inr(book.capitalStart)}`} tone={st.totalPct >= 0 ? 'text-green' : 'text-red'} />
            <Tile label="Total P&L" value={`${sign(st.totalPct)}%`} sub={inr(st.equity - book.capitalStart)} tone={pctCls(st.totalPct)} />
            <Tile label="This month" value={thisMonth ? `${sign(thisMonth.pct)}%` : '—'} sub={`aim ${st.monthTarget.min}–${st.monthTarget.max}%`} tone={thisMonth ? pctCls(thisMonth.pct) : ''} />
            <Tile label="Realised" value={inr(st.realizedPnl)} sub={`${sign(st.realizedPct)}%`} tone={pctCls(st.realizedPnl)} />
            <Tile label="Win rate" value={st.winRate != null ? `${st.winRate}%` : '—'} sub={`${st.wins}W / ${st.losses}L`} />
            <Tile label="Open / Closed" value={`${st.open} / ${st.closedCount}`} sub={`${inr(st.cash)} cash`} />
            <Tile label="Profit factor" value={st.profitFactor != null ? st.profitFactor : '—'} sub={st.onTimeWinRate != null ? `${st.onTimeWinRate}% hit on time` : 'building'} />
          </div>

          {/* tabs */}
          <div className="shrink-0 flex gap-1 px-3 pt-2 bg-bg-panel border-b border-border">
            {[['open', `Open (${open.length})`], ['closed', `Closed (${closed.length})`]].map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`mono text-xs px-3 py-2 rounded-t-lg border-b-2 ${tab === k ? 'text-accent border-accent font-bold' : 'text-txt-sec border-transparent'}`}
                style={tab === k ? { background: 'rgba(41,98,255,0.08)' } : {}}>{lbl}</button>
            ))}
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

function Tile({ label, value, sub, tone }) {
  return (
    <div className="bg-bg-panel px-3 py-2">
      <div className="text-[10px] text-txt-muted uppercase tracking-wide">{label}</div>
      <div className={`mono text-sm sm:text-base font-bold ${tone || 'text-txt'}`}>{value}</div>
      {sub && <div className="text-[10px] text-txt-sec">{sub}</div>}
    </div>
  )
}

function KindTag({ s }) {
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${s.kind === 'FNO' ? 'bg-accent-purple' : 'bg-accent-primary'}`}>{s.kind === 'FNO' ? 'F&O' : 'CASH'}</span>
}

function OpenTable({ rows }) {
  if (!rows.length) return <Empty msg="No open paper positions yet — they open as new high-conviction signals fire." />
  return (
    <table className="w-full mono text-xs border-collapse">
      <thead><tr className="text-txt-sec text-[10px] uppercase sticky top-0 bg-bg-panel">
        {['Symbol', '', 'Dir', 'Qty', 'Entry', 'Entry date', 'LTP', 'Unrealised', 'SL', 'T1', 'Grade', 'Setup'].map((h, i) =>
          <th key={i} className={`px-3 py-2 font-semibold ${[3, 4, 6, 7, 8, 9].includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.id + i} className="border-b border-border hover:bg-bg-card">
            <td className="px-3 py-2 font-bold">{s.symbol}</td>
            <td className="px-3 py-2"><KindTag s={s} /></td>
            <td className="px-3 py-2"><span className={s.direction === 'SHORT' ? 'text-red' : 'text-green'}>{s.direction === 'SHORT' ? 'SELL' : 'BUY'}</span></td>
            <td className="px-3 py-2 text-right">{s.qty}{s.lots ? <span className="text-txt-muted"> ({s.lots}L)</span> : ''}</td>
            <td className="px-3 py-2 text-right">₹{s.entryPrice}</td>
            <td className="px-3 py-2 text-txt-sec">{s.entryDate}</td>
            <td className="px-3 py-2 text-right text-txt-sec">₹{s.ltp}</td>
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

function ClosedTable({ rows }) {
  if (!rows.length) return <Empty msg="No closed trades yet — outcomes journal here as targets/stops are hit." />
  return (
    <table className="w-full mono text-xs border-collapse">
      <thead><tr className="text-txt-sec text-[10px] uppercase sticky top-0 bg-bg-panel">
        {['Symbol', '', 'Dir', 'Qty', 'Entry', 'Exit', 'Held', 'Result', 'P&L', 'Target / on time', 'Notes'].map((h, i) =>
          <th key={i} className={`px-3 py-2 font-semibold ${[3, 4, 5, 8].includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.id + i} className="border-b border-border hover:bg-bg-card align-top">
            <td className="px-3 py-2 font-bold">{s.symbol}</td>
            <td className="px-3 py-2"><KindTag s={s} /></td>
            <td className="px-3 py-2"><span className={s.direction === 'SHORT' ? 'text-red' : 'text-green'}>{s.direction === 'SHORT' ? 'SELL' : 'BUY'}</span></td>
            <td className="px-3 py-2 text-right">{s.qty}{s.lots ? ` (${s.lots}L)` : ''}</td>
            <td className="px-3 py-2 text-right">₹{s.entryPrice}<div className="text-[10px] text-txt-muted">{s.entryDate}</div></td>
            <td className="px-3 py-2 text-right">₹{s.exitPrice}<div className="text-[10px] text-txt-muted">{s.exitDate}</div></td>
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
