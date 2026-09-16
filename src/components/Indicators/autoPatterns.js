// Auto pattern indicators — Auto Fibonacci + Auto Harmonic. Both auto-detect the live swing structure
// (ZigZag via findPivots) and draw levels/zones/projections that update as new pivots form. The projected
// (dashed) levels are PROBABILISTIC targets the market tends to react to — not guarantees.
import { findPivots } from './LiquidityEngine'

const num = (key, label, def) => ({ key, label, default: def, type: 'number' })
const col = (key, label, def) => ({ key, label, default: def, type: 'color' })
const wid = (key, label, def) => ({ key, label, default: def, type: 'width' })

// the most recent N alternating (high/low) pivots
function lastAlternating(piv, n) {
  const alt = []
  for (let i = piv.length - 1; i >= 0 && alt.length < n; i--) {
    if (!alt.length || piv[i].type !== alt[0].type) alt.unshift(piv[i])
  }
  return alt.length === n ? alt : null
}

export const AUTO = {
  // ── AUTO FIBONACCI — retracement of the active swing + extension targets (the projected move) ──
  auto_fib: {
    name: 'Auto Fibonacci', type: 'overlay',
    inputs: [num('depth', 'Swing Depth', 3), col('color', 'Level Color', '#af82d5'), col('proj', 'Target Color', '#e5a73e'), wid('width', 'Width', 1)],
    compute: (b, o) => {
      const piv = findPivots(b, o.depth, o.depth)
      const alt = lastAlternating(piv, 2)
      if (!alt) return {}
      const [prev, last] = alt
      const up = last.price > prev.price                 // up-leg (low→high) → retraces down; else down-leg
      const hi = Math.max(last.price, prev.price), lo = Math.min(last.price, prev.price), range = hi - lo || 1
      const retr = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
      const ext = [1.272, 1.618, 2.618]
      const levels = []
      for (const f of retr) {
        const price = up ? hi - range * f : lo + range * f
        levels.push({ price: +price.toFixed(2), color: o.color, title: `Fib ${(f * 100).toFixed(1)}%`, width: (f === 0.618 || f === 0.5) ? o.width + 1 : o.width, style: (f === 0 || f === 1) ? 0 : 2 })
      }
      for (const f of ext) {                              // extension = the PROJECTED continuation target
        const price = up ? hi + range * (f - 1) : lo - range * (f - 1)
        levels.push({ price: +price.toFixed(2), color: o.proj, title: `Target ${(f * 100).toFixed(1)}% ext`, width: o.width, style: 3 })
      }
      const markers = [prev, last].map(p => ({ time: p.time, position: p.type === 'high' ? 'aboveBar' : 'belowBar', color: o.color, shape: 'circle', text: p.type === 'high' ? 'swing H' : 'swing L' }))
      return { levels, markers }
    },
  },

  // ── AUTO HARMONIC — detects a completing XABCD (Gartley / Bat / Butterfly / Crab) on the live swings,
  // draws the legs + PCZ + entry/SL/TP. Reversal at D; targets are projected retracements of AD. ──
  auto_harmonic: {
    name: 'Auto Harmonic', type: 'overlay',
    inputs: [num('depth', 'Swing Depth', 3), num('tol', 'Ratio Tolerance %', 9), col('bull', 'Bull Color', '#46c79b'), col('bear', 'Bear Color', '#e16b72')],
    compute: (b, o) => {
      const piv = findPivots(b, o.depth, o.depth)
      const alt = lastAlternating(piv, 5)
      if (!alt) return {}
      const [X, A, B, C, D] = alt
      const XA = Math.abs(A.price - X.price) || 1
      const rB = Math.abs(B.price - A.price) / XA          // AB retracement of XA
      const rD = Math.abs(D.price - A.price) / XA          // AD retracement/extension of XA
      const tol = (o.tol || 9) / 100
      const pats = [
        { name: 'Gartley', b: 0.618, d: 0.786 },
        { name: 'Bat', b: 0.45, d: 0.886 },
        { name: 'Butterfly', b: 0.786, d: 1.272 },
        { name: 'Crab', b: 0.5, d: 1.618 },
      ]
      const match = pats.find(p => Math.abs(rB - p.b) <= tol && Math.abs(rD - p.d) <= tol)
      if (!match) return {}
      const bullish = D.type === 'low'                     // D at a low = bullish reversal, at a high = bearish
      const color = bullish ? o.bull : o.bear
      const score = Math.max(50, Math.round(100 - ((Math.abs(rB - match.b) + Math.abs(rD - match.d)) / 2) * 100))  // ratio-fit confidence
      const AD = Math.abs(D.price - A.price)
      const entry = D.price
      const sl = bullish ? X.price * 0.995 : X.price * 1.005
      const t1 = bullish ? D.price + AD * 0.382 : D.price - AD * 0.382
      const t2 = bullish ? D.price + AD * 0.618 : D.price - AD * 0.618
      const legLine = { key: 'harm', kind: 'line', color, lineWidth: 2, data: [X, A, B, C, D].map(p => ({ time: p.time, value: p.price })) }
      // ── PROJECTED PATH into the FUTURE (the arrow to the potential target) ──
      const iv = b.length > 2 ? (b[b.length - 1].time - b[b.length - 2].time) || 60 : 60
      const ahead = Math.max(6, Math.min(30, Math.round((D.time - C.time) / iv) || 12))
      const midTime = D.time + Math.round(ahead * 0.5) * iv, endTime = D.time + ahead * iv
      const projection = { key: 'harm_proj', kind: 'line', color, lineWidth: 2, lineStyle: 2, data: [{ time: D.time, value: D.price }, { time: midTime, value: t1 }, { time: endTime, value: t2 }] }
      const pcz = D.price * 0.004
      const zones = [
        { time1: C.time, time2: endTime, price1: D.price + pcz, price2: D.price - pcz, fill: color + '22', border: color, label: `${match.name} ${score} · PCZ` },
        // GREEN target zone (T1→T2) and RED stop band, both extending forward — matches the TradingView projection look
        { time1: D.time, time2: endTime, price1: t1, price2: t2, fill: 'rgba(70,199,155,0.14)', border: '#46c79b', label: `Target ${bullish ? '' : ''}(T1–T2)` },
        { time1: D.time, time2: endTime, price1: sl, price2: bullish ? sl * 0.997 : sl * 1.003, fill: 'rgba(225,107,114,0.16)', border: '#e16b72', label: 'Stop' },
      ]
      const levels = [
        { price: +entry.toFixed(2), color, title: `${match.name} ${score} — ${bullish ? 'LONG' : 'SHORT'} @ D`, width: 2, style: 0 },
        { price: +sl.toFixed(2), color: '#e16b72', title: 'SL (beyond X)', width: 1, style: 2 },
        { price: +t1.toFixed(2), color: '#46c79b', title: 'T1 (38.2% AD)', width: 1, style: 2 },
        { price: +t2.toFixed(2), color: '#46c79b', title: 'T2 (61.8% AD)', width: 1, style: 2 },
      ]
      const markers = [X, A, B, C, D].map((p, i) => ({ time: p.time, position: p.type === 'high' ? 'aboveBar' : 'belowBar', color, shape: 'circle', text: 'XABCD'[i] }))
      markers.push({ time: D.time, position: bullish ? 'belowBar' : 'aboveBar', color, shape: bullish ? 'arrowUp' : 'arrowDown', text: `${match.name} ${score} → Potential ${bullish ? '▲' : '▼'} ${t2.toFixed(1)}` })
      return { series: [legLine, projection], zones, levels, markers }
    },
  },
}
