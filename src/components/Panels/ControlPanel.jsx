import { useState } from 'react'
import { listLayouts, saveLayout, loadLayout, deleteLayout } from '../../store/persist'
import { useAlertStore } from '../Alerts/AlertEngine'
import BacktestModal from '../Backtest/BacktestModal'

export default function ControlPanel() {
  const [name, setName] = useState('')
  const [layouts, setLayouts] = useState(listLayouts())
  const [showBT, setShowBT] = useState(false)
  const config = useAlertStore(s => s.config)
  const setConfig = useAlertStore(s => s.setConfig)
  const refresh = () => setLayouts(listLayouts())

  return (
    <div className="space-y-3">
      <button onClick={() => setShowBT(true)}
        className="w-full bg-accent/90 hover:bg-accent text-white mono text-xs py-1.5 rounded">⚙ Backtest</button>
      {showBT && <BacktestModal onClose={() => setShowBT(false)} />}

      <div>
        <div className="text-txt-sec text-xs uppercase tracking-wide mb-1">Layouts</div>
        <div className="flex gap-1 mb-1">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="name"
            className="flex-1 bg-bg-base border border-border rounded px-1.5 py-1 mono text-xs" />
          <button onClick={() => { if (name) { saveLayout(name); setName(''); refresh() } }}
            className="bg-bg-card border border-border rounded px-2 mono text-xs hover:border-accent">Save</button>
        </div>
        {Object.keys(layouts).map(n => (
          <div key={n} className="flex items-center justify-between mono text-xs px-1 py-0.5 hover:bg-bg-card rounded">
            <button onClick={() => loadLayout(n)} className="text-txt hover:text-accent">{n}</button>
            <button onClick={() => { deleteLayout(n); refresh() }} className="text-red text-[10px]">✕</button>
          </div>
        ))}
      </div>

      <div>
        <div className="text-txt-sec text-xs uppercase tracking-wide mb-1">Alerts</div>
        <label className="flex items-center justify-between mono text-xs py-0.5">
          <span className="text-txt-sec">Sound</span>
          <input type="checkbox" checked={config.sound} onChange={e => setConfig({ sound: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between mono text-xs py-0.5">
          <span className="text-txt-sec">Sound ≥</span>
          <select value={config.soundMinGrade} onChange={e => setConfig({ soundMinGrade: e.target.value })}
            className="bg-bg-base border border-border rounded text-xs px-1">
            {['A++', 'A+', 'A', 'B'].map(g => <option key={g}>{g}</option>)}
          </select>
        </label>
        <input value={config.webhook} onChange={e => setConfig({ webhook: e.target.value })} placeholder="Webhook URL"
          className="w-full bg-bg-base border border-border rounded px-1.5 py-1 mono text-[11px] mt-1" />
      </div>
    </div>
  )
}
