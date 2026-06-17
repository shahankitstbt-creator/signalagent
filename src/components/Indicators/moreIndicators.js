// Additional built-in indicators (spread into the main INDICATORS registry).
import { sma, ema, rma, stdev, atr, highest, lowest, closes, hl2 } from '../../utils/math'

const line = (data, color, lineWidth = 1, key = 'l', lineStyle = 0) => ({ key, kind: 'line', color, lineWidth, lineStyle, data })
const xy = (bars, vals) => bars.map((b, i) => vals[i] == null ? null : ({ time: b.time, value: vals[i] })).filter(Boolean)
const num = (key, label, def) => ({ key, label, default: def, type: 'number' })
const col = (key, label, def) => ({ key, label, default: def, type: 'color' })
const wid = (key, label, def) => ({ key, label, default: def, type: 'width' })
const lst = (key = 'lstyle', label = 'Line Style', def = 0) => ({ key, label, default: def, type: 'linestyle' })

const C = { blue: '#2962FF', orange: '#FF6D00', green: '#00C853', red: '#FF1744', cyan: '#00E5FF', yellow: '#FFD600', purple: '#AA00FF', gold: '#FFB300', sec: '#6B7F99' }

function stochK(bars, len) {
  const c = closes(bars), H = bars.map(x => x.high), L = bars.map(x => x.low) // hoist (avoid O(n²) alloc)
  return bars.map((b, i) => { if (i < len - 1) return null; const hh = highest(H, len, i), ll = lowest(L, len, i); return hh === ll ? 50 : ((c[i] - ll) / (hh - ll)) * 100 })
}

export const MORE = {
  buysell: {
    name: 'Buy/Sell Signals', type: 'overlay',
    inputs: [num('len', 'ATR Period', 10), num('mult', 'Multiplier', 3), col('buyColor', 'Buy', C.green), col('sellColor', 'Sell', C.red)],
    compute: (b, o) => {
      const a = atr(b, o.len), src = hl2(b)
      const upper = [], lower = [], trend = []
      for (let i = 0; i < b.length; i++) {
        if (a[i] == null) { upper[i] = lower[i] = trend[i] = null; continue }
        const bu = src[i] + o.mult * a[i], bl = src[i] - o.mult * a[i]
        upper[i] = (upper[i - 1] == null || bu < upper[i - 1] || b[i - 1].close > upper[i - 1]) ? bu : upper[i - 1]
        lower[i] = (lower[i - 1] == null || bl > lower[i - 1] || b[i - 1].close < lower[i - 1]) ? bl : lower[i - 1]
        trend[i] = trend[i - 1] == null ? 1 : trend[i - 1] === -1 && b[i].close > upper[i - 1] ? 1 : trend[i - 1] === 1 && b[i].close < lower[i - 1] ? -1 : trend[i - 1]
      }
      const markers = []
      for (let i = 1; i < b.length; i++) {
        if (trend[i] === 1 && trend[i - 1] === -1) markers.push({ time: b[i].time, position: 'belowBar', color: o.buyColor, shape: 'arrowUp', text: 'Buy' })
        if (trend[i] === -1 && trend[i - 1] === 1) markers.push({ time: b[i].time, position: 'aboveBar', color: o.sellColor, shape: 'arrowDown', text: 'Sell' })
      }
      return { series: [], markers }
    },
  },
  ichimoku: {
    name: 'Ichimoku Cloud', type: 'overlay',
    inputs: [num('tenkan', 'Tenkan', 9), num('kijun', 'Kijun', 26), num('senkou', 'Senkou B', 52),
      col('tenkanColor', 'Tenkan', C.blue), col('kijunColor', 'Kijun', C.red), col('aColor', 'Span A', C.green), col('bColor', 'Span B', C.orange), wid('width', 'Width', 1)],
    plots: [{ key: 'tenkan', label: 'Tenkan' }, { key: 'kijun', label: 'Kijun' }, { key: 'spanA', label: 'Span A' }, { key: 'spanB', label: 'Span B' }],
    compute: (b, o) => {
      const Hi = b.map(x => x.high), Lo = b.map(x => x.low)
      const mid = (len) => b.map((_, i) => i < len - 1 ? null : (highest(Hi, len, i) + lowest(Lo, len, i)) / 2)
      const tenkan = mid(o.tenkan), kijun = mid(o.kijun), senkouB = mid(o.senkou)
      const spanA = tenkan.map((t, i) => t == null || kijun[i] == null ? null : (t + kijun[i]) / 2)
      return { series: [
        line(xy(b, tenkan), o.tenkanColor, o.width, 'tenkan'),
        line(xy(b, kijun), o.kijunColor, o.width, 'kijun'),
        line(xy(b, spanA), o.aColor, o.width, 'spanA'),
        line(xy(b, senkouB), o.bColor, o.width, 'spanB'),
      ] }
    },
  },

  stochastic: {
    name: 'Stochastic', type: 'pane',
    inputs: [num('k', '%K', 14), num('smooth', 'Smooth', 3), num('d', '%D', 3), col('kColor', '%K', C.blue), col('dColor', '%D', C.orange), wid('width', 'Width', 1)],
    plots: [{ key: 'k', label: '%K' }, { key: 'd', label: '%D' }],
    compute: (b, o) => {
      const raw = stochK(b, o.k)
      const k = sma(raw.map(x => x ?? 0), o.smooth)
      const d = sma(k.map(x => x ?? 0), o.d)
      return { series: [line(xy(b, k), o.kColor, o.width, 'k'), line(xy(b, d), o.dColor, o.width, 'd')],
        priceLines: [{ price: 80, color: '#FF174455', title: '80' }, { price: 20, color: '#00C85355', title: '20' }] }
    },
  },

  stochrsi: {
    name: 'Stochastic RSI', type: 'pane',
    inputs: [num('len', 'RSI Len', 14), num('stoch', 'Stoch Len', 14), num('k', '%K', 3), num('d', '%D', 3), col('kColor', '%K', C.cyan), col('dColor', '%D', C.orange), wid('width', 'Width', 1)],
    plots: [{ key: 'k', label: '%K' }, { key: 'd', label: '%D' }],
    compute: (b, o) => {
      const src = closes(b)
      const g = src.map((v, i) => i === 0 ? 0 : Math.max(0, v - src[i - 1]))
      const l = src.map((v, i) => i === 0 ? 0 : Math.max(0, src[i - 1] - v))
      const ag = rma(g, o.len), al = rma(l, o.len)
      const rsi = ag.map((x, i) => x == null ? null : (al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i])))
      const sr = rsi.map((_, i) => { if (i < o.stoch - 1 || rsi[i] == null) return null; const w = rsi.slice(i - o.stoch + 1, i + 1).filter(x => x != null); const hh = Math.max(...w), ll = Math.min(...w); return hh === ll ? 50 : ((rsi[i] - ll) / (hh - ll)) * 100 })
      const k = sma(sr.map(x => x ?? 0), o.k), d = sma(k.map(x => x ?? 0), o.d)
      return { series: [line(xy(b, k), o.kColor, o.width, 'k'), line(xy(b, d), o.dColor, o.width, 'd')],
        priceLines: [{ price: 80, color: '#FF174455', title: '80' }, { price: 20, color: '#00C85355', title: '20' }] }
    },
  },

  adx: {
    name: 'ADX / DMI', type: 'pane',
    inputs: [num('len', 'Length', 14), col('adxColor', 'ADX', C.yellow), col('plusColor', '+DI', C.green), col('minusColor', '-DI', C.red), wid('width', 'Width', 1)],
    plots: [{ key: 'adx', label: 'ADX' }, { key: 'plus', label: '+DI' }, { key: 'minus', label: '-DI' }],
    compute: (b, o) => {
      const len = o.len, n = b.length
      const tr = [], pdm = [], ndm = []
      for (let i = 0; i < n; i++) {
        if (i === 0) { tr.push(b[i].high - b[i].low); pdm.push(0); ndm.push(0); continue }
        const up = b[i].high - b[i - 1].high, dn = b[i - 1].low - b[i].low
        pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0)
        tr.push(Math.max(b[i].high - b[i].low, Math.abs(b[i].high - b[i - 1].close), Math.abs(b[i].low - b[i - 1].close)))
      }
      const atrS = rma(tr, len), pS = rma(pdm, len), nS = rma(ndm, len)
      const pdi = pS.map((v, i) => v == null || !atrS[i] ? null : 100 * v / atrS[i])
      const ndi = nS.map((v, i) => v == null || !atrS[i] ? null : 100 * v / atrS[i])
      const dx = pdi.map((p, i) => p == null || ndi[i] == null ? null : (p + ndi[i] === 0 ? 0 : 100 * Math.abs(p - ndi[i]) / (p + ndi[i])))
      const adx = rma(dx.map(x => x ?? 0), len)
      return { series: [line(xy(b, adx), o.adxColor, o.width + 1, 'adx'), line(xy(b, pdi), o.plusColor, o.width, 'plus'), line(xy(b, ndi), o.minusColor, o.width, 'minus')],
        priceLines: [{ price: 25, color: '#6B7F9955', title: '25' }] }
    },
  },

  cci: {
    name: 'CCI', type: 'pane',
    inputs: [num('len', 'Length', 20), col('color', 'Color', C.purple), wid('width', 'Width', 2), lst()],
    compute: (b, o) => {
      const tp = b.map(x => (x.high + x.low + x.close) / 3)
      const cci = tp.map((_, i) => { if (i < o.len - 1) return null; const w = tp.slice(i - o.len + 1, i + 1); const m = w.reduce((a, c) => a + c, 0) / o.len; const md = w.reduce((a, c) => a + Math.abs(c - m), 0) / o.len; return md === 0 ? 0 : (tp[i] - m) / (0.015 * md) })
      return { series: [line(xy(b, cci), o.color, o.width, 'cci', o.lstyle)], priceLines: [{ price: 100, color: '#FF174455', title: '100' }, { price: -100, color: '#00C85355', title: '-100' }] }
    },
  },

  williamsr: {
    name: 'Williams %R', type: 'pane',
    inputs: [num('len', 'Length', 14), col('color', 'Color', C.cyan), wid('width', 'Width', 2), lst()],
    compute: (b, o) => {
      const H = b.map(x => x.high), L = b.map(x => x.low)
      const r = b.map((_, i) => { if (i < o.len - 1) return null; const hh = highest(H, o.len, i), ll = lowest(L, o.len, i); return hh === ll ? -50 : ((hh - b[i].close) / (hh - ll)) * -100 })
      return { series: [line(xy(b, r), o.color, o.width, 'wr', o.lstyle)], priceLines: [{ price: -20, color: '#FF174455', title: '-20' }, { price: -80, color: '#00C85355', title: '-80' }] }
    },
  },

  obv: {
    name: 'OBV', type: 'pane',
    inputs: [col('color', 'Color', C.blue), wid('width', 'Width', 2), lst()],
    compute: (b, o) => {
      let obv = 0; const out = b.map((x, i) => { if (i > 0) obv += x.close > b[i - 1].close ? x.volume : x.close < b[i - 1].close ? -x.volume : 0; return obv })
      return { series: [line(xy(b, out), o.color, o.width, 'obv', o.lstyle)] }
    },
  },

  mfi: {
    name: 'Money Flow Index', type: 'pane',
    inputs: [num('len', 'Length', 14), col('color', 'Color', C.gold), wid('width', 'Width', 2), lst()],
    compute: (b, o) => {
      const tp = b.map(x => (x.high + x.low + x.close) / 3)
      const mfi = b.map((_, i) => { if (i < o.len) return null; let pos = 0, neg = 0; for (let k = i - o.len + 1; k <= i; k++) { const mf = tp[k] * b[k].volume; if (tp[k] > tp[k - 1]) pos += mf; else if (tp[k] < tp[k - 1]) neg += mf } return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg) })
      return { series: [line(xy(b, mfi), o.color, o.width, 'mfi', o.lstyle)], priceLines: [{ price: 80, color: '#FF174455', title: '80' }, { price: 20, color: '#00C85355', title: '20' }] }
    },
  },

  atrpane: {
    name: 'ATR', type: 'pane',
    inputs: [num('len', 'Length', 14), col('color', 'Color', C.orange), wid('width', 'Width', 2), lst()],
    compute: (b, o) => ({ series: [line(xy(b, atr(b, o.len)), o.color, o.width, 'atr', o.lstyle)] }),
  },

  roc: {
    name: 'Rate of Change', type: 'pane',
    inputs: [num('len', 'Length', 9), col('color', 'Color', C.cyan), wid('width', 'Width', 2), lst()],
    compute: (b, o) => {
      const c = closes(b)
      const roc = c.map((v, i) => i < o.len ? null : ((v - c[i - o.len]) / c[i - o.len]) * 100)
      return { series: [line(xy(b, roc), o.color, o.width, 'roc', o.lstyle)], priceLines: [{ price: 0, color: '#6B7F9955', title: '0' }] }
    },
  },

  ao: {
    name: 'Awesome Oscillator', type: 'pane',
    inputs: [],
    compute: (b) => {
      const m = b.map(x => (x.high + x.low) / 2)
      const f = sma(m, 5), s = sma(m, 34)
      const ao = f.map((v, i) => v == null || s[i] == null ? null : v - s[i])
      const data = b.map((x, i) => ao[i] == null ? null : ({ time: x.time, value: ao[i], color: i > 0 && ao[i] >= (ao[i - 1] ?? 0) ? '#00C85399' : '#FF174499' })).filter(Boolean)
      return { series: [{ key: 'ao', kind: 'histogram', color: C.sec, data }] }
    },
  },

  donchian: {
    name: 'Donchian Channel', type: 'overlay',
    inputs: [num('len', 'Length', 20), col('color', 'Color', C.blue), wid('width', 'Width', 1)],
    plots: [{ key: 'up', label: 'Upper' }, { key: 'mid', label: 'Basis' }, { key: 'lo', label: 'Lower' }],
    compute: (b, o) => {
      const H = b.map(x => x.high), L = b.map(x => x.low)
      const up = b.map((_, i) => i < o.len - 1 ? null : highest(H, o.len, i))
      const lo = b.map((_, i) => i < o.len - 1 ? null : lowest(L, o.len, i))
      const mid = up.map((u, i) => u == null ? null : (u + lo[i]) / 2)
      return { series: [line(xy(b, up), o.color + 'AA', o.width, 'up'), line(xy(b, mid), C.sec, o.width, 'mid'), line(xy(b, lo), o.color + 'AA', o.width, 'lo')] }
    },
  },

  keltner: {
    name: 'Keltner Channel', type: 'overlay',
    inputs: [num('len', 'EMA Len', 20), num('atrLen', 'ATR Len', 10), num('mult', 'Mult', 2), col('color', 'Color', C.purple), wid('width', 'Width', 1)],
    plots: [{ key: 'up', label: 'Upper' }, { key: 'mid', label: 'Basis' }, { key: 'lo', label: 'Lower' }],
    compute: (b, o) => {
      const basis = ema(closes(b), o.len), a = atr(b, o.atrLen)
      const up = basis.map((m, i) => m == null || a[i] == null ? null : m + o.mult * a[i])
      const lo = basis.map((m, i) => m == null || a[i] == null ? null : m - o.mult * a[i])
      return { series: [line(xy(b, up), o.color + 'AA', o.width, 'up'), line(xy(b, basis), o.color, o.width, 'mid'), line(xy(b, lo), o.color + 'AA', o.width, 'lo')] }
    },
  },

  psar: {
    name: 'Parabolic SAR', type: 'overlay',
    inputs: [num('step', 'Step', 0.02), num('max', 'Max', 0.2), col('color', 'Color', C.gold), wid('width', 'Width', 2)],
    compute: (b, o) => {
      const n = b.length; if (n < 2) return { series: [] }
      let bull = b[1].close > b[0].close, af = o.step
      let sar = bull ? b[0].low : b[0].high, ep = bull ? b[0].high : b[0].low
      const out = new Array(n).fill(null)
      for (let i = 1; i < n; i++) {
        sar = sar + af * (ep - sar)
        if (bull) {
          if (b[i].low < sar) { bull = false; sar = ep; ep = b[i].low; af = o.step }
          else { if (b[i].high > ep) { ep = b[i].high; af = Math.min(af + o.step, o.max) } }
        } else {
          if (b[i].high > sar) { bull = true; sar = ep; ep = b[i].high; af = o.step }
          else { if (b[i].low < ep) { ep = b[i].low; af = Math.min(af + o.step, o.max) } }
        }
        out[i] = sar
      }
      const data = b.map((x, i) => out[i] == null ? null : ({ time: x.time, value: out[i] })).filter(Boolean)
      return { series: [{ key: 'psar', kind: 'line', color: o.color, lineWidth: o.width, lineStyle: 0, data }] }
    },
  },

  pivots: {
    name: 'Pivot Points', type: 'overlay',
    inputs: [],
    compute: (b) => {
      if (b.length < 2) return { series: [] }
      const p = b[b.length - 2] // prior completed bar
      const P = (p.high + p.low + p.close) / 3
      const R1 = 2 * P - p.low, S1 = 2 * P - p.high
      const R2 = P + (p.high - p.low), S2 = P - (p.high - p.low)
      const R3 = p.high + 2 * (P - p.low), S3 = p.low - 2 * (p.high - P)
      const lv = (price, title, color) => ({ price, title, color, style: 2 })
      return { series: [], levels: [
        lv(P, 'P', C.gold), lv(R1, 'R1', C.red), lv(R2, 'R2', C.red), lv(R3, 'R3', C.red),
        lv(S1, 'S1', C.green), lv(S2, 'S2', C.green), lv(S3, 'S3', C.green),
      ] }
    },
  },
}
