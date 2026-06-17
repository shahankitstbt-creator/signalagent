// Keep multiple lightweight-charts time scales in lock-step.
export function createSyncGroup() {
  const charts = new Set()
  let syncing = false
  return {
    add(chart) {
      const cb = (range) => {
        if (syncing || !range) return
        syncing = true
        charts.forEach(c => { if (c !== chart) c.timeScale().setVisibleLogicalRange(range) })
        syncing = false
      }
      chart.__syncCb = cb
      chart.timeScale().subscribeVisibleLogicalRangeChange(cb)
      charts.add(chart)
    },
    remove(chart) {
      charts.delete(chart)
      if (chart.__syncCb) chart.timeScale().unsubscribeVisibleLogicalRangeChange(chart.__syncCb)
    },
  }
}

const BASE = {
  layout: { background: { color: '#0A0E17' }, textColor: '#6B7F99', fontFamily: 'JetBrains Mono, monospace' },
  grid: { vertLines: { color: '#141d2e' }, horzLines: { color: '#141d2e' } },
  rightPriceScale: { borderColor: '#1E2D42', entireTextOnly: true },
  timeScale: { borderColor: '#1E2D42', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8 },
  crosshair: {
    vertLine: { color: '#3A4F66', width: 1, style: 3, labelBackgroundColor: '#2962FF' },
    horzLine: { color: '#3A4F66', width: 1, style: 3, labelBackgroundColor: '#2962FF' },
  },
  // TradingView-style interactions (drag axes to scale, double-click axis to reset, kinetic scroll)
  handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
  handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
  kineticScroll: { touch: true, mouse: false },
  autoSize: true,
}
export const baseOptions = (extra = {}) => ({ ...BASE, ...extra })

// Reconcile a chart's series for an indicator: reuse existing series objects
// (update data + restyle) instead of removing/re-adding them, so live ticks and
// setting changes don't flicker. `prev` = [{kind,obj}]; returns the new list.
export function syncSeries(chart, prev, specs, full) {
  const structural = prev.length !== specs.length || prev.some((s, i) => s.kind !== specs[i].kind)
  if (structural) {
    prev.forEach(s => { try { chart.removeSeries(s.obj) } catch { /* already gone */ } })
    return specs.map(spec => ({ kind: spec.kind, obj: addSeries(chart, spec) }))
  }
  specs.forEach((spec, i) => {
    const obj = prev[i].obj
    try {
      if (full || spec.data.length < 2) obj.setData(spec.data)
      else obj.update(spec.data[spec.data.length - 1]) // live tick: only the last point moved
      obj.applyOptions(spec.kind === 'line'
        ? { color: spec.color, lineWidth: spec.lineWidth || 1, lineStyle: spec.lineStyle || 0 }
        : { color: spec.color })
    } catch { try { obj.setData(spec.data) } catch { /* ignore */ } }
  })
  return prev
}

// Add an indicator series spec to a chart; returns the series for cleanup.
export function addSeries(chart, s) {
  const opts = { priceLineVisible: false, lastValueVisible: false, color: s.color }
  const series = s.kind === 'histogram'
    ? chart.addHistogramSeries({ ...opts, priceFormat: { type: 'price' } })
    : chart.addLineSeries({ ...opts, lineWidth: s.lineWidth || 1, lineStyle: s.lineStyle || 0 })
  series.setData(s.data)
  ;(s.priceLines || []).forEach(pl => series.createPriceLine({ ...pl, lineStyle: 2, lineWidth: 1 }))
  return series
}
