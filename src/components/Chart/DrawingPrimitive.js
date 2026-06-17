// Renders user drawings: horizontal lines, trend lines, rays, rectangles,
// and Fibonacci retracements. Coordinates resolved live so they track pan/zoom.

const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 0.886, 1]

class DrawRenderer {
  constructor(p) { this._p = p }
  draw(target) {
    const p = this._p, chart = p._chart, series = p._series
    if (!chart || !series) return
    const ts = chart.timeScale()
    const X = t => ts.timeToCoordinate(t)
    const Y = v => series.priceToCoordinate(v)
    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context, hr = scope.horizontalPixelRatio, vr = scope.verticalPixelRatio
      const W = scope.mediaSize.width
      ctx.save()
      ctx.font = `${10 * vr}px JetBrains Mono, monospace`
      for (const s of [...p._shapes, p._previewShape].filter(Boolean)) {
        ctx.strokeStyle = s.color || '#2962FF'
        ctx.fillStyle = s.color || '#2962FF'
        ctx.lineWidth = hr
        if (s.type === 'hline') {
          const y = Y(s.price); if (y == null) continue
          ctx.beginPath(); ctx.moveTo(0, y * vr); ctx.lineTo(W * hr, y * vr); ctx.stroke()
          label(ctx, s.price.toFixed(s.price < 10 ? 4 : 2), 4 * hr, y * vr - 3 * vr, vr)
        } else if (s.type === 'trend' || s.type === 'ray') {
          const x1 = X(s.t1), x2 = X(s.t2), y1 = Y(s.p1), y2 = Y(s.p2)
          if (x1 == null || x2 == null || y1 == null || y2 == null) continue
          let ex = x2, ey = y2
          if (s.type === 'ray') { const dx = x2 - x1, dy = y2 - y1; if (dx !== 0) { const k = (W - x1) / dx; ex = x1 + dx * k; ey = y1 + dy * k } }
          ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * vr); ctx.lineTo(ex * hr, ey * vr); ctx.stroke()
        } else if (s.type === 'rect') {
          const x1 = X(s.t1), x2 = X(s.t2), y1 = Y(s.p1), y2 = Y(s.p2)
          if (x1 == null || x2 == null || y1 == null || y2 == null) continue
          ctx.globalAlpha = 0.12; ctx.fillRect(x1 * hr, Math.min(y1, y2) * vr, (x2 - x1) * hr, Math.abs(y2 - y1) * vr)
          ctx.globalAlpha = 1; ctx.strokeRect(x1 * hr, Math.min(y1, y2) * vr, (x2 - x1) * hr, Math.abs(y2 - y1) * vr)
        } else if (s.type === 'fib') {
          const x1 = X(s.t1), x2 = X(s.t2); if (x1 == null || x2 == null) continue
          const hi = Math.max(s.p1, s.p2), lo = Math.min(s.p1, s.p2)
          for (const f of FIBS) {
            const price = hi - (hi - lo) * f, y = Y(price); if (y == null) continue
            ctx.globalAlpha = 0.8
            ctx.beginPath(); ctx.moveTo(Math.min(x1, x2) * hr, y * vr); ctx.lineTo(W * hr, y * vr); ctx.stroke()
            label(ctx, `${(f * 100).toFixed(1)}%  ${price.toFixed(price < 10 ? 4 : 2)}`, Math.min(x1, x2) * hr + 3 * hr, y * vr - 2 * vr, vr)
          }
          ctx.globalAlpha = 1
        } else if (s.type === 'vline') {
          const x = X(s.t); if (x == null) continue
          const H = scope.mediaSize.height
          ctx.beginPath(); ctx.moveTo(x * hr, 0); ctx.lineTo(x * hr, H * vr); ctx.stroke()
        } else if (s.type === 'arrow') {
          const x1 = X(s.t1), x2 = X(s.t2), y1 = Y(s.p1), y2 = Y(s.p2)
          if (x1 == null || x2 == null || y1 == null || y2 == null) continue
          ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * vr); ctx.lineTo(x2 * hr, y2 * vr); ctx.stroke()
          const ang = Math.atan2((y2 - y1) * vr, (x2 - x1) * hr), hl = 10 * hr
          ctx.beginPath(); ctx.moveTo(x2 * hr, y2 * vr)
          ctx.lineTo(x2 * hr - hl * Math.cos(ang - Math.PI / 6), y2 * vr - hl * Math.sin(ang - Math.PI / 6))
          ctx.moveTo(x2 * hr, y2 * vr)
          ctx.lineTo(x2 * hr - hl * Math.cos(ang + Math.PI / 6), y2 * vr - hl * Math.sin(ang + Math.PI / 6))
          ctx.stroke()
        } else if (s.type === 'text') {
          const x = X(s.t), y = Y(s.p); if (x == null || y == null) continue
          ctx.font = `${12 * vr}px JetBrains Mono, monospace`
          ctx.fillText(s.text || '', x * hr + 3 * hr, y * vr)
        } else if (s.type === 'measure') {
          const x1 = X(s.t1), x2 = X(s.t2), y1 = Y(s.p1), y2 = Y(s.p2)
          if (x1 == null || x2 == null || y1 == null || y2 == null) continue
          const up = s.p2 >= s.p1
          ctx.fillStyle = up ? 'rgba(0,200,83,0.12)' : 'rgba(255,23,68,0.12)'
          ctx.fillRect(x1 * hr, Math.min(y1, y2) * vr, (x2 - x1) * hr, Math.abs(y2 - y1) * vr)
          ctx.strokeStyle = up ? 'rgba(0,200,83,0.7)' : 'rgba(255,23,68,0.7)'
          ctx.strokeRect(x1 * hr, Math.min(y1, y2) * vr, (x2 - x1) * hr, Math.abs(y2 - y1) * vr)
          const d = s.p2 - s.p1, pct = s.p1 ? (d / s.p1) * 100 : 0
          ctx.fillStyle = up ? '#00C853' : '#FF1744'
          ctx.font = `${11 * vr}px JetBrains Mono, monospace`
          ctx.fillText(`${d >= 0 ? '+' : ''}${d.toFixed(d < 10 && d > -10 ? 4 : 2)}  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`, (x1 + 3) * hr, (Math.min(y1, y2) - 4) * vr)
        }
      }
      ctx.restore()
    })
  }
}
function label(ctx, text, x, y, vr) { ctx.fillText(text, x, y) }

class DrawView { constructor(p) { this._r = new DrawRenderer(p) } renderer() { return this._r } zOrder() { return 'top' } }

export class DrawingPrimitive {
  constructor() { this._shapes = []; this._previewShape = null; this._chart = null; this._series = null; this._req = null; this._view = new DrawView(this) }
  attached(p) { this._chart = p.chart; this._series = p.series; this._req = p.requestUpdate }
  detached() { this._chart = null; this._series = null }
  updateAllViews() {}
  paneViews() { return [this._view] }
  setShapes(shapes) { this._shapes = shapes; this._req && this._req() }
  setPreview(shape) { this._previewShape = shape; this._req && this._req() }
}
