import { useState } from 'react'
import { useChartSettings } from '../../store/chartSettingsStore'

// TradingView-style chart settings: Symbol / Canvas / Scales tabs.
export default function ChartSettingsModal({ onClose }) {
  const s = useChartSettings()
  const set = s.set
  const [tab, setTab] = useState('Symbol')
  const isCandle = ['candles', 'hollow', 'heikin', 'bar'].includes(s.chartType)
  const isLine = ['line', 'area'].includes(s.chartType)

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center" onMouseDown={onClose}>
      <div className="bg-bg-card border border-border rounded-lg shadow-2xl w-[440px] max-w-[94vw]" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="mono font-bold text-txt">Chart settings</h2>
          <button onClick={onClose} className="text-txt-muted hover:text-txt">✕</button>
        </div>
        <div className="flex border-b border-border px-2">
          {['Symbol', 'Canvas', 'Scales'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`mono text-xs px-3 py-2 -mb-px border-b-2 ${tab === t ? 'border-accent text-txt' : 'border-transparent text-txt-sec hover:text-txt'}`}>{t}</button>
          ))}
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5">
          {tab === 'Symbol' && (<>
            {isCandle && <>
              <Color label="Body up" k="upColor" />
              <Color label="Body down" k="downColor" />
              <Color label="Wick up" k="wickUpColor" />
              <Color label="Wick down" k="wickDownColor" />
              <Color label="Border up" k="borderUpColor" />
              <Color label="Border down" k="borderDownColor" />
              <Bool label="Borders" k="borderVisible" />
            </>}
            {isLine && <><Color label="Line color" k="lineColor" /><Width label="Line width" k="lineWidth" /></>}
            {s.chartType === 'baseline' && <><Color label="Top color" k="upColor" /><Color label="Bottom color" k="downColor" /></>}
            <Select label="Precision" k="precision" options={['default', '0', '1', '2', '3', '4', '5']} />
            <Bool label="Last price label" k="lastValueLabel" />
            <Bool label="Show volume" k="volumeVisible" />
          </>)}

          {tab === 'Canvas' && (<>
            <Color label="Background" k="background" />
            <Bool label="Grid lines" k="gridVisible" />
            <Color label="Grid color" k="gridColor" />
            <Bool label="Magnet crosshair" k="crosshairMagnet" />
            <Bool label="Crosshair visible" k="crosshairVisible" />
            <Bool label="Symbol watermark" k="watermark" />
          </>)}

          {tab === 'Scales' && (<>
            <Select label="Price scale" k="scaleMode" options={['normal', 'log', 'percent']} />
            <Bool label="Auto (fit data)" k="autoScale" />
            <Bool label="Invert scale" k="invertScale" />
            <Bool label="Last value label" k="lastValueLabel" />
          </>)}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button onClick={s.reset} className="mono text-xs text-txt-sec hover:text-txt">Reset defaults</button>
          <button onClick={onClose} className="mono text-xs px-4 py-1.5 rounded bg-accent text-white">Done</button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return <label className="flex items-center justify-between gap-3"><span className="text-txt-sec text-xs">{label}</span>{children}</label>
}
function Color({ label, k }) {
  const v = useChartSettings(s => s[k]); const set = useChartSettings(s => s.set)
  return <Row label={label}><span className="flex items-center gap-1.5">
    <input type="color" value={v} onChange={e => set({ [k]: e.target.value })} className="w-8 h-6 bg-transparent border border-border rounded cursor-pointer" />
    <span className="text-txt-muted text-[10px] mono w-14">{v}</span></span></Row>
}
function Bool({ label, k }) {
  const v = useChartSettings(s => s[k]); const set = useChartSettings(s => s.set)
  return <Row label={label}><input type="checkbox" checked={!!v} onChange={e => set({ [k]: e.target.checked })} className="w-4 h-4" /></Row>
}
function Width({ label, k }) {
  const v = useChartSettings(s => s[k]); const set = useChartSettings(s => s.set)
  return <Row label={label}><select value={v} onChange={e => set({ [k]: +e.target.value })} className="w-28 bg-bg-base border border-border rounded px-2 py-1 mono text-xs">{[1, 2, 3, 4].map(w => <option key={w} value={w}>{w} px</option>)}</select></Row>
}
function Select({ label, k, options }) {
  const v = useChartSettings(s => s[k]); const set = useChartSettings(s => s.set)
  return <Row label={label}><select value={v} onChange={e => set({ [k]: e.target.value })} className="w-28 bg-bg-base border border-border rounded px-2 py-1 mono text-xs capitalize">{options.map(o => <option key={o} value={o}>{o}</option>)}</select></Row>
}
