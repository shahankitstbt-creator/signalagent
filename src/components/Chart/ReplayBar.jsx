import { useEffect } from 'react'
import { useReplayStore } from '../../store/replayStore'
import { useChartStore } from '../../store/chartStore'

export default function ReplayBar() {
  const active = useReplayStore(s => s.active)
  const index = useReplayStore(s => s.index)
  const playing = useReplayStore(s => s.playing)
  const speed = useReplayStore(s => s.speed)
  const len = useChartStore(s => s.bars.length)

  useEffect(() => {
    if (!playing) return
    const ms = Math.max(70, 600 / speed)
    const id = setInterval(() => useReplayStore.getState().tick(useChartStore.getState().bars.length), ms)
    return () => clearInterval(id)
  }, [playing, speed])

  if (!active) return null
  const R = useReplayStore.getState()
  const Btn = ({ onClick, children, title }) => (
    <button onClick={onClick} title={title} className="px-2 py-0.5 rounded hover:bg-bg-card text-txt-sec text-sm">{children}</button>
  )
  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-bg-panel border border-border rounded-lg shadow-xl px-2 py-1">
      <Btn onClick={() => R.step(len, -1)} title="Step back">⏮</Btn>
      <Btn onClick={() => R.togglePlay()} title="Play / Pause">{playing ? '⏸' : '⏵'}</Btn>
      <Btn onClick={() => R.step(len, 1)} title="Step forward">⏭</Btn>
      <input type="range" min="10" max={len} value={index} onChange={e => R.setIndex(len, +e.target.value)} className="w-40 mx-1 accent-[color:var(--color-accent)]" />
      <span className="mono text-[10px] text-txt-muted w-16">{index}/{len}</span>
      <select value={speed} onChange={e => R.setSpeed(+e.target.value)} className="bg-bg-base border border-border rounded mono text-[10px] px-1 py-0.5">
        {[0.5, 1, 2, 3, 5, 10].map(s => <option key={s} value={s}>{s}×</option>)}
      </select>
      <Btn onClick={() => R.stop()} title="Exit replay">✕</Btn>
    </div>
  )
}
