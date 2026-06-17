// Price-series helpers: build the right lightweight-charts series for a chart
// type, and shape OHLCV data for it (incl. Heikin Ashi).

export function heikinAshi(bars) {
  const out = []
  let pO, pC
  for (const b of bars) {
    const close = (b.open + b.high + b.low + b.close) / 4
    const open = pO == null ? (b.open + b.close) / 2 : (pO + pC) / 2
    const high = Math.max(b.high, open, close)
    const low = Math.min(b.low, open, close)
    out.push({ time: b.time, open, high, low, close })
    pO = open; pC = close
  }
  return out
}

export function priceData(bars, type) {
  if (type === 'line' || type === 'area' || type === 'baseline') return bars.map(b => ({ time: b.time, value: b.close }))
  if (type === 'heikin') return heikinAshi(bars)
  return bars // candles / hollow / bar use raw OHLC
}

const precFmt = (s) => s.precision === 'default' ? undefined
  : { priceFormat: { type: 'price', precision: +s.precision, minMove: Math.pow(10, -s.precision) } }

export function makePriceSeries(chart, s) {
  const t = s.chartType
  const common = { lastValueVisible: s.lastValueLabel, ...(precFmt(s) || {}) }
  if (t === 'line') return chart.addLineSeries({ color: s.lineColor, lineWidth: s.lineWidth, ...common })
  if (t === 'area') return chart.addAreaSeries({ lineColor: s.lineColor, topColor: s.lineColor + '55', bottomColor: s.lineColor + '08', lineWidth: s.lineWidth, ...common })
  if (t === 'baseline') return chart.addBaselineSeries({ topLineColor: s.upColor, topFillColor1: s.upColor + '40', topFillColor2: s.upColor + '05', bottomLineColor: s.downColor, bottomFillColor1: s.downColor + '05', bottomFillColor2: s.downColor + '40', ...common })
  if (t === 'bar') return chart.addBarSeries({ upColor: s.upColor, downColor: s.downColor, thinBars: false, ...common })
  const hollow = t === 'hollow'
  return chart.addCandlestickSeries({
    upColor: hollow ? 'rgba(0,0,0,0)' : s.upColor, downColor: s.downColor,
    wickUpColor: s.wickUpColor, wickDownColor: s.wickDownColor,
    borderUpColor: s.borderUpColor, borderDownColor: s.borderDownColor,
    borderVisible: hollow ? true : s.borderVisible, ...common,
  })
}

// Apply colour/precision changes without recreating the series.
export function applyPriceStyle(series, s) {
  const t = s.chartType
  const o = {}
  if (t === 'line') Object.assign(o, { color: s.lineColor, lineWidth: s.lineWidth })
  else if (t === 'area') Object.assign(o, { lineColor: s.lineColor, topColor: s.lineColor + '55', bottomColor: s.lineColor + '08', lineWidth: s.lineWidth })
  else if (t === 'bar') Object.assign(o, { upColor: s.upColor, downColor: s.downColor })
  else if (t === 'candles' || t === 'hollow' || t === 'heikin') Object.assign(o, {
    upColor: t === 'hollow' ? 'rgba(0,0,0,0)' : s.upColor, downColor: s.downColor,
    wickUpColor: s.wickUpColor, wickDownColor: s.wickDownColor,
    borderUpColor: s.borderUpColor, borderDownColor: s.borderDownColor, borderVisible: t === 'hollow' ? true : s.borderVisible,
  })
  o.lastValueVisible = s.lastValueLabel
  const pf = precFmt(s); if (pf) o.priceFormat = pf.priceFormat
  try { series.applyOptions(o) } catch { /* ignore */ }
}
