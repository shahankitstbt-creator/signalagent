// Shared analytics context — computed once per scan, reused by all strategies.
import { ema, sma, rma, stdev, atr, closes } from '../../utils/math'
import { volumeProfile } from '../Indicators/VolumeProfile'
import { findEqualLevels, detectSweeps, analyzeStructure } from '../Indicators/LiquidityEngine'
import { detectFVG, trackMitigation } from '../Indicators/ImbalanceFVG'

export function rsiArr(bars, len = 14) {
  const src = closes(bars)
  const g = src.map((v, i) => i === 0 ? 0 : Math.max(0, v - src[i - 1]))
  const l = src.map((v, i) => i === 0 ? 0 : Math.max(0, src[i - 1] - v))
  const ag = rma(g, len), al = rma(l, len)
  return ag.map((x, i) => x == null ? null : (al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i])))
}

export function buildContext(bars) {
  const src = closes(bars)
  const i = bars.length - 1
  const levels = findEqualLevels(bars, 0.001)
  const fvgs = trackMitigation(detectFVG(bars), bars)
  return {
    bars, i, last: bars[i], close: bars[i].close,
    ema50: ema(src, 50), ema200: ema(src, 200), ema20: ema(src, 20),
    sma50: sma(src, 50), sma200: sma(src, 200),
    rsi: rsiArr(bars, 14), atr: atr(bars, 14),
    bbBasis: sma(src, 20), bbStd: stdev(src, 20),
    vp: volumeProfile(bars, 100),
    levels, sweeps: detectSweeps(bars, levels), struct: analyzeStructure(bars),
    fvgs,
    avgVol: bars.slice(-20).reduce((a, b) => a + b.volume, 0) / Math.min(20, bars.length),
  }
}
