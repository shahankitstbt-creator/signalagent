// Indicator library. Each indicator: compute(bars, opts) => {
//   series: [{ key, kind:'line'|'histogram', color, lineWidth?, data:[{time,value,color?}] }],
//   markers?, priceLines?, levels?, zones?
// }
// Inputs are typed: type 'number' (default) | 'color' | 'width'. Every indicator
// exposes period(s), line color + width, and — where one exists — a signal line
// with its own color + width.

import { sma, ema, rma, stdev, atr, linreg, closes, hl2, avg } from '../../utils/math'
import { vpIndicator } from './VolumeProfile'
import { liquidityIndicator } from './LiquidityEngine'
import { fvgIndicator } from './ImbalanceFVG'
import { MORE } from './moreIndicators'

const line = (data, color, lineWidth = 1, key = 'l', lineStyle = 0) => ({ key, kind: 'line', color, lineWidth, lineStyle, data })
const xy = (bars, vals) => bars.map((b, i) => vals[i] == null ? null : ({ time: b.time, value: vals[i] })).filter(Boolean)
// input descriptor helpers
const num = (key, label, def) => ({ key, label, default: def, type: 'number' })
const col = (key, label, def) => ({ key, label, default: def, type: 'color' })
const wid = (key, label, def) => ({ key, label, default: def, type: 'width' })
const lst = (key = 'lstyle', label = 'Line Style', def = 0) => ({ key, label, default: def, type: 'linestyle' })

export const INDICATORS = {
  ema: {
    name: 'EMA', type: 'overlay',
    inputs: [num('len', 'Period', 21), col('color', 'Line Color', '#2962FF'), wid('width', 'Line Width', 2), lst()],
    compute: (b, o) => ({ series: [line(xy(b, ema(closes(b), o.len)), o.color, o.width, 'ema', o.lstyle)] }),
  },
  sma: {
    name: 'SMA', type: 'overlay',
    inputs: [num('len', 'Period', 50), col('color', 'Line Color', '#FF6D00'), wid('width', 'Line Width', 2), lst()],
    compute: (b, o) => ({ series: [line(xy(b, sma(closes(b), o.len)), o.color, o.width, 'sma', o.lstyle)] }),
  },
  vwap: {
    name: 'VWAP', type: 'overlay',
    inputs: [col('color', 'Line Color', '#FFB300'), wid('width', 'Line Width', 2), lst()],
    compute: (b, o) => {
      let pv = 0, vv = 0, out = []
      b.forEach(x => { const tp = (x.high + x.low + x.close) / 3; pv += tp * x.volume; vv += x.volume; out.push(vv ? pv / vv : null) })
      return { series: [line(xy(b, out), o.color, o.width, 'vwap', o.lstyle)] }
    },
  },
  ribbon: {
    name: 'MA Ribbon', type: 'overlay',
    inputs: [num('start', 'Start Period', 20), num('step', 'Step', 10), num('count', 'MA Count', 12),
      col('upColor', 'Bull Color', '#00C853'), col('downColor', 'Bear Color', '#FF1744'), wid('width', 'Line Width', 1)],
    compute: (b, o) => {
      const src = closes(b)
      const periods = Array.from({ length: o.count }, (_, i) => o.start + i * o.step)
      return {
        series: periods.map(p => {
          const e = ema(src, p)
          const data = xy(b, e)
          const up = e.at(-1) > e.at(-2)
          return line(data, (up ? o.upColor : o.downColor) + '99', o.width, `r${p}`)
        }),
      }
    },
  },
  bb: {
    name: 'Bollinger Bands', type: 'overlay',
    plots: [{ key: 'up', label: 'Upper' }, { key: 'mid', label: 'Basis' }, { key: 'lo', label: 'Lower' }],
    inputs: [num('len', 'Period', 20), num('mult', 'StdDev Mult', 2),
      col('bandColor', 'Band Color', '#2962FF'), col('basisColor', 'Basis Color', '#6B7F99'), wid('width', 'Line Width', 1)],
    compute: (b, o) => {
      const src = closes(b), basis = sma(src, o.len), sd = stdev(src, o.len)
      const up = basis.map((x, i) => x == null ? null : x + o.mult * sd[i])
      const lo = basis.map((x, i) => x == null ? null : x - o.mult * sd[i])
      return { series: [
        line(xy(b, up), o.bandColor + 'AA', o.width, 'up'),
        line(xy(b, basis), o.basisColor, o.width, 'mid'),
        line(xy(b, lo), o.bandColor + 'AA', o.width, 'lo'),
      ] }
    },
  },
  supertrend: {
    name: 'Supertrend', type: 'overlay',
    inputs: [num('len', 'ATR Period', 10), num('mult', 'Multiplier', 3),
      col('upColor', 'Bull Color', '#00C853'), col('downColor', 'Bear Color', '#FF1744'), wid('width', 'Line Width', 2), lst()],
    compute: (b, o) => {
      const a = atr(b, o.len), src = hl2(b)
      let upper = [], lower = [], trend = [], st = []
      for (let i = 0; i < b.length; i++) {
        if (a[i] == null) { upper[i] = lower[i] = trend[i] = st[i] = null; continue }
        const bu = src[i] + o.mult * a[i], bl = src[i] - o.mult * a[i]
        upper[i] = (upper[i - 1] == null || bu < upper[i - 1] || b[i - 1].close > upper[i - 1]) ? bu : upper[i - 1]
        lower[i] = (lower[i - 1] == null || bl > lower[i - 1] || b[i - 1].close < lower[i - 1]) ? bl : lower[i - 1]
        trend[i] = trend[i - 1] == null ? 1
          : trend[i - 1] === -1 && b[i].close > upper[i - 1] ? 1
          : trend[i - 1] === 1 && b[i].close < lower[i - 1] ? -1 : trend[i - 1]
        st[i] = trend[i] === 1 ? lower[i] : upper[i]
      }
      const data = b.map((x, i) => st[i] == null ? null : ({ time: x.time, value: st[i], color: trend[i] === 1 ? o.upColor : o.downColor })).filter(Boolean)
      return { series: [{ key: 'st', kind: 'line', color: o.upColor, lineWidth: o.width, lineStyle: o.lstyle, data }] }
    },
  },
  utbot: {
    name: 'UT Bot Alerts', type: 'overlay',
    inputs: [num('key', 'Sensitivity', 1), num('len', 'ATR Period', 10),
      col('color', 'Stop Color', '#AA00FF'), wid('width', 'Line Width', 1),
      col('buyColor', 'Buy Color', '#00C853'), col('sellColor', 'Sell Color', '#FF1744')],
    compute: (b, o) => {
      const a = atr(b, o.len), src = closes(b)
      let stop = [], pos = []
      for (let i = 0; i < b.length; i++) {
        if (a[i] == null) { stop[i] = null; pos[i] = 0; continue }
        const n = o.key * a[i], c = src[i], cPrev = src[i - 1], sPrev = stop[i - 1]
        if (sPrev == null) { stop[i] = c - n; pos[i] = 1; continue }
        if (c > sPrev && cPrev > sPrev) stop[i] = Math.max(sPrev, c - n)
        else if (c < sPrev && cPrev < sPrev) stop[i] = Math.min(sPrev, c + n)
        else stop[i] = c > sPrev ? c - n : c + n
        pos[i] = c > stop[i] ? 1 : -1
      }
      const markers = []
      for (let i = 1; i < b.length; i++) {
        if (pos[i] === 1 && pos[i - 1] === -1) markers.push({ time: b[i].time, position: 'belowBar', color: o.buyColor, shape: 'arrowUp', text: 'BUY' })
        if (pos[i] === -1 && pos[i - 1] === 1) markers.push({ time: b[i].time, position: 'aboveBar', color: o.sellColor, shape: 'arrowDown', text: 'SELL' })
      }
      return { series: [line(xy(b, stop), o.color, o.width, 'stop')], markers }
    },
  },
  rsi: {
    name: 'RSI', type: 'pane',
    inputs: [num('len', 'Period', 14), col('color', 'Line Color', '#00E5FF'), wid('width', 'Line Width', 2), lst(),
      num('ob', 'Overbought', 70), num('os', 'Oversold', 30)],
    compute: (b, o) => {
      const src = closes(b)
      const gain = src.map((v, i) => i === 0 ? 0 : Math.max(0, v - src[i - 1]))
      const loss = src.map((v, i) => i === 0 ? 0 : Math.max(0, src[i - 1] - v))
      const ag = rma(gain, o.len), al = rma(loss, o.len)
      const rsi = ag.map((g, i) => g == null ? null : (al[i] === 0 ? 100 : 100 - 100 / (1 + g / al[i])))
      return {
        series: [line(xy(b, rsi), o.color, o.width, 'rsi', o.lstyle)],
        priceLines: [{ price: o.ob, color: '#FF174455', title: String(o.ob) }, { price: o.os, color: '#00C85355', title: String(o.os) }],
      }
    },
  },
  macd: {
    name: 'MACD', type: 'pane',
    plots: [{ key: 'hist', label: 'Histogram' }, { key: 'macd', label: 'MACD' }, { key: 'sig', label: 'Signal' }],
    inputs: [num('fast', 'Fast', 12), num('slow', 'Slow', 26), num('sig', 'Signal', 9),
      col('macdColor', 'MACD Color', '#2962FF'), wid('macdWidth', 'MACD Width', 2),
      col('sigColor', 'Signal Color', '#FFD600'), wid('sigWidth', 'Signal Width', 1)],
    compute: (b, o) => {
      const src = closes(b)
      const ef = ema(src, o.fast), es = ema(src, o.slow)
      const macd = ef.map((f, i) => f == null || es[i] == null ? null : f - es[i])
      const sig = ema(macd.map(v => v == null ? 0 : v), o.sig)
      const hist = macd.map((m, i) => m == null || sig[i] == null ? null : m - sig[i])
      const histData = b.map((x, i) => hist[i] == null ? null : ({ time: x.time, value: hist[i], color: hist[i] >= 0 ? '#00C85399' : '#FF174499' })).filter(Boolean)
      return { series: [
        { key: 'hist', kind: 'histogram', color: o.macdColor, data: histData },
        line(xy(b, macd), o.macdColor, o.macdWidth, 'macd'),
        line(xy(b, sig), o.sigColor, o.sigWidth, 'sig'),
      ] }
    },
  },
  lrc: {
    name: 'Linear Reg Candles', type: 'overlay',
    inputs: [num('len', 'Period', 11), col('upColor', 'Bull Color', '#00C853'), col('downColor', 'Bear Color', '#FF1744'), wid('width', 'Line Width', 2), lst()],
    compute: (b, o) => {
      const lro = linreg(b.map(x => x.open), o.len)
      const lrc = linreg(closes(b), o.len)
      const data = b.map((x, i) => lrc[i] == null ? null : ({ time: x.time, value: lrc[i], color: lrc[i] >= lro[i] ? o.upColor : o.downColor })).filter(Boolean)
      return { series: [{ key: 'lrc', kind: 'line', color: o.upColor, lineWidth: o.width, lineStyle: o.lstyle, data }] }
    },
  },

  // ── Extended built-ins ──
  ...MORE,

  // ── Institutional engines (semantic colors; periods/tolerances configurable) ──
  vp: vpIndicator,
  liquidity: liquidityIndicator,
  fvg: fvgIndicator,
}

export const indicatorDefaults = (id) =>
  Object.fromEntries((INDICATORS[id].inputs || []).map(i => [i.key, i.default]))
