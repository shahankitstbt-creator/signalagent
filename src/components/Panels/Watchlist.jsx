import { useEffect, useState } from 'react'
import { useChartStore } from '../../store/chartStore'
import { INDIAN_INDICES } from '../../data/YahooFeed'

const norm = s => s.toUpperCase().replace(/\s+/g, ' ').trim()

// Indian indices with today's % move + advance/decline breadth.
export default function Watchlist() {
  const symbol = useChartStore(s => s.symbol)
  const setAssetClass = useChartStore(s => s.setAssetClass)
  const setSymbol = useChartStore(s => s.setSymbol)
  const [chg, setChg] = useState({})       // ticker -> % change today
  const [breadth, setBreadth] = useState({}) // normalized name -> {advancing,declining,advPct,bias}

  useEffect(() => {
    let alive = true
    const loadChg = async () => {
      const entries = await Promise.all(INDIAN_INDICES.map(async ([sym]) => {
        try {
          const r = await fetch(`/yahoo/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`)
          const d = await r.json()
          const c = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(x => x != null)
          if (c && c.length >= 2) return [sym, ((c.at(-1) - c.at(-2)) / c.at(-2)) * 100]
        } catch { /* ignore */ }
        return [sym, null]
      }))
      if (alive) setChg(Object.fromEntries(entries))
    }
    const loadBreadth = async () => {
      try {
        const r = await fetch('/breadth.json?t=' + Date.now())
        if (!r.ok) return
        const d = await r.json()
        const m = {}; for (const [k, v] of Object.entries(d.breadth || {})) m[norm(k)] = v
        if (alive) setBreadth(m)
      } catch { /* ignore */ }
    }
    loadChg(); loadBreadth()
    const id = setInterval(() => { loadChg(); loadBreadth() }, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const open = sym => { setAssetClass('indices'); setSymbol(sym) }

  return (
    <div>
      <div className="text-txt-sec text-xs uppercase tracking-wide mb-1">Indian Indices</div>
      <div className="space-y-0.5">
        {INDIAN_INDICES.map(([sym, name]) => {
          const pc = chg[sym]
          const bd = breadth[norm(name)]
          return (
            <button key={sym} onClick={() => open(sym)}
              className={`w-full px-1.5 py-1 rounded text-left ${symbol === sym ? 'bg-bg-card' : 'hover:bg-bg-card'}`}>
              <div className="flex items-center justify-between mono text-[11px]">
                <span className="text-txt truncate pr-1">{name}</span>
                {pc != null
                  ? <span className={pc >= 0 ? 'text-green' : 'text-red'}>{pc >= 0 ? '+' : ''}{pc.toFixed(2)}%</span>
                  : <span className="text-txt-muted">—</span>}
              </div>
              {bd && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="mono text-[9px] text-green w-7">▲{bd.advancing}</span>
                  <div className="flex-1 h-1 rounded bg-bg-base overflow-hidden flex">
                    <div className="bg-green h-full" style={{ width: `${bd.advPct}%` }} />
                    <div className="bg-red h-full" style={{ width: `${100 - bd.advPct}%` }} />
                  </div>
                  <span className="mono text-[9px] text-red w-7 text-right">▼{bd.declining}</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
