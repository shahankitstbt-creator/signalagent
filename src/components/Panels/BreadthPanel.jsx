import { useEffect, useState } from 'react'

// Advance/Decline breadth per index — how many constituents are green vs red.
// Defines the trend/bias of each index (like a market heat-map summary).
export default function BreadthPanel() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => fetch('/breadth.json?t=' + Date.now()).then(r => r.ok ? r.json() : null).then(d => alive && setData(d)).catch(() => {})
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const rows = data?.breadth ? Object.entries(data.breadth).sort((a, b) => b[1].advPct - a[1].advPct) : []

  return (
    <div>
      <div className="text-txt-sec text-xs uppercase tracking-wide mb-1">Market Breadth (A/D)</div>
      {rows.length === 0 && <div className="text-txt-muted mono text-[11px]">Runs with the scan…</div>}
      <div className="space-y-1">
        {rows.map(([name, b]) => (
          <div key={name} className="mono text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-txt truncate pr-1">{name}</span>
              <span className={b.bias === 'Bullish' ? 'text-green' : b.bias === 'Bearish' ? 'text-red' : 'text-txt-sec'}>
                ▲{b.advancing} ▼{b.declining}
              </span>
            </div>
            <div className="h-1.5 rounded bg-bg-base overflow-hidden flex mt-0.5">
              <div className="bg-green h-full" style={{ width: `${b.advPct}%` }} />
              <div className="bg-red h-full" style={{ width: `${100 - b.advPct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
