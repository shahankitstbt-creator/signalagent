// Liquidity & Market Structure engine: swing pivots, equal highs/lows (BSL/SSL),
// liquidity sweeps, and BOS / CHoCH labelling. Corrected from blueprint.

export function findPivots(bars, left = 2, right = 2) {
  const pivots = []
  for (let i = left; i < bars.length - right; i++) {
    let isHigh = true, isLow = true
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue
      if (bars[j].high >= bars[i].high) isHigh = false
      if (bars[j].low <= bars[i].low) isLow = false
    }
    if (isHigh) pivots.push({ index: i, time: bars[i].time, price: bars[i].high, type: 'high' })
    if (isLow) pivots.push({ index: i, time: bars[i].time, price: bars[i].low, type: 'low' })
  }
  return pivots.sort((a, b) => a.index - b.index)
}

// Equal highs (BSL) / equal lows (SSL) clustered within tolerance.
export function findEqualLevels(bars, tolerance = 0.001, left = 2, right = 2) {
  const piv = findPivots(bars, left, right)
  const buySide = [], sellSide = []
  for (const p of piv) {
    const pool = p.type === 'high' ? buySide : sellSide
    const tag = p.type === 'high' ? 'BSL' : 'SSL'
    const hit = pool.find(l => Math.abs(l.price - p.price) / l.price < tolerance)
    if (hit) { hit.strength++; hit.indices.push(p.index); hit.lastIndex = p.index }
    else pool.push({ price: p.price, type: tag, strength: 1, indices: [p.index], firstIndex: p.index, lastIndex: p.index })
  }
  return { buySide, sellSide }
}

// Sweep: wick beyond a level, close back inside.
export function detectSweeps(bars, levels) {
  const sweeps = []
  bars.forEach((bar, i) => {
    for (const l of levels.buySide) {
      if (i <= l.lastIndex) continue
      if (bar.high > l.price && bar.close < l.price)
        sweeps.push({ index: i, time: bar.time, type: 'BSL_SWEEP', price: l.price, wick: bar.high, direction: 'BEARISH', strength: l.strength })
    }
    for (const l of levels.sellSide) {
      if (i <= l.lastIndex) continue
      if (bar.low < l.price && bar.close > l.price)
        sweeps.push({ index: i, time: bar.time, type: 'SSL_SWEEP', price: l.price, wick: bar.low, direction: 'BULLISH', strength: l.strength })
    }
  })
  return sweeps
}

// Market structure: HH/HL/LH/LL sequence + BOS / CHoCH.
export function analyzeStructure(bars, left = 2, right = 2) {
  const piv = findPivots(bars, left, right)
  const highs = piv.filter(p => p.type === 'high')
  const lows = piv.filter(p => p.type === 'low')
  const seq = []
  for (const p of piv) {
    if (p.type === 'high') {
      const prev = highs.filter(h => h.index < p.index).at(-1)
      seq.push({ ...p, label: prev ? (p.price > prev.price ? 'HH' : 'LH') : 'H' })
    } else {
      const prev = lows.filter(h => h.index < p.index).at(-1)
      seq.push({ ...p, label: prev ? (p.price > prev.price ? 'HL' : 'LL') : 'L' })
    }
  }
  for (let i = 2; i < seq.length; i++) {
    const [a, b, c] = [seq[i - 2], seq[i - 1], seq[i]]
    if (a.label === 'HL' && b.label === 'LH' && c.label === 'LL') c.choch = 'BEARISH_CHOCH'
    if (a.label === 'LH' && b.label === 'HL' && c.label === 'HH') c.choch = 'BULLISH_CHOCH'
  }
  return seq
}

export const liquidityIndicator = {
  name: 'Liquidity + Structure', type: 'overlay',
  inputs: [{ key: 'tol', label: 'Equal Tol %', default: 0.1 }],
  compute: (bars, o) => {
    const levels = findEqualLevels(bars, o.tol / 100)
    const sweeps = detectSweeps(bars, levels)
    const struct = analyzeStructure(bars)
    const lvls = []
    levels.buySide.filter(l => l.strength >= 2).forEach(l =>
      lvls.push({ price: l.price, color: '#FF6D00', title: `BSL ×${l.strength}`, style: 2 }))
    levels.sellSide.filter(l => l.strength >= 2).forEach(l =>
      lvls.push({ price: l.price, color: '#FF6D00', title: `SSL ×${l.strength}`, style: 2 }))
    const markers = []
    sweeps.forEach(s => markers.push({
      time: s.time, position: s.direction === 'BULLISH' ? 'belowBar' : 'aboveBar',
      color: '#FF6D00', shape: s.direction === 'BULLISH' ? 'arrowUp' : 'arrowDown',
      text: s.type.replace('_', ' '),
    }))
    struct.forEach(p => { if (p.choch) markers.push({
      time: p.time, position: p.label === 'HH' ? 'belowBar' : 'aboveBar',
      color: '#AA00FF', shape: 'circle', text: p.choch.includes('BULL') ? 'CHoCH▲' : 'CHoCH▼' }) })
    markers.sort((a, b) => a.time - b.time)
    return { series: [], levels: lvls, markers, meta: { levels, sweeps, struct } }
  },
}
