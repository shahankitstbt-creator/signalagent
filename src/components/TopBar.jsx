import { useEffect, useRef, useState } from 'react'
import { useChartStore } from '../store/chartStore'
import { search as searchSymbols, INTERVALS, ASSET_CLASSES } from '../data/DataManager'
import IndicatorMenu from './Indicators/IndicatorMenu'
import { useLayoutStore } from '../store/layoutStore'
import { useViewStore } from '../store/viewStore'
import ContentStudio from './Content/ContentStudio'

const TF_GROUPS = ['1m','5m','15m','30m','1h','1d','1w','1M']

export default function TopBar() {
  const assetClass = useChartStore(s => s.assetClass)
  const symbol = useChartStore(s => s.symbol)
  const interval = useChartStore(s => s.interval)
  const lastPrice = useChartStore(s => s.lastPrice)
  const setAssetClass = useChartStore(s => s.setAssetClass)
  const setSymbol = useChartStore(s => s.setSymbol)
  const setInterval = useChartStore(s => s.setInterval)

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [contentOpen, setContentOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    searchSymbols(assetClass, q).then(r => alive && setResults(r))
    return () => { alive = false }
  }, [q, open, assetClass])

  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="h-11 shrink-0 flex items-center gap-2 px-3 bg-bg-panel border-b border-border">
      <button onClick={() => useViewStore.getState().setView('board')} title="Back to Signal Board"
        className="mono text-xs px-2 py-1 rounded bg-bg-card border border-border hover:border-accent">🎯 Board</button>
      <span className="mono font-bold text-accent tracking-tight">ProTrader<span className="text-txt">OS</span></span>

      <select value={assetClass} onChange={e => setAssetClass(e.target.value)}
        className="mono text-xs bg-bg-card border border-border rounded px-1.5 py-1 capitalize">
        {ASSET_CLASSES.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      <div className="relative" ref={boxRef}>
        <button onClick={() => setOpen(o => !o)}
          className="mono font-semibold px-3 py-1 rounded bg-bg-card border border-border hover:border-accent">
          {symbol}
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-72 bg-bg-card border border-border rounded shadow-xl">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${assetClass}…`}
              className="w-full px-3 py-2 bg-bg-base outline-none mono text-sm border-b border-border" />
            <div className="max-h-80 overflow-y-auto">
              {results.length === 0 && <div className="px-3 py-2 text-txt-muted mono text-xs">No matches</div>}
              {results.map(r => (
                <button key={r.symbol} onClick={() => { setSymbol(r.symbol); setOpen(false); setQ('') }}
                  className="w-full flex justify-between px-3 py-1.5 hover:bg-bg-panel mono text-sm">
                  <span>{r.symbol}</span>
                  <span className="text-txt-muted truncate ml-2">{r.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {TF_GROUPS.map(tf => (
          <button key={tf} onClick={() => setInterval(tf)}
            className={`mono text-xs px-2 py-1 rounded ${interval === tf ? 'bg-accent text-white' : 'text-txt-sec hover:bg-bg-card'}`}>
            {tf}
          </button>
        ))}
      </div>

      <IndicatorMenu />

      <LayoutSelector />

      <button onClick={() => setContentOpen(true)} title="Content Studio — daily posts for IG/YouTube"
        className="mono text-xs px-2 py-1 rounded bg-bg-card border border-border hover:border-accent">📣 Content</button>
      {contentOpen && <ContentStudio onClose={() => setContentOpen(false)} />}

      <div className="ml-auto mono text-sm">
        {lastPrice != null && <span className="text-txt">{symbol} <span className="text-gold">{lastPrice}</span></span>}
      </div>
    </div>
  )
}

function LayoutSelector() {
  const layout = useLayoutStore(s => s.layout)
  const setLayout = useLayoutStore(s => s.setLayout)
  return (
    <div className="flex items-center gap-0.5">
      {[[1, '▢'], [2, '◫'], [4, '田']].map(([n, icon]) => (
        <button key={n} onClick={() => setLayout(n)} title={`${n} chart${n > 1 ? 's' : ''}`}
          className={`mono text-xs px-1.5 py-1 rounded ${layout === n ? 'bg-accent text-white' : 'text-txt-sec hover:bg-bg-card'}`}>{icon}</button>
      ))}
    </div>
  )
}
