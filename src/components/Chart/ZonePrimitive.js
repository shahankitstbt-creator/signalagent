// Series primitive that paints filled rectangles (FVG / Order Block / BPR zones)
// on the price pane. lightweight-charts v4 has no native boxes.

class ZoneRenderer {
  constructor(p) { this._p = p }
  draw(target) {
    const p = this._p
    const chart = p._chart, series = p._series
    if (!chart || !series || !p._zones.length) return
    const ts = chart.timeScale()
    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context, hr = scope.horizontalPixelRatio, vr = scope.verticalPixelRatio
      ctx.save()
      for (const z of p._zones) {
        const x1 = ts.timeToCoordinate(z.time1)
        let x2 = z.time2 != null ? ts.timeToCoordinate(z.time2) : null
        if (x2 == null) x2 = scope.mediaSize.width
        const y1 = series.priceToCoordinate(z.price1)
        const y2 = series.priceToCoordinate(z.price2)
        if (x1 == null || y1 == null || y2 == null) continue
        const X = x1 * hr, W = (x2 - x1) * hr
        const Y = Math.min(y1, y2) * vr, H = Math.abs(y2 - y1) * vr
        ctx.fillStyle = z.fill
        ctx.fillRect(X, Y, W, H)
        ctx.strokeStyle = z.border
        ctx.lineWidth = hr
        ctx.strokeRect(X, Y, W, H)
        if (z.label) {
          ctx.fillStyle = z.border
          ctx.font = `${10 * vr}px JetBrains Mono, monospace`
          ctx.fillText(z.label, X + 4 * hr, Y + 12 * vr)
        }
      }
      ctx.restore()
    })
  }
}

class ZoneView {
  constructor(p) { this._r = new ZoneRenderer(p) }
  renderer() { return this._r }
  zOrder() { return 'bottom' }
}

export class ZonePrimitive {
  constructor() {
    this._zones = []
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._view = new ZoneView(this)
  }
  attached(params) {
    this._chart = params.chart
    this._series = params.series
    this._requestUpdate = params.requestUpdate
  }
  detached() { this._chart = null; this._series = null }
  updateAllViews() {}
  paneViews() { return [this._view] }
  setZones(zones) { this._zones = zones; this._requestUpdate && this._requestUpdate() }
}
