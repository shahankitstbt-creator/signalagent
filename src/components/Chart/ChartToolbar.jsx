import { useState } from 'react'
import { useChartSettings } from '../../store/chartSettingsStore'
import { useReplayStore } from '../../store/replayStore'
import { useChartStore } from '../../store/chartStore'
import ChartSettingsModal from './ChartSettingsModal'

const TYPES = [
  ['candles', 'Candles', '🕯'], ['hollow', 'Hollow', '🪔'], ['heikin', 'Heikin Ashi', '🎏'],
  ['bar', 'Bars', '|'], ['line', 'Line', '╱'], ['area', 'Area', '◣'], ['baseline', 'Baseline', '═'],
]

export default function ChartToolbar({ onReset, onScreenshot, onFullscreen }) {
  const chartType = useChartSettings(s => s.chartType)
  const scaleMode = useChartSettings(s => s.scaleMode)
  const set = useChartSettings(s => s.set)
  const replayActive = useReplayStore(s => s.active)
  const [typeOpen, setTypeOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const cur = TYPES.find(t => t[0] === chartType) || TYPES[0]

  return (
    <div className="h-9 shrink-0 flex items-center gap-1 px-2 bg-bg-panel border-b border-border">
      {/* chart type */}
      <div className="relative">
        <button onClick={() => setTypeOpen(o => !o)} onBlur={() => setTimeout(() => setTypeOpen(false), 150)}
          className="mono text-xs px-2 py-1 rounded hover:bg-bg-card text-txt flex items-center gap-1">
          <span>{cur[2]}</span> {cur[1]} <span className="text-txt-muted">▾</span>
        </button>
        {typeOpen && (
          <div className="absolute z-50 mt-1 w-40 bg-bg-card border border-border rounded shadow-xl p-1">
            {TYPES.map(([id, label, icon]) => (
              <button key={id} onMouseDown={() => { set({ chartType: id }); setTypeOpen(false) }}
                className={`w-full text-left px-2 py-1 rounded mono text-xs flex items-center gap-2 ${chartType === id ? 'bg-accent text-white' : 'hover:bg-bg-panel'}`}>
                <span className="w-4 text-center">{icon}</span>{label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border mx-1" />

      <button onClick={() => setSettingsOpen(true)} title="Chart settings"
        className="mono text-xs px-2 py-1 rounded hover:bg-bg-card text-txt-sec">⚙ Settings</button>

      <button onClick={() => { const r = useReplayStore.getState(); r.active ? r.stop() : r.start(useChartStore.getState().bars.length) }} title="Bar replay"
        className={`mono text-xs px-2 py-1 rounded ${replayActive ? 'bg-accent text-white' : 'hover:bg-bg-card text-txt-sec'}`}>⏵ Replay</button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* price scale mode */}
      {[['normal', 'Lin'], ['log', 'Log'], ['percent', '%']].map(([m, l]) => (
        <button key={m} onClick={() => set({ scaleMode: m })}
          className={`mono text-xs px-2 py-1 rounded ${scaleMode === m ? 'bg-accent text-white' : 'text-txt-sec hover:bg-bg-card'}`}>{l}</button>
      ))}

      <div className="ml-auto flex items-center gap-1">
        <button onClick={onReset} title="Reset view" className="mono text-xs px-2 py-1 rounded hover:bg-bg-card text-txt-sec">⟲ Reset</button>
        <button onClick={onScreenshot} title="Screenshot" className="text-sm px-2 py-1 rounded hover:bg-bg-card text-txt-sec">📷</button>
        <button onClick={onFullscreen} title="Fullscreen" className="text-sm px-2 py-1 rounded hover:bg-bg-card text-txt-sec">⛶</button>
      </div>

      {settingsOpen && <ChartSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
