import { useEffect, useState } from 'react'
import { useContentStore, fullCaption } from '../../store/contentStore'

const PLAT_ICON = { instagram: '📸', youtube: '▶️' }

export default function ContentStudio({ onClose }) {
  const items = useContentStore(s => s.items)
  const meta = useContentStore(s => s.meta)
  const loading = useContentStore(s => s.loading)
  const error = useContentStore(s => s.error)
  const posted = useContentStore(s => s.posted)
  const markPosted = useContentStore(s => s.markPosted)
  const load = useContentStore(s => s.load)
  const [copied, setCopied] = useState(null)

  useEffect(() => { load() }, [load])

  const copy = (i) => { navigator.clipboard?.writeText(fullCaption(i)); setCopied(i.id); setTimeout(() => setCopied(null), 1500) }

  return (
    <div className="fixed inset-0 z-[130] bg-bg-base flex flex-col">
      <div className="h-11 shrink-0 flex items-center gap-3 px-4 border-b border-border bg-bg-panel">
        <span className="mono font-bold text-accent">📣 Content Studio</span>
        <span className="mono text-xs text-txt-sec">{items.length} pieces{meta?.date ? ` · ${meta.date}` : ''}</span>
        <button onClick={load} className="mono text-xs text-txt-sec hover:text-txt">⟳ refresh</button>
        <span className="ml-auto mono text-[10px] text-txt-muted">Review → Copy/Post → Mark done. Disclaimer is included automatically.</span>
        <button onClick={onClose} className="text-txt-muted hover:text-txt text-lg px-2">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-txt-sec mono text-sm">Loading…</div>}
        {error && <div className="text-yellow mono text-sm">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 max-w-[1500px] mx-auto">
          {items.map(i => {
            const isPosted = posted[i.id]
            return (
              <div key={i.id} className={`rounded-lg border p-3 flex flex-col ${isPosted ? 'border-green/40 bg-green/5' : 'border-border bg-bg-card'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">{i.theme}</span>
                  <span className="mono text-[10px] text-txt-muted uppercase">{i.format}</span>
                  <span className="ml-auto text-xs">{(i.platform || []).map(p => PLAT_ICON[p]).join(' ')}</span>
                </div>
                <div className="mono text-sm font-bold text-txt mb-1">{i.hook}</div>
                {i.image && <a href={i.image} download className="block mb-2"><img src={i.image} alt="" className="w-full rounded border border-border" loading="lazy" /></a>}
                <pre className="mono text-[11px] text-txt-sec whitespace-pre-wrap leading-snug flex-1">{i.body}</pre>
                <div className="mono text-[10px] text-accent/80 mt-2 break-words">{i.hashtags.join(' ')}</div>
                <div className="mono text-[9px] text-txt-muted mt-1.5 leading-tight border-t border-border pt-1.5">{i.disclaimer}</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => copy(i)} className="flex-1 mono text-[11px] py-1.5 rounded bg-accent text-white">
                    {copied === i.id ? '✓ Copied' : 'Copy caption'}
                  </button>
                  <button onClick={() => markPosted(i.id, !isPosted)}
                    className={`flex-1 mono text-[11px] py-1.5 rounded border ${isPosted ? 'bg-green/20 text-green border-green/40' : 'border-border text-txt-sec'}`}>
                    {isPosted ? '✓ Posted' : 'Mark posted'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
