import { useHitAlerts } from '../../store/hitAlerts'

// In-app popups for target/SL hits (bottom-right toasts). Works alongside the
// system notification fired by the service worker.
export default function HitPopups() {
  const popups = useHitAlerts(s => s.popups)
  const dismiss = useHitAlerts(s => s.dismiss)
  if (!popups.length) return null
  return (
    <div className="fixed z-[100] bottom-4 right-4 flex flex-col gap-2 w-[320px] max-w-[90vw]">
      {popups.map(p => (
        <div key={p.id} className={`rounded-xl border bg-bg-card elev-lg p-3 ${p.tone === 'up' ? 'border-green' : 'border-red'}`}
          style={{ borderLeftWidth: 4 }}>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className={`mono text-sm font-bold ${p.tone === 'up' ? 'text-green' : 'text-red'}`}>{p.title}</div>
              <div className="mono text-[11px] text-txt-sec mt-0.5 leading-snug">{p.body}</div>
            </div>
            <button onClick={() => dismiss(p.id)} className="mono text-txt-muted hover:text-txt text-sm leading-none">✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}
