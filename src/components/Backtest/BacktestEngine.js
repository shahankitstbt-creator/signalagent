// Walk-forward backtest for a single strategy. At each bar we evaluate the
// strategy on data up to that bar; on a signal (no open trade) we open a
// position and exit at TP1 or SL (whichever the high/low hits first).
import { STRATEGIES } from '../Strategies/strategies'
import { buildContext } from '../Strategies/context'

export function backtest(bars, stratId, { warmup = 120, riskPerTrade = 0.01, capital = 10000 } = {}) {
  const strat = STRATEGIES[stratId]
  if (!strat || bars.length < warmup + 20) return null
  const trades = []
  let open = null
  let equity = capital
  const curve = []

  for (let i = warmup; i < bars.length; i++) {
    const bar = bars[i]
    // manage open trade against this bar's range
    if (open) {
      const hitSL = open.dir === 'LONG' ? bar.low <= open.stop : bar.high >= open.stop
      const hitTP = open.dir === 'LONG' ? bar.high >= open.tp : bar.low <= open.tp
      if (hitSL || hitTP) {
        // if both in one bar, assume SL first (conservative)
        const win = hitTP && !hitSL ? true : (hitSL ? false : true)
        const r = win ? open.rr : -1
        const pnl = equity * riskPerTrade * r
        equity += pnl
        trades.push({ ...open, exitIndex: i, exitTime: bar.time, win, r, pnl })
        open = null
      }
    }
    curve.push({ time: bar.time, value: +equity.toFixed(2) })
    if (open) continue

    // evaluate strategy on bars up to i
    let raw
    try { raw = strat.run(buildContext(bars.slice(0, i + 1))) } catch { raw = null }
    if (raw) {
      const risk = Math.abs(raw.entry - raw.stop)
      const rr = risk ? Math.abs(raw.tps[0] - raw.entry) / risk : 0
      if (rr >= 0.3) open = { dir: raw.direction, entry: raw.entry, stop: raw.stop, tp: raw.tps[0], rr: +rr.toFixed(2), entryIndex: i, entryTime: bar.time }
    }
  }

  const wins = trades.filter(t => t.win)
  const losses = trades.filter(t => !t.win)
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  let peak = capital, maxDD = 0
  for (const p of curve) { peak = Math.max(peak, p.value); maxDD = Math.max(maxDD, (peak - p.value) / peak) }

  return {
    trades, curve,
    netProfit: +(equity - capital).toFixed(2),
    netPct: +(((equity - capital) / capital) * 100).toFixed(1),
    total: trades.length,
    winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : 0,
    profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? 99 : 0),
    avgRR: trades.length ? +(trades.reduce((s, t) => s + t.rr, 0) / trades.length).toFixed(2) : 0,
    maxDD: +(maxDD * 100).toFixed(1),
    finalEquity: +equity.toFixed(2),
  }
}
