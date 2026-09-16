import { useEffect, useState, useRef } from 'react'
import { useChartStore } from '../../store/chartStore'
import { useWatchlistStore } from '../../store/watchlistStore'
import { search } from '../../data/DataManager'

// User watchlists — your own named lists, add/remove any symbol, live % move, click to open on the chart.
export default function Watchlist() {
  const symbol = useChartStore(s => s.symbol)
  const openSymbol = useChartStore(s => s.openSymbol)
  const { lists, active, addSymbol, removeSymbol, addList, removeList, setActive } = useWatchlistStore()
  const rows = lists[active] || []
  const [chg, setChg] = useState({})
  const [q, setQ] = useState('')
  const [cls, setCls] = useState('stocks')
  const [results, setResults] = useState([])
  const [adding, setAdding] = useState(false)
  const tRef = useRef()

  // live % change for the active list
  useEffect(() => {
    let alive = true
    const loadChg = async () => {
      const entries = await Promise.all(rows.map(async r => {
        try {
          const res = await fetch(`/yahoo/v8/finance/chart/${encodeURIComponent(r.symbol)}?interval=1d&range=5d`)
          const d = await res.json()
          const c = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(x => x != null)
          if (c && c.length >= 2) return [r.symbol, ((c.at(-1) - c.at(-2)) / c.at(-2)) * 100]
        } catch { }
        return [r.symbol, null]
      }))
      if (alive) setChg(Object.fromEntries(entries))
    }
    loadChg(); const id = setInterval(loadChg, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [active, rows.length])

  // debounced symbol search for the add box
  useEffect(() => {
    clearTimeout(tRef.current)
    if (!q.trim()) { setResults([]); return }
    tRef.current = setTimeout(async () => { try { setResults((await search(cls, q)).slice(0, 8)) } catch { setResults([]) } }, 200)
    return () => clearTimeout(tRef.current)
  }, [q, cls])

  const pick = r => { addSymbol(r.symbol, r.name, cls); setQ(''); setResults([]); setAdding(false) }

  return (
    <div>
      {/* list switcher */}
      <div className="flex items-center gap-1 mb-1.5">
        <select value={active} onChange={e => setActive(e.target.value)}
          className="flex-1 min-w-0 bg-bg-card border border-border rounded px-1.5 py-1 text-[11px] text-txt mono">
          {Object.keys(lists).map(n => <option key={n} value={n}>{n} ({lists[n].length})</option>)}
        </select>
        <button title="New list" onClick={() => { const n = prompt('New watchlist name:'); if (n) addList(n) }} className="ibtn !w-7 !h-7 text-sm">+</button>
        <button title="Delete this list" onClick={() => { if (confirm(`Delete list "${active}"?`)) removeList(active) }} className="ibtn !w-7 !h-7 text-xs">🗑</button>
        <button title="Add symbol" onClick={() => setAdding(v => !v)} className="ibtn !w-7 !h-7 text-sm" style={adding ? { color: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : {}}>＋</button>
      </div>

      {/* add-symbol search */}
      {adding && (
        <div className="mb-2 p-1.5 rounded bg-bg-card border border-border">
          <div className="flex gap-1 mb-1">
            {['stocks', 'indices'].map(c => (
              <button key={c} onClick={() => setCls(c)} className={`px-2 py-0.5 rounded text-[10px] mono ${cls === c ? 'bg-accent-primary text-white' : 'text-txt-sec bg-bg-base'}`}>{c}</button>
            ))}
          </div>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${cls}…`}
            className="w-full bg-bg-base border border-border rounded px-2 py-1 text-[11px] text-txt mono outline-none focus:border-accent" />
          {results.length > 0 && (
            <div className="mt-1 max-h-44 overflow-auto">
              {results.map(r => (
                <button key={r.symbol} onClick={() => pick(r)} className="w-full text-left px-1.5 py-1 rounded hover:bg-bg-base mono text-[11px] flex justify-between gap-2">
                  <span className="text-txt truncate">{r.name}</span><span className="text-txt-muted shrink-0">{r.symbol}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* rows */}
      <div className="space-y-0.5">
        {rows.length === 0 && <div className="text-txt-muted text-[11px] mono px-1.5 py-2">Empty — tap ＋ to add symbols.</div>}
        {rows.map(r => {
          const pc = chg[r.symbol]
          return (
            <div key={r.symbol} className={`group flex items-center rounded ${symbol === r.symbol ? 'bg-bg-card' : 'hover:bg-bg-card'}`}>
              <button onClick={() => openSymbol(r.assetClass, r.symbol)} className="flex-1 min-w-0 px-1.5 py-1 text-left">
                <div className="flex items-center justify-between mono text-[11px] gap-1">
                  <span className="text-txt truncate">{r.name}</span>
                  {pc != null ? <span className={pc >= 0 ? 'text-green' : 'text-red'}>{pc >= 0 ? '+' : ''}{pc.toFixed(2)}%</span> : <span className="text-txt-muted">—</span>}
                </div>
              </button>
              <button title="Remove" onClick={() => removeSymbol(r.symbol)} className="px-1.5 text-txt-muted hover:text-red opacity-0 group-hover:opacity-100 text-xs">✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
