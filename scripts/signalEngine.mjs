// ─────────────────────────────────────────────────────────────────────────
// SIGNAL ENGINE — modular, backtested, accuracy-gated.
// Each entry in LOGICS is one screener strategy: signal(H, i) => true when a
// LONG entry triggers at bar i. The engine backtests every logic over history;
// only logics with aggregate accuracy >= MIN_ACCURACY (and enough trades) are
// allowed to emit live signals. ADD MORE LOGICS by appending to LOGICS.
// ─────────────────────────────────────────────────────────────────────────
import { rsiSeries, atrSeries, sma } from './lib.mjs'

// Realistic gate. NOTE: directional daily-swing setups historically hit ~55–70%
// (measured first-target hit rate), NOT 75%+. We ship strategies above this bar
// and label every signal with its TRUE backtested accuracy — no inflated numbers.
export const MIN_ACCURACY = 60      // only ship strategies that backtest >= this
export const MIN_TRADES = 80        // ...with at least this many historical trades (pooled)
const FWD = 15                      // bars allowed to reach target before stop

const ema = (a, len) => { const k = 2 / (len + 1); const o = [a[0]]; for (let i = 1; i < a.length; i++) o.push(a[i] * k + o[i - 1] * (1 - k)); return o }
const hh = (arr, len, i) => { let m = -Infinity; for (let j = Math.max(0, i - len + 1); j <= i; j++) m = Math.max(m, arr[j]); return m }
const ll = (arr, len, i) => { let m = Infinity; for (let j = Math.max(0, i - len + 1); j <= i; j++) m = Math.min(m, arr[j]); return m }

// Precompute indicator arrays once per stock (shared by all logics + backtest).
export function prep(d) {
  const { o, h, l, c, v } = d
  const rsi = rsiSeries(c), atr = atrSeries(h, l, c)
  const e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200)
  const ef = ema(c, 12), es = ema(c, 26)
  const macd = ef.map((f, i) => f - es[i]); const sig = ema(macd, 9)
  const bbw = c.map((_, i) => { if (i < 19) return null; const w = c.slice(i - 19, i + 1); const m = w.reduce((a, b) => a + b, 0) / 20; const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20); return m ? 4 * sd / m : null })
  const vsma = sma(v, 20)
  return { o, h, l, c, v, rsi, atr, e20, e50, e200, macd, sig, bbw, vsma, hh, ll }
}

export const LOGICS = [
  { id: 'squeeze_break', name: 'Squeeze Breakout', desc: 'BB-width coiled, then breaks 20-day high', signal: (H, i) => {
    if (i < 41) return false
    const win = H.bbw.slice(i - 40, i).filter(x => x != null); if (!win.length) return false
    const mn = Math.min(...win), mx = Math.max(...win); const pct = mx > mn ? (H.bbw[i - 1] - mn) / (mx - mn) : 1
    return pct < 0.25 && H.c[i] > H.hh(H.h, 20, i - 1) && H.c[i] > H.o[i]
  } },
  { id: 'ma20_pullback', name: 'MA20 Pullback', desc: 'Uptrend pullback to rising 20 EMA, bullish close', signal: (H, i) => {
    if (i < 51) return false
    return H.e20[i] > H.e50[i] && H.e20[i] > H.e20[i - 3] && H.l[i - 1] <= H.e20[i - 1] * 1.01 && H.c[i] > H.c[i - 1] && H.c[i] > H.e20[i]
  } },
  { id: 'golden_trend', name: 'Golden-Trend Entry', desc: '50>200 EMA, price>20 EMA, RSI building', signal: (H, i) => {
    if (i < 201) return false
    return H.e50[i] > H.e200[i] && H.c[i] > H.e20[i] && H.rsi[i] >= 45 && H.rsi[i] <= 62 && H.rsi[i] > H.rsi[i - 2]
  } },
  { id: 'rsi60_cross', name: 'RSI-60 Cross', desc: 'RSI crosses up through 60 (momentum), not overbought', signal: (H, i) => {
    if (i < 16) return false
    return H.rsi[i - 1] < 60 && H.rsi[i] >= 60 && H.rsi[i] < 75 && H.c[i] > H.e50[i]
  } },
  { id: 'donchian_break', name: 'Donchian-20 Breakout', desc: 'Close above prior 20-bar high (Turtle)', signal: (H, i) => {
    if (i < 21) return false
    return H.c[i] > H.hh(H.h, 20, i - 1) && H.c[i] > H.e50[i]
  } },
  { id: 'macd_cross', name: 'MACD Bull Cross', desc: 'MACD crosses above signal, price above 50 EMA', signal: (H, i) => {
    if (i < 35) return false
    return H.macd[i - 1] <= H.sig[i - 1] && H.macd[i] > H.sig[i] && H.c[i] > H.e50[i]
  } },
  { id: 'inside_break', name: 'Inside-Bar Breakout', desc: 'Inside bar then close breaks its high', signal: (H, i) => {
    if (i < 3) return false
    const inside = H.h[i - 1] <= H.h[i - 2] && H.l[i - 1] >= H.l[i - 2]
    return inside && H.c[i] > H.h[i - 1] && H.c[i] > H.e50[i]
  } },
  { id: 'nr7_break', name: 'NR7 Breakout', desc: 'Narrowest range of 7 then breakout', signal: (H, i) => {
    if (i < 9) return false
    const r = k => H.h[k] - H.l[k]; let nr = true
    for (let k = i - 7; k < i - 1; k++) if (r(i - 1) > r(k)) nr = false
    return nr && H.c[i] > H.h[i - 1] && H.c[i] > H.o[i]
  } },
  { id: 'high52_break', name: '52-Week High Break', desc: 'Close above prior 250-bar high', signal: (H, i) => {
    if (i < 60) return false
    const look = Math.min(250, i)
    return H.c[i] > H.hh(H.h, look, i - 1) && H.c[i] > H.o[i]
  } },
  { id: 'gap_go', name: 'Gap-Up & Go', desc: 'Opens >1.2% above prior close and holds green', signal: (H, i) => {
    if (i < 51) return false
    return H.o[i] > H.c[i - 1] * 1.012 && H.c[i] > H.o[i] && H.e20[i] > H.e50[i]
  } },
  { id: 'ema_stack', name: 'EMA Stack Momentum', desc: 'Price>20>50>200 EMA all rising', signal: (H, i) => {
    if (i < 201) return false
    return H.c[i] > H.e20[i] && H.e20[i] > H.e50[i] && H.e50[i] > H.e200[i] && H.e20[i] > H.e20[i - 3] && H.c[i] > H.c[i - 1]
  } },

  // ── Confluence combos (selective → higher accuracy) ──
  { id: 'combo_trend_pullback', name: 'Trend Pullback (confluence)', desc: 'Strong uptrend + pullback to 20 EMA + RSI turning up', signal: (H, i) => {
    if (i < 201) return false
    return H.e20[i] > H.e50[i] && H.e50[i] > H.e200[i] && H.e50[i] > H.e50[i - 5] &&
      H.l[i - 1] <= H.e20[i - 1] * 1.015 && H.c[i] > H.c[i - 1] && H.c[i] > H.o[i] &&
      H.rsi[i] > 45 && H.rsi[i] < 65 && H.rsi[i] > H.rsi[i - 1]
  } },
  { id: 'combo_breakout_momo', name: 'Breakout + Momentum (confluence)', desc: '20-day breakout + strong RSI + uptrend', signal: (H, i) => {
    if (i < 51) return false
    return H.c[i] > H.hh(H.h, 20, i - 1) && H.c[i] > H.o[i] && H.e20[i] > H.e50[i] &&
      H.e50[i] > H.e50[i - 5] && H.rsi[i] > 55 && H.rsi[i] < 72
  } },
  { id: 'combo_squeeze_trend', name: 'Squeeze + Trend (confluence)', desc: 'Coiled volatility inside an uptrend breaking 10-day high', signal: (H, i) => {
    if (i < 201) return false
    const win = H.bbw.slice(i - 40, i).filter(x => x != null); if (!win.length) return false
    const mn = Math.min(...win), mx = Math.max(...win); const pct = mx > mn ? (H.bbw[i - 1] - mn) / (mx - mn) : 1
    return pct < 0.3 && H.e20[i] > H.e50[i] && H.e50[i] > H.e200[i] && H.c[i] > H.hh(H.h, 10, i - 1) && H.c[i] > H.o[i]
  } },
  { id: 'combo_strong', name: 'Full Confluence', desc: 'EMA stack + MACD>signal + RSI 50-65 + near 20-day high', signal: (H, i) => {
    if (i < 201) return false
    const nearHigh = (H.hh(H.h, 20, i - 1) - H.c[i]) / H.c[i] < 0.02
    return H.c[i] > H.e20[i] && H.e20[i] > H.e50[i] && H.e50[i] > H.e200[i] &&
      H.macd[i] > H.sig[i] && H.rsi[i] >= 50 && H.rsi[i] <= 66 && nearHigh && H.c[i] > H.o[i]
  } },
  { id: 'combo_pocket_pivot', name: 'Pocket Pivot (confluence)', desc: 'Up-volume surge off rising 50 EMA in uptrend', signal: (H, i) => {
    if (i < 51) return false
    let maxDn = 0; for (let k = i - 10; k < i; k++) if (k > 0 && H.c[k] < H.c[k - 1]) maxDn = Math.max(maxDn, H.v[k])
    return H.e20[i] > H.e50[i] && H.e50[i] > H.e50[i - 5] && H.c[i] > H.e50[i] && H.l[i] <= H.e50[i] * 1.04 &&
      H.v[i] > maxDn && H.c[i] > H.o[i] && H.rsi[i] > 50
  } },
]

// Backtest one logic → trades / wins. "win" = reached the first target (tMult×ATR)
// before the stop (sMult×ATR) within `fwd` bars — a measured first-target hit rate.
export function backtestLogic(H, logic, { tMult = 1, sMult = 1.5, fwd = FWD } = {}) {
  const { c, h, l, atr } = H; let trades = 0, wins = 0
  for (let i = 30; i < c.length - 1; i++) {
    if (!logic.signal(H, i)) continue
    const a = atr[i] || c[i] * 0.02
    const entry = c[i], sl = entry - sMult * a, t1 = entry + tMult * a
    let res = null
    for (let k = i + 1; k <= Math.min(c.length - 1, i + fwd); k++) { if (l[k] <= sl) { res = false; break } if (h[k] >= t1) { res = true; break } }
    if (res !== null) { trades++; if (res) wins++ }
  }
  return { trades, wins }
}

// Run all logics on one stock → per-logic {trades, wins, today:bool}.
export function runEngine(d) {
  const H = prep(d)
  const i = H.c.length - 1
  const out = {}
  for (const L of LOGICS) {
    const bt = backtestLogic(H, L)
    out[L.id] = { trades: bt.trades, wins: bt.wins, today: !!L.signal(H, i) }
  }
  return out
}
