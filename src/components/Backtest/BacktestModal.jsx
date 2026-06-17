import { useState } from 'react'
import { backtest } from './BacktestEngine'
import { STRATEGIES } from '../Strategies/strategies'
import { useChartStore } from '../../store/chartStore'

export default function BacktestModal({ onClose }) {
  const bars = useChartStore(s => s.bars)
  const symbol = useChartStore(s => s.symbol)
  const interval = useChartStore(s => s.interval)
  const [stratId, setStratId] = useState('sweep')
  const [res, setRes] = useState(null)
  const [running, setRunning] = useState(false)

  const run = () => {
    setRunning(true)
    setTimeout(() => { setRes(backtest(bars, stratId)); setRunning(false) }, 20)
  }

  const stats = res && [
    ['Net Profit', `$${res.netProfit} (${res.netPct}%)`, res.netProfit >= 0 ? 'text-green' : 'text-red'],
    ['Win Rate', `${res.winRate}%`], ['Total Trades', res.total],
    ['Profit Factor', res.profitFactor, res.profitFactor >= 1.5 ? 'text-green' : 'text-yellow'],
    ['Avg R:R', `1:${res.avgRR}`], ['Max Drawdown', `-${res.maxDD}%`, 'text-red'],
  ]

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-lg shadow-2xl w-[560px] max-w-[94vw] p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="mono font-bold text-txt">Backtest · {symbol} · {interval}</h2>
          <button onClick={onClose} className="text-txt-muted hover:text-txt">✕</button>
        </div>
        <div className="flex gap-2 items-center mb-3">
          <select value={stratId} onChange={e => setStratId(e.target.value)}
            className="flex-1 bg-bg-base border border-border rounded px-2 py-1.5 mono text-xs">
            {Object.entries(STRATEGIES).map(([id, s]) => <option key={id} value={id}>{s.name}</option>)}
          </select>
          <button onClick={run} disabled={running || bars.length < 140}
            className="bg-accent text-white mono text-xs px-4 py-1.5 rounded disabled:opacity-50">
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
        {bars.length < 140 && <div className="text-yellow mono text-xs mb-2">Not enough bars loaded.</div>}
        {res && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {stats.map(([k, v, cls]) => (
                <div key={k} className="bg-bg-panel border border-border rounded p-2">
                  <div className="text-txt-muted text-[10px] mono uppercase">{k}</div>
                  <div className={`mono text-sm font-bold ${cls || 'text-txt'}`}>{v}</div>
                </div>
              ))}
            </div>
            <Equity curve={res.curve} />
            <div className="text-txt-muted text-[10px] mono mt-2">
              Model: enter on signal, exit at TP1 or SL (SL-first if both hit in one bar), 1% risk/trade. Past results are not predictive.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Equity({ curve }) {
  if (!curve.length) return null
  const w = 520, h = 90
  const vals = curve.map(c => c.value)
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const pts = curve.map((c, i) => `${(i / (curve.length - 1)) * w},${h - ((c.value - min) / range) * h}`).join(' ')
  const up = vals.at(-1) >= vals[0]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full bg-bg-panel border border-border rounded">
      <polyline points={pts} fill="none" stroke={up ? '#00C853' : '#FF1744'} strokeWidth="1.5" />
    </svg>
  )
}
