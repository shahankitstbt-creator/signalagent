import { useAlertStore } from './AlertEngine'

const COLOR = { 'A++': 'border-gold', 'A+': 'border-green', 'A': 'border-cyan' }

export default function Toasts() {
  const toasts = useAlertStore(s => s.toasts)
  const dismiss = useAlertStore(s => s.dismiss)
  return (
    <div className="fixed top-14 right-3 z-[100] space-y-2 w-80">
      {toasts.map(t => (
        <div key={t.id} className={`bg-bg-card border-l-4 ${COLOR[t.grade] || 'border-accent'} border border-border rounded shadow-xl p-2 animate-[fadein_.2s]`}>
          <div className="flex justify-between items-start">
            <div className="mono text-xs font-bold text-txt">{t.title}</div>
            <button onClick={() => dismiss(t.id)} className="text-txt-muted hover:text-txt text-xs">✕</button>
          </div>
          <pre className="mono text-[10px] text-txt-sec whitespace-pre-wrap mt-1 leading-tight">{t.body}</pre>
        </div>
      ))}
    </div>
  )
}
