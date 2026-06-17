import { useMemo, useRef, useState } from 'react'
import { INDICATORS, indicatorDefaults } from './indicators'
import { useIndicatorStore } from '../../store/indicatorStore'
import { INTERVALS } from '../../data/DataManager'

const STYLE_TYPES = new Set(['color', 'width', 'linestyle'])
const LINE_STYLES = [['0', 'Solid'], ['2', 'Dashed'], ['3', 'Dotted']]

// TradingView-style indicator settings dialog: Inputs / Style / Visibility tabs.
export default function IndicatorSettingsModal({ uid, onClose }) {
  const inst = useIndicatorStore(s => s.active.find(a => a.uid === uid))
  const setOpt = useIndicatorStore(s => s.setOpt)
  const [tab, setTab] = useState('Inputs')
  const snapshot = useRef(inst ? { ...inst.opts } : null) // for Cancel

  if (!inst) return null
  const def = INDICATORS[inst.id]
  const inputs = def.inputs || []
  const inputTab = inputs.filter(i => !STYLE_TYPES.has(i.type))
  const styleTab = inputs.filter(i => STYLE_TYPES.has(i.type))
  const tfs = inst.opts._tf || []

  const set = (k, v) => setOpt(uid, k, v)
  const cancel = () => { Object.entries(snapshot.current).forEach(([k, v]) => set(k, v)); onClose() }
  const reset = () => { const d = indicatorDefaults(inst.id); Object.entries(d).forEach(([k, v]) => set(k, v)) }
  const toggleTf = (tf) => {
    const cur = inst.opts._tf || []
    set('_tf', cur.includes(tf) ? cur.filter(t => t !== tf) : [...cur, tf])
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center" onMouseDown={cancel}>
      <div className="bg-bg-card border border-border rounded-lg shadow-2xl w-[420px] max-w-[94vw]" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="mono font-bold text-txt">{def.name}</h2>
          <button onClick={cancel} className="text-txt-muted hover:text-txt">✕</button>
        </div>

        <div className="flex border-b border-border px-2">
          {['Inputs', 'Style', 'Visibility'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`mono text-xs px-3 py-2 -mb-px border-b-2 ${tab === t ? 'border-accent text-txt' : 'border-transparent text-txt-sec hover:text-txt'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5">
          {tab === 'Inputs' && (inputTab.length ? inputTab.map(i => <Field key={i.key} inp={i} val={inst.opts[i.key]} set={set} />)
            : <Empty text="No input parameters." />)}
          {tab === 'Style' && (<>
            {def.plots && def.plots.length > 1 && (
              <div className="pb-2 mb-1 border-b border-border">
                <div className="text-txt-muted text-[10px] uppercase mb-1">Plots</div>
                {def.plots.map(pl => (
                  <label key={pl.key} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-txt-sec text-xs">{pl.label}</span>
                    <input type="checkbox" checked={!inst.opts['hide_' + pl.key]} onChange={e => set('hide_' + pl.key, !e.target.checked)} className="w-4 h-4" />
                  </label>
                ))}
              </div>
            )}
            {styleTab.length ? styleTab.map(i => <Field key={i.key} inp={i} val={inst.opts[i.key]} set={set} />)
              : (!def.plots && <Empty text="This indicator uses fixed styling." />)}
          </>)}
          {tab === 'Visibility' && (
            <div>
              <div className="text-txt-sec mono text-[11px] mb-2">Show on timeframes (none selected = all):</div>
              <div className="flex flex-wrap gap-1.5">
                {INTERVALS.map(tf => (
                  <button key={tf} onClick={() => toggleTf(tf)}
                    className={`mono text-xs px-2 py-1 rounded border ${tfs.includes(tf) ? 'bg-accent text-white border-accent' : 'border-border text-txt-sec hover:text-txt'}`}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button onClick={reset} className="mono text-xs text-txt-sec hover:text-txt">Defaults</button>
          <div className="flex gap-2">
            <button onClick={cancel} className="mono text-xs px-3 py-1.5 rounded bg-bg-panel border border-border">Cancel</button>
            <button onClick={onClose} className="mono text-xs px-4 py-1.5 rounded bg-accent text-white">Ok</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const Empty = ({ text }) => <div className="text-txt-muted mono text-xs">{text}</div>

function Field({ inp, val, set }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-txt-sec text-xs">{inp.label}</span>
      {inp.type === 'color' ? (
        <span className="flex items-center gap-1.5">
          <input type="color" value={val} onChange={e => set(inp.key, e.target.value)}
            className="w-8 h-6 bg-transparent border border-border rounded cursor-pointer" />
          <span className="text-txt-muted text-[10px] mono w-14">{val}</span>
        </span>
      ) : inp.type === 'width' ? (
        <select value={val} onChange={e => set(inp.key, +e.target.value)} className="w-28 bg-bg-base border border-border rounded px-2 py-1 mono text-xs">
          {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w} px</option>)}
        </select>
      ) : inp.type === 'linestyle' ? (
        <select value={val} onChange={e => set(inp.key, +e.target.value)} className="w-28 bg-bg-base border border-border rounded px-2 py-1 mono text-xs">
          {LINE_STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : inp.type === 'bool' ? (
        <input type="checkbox" checked={!!val} onChange={e => set(inp.key, e.target.checked)} className="w-4 h-4" />
      ) : inp.type === 'select' || inp.type === 'source' ? (
        <select value={val} onChange={e => set(inp.key, e.target.value)} className="w-28 bg-bg-base border border-border rounded px-2 py-1 mono text-xs">
          {(inp.options || ['close', 'open', 'high', 'low', 'hl2']).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type="number" step="any" value={val}
          onChange={e => set(inp.key, e.target.value === '' ? inp.default : +e.target.value)}
          className="w-28 bg-bg-base border border-border rounded px-2 py-1 text-right mono text-xs" />
      )}
    </label>
  )
}
