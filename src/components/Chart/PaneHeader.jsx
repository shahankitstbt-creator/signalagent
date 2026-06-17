import { useEffect, useRef, useState } from 'react'
import { useLayoutStore } from '../../store/layoutStore'
import { search as searchSymbols, ASSET_CLASSES } from '../../data/DataManager'

const TFS = ['5m', '15m', '1h', '1d', '1w']

// Compact header for a grid pane: asset class, symbol search, timeframe.
export default function PaneHeader({ paneIndex }) {
  const pane = useLayoutStore(s => s.panes[paneIndex])
  const setPane = useLayoutStore(s => s.setPane)
  const active = useLayoutStore(s => s.active)
  const setActive = useLayoutStore(s => s.setActive)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    searchSymbols(pane.assetClass, q).then(r => alive && setRes(r))
    return () => { alive = false }
  }, [q, open, pane.assetClass])

  useEffect(() => {
    const h = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className={`h-7 shrink-0 flex items-center gap-1 px-1.5 border-b ${active === paneIndex ? 'border-accent bg-bg-card' : 'border-border bg-bg-panel'}`}
      onMouseDown={() => setActive(paneIndex)}>
      <select value={pane.assetClass} onChange={e => setPane(paneIndex, { assetClass: e.target.value })}
        className="mono text-[10px] bg-bg-base border border-border rounded px-1 py-0.5 capitalize">
        {ASSET_CLASSES.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <div className="relative" ref={box}>
        <button onClick={() => setOpen(o => !o)} className="mono text-[11px] font-semibold px-1.5 py-0.5 rounded hover:bg-bg-base">{pane.symbol}</button>
        {open && (
          <div className="absolute z-50 mt-1 w-56 bg-bg-card border border-border rounded shadow-xl">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full px-2 py-1 bg-bg-base outline-none mono text-xs border-b border-border" />
            <div className="max-h-56 overflow-y-auto">
              {res.map(r => (
                <button key={r.symbol} onClick={() => { setPane(paneIndex, { symbol: r.symbol }); setOpen(false); setQ('') }}
                  className="w-full flex justify-between px-2 py-1 hover:bg-bg-panel mono text-[11px]">
                  <span>{r.symbol}</span><span className="text-txt-muted truncate ml-2">{r.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 ml-auto">
        {TFS.map(tf => (
          <button key={tf} onClick={() => setPane(paneIndex, { interval: tf })}
            className={`mono text-[10px] px-1 py-0.5 rounded ${pane.interval === tf ? 'bg-accent text-white' : 'text-txt-sec hover:bg-bg-base'}`}>{tf}</button>
        ))}
      </div>
    </div>
  )
}
