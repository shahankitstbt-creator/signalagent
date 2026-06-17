import { useDrawingStore } from '../../store/drawingStore'
import { useChartStore } from '../../store/chartStore'

const TOOLS = [
  { id: 'cursor', icon: '⤢', label: 'Cursor' },
  { id: 'hline', icon: '─', label: 'Horizontal line' },
  { id: 'vline', icon: '│', label: 'Vertical line' },
  { id: 'trend', icon: '╱', label: 'Trend line' },
  { id: 'ray', icon: '⟋', label: 'Ray' },
  { id: 'arrow', icon: '↗', label: 'Arrow' },
  { id: 'rect', icon: '▭', label: 'Rectangle' },
  { id: 'fib', icon: '𝆐', label: 'Fib retracement' },
  { id: 'measure', icon: '⊞', label: 'Measure' },
  { id: 'text', icon: 'T', label: 'Text' },
]

export default function DrawToolbar() {
  const tool = useDrawingStore(s => s.tool)
  const setTool = useDrawingStore(s => s.setTool)
  const removeLast = useDrawingStore(s => s.removeLast)
  const clear = useDrawingStore(s => s.clear)
  const assetClass = useChartStore(s => s.assetClass)
  const symbol = useChartStore(s => s.symbol)
  const key = `${assetClass}:${symbol}`

  return (
    <div className="absolute left-1 top-1 z-20 flex flex-col gap-0.5 bg-bg-panel/90 border border-border rounded p-0.5">
      {TOOLS.map(t => (
        <button key={t.id} title={t.label} onClick={() => setTool(t.id)}
          className={`w-7 h-7 rounded text-sm ${tool === t.id ? 'bg-accent text-white' : 'text-txt-sec hover:bg-bg-card'}`}>
          {t.icon}
        </button>
      ))}
      <div className="h-px bg-border my-0.5" />
      <button title="Undo last" onClick={() => removeLast(key)} className="w-7 h-7 rounded text-sm text-txt-sec hover:bg-bg-card">⟲</button>
      <button title="Clear all" onClick={() => clear(key)} className="w-7 h-7 rounded text-sm text-red hover:bg-bg-card">🗑</button>
    </div>
  )
}
