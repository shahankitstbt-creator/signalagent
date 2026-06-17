// Volume Profile — histogram of traded volume by price, with POC / VAH / VAL
// and High/Low Volume Nodes. Corrected & completed from the blueprint spec.

export function volumeProfile(bars, numBins = 100) {
  if (!bars.length) return null
  const high = Math.max(...bars.map(b => b.high))
  const low = Math.min(...bars.map(b => b.low))
  const binSize = (high - low) / numBins || 1
  const bins = new Array(numBins).fill(0)

  for (const bar of bars) {
    const lo = Math.max(0, Math.floor((bar.low - low) / binSize))
    const hi = Math.min(numBins - 1, Math.ceil((bar.high - low) / binSize))
    const span = hi - lo || 1
    const volPer = bar.volume / span
    for (let i = lo; i <= hi; i++) bins[i] += volPer
  }

  const poc = bins.indexOf(Math.max(...bins))
  const total = bins.reduce((a, b) => a + b, 0)
  const [vah, val] = valueArea(bins, poc, total * 0.7)
  const priceAt = i => low + (i + 0.5) * binSize

  const avg = total / numBins
  const hvn = [], lvn = []
  bins.forEach((v, i) => { if (v > avg * 1.5) hvn.push(i); else if (v < avg / 1.5) lvn.push(i) })

  return {
    bins, binSize, low, high, numBins,
    pocPrice: priceAt(poc), vahPrice: priceAt(vah), valPrice: priceAt(val),
    hvnPrices: hvn.map(priceAt), lvnPrices: lvn.map(priceAt),
    maxVol: Math.max(...bins), priceAt,
  }
}

// Expand outward from POC until `targetVol` (70%) captured.
function valueArea(bins, poc, targetVol) {
  let acc = bins[poc], hi = poc, lo = poc
  while (acc < targetVol && (hi < bins.length - 1 || lo > 0)) {
    const up = hi < bins.length - 1 ? bins[hi + 1] : -1
    const dn = lo > 0 ? bins[lo - 1] : -1
    if (up >= dn) { hi++; acc += Math.max(0, up) }
    else { lo--; acc += Math.max(0, dn) }
  }
  return [hi, lo]
}

// Indicator-system adapter: POC/VAH/VAL as price levels (gold/red/blue).
export const vpIndicator = {
  name: 'Volume Profile', type: 'overlay',
  inputs: [{ key: 'bins', label: 'Bins', default: 100 }],
  compute: (bars, o) => {
    const vp = volumeProfile(bars, o.bins)
    if (!vp) return { series: [] }
    return {
      series: [],
      levels: [
        { price: vp.pocPrice, color: '#FFB300', title: 'POC', width: 2 },
        { price: vp.vahPrice, color: '#B71C1C', title: 'VAH', style: 2 },
        { price: vp.valPrice, color: '#1565C0', title: 'VAL', style: 2 },
      ],
      profile: vp, // consumed by the VP histogram primitive
    }
  },
}
