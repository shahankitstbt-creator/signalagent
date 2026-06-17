import { useEffect, useState } from 'react'
import { usePicksStore } from '../../store/picksStore'
import { useChartStore } from '../../store/chartStore'
import OptionChain from './OptionChain'

const confColor = (c) => c >= 80 ? 'text-green' : c >= 65 ? 'text-cyan' : c >= 50 ? 'text-yellow' : 'text-txt-sec'
const statusBadge = (s) => s === 'up' ? 'text-green' : s === 'stable' ? 'text-cyan' : s === 'down' ? 'text-red' : 'text-txt-muted'

export default function PicksPanel() {
  const [tab, setTab] = useState('picks')
  const picks = usePicksStore(s => s.picks)
  const meta = usePicksStore(s => s.meta)
  const loading = usePicksStore(s => s.loading)
  const error = usePicksStore(s => s.error)
  const watchlist = usePicksStore(s => s.watchlist)
  const signals = usePicksStore(s => s.signals)
  const engine = usePicksStore(s => s.engine)
  const loadPicks = usePicksStore(s => s.loadPicks)

  useEffect(() => { loadPicks() }, [loadPicks])

  // watchlist sorted by LTP (low → high), high confidence first on ties.
  // coerce so stale items without a numeric price still sort deterministically.
  const num = (x) => { const n = +x; return Number.isFinite(n) ? n : Infinity }
  const sortedWatch = [...watchlist].sort((a, b) => (num(a.price) - num(b.price)) || (num(b.confidence) - num(a.confidence)))
  const list = tab === 'picks' ? picks : tab === 'signals' ? signals : sortedWatch

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {['picks', 'signals', 'watchlist', 'options'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`mono text-xs px-2 py-1 rounded capitalize ${tab === t ? 'bg-accent text-white' : 'text-txt-sec hover:bg-bg-card'}`}>
            {t}{t === 'picks' ? ` · ${picks.length}` : t === 'signals' ? ` · ${signals.length}` : t === 'watchlist' ? ` · ${watchlist.length}` : ''}
          </button>
        ))}
        <button onClick={loadPicks} title="Reload" className="ml-auto text-txt-sec hover:text-txt px-1">⟳</button>
      </div>

      {tab === 'options' && <OptionChain />}

      {tab === 'signals' && engine && (
        <div className="mb-2 text-[10px] mono">
          <div className="text-txt-muted leading-tight mb-1">{engine.activeLogics} strategies ≥{engine.minAccuracy}% backtested · {new Date(engine.generatedAt).toLocaleString()}</div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {(engine.logics || []).map(l => (
              <div key={l.id} className="flex justify-between">
                <span className={l.active ? 'text-txt' : 'text-txt-muted'}>{l.active ? '✓' : '·'} {l.name}</span>
                <span className={l.accuracy >= 65 ? 'text-green' : l.accuracy >= 58 ? 'text-cyan' : 'text-txt-muted'}>{l.accuracy}% <span className="text-txt-muted">({l.trades})</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {meta && tab === 'picks' && (
        <div className="text-[10px] mono text-txt-muted mb-2 leading-tight">
          {new Date(meta.generatedAt).toLocaleString()} · scanned {meta.scanned} · {meta.candidates} qualified
        </div>
      )}
      {tab !== 'options' && <>
        {tab === 'watchlist' && watchlist.length > 0 && <div className="text-[10px] mono text-txt-muted mb-1">sorted by LTP ↑ (low → high)</div>}
        {loading && <div className="text-txt-sec mono text-xs">Loading…</div>}
        {error && <div className="text-yellow mono text-xs leading-tight">{error}</div>}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {!loading && list.length === 0 && (
            <div className="text-txt-muted mono text-xs">
              {tab === 'picks' ? 'No picks. Run `npm run scan`.' : 'No stocks added yet. Add from Picks.'}
            </div>
          )}
          {list.map(p => <PickCard key={p.symbol} p={p} tab={tab} />)}
        </div>
      </>}
    </div>
  )
}

function PickCard({ p, tab }) {
  const [open, setOpen] = useState(false)
  const add = usePicksStore(s => s.addToWatchlist)
  const remove = usePicksStore(s => s.removeFromWatchlist)
  const inWL = usePicksStore(s => s.inWatchlist(p.symbol))
  const openSymbol = useChartStore(s => s.openSymbol)
  const f = p.fundamentals

  const openChart = () => openSymbol('stocks', `${p.symbol}.NS`)

  return (
    <div className="rounded border border-border bg-bg-panel p-2">
      <div className="flex items-center justify-between">
        <button onClick={openChart} className="mono text-sm font-bold text-txt hover:text-accent text-left">{p.symbol}</button>
        <span className="flex items-center gap-2">
          <span className="mono text-xs text-gold">{p.price != null ? `₹${p.price}` : ''}</span>
          <span className={`mono text-sm font-bold ${confColor(p.confidence)}`}>{p.confidence}%</span>
        </span>
      </div>
      <div className="text-[10px] text-txt-muted truncate">{p.name} · {p.sector}</div>
      {p.logic && (
        <div className="flex items-center gap-1.5 mt-0.5 mono text-[10px]">
          <span className="px-1 rounded bg-purple/20 text-purple">{p.logic}</span>
          {p.accuracy != null && <span className="text-cyan">{p.accuracy}% backtested</span>}
        </div>
      )}
      {p.setupType && (
        <div className="flex items-center gap-1.5 mt-0.5 mono text-[10px]">
          <span className="px-1 rounded bg-accent/20 text-accent">{p.setupType}</span>
          {p.moveScore != null && <span className="text-txt-sec">move {p.moveScore}/100</span>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 mt-1.5 mono text-[10px]">
        <Cell label="Entry" val={p.entry} />
        <Cell label="SL" val={`${p.sl} (${p.slPct}%)`} cls="text-red" />
        <Cell label="RSI" val={p.rsi} />
      </div>
      <div className="mt-1 space-y-0.5">
        {p.targets.map((t, i) => (
          <div key={i} className="flex justify-between mono text-[10px]">
            <span className="text-txt-sec">T{i + 1} {t.price}</span>
            <span className="text-green">+{t.pct}%</span>
            <span className="text-txt-muted">by {t.by}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-1.5 mono text-[10px] text-txt-sec">
        <span>confluence {p.confluencePct}%</span>
        {p.backtestHitRate != null && <span className="text-cyan">backtest {p.backtestHitRate}% ({p.backtestTrades})</span>}
        <span className="text-txt-muted">R:R 1:{p.rr}</span>
      </div>

      {f && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 mono text-[10px]">
          <span className={statusBadge(f.promoter.status)}>Prom {f.promoter.status}</span>
          <span className={statusBadge(f.fii.status)}>FII {f.fii.status}</span>
          <span className={statusBadge(f.dii.status)}>DII {f.dii.status}</span>
          <span className={f.pledge.low ? 'text-green' : 'text-red'}>Pledge {f.pledge.pct ?? '?'}%</span>
        </div>
      )}

      <button onClick={() => setOpen(o => !o)} className="mono text-[10px] text-accent mt-1">{open ? '− why' : '+ why / expected'}</button>
      {open && (
        <div className="mt-1 mono text-[10px] text-txt-sec leading-snug">
          <div className="mb-1"><span className="text-txt-muted">Why: </span>{p.why}</div>
          <div><span className="text-txt-muted">Expected: </span>{p.expected}</div>
        </div>
      )}

      <div className="flex gap-1 mt-1.5">
        <button onClick={openChart} className="flex-1 mono text-[10px] py-1 rounded bg-bg-card border border-border hover:border-accent">Chart</button>
        {tab === 'watchlist'
          ? <button onClick={() => remove(p.symbol)} className="flex-1 mono text-[10px] py-1 rounded bg-red/80 text-white">Remove</button>
          : <button onClick={() => add(p)} disabled={inWL}
              className="flex-1 mono text-[10px] py-1 rounded bg-accent/90 text-white disabled:opacity-40">{inWL ? '✓ Added' : '★ Watchlist'}</button>}
      </div>
    </div>
  )
}

function Cell({ label, val, cls }) {
  return <div><div className="text-txt-muted">{label}</div><div className={cls || 'text-txt'}>{val}</div></div>
}
