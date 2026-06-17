import { useEffect, useState } from 'react'

// Option chain. Live NSE premiums/OI are bot-blocked & need a paid F&O feed, so
// this prices a THEORETICAL chain (Black-Scholes) off the live index spot.
// Honest + useful: ATM, theoretical Call/Put premia and deltas across strikes.
const UNDERLYINGS = [
  { name: 'NIFTY', sym: '^NSEI', step: 50 },
  { name: 'BANKNIFTY', sym: '^NSEBANK', step: 100 },
  { name: 'FINNIFTY', sym: '^CNXFIN', step: 50 },
  { name: 'SENSEX', sym: '^BSESN', step: 100 },
]
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
const N = (x) => 0.5 * (1 + erf(x / Math.SQRT2))
function bs(S, K, T, iv, type) {
  const r = 0.065
  if (T <= 0 || iv <= 0) return { px: type === 'C' ? Math.max(0, S - K) : Math.max(0, K - S), delta: 0 }
  const d1 = (Math.log(S / K) + (r + iv * iv / 2) * T) / (iv * Math.sqrt(T))
  const d2 = d1 - iv * Math.sqrt(T)
  const px = type === 'C' ? S * N(d1) - K * Math.exp(-r * T) * N(d2) : K * Math.exp(-r * T) * N(-d2) - S * N(-d1)
  return { px: Math.max(0, px), delta: type === 'C' ? N(d1) : N(d1) - 1 }
}

export default function OptionChain() {
  const [u, setU] = useState(UNDERLYINGS[0])
  const [spot, setSpot] = useState(null)
  const [iv, setIv] = useState(14)
  const [dte, setDte] = useState(7)

  useEffect(() => {
    let alive = true
    fetch(`/yahoo/v8/finance/chart/${encodeURIComponent(u.sym)}?interval=1d&range=1d`)
      .then(r => r.json()).then(d => { const c = d?.chart?.result?.[0]?.meta?.regularMarketPrice; if (alive && c) setSpot(c) }).catch(() => {})
    return () => { alive = false }
  }, [u])

  const atm = spot ? Math.round(spot / u.step) * u.step : null
  const T = dte / 365, sig = iv / 100
  const strikes = atm ? Array.from({ length: 13 }, (_, i) => atm + (i - 6) * u.step) : []

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <select value={u.name} onChange={e => setU(UNDERLYINGS.find(x => x.name === e.target.value))}
          className="mono text-xs bg-bg-card border border-border rounded px-1.5 py-1">
          {UNDERLYINGS.map(x => <option key={x.name}>{x.name}</option>)}
        </select>
        <span className="mono text-xs text-txt-sec">Spot <span className="text-gold">{spot ? spot.toFixed(0) : '…'}</span></span>
        <label className="mono text-[10px] text-txt-muted ml-auto">IV%<input type="number" value={iv} onChange={e => setIv(+e.target.value || 0)} className="w-10 ml-1 bg-bg-base border border-border rounded px-1 text-right" /></label>
        <label className="mono text-[10px] text-txt-muted">DTE<input type="number" value={dte} onChange={e => setDte(+e.target.value || 0)} className="w-10 ml-1 bg-bg-base border border-border rounded px-1 text-right" /></label>
      </div>

      <div className="grid grid-cols-3 mono text-[10px] text-txt-muted px-1 pb-1 border-b border-border">
        <span>CALL</span><span className="text-center">STRIKE</span><span className="text-right">PUT</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!spot && <div className="text-txt-muted mono text-xs p-2">Loading spot…</div>}
        {strikes.map(K => {
          const call = bs(spot, K, T, sig, 'C'), put = bs(spot, K, T, sig, 'P')
          const isAtm = K === atm
          return (
            <div key={K} className={`grid grid-cols-3 mono text-[10px] px-1 py-0.5 ${isAtm ? 'bg-bg-card' : ''}`}>
              <span className="text-green">{call.px.toFixed(1)} <span className="text-txt-muted">{call.delta.toFixed(2)}</span></span>
              <span className={`text-center ${isAtm ? 'text-gold font-bold' : 'text-txt'}`}>{K}</span>
              <span className="text-right text-red"><span className="text-txt-muted">{put.delta.toFixed(2)}</span> {put.px.toFixed(1)}</span>
            </div>
          )
        })}
      </div>
      <div className="text-[9px] mono text-txt-muted mt-1 leading-tight border-t border-border pt-1">
        Theoretical (Black-Scholes) from live spot. Live NSE LTP/OI needs a paid F&O feed.
      </div>
    </div>
  )
}
