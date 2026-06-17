// Fair Value Gap / Imbalance engine. 3-candle gaps with CE + OTE zones,
// mitigation tracking, Inversion FVG and Balanced Price Range detection.

export function detectFVG(bars) {
  const fvgs = []
  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1], curr = bars[i], next = bars[i + 1]
    if (next.low > prev.high && curr.close > curr.open) {
      const bottom = prev.high, top = next.low, size = top - bottom
      fvgs.push({
        type: 'BULLISH_FVG', top, bottom, time: curr.time, startIndex: i,
        midpoint: (top + bottom) / 2,
        ote_low: bottom + size * 0.62, ote_high: bottom + size * 0.79,
        size, filled: false, mitigated: false,
      })
    }
    if (next.high < prev.low && curr.close < curr.open) {
      const top = prev.low, bottom = next.high, size = top - bottom
      fvgs.push({
        type: 'BEARISH_FVG', top, bottom, time: curr.time, startIndex: i,
        midpoint: (top + bottom) / 2,
        ote_low: bottom + size * 0.21, ote_high: bottom + size * 0.38,
        size, filled: false, mitigated: false,
      })
    }
  }
  return fvgs
}

// Walk forward marking each FVG mitigated (CE touched) / filled.
export function trackMitigation(fvgs, bars) {
  for (const fvg of fvgs) {
    for (let i = fvg.startIndex + 2; i < bars.length; i++) {
      const b = bars[i]
      if (fvg.type === 'BULLISH_FVG') {
        if (b.low <= fvg.midpoint) fvg.mitigated = true
        if (b.low <= fvg.bottom) { fvg.filled = true; fvg.filledIndex = i; break }
      } else {
        if (b.high >= fvg.midpoint) fvg.mitigated = true
        if (b.high >= fvg.top) { fvg.filled = true; fvg.filledIndex = i; break }
      }
    }
  }
  return fvgs
}

// Overlapping bull+bear FVG = Balanced Price Range (strongest zone).
export function detectBPR(fvgs) {
  const bull = fvgs.filter(f => f.type === 'BULLISH_FVG')
  const bear = fvgs.filter(f => f.type === 'BEARISH_FVG')
  const bprs = []
  for (const a of bull) for (const b of bear) {
    const top = Math.min(a.top, b.top), bottom = Math.max(a.bottom, b.bottom)
    if (top > bottom) bprs.push({ type: 'BPR', top, bottom, time: Math.min(a.time, b.time), strength: 'EXTREME' })
  }
  return bprs
}

export const fvgIndicator = {
  name: 'FVG / Imbalance', type: 'overlay',
  inputs: [{ key: 'hideFilled', label: 'Hide Filled (1/0)', default: 1 }],
  compute: (bars, o) => {
    const fvgs = trackMitigation(detectFVG(bars), bars)
    const last = bars.at(-1).time
    const zones = []
    for (const f of fvgs) {
      if (o.hideFilled && f.filled) continue
      const bull = f.type === 'BULLISH_FVG'
      zones.push({
        time1: f.time, time2: f.filled ? bars[f.filledIndex].time : last,
        price1: f.top, price2: f.bottom,
        fill: bull ? 'rgba(0,229,255,0.13)' : 'rgba(255,23,68,0.13)',
        border: bull ? 'rgba(0,229,255,0.5)' : 'rgba(255,23,68,0.5)',
        label: bull ? 'Bull FVG' : 'Bear FVG',
      })
    }
    detectBPR(fvgs).forEach(b => zones.push({
      time1: b.time, time2: last, price1: b.top, price2: b.bottom,
      fill: 'rgba(255,179,0,0.18)', border: 'rgba(255,179,0,0.7)', label: 'BPR ★',
    }))
    return { series: [], zones, meta: { fvgs } }
  },
}
