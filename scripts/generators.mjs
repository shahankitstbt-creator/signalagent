// ─────────────────────────────────────────────────────────────────────────
// SIGNAL GENERATORS — each is a labelled "column" on the board. A stock-based
// generator inspects (analysis + OHLCV + fundamentals) and emits a full signal
// card (LTP, entry, SL, targets+dates, reason, backtested accuracy, social text).
// Astro generators emit market-level timing cards (honest, traditional framing).
// ADD A GENERATOR: append to GEN_META + write its gen() — board updates itself.
// ─────────────────────────────────────────────────────────────────────────
const round = (x, d = 2) => x == null ? null : +(+x).toFixed(d)
const ema = (a, len) => { const k = 2 / (len + 1); const o = [a[0]]; for (let i = 1; i < a.length; i++) o.push(a[i] * k + o[i - 1] * (1 - k)); return o }

export const GEN_META = [
  { id: 'vol_accum', label: 'Volume + Accumulation', color: '#00C853', desc: 'Coiling with rising up-volume in an uptrend (swing upside)' },
  { id: 'vp_fib', label: 'Volume Profile + Fib', color: '#FFB300', desc: 'Price at a high-volume node (POC) coinciding with a Fib level' },
  { id: 'money_flow', label: 'Money Flow', color: '#00E5FF', desc: 'MFI & OBV rising with price — money flowing in' },
  { id: 'multibagger', label: 'Multibagger Quality', color: '#AA00FF', desc: 'Ownership strong: promoter/FII/DII up, low pledge, uptrend' },
  { id: 'harmonic', label: 'Harmonic Patterns', color: '#FF6D00', desc: 'Bullish harmonic / ABC retrace completing' },
  { id: 'vedic_astro', label: 'Vedic Astro · Nifty & Gold', color: '#B388FF', desc: 'VedicAstro · Vyapar Ratna · Planet Positions · Combinations · KP — real positions, traditional reading (no edge claim)' },
  { id: 'astro_timing', label: 'Hora & Rahu-Kaal Timing', color: '#E040FB', desc: 'Intraday timing windows for Nifty & Gold (tradition)' },
  { id: 'option_buildup', label: 'Option Chain Build-Up', color: '#FF1744', desc: 'Live NIFTY option OI via Angel One — PCR, support/resistance' },
]

// ── helpers on the OHLCV {o,h,l,c,v} shape ──
function mfi(d, len = 14) {
  const { h, l, c, v } = d, tp = c.map((_, i) => (h[i] + l[i] + c[i]) / 3)
  const out = new Array(c.length).fill(null)
  for (let i = len; i < c.length; i++) { let pos = 0, neg = 0; for (let k = i - len + 1; k <= i; k++) { const mf = tp[k] * v[k]; if (tp[k] > tp[k - 1]) pos += mf; else if (tp[k] < tp[k - 1]) neg += mf } out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg) }
  return out
}
function obv(d) { const { c, v } = d; let o = 0; const out = [0]; for (let i = 1; i < c.length; i++) { o += c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0; out.push(o) } return out }
function volProfile(d, bins = 50) {
  const { h, l, v } = d; const hi = Math.max(...h), lo = Math.min(...l), bs = (hi - lo) / bins || 1
  const acc = new Array(bins).fill(0)
  for (let i = 0; i < h.length; i++) { const a = Math.max(0, Math.floor((l[i] - lo) / bs)), b = Math.min(bins - 1, Math.ceil((h[i] - lo) / bs)); const per = v[i] / ((b - a) || 1); for (let k = a; k <= b; k++) acc[k] += per }
  const poc = acc.indexOf(Math.max(...acc))
  return { poc: lo + (poc + 0.5) * bs, lo, hi }
}

// build a signal card with targets+dates + social caption
function mk(gen, st, a, reason, accuracy, addDays) {
  const pct = x => round(((x - a.entry) / a.entry) * 100, 1)
  const targets = [
    { price: a.targets[0], pct: pct(a.targets[0]), by: addDays(a.bt.avgDaysT1) },
    { price: a.targets[1], pct: pct(a.targets[1]), by: addDays(a.bt.avgDaysT2) },
    { price: a.targets[2], pct: pct(a.targets[2]), by: addDays(a.bt.avgDaysT3) },
  ]
  // Headline confidence is CAPPED at 95 so no card ever reads as a guarantee.
  // The true measured backtest hit-rate is preserved separately in `accuracy`.
  const conf = Math.min(95, Math.round(accuracy != null ? accuracy : a.moveScore))
  const n = a.bt.trades
  const accLine = accuracy != null
    ? `Backtested first-target hit ~${accuracy}% over ${n} past setups (measured, not a promise — small samples are noisy).`
    : `Setup score ${a.moveScore}/100 (too little history to backtest).`
  const social = `${st.symbol} — ${gen.label} setup 📈\n${reason}\nLTP ₹${a.price} · Entry ₹${a.entry} · SL ₹${a.sl} (${pct(a.sl)}%)\nT1 ₹${a.targets[0]} (+${targets[0].pct}%) by ${targets[0].by}\nT2 ₹${a.targets[1]} (+${targets[1].pct}%) · T3 ₹${a.targets[2]} (+${targets[2].pct}%)\n${accLine}\n📌 Educational only, not advice. Not SEBI-registered. #${st.symbol} #swingtrading #nifty`
  return {
    generator: gen.id, symbol: st.symbol, name: st.name, sector: st.sector, indices: st.indices,
    label: gen.label, reason, direction: 'LONG',
    ltp: a.price, entry: a.entry, sl: a.sl, slPct: pct(a.sl), targets,
    rr: a.rr, rsi: a.rsi, confidence: conf, accuracy, backtestTrades: n, social,
  }
}

// ── stock-based generators. ctx = { st, d, a, f, addDays } ──
const STOCK_GENS = {
  vol_accum: ({ st, a, addDays }) => (a.squeeze || a.volBuildup) && a.higherLows && a.emaStack
    ? mk(GEN_META[0], st, a, `${a.setupType}: ${a.precursors.slice(0, 3).join('; ')}`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays) : null,
  vp_fib: ({ st, d, a, addDays }) => {
    const vp = volProfile(d); const swingLo = Math.min(...d.l.slice(-40)), swingHi = Math.max(...d.h.slice(-40))
    const fibs = [0.382, 0.5, 0.618, 0.786].map(f => swingHi - (swingHi - swingLo) * f)
    const nearPOC = Math.abs(a.price - vp.poc) / a.price < 0.012
    const nearFib = fibs.some(fp => Math.abs(a.price - fp) / a.price < 0.012)
    return nearPOC && nearFib && a.emaStack
      ? mk(GEN_META[1], st, a, `At POC ₹${round(vp.poc)} + Fib confluence — institutional magnet zone`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays) : null
  },
  money_flow: ({ st, d, a, addDays }) => {
    const m = mfi(d), ob = obv(d), i = d.c.length - 1
    const mfiRising = m[i] != null && m[i] > 50 && m[i] < 80 && m[i] > (m[i - 3] ?? 0)
    const obvRising = ob[i] > ob[i - 5]
    return mfiRising && obvRising && a.emaStack && a.price > a.entry * 0.999
      ? mk(GEN_META[2], st, a, `MFI ${round(m[i], 0)} rising + OBV up — money flowing in`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays) : null
  },
  harmonic: ({ st, a, addDays }) => a.harmonic?.bullish
    ? mk(GEN_META[4], st, a, `Bullish ${a.harmonic.pattern} — reversal/continuation zone`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays) : null,
  multibagger: ({ st, a, f, addDays }) => {
    if (!f) return null
    const ok = x => x === 'up' || x === 'stable'
    const q = ok(f.promoter.status) && (ok(f.fii.status) || ok(f.dii.status)) && f.pledge?.low
    return q && a.emaStack
      ? mk(GEN_META[3], st, a, `Quality: Promoter ${f.promoter.status}, FII ${f.fii.status}, DII ${f.dii.status}, Pledge ${f.pledge?.pct ?? 0}%`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays) : null
  },
}

// run the price-only generators (no fundamentals) for one stock
export function runPriceGenerators(st, d, a, addDays) {
  const out = []
  for (const id of ['vol_accum', 'vp_fib', 'money_flow', 'harmonic']) { try { const s = STOCK_GENS[id]({ st, d, a, addDays }); if (s) out.push(s) } catch { } }
  return out
}
export function runMultibagger(st, a, f, addDays) { try { return STOCK_GENS.multibagger({ st, a, f, addDays }) } catch { return null } }

// ── astro cards come from the real Vedic ephemeris engine (5 methods × Nifty/Gold)
//    plus Hora/Rahu-Kaal timing. All honestly framed: real positions, tradition reading.
export { vedicMarketSignals, horaSignals } from './astroEngine.mjs'
