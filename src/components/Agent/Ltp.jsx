import { useLiveLtp } from '../../store/liveLtp'

// Live-updating price cell — shows the polled LTP (flashing green/red on change)
// during market hours, else the scan's value.
export default function Ltp({ symbol, base, prefix = '', className = '' }) {
  const p = useLiveLtp(s => s.prices[symbol])
  const val = p?.ltp ?? base
  const up = p && p.prev != null && p.ltp > p.prev
  const dn = p && p.prev != null && p.ltp < p.prev
  return (
    <span className={`${className} ${up ? 'text-green' : dn ? 'text-red' : ''}`}
      title={p ? `live · ${new Date(p.ts).toLocaleTimeString()}` : ''}>
      {prefix}{val ?? '—'}{p ? <span className="text-green"> ●</span> : null}
    </span>
  )
}
