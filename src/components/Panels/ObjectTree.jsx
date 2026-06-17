import { useDrawingStore } from '../../store/drawingStore'
import { useChartStore } from '../../store/chartStore'

const LABELS = {
  hline: 'Horizontal line', vline: 'Vertical line', trend: 'Trend line', ray: 'Ray',
  arrow: 'Arrow', rect: 'Rectangle', fib: 'Fib retracement', measure: 'Measure', text: 'Text',
}

// Object tree: every drawing on the current chart, with delete (like TradingView).
export default function ObjectTree() {
  const assetClass = useChartStore(s => s.assetClass)
  const symbol = useChartStore(s => s.symbol)
  const key = `${assetClass}:${symbol}`
  const shapes = useDrawingStore(s => s.byKey[key]) || []
  const removeAt = useDrawingStore(s => s.removeAt)
  const clear = useDrawingStore(s => s.clear)

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-txt-sec text-xs uppercase tracking-wide">Objects · {shapes.length}</span>
        {shapes.length > 0 && <button onClick={() => clear(key)} className="text-red text-[10px] mono hover:text-white">clear</button>}
      </div>
      {shapes.length === 0 && <div className="text-txt-muted mono text-[11px]">No drawings on this chart.</div>}
      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {shapes.map((s, i) => (
          <div key={i} className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-bg-card mono text-[11px]">
            <span className="text-txt truncate">
              <span style={{ color: s.color }}>●</span> {LABELS[s.type] || s.type}
              {s.price != null && <span className="text-txt-muted"> @{(+s.price).toFixed(s.price < 10 ? 3 : 1)}</span>}
              {s.text && <span className="text-txt-muted"> "{s.text.slice(0, 10)}"</span>}
            </span>
            <button onClick={() => removeAt(key, i)} className="text-red text-[10px] hover:text-white pl-1">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
