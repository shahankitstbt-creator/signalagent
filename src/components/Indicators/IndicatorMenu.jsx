import { useEffect, useRef, useState } from 'react'
import { INDICATORS } from './indicators'
import { useIndicatorStore } from '../../store/indicatorStore'
import IndicatorSettingsModal from './IndicatorSettingsModal'

export default function IndicatorMenu() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null) // uid being configured (modal)
  const active = useIndicatorStore(s => s.active)
  const add = useIndicatorStore(s => s.add)
  const remove = useIndicatorStore(s => s.remove)
  const box = useRef(null)

  useEffect(() => {
    const h = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(o => !o)}
        className="mono text-xs px-2 py-1 rounded bg-bg-card border border-border hover:border-accent">
        ƒ Indicators {active.length > 0 && <span className="text-accent">· {active.length}</span>}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-bg-card border border-border rounded shadow-xl p-1 max-h-[70vh] overflow-y-auto">
          <div className="text-txt-muted text-[10px] uppercase px-2 py-1">Add Indicator</div>
          {Object.entries(INDICATORS).map(([id, def]) => (
            <button key={id} onClick={() => add(id)}
              className="w-full text-left px-2 py-1 rounded hover:bg-bg-panel mono text-xs flex justify-between">
              <span>{def.name}</span>
              <span className="text-txt-muted">{def.type}</span>
            </button>
          ))}

          {active.length > 0 && <div className="text-txt-muted text-[10px] uppercase px-2 py-1 mt-1 border-t border-border">Active</div>}
          {active.map(a => (
            <div key={a.uid} className="flex items-center justify-between px-2 py-1 mono text-xs">
              <span className="text-txt">{INDICATORS[a.id].name}</span>
              <span className="flex gap-1">
                <button onClick={() => { setEditing(a.uid); setOpen(false) }} title="Settings"
                  className="text-txt-sec hover:text-accent px-1">⚙</button>
                <button onClick={() => remove(a.uid)} title="Remove" className="text-red hover:text-white px-1">✕</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {editing && <IndicatorSettingsModal uid={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
