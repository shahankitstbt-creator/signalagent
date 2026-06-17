import { useEffect, useState } from 'react'
import { useContentStore, fullCaption } from '../../store/contentStore'
import { useViewStore } from '../../store/viewStore'

const PLAT = { instagram: '📸', youtube: '▶️' }

export default function AgentDashboard() {
  const items = useContentStore(s => s.items)
  const meta = useContentStore(s => s.meta)
  const loading = useContentStore(s => s.loading)
  const error = useContentStore(s => s.error)
  const posted = useContentStore(s => s.posted)
  const markPosted = useContentStore(s => s.markPosted)
  const load = useContentStore(s => s.load)
  const setView = useViewStore(s => s.setView)
  const [copied, setCopied] = useState(null)

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [load])
  const copy = (i) => { navigator.clipboard?.writeText(fullCaption(i)); setCopied(i.id); setTimeout(() => setCopied(null), 1500) }

  const postedCount = items.filter(i => posted[i.id]).length

  return (
    <div className="h-full flex flex-col bg-bg-base text-txt overflow-hidden">
      {/* header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-bg-panel flex items-center gap-4">
        <div>
          <div className="mono text-xl font-bold text-accent">🤖 ProTrader Agent</div>
          <div className="mono text-[11px] text-txt-sec mt-0.5">
            <span className="text-green">● Live</span> · runs 24×7 · auto-generates daily market content
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setView('board')} className="mono text-xs px-3 py-2 rounded bg-bg-card border border-border hover:border-accent">🎯 Signal Board</button>
          <button onClick={() => setView('chart')} className="mono text-xs px-3 py-2 rounded bg-bg-card border border-border hover:border-accent">📈 Chart</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* status strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 max-w-5xl">
          <Stat label="Content today" value={items.length} sub={meta?.date || '—'} />
          <Stat label="Marked posted" value={`${postedCount}/${items.length}`} sub="this batch" />
          <Stat label="Accounts connected" value="0 / 2" sub="IG + YouTube (tomorrow)" warn />
          <Stat label="Auto-post" value="DRY-RUN" sub="live when tokens added" warn />
        </div>

        {/* how it runs */}
        <div className="mb-5 max-w-5xl rounded-lg border border-border bg-bg-card p-4">
          <div className="mono text-xs uppercase text-txt-sec mb-2">How it runs automatically</div>
          <div className="flex flex-wrap items-center gap-2 mono text-[11px] text-txt-sec">
            {['Scan 500 NSE stocks (hourly)', 'Score + backtest setups', 'Generate 7 posts (08:30)', 'Render branded images', 'Auto-post (09:30 · 13:30 · 18:30)'].map((s, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded bg-bg-panel border border-border">{s}</span>
                {i < 4 && <span className="text-txt-muted">→</span>}
              </span>
            ))}
          </div>
          <div className="mono text-[10px] text-txt-muted mt-2">
            Every piece carries a SEBI disclaimer · accuracy shown = real backtested hit-rate · astro framed as tradition. This keeps your account safe & honest.
          </div>
        </div>

        {/* content queue */}
        <div className="mono text-sm font-bold mb-2 max-w-5xl flex items-center gap-3">
          Today's content queue
          <button onClick={load} className="mono text-[11px] text-txt-sec hover:text-txt">⟳ refresh</button>
        </div>
        {loading && <div className="mono text-xs text-txt-sec">Loading…</div>}
        {error && <div className="mono text-xs text-yellow">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 max-w-[1400px]">
          {items.map(i => {
            const isPosted = posted[i.id]
            return (
              <div key={i.id} className={`rounded-lg border p-3 flex flex-col ${isPosted ? 'border-green/40 bg-green/5' : 'border-border bg-bg-card'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">{i.theme}</span>
                  <span className="mono text-[10px] text-txt-muted uppercase">{i.format}</span>
                  <span className="ml-auto text-xs">{(i.platform || []).map(p => PLAT[p]).join(' ')}</span>
                </div>
                <div className="mono text-sm font-bold mb-1">{i.hook}</div>
                {i.image && <a href={i.image} download className="block mb-2"><img src={i.image} alt="" className="w-full rounded border border-border" loading="lazy" /></a>}
                <pre className="mono text-[11px] text-txt-sec whitespace-pre-wrap leading-snug flex-1">{i.body}</pre>
                <div className="mono text-[10px] text-accent/80 mt-2 break-words">{i.hashtags.join(' ')}</div>
                <div className="mono text-[9px] text-txt-muted mt-1.5 border-t border-border pt-1.5">{i.disclaimer}</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => copy(i)} className="flex-1 mono text-[11px] py-1.5 rounded bg-accent text-white">{copied === i.id ? '✓ Copied' : 'Copy caption'}</button>
                  <button onClick={() => markPosted(i.id, !isPosted)} className={`flex-1 mono text-[11px] py-1.5 rounded border ${isPosted ? 'bg-green/20 text-green border-green/40' : 'border-border text-txt-sec'}`}>{isPosted ? '✓ Posted' : 'Mark posted'}</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, warn }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="mono text-[10px] uppercase text-txt-muted">{label}</div>
      <div className={`mono text-lg font-bold ${warn ? 'text-yellow' : 'text-txt'}`}>{value}</div>
      <div className="mono text-[10px] text-txt-sec">{sub}</div>
    </div>
  )
}
