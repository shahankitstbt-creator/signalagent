// ─────────────────────────────────────────────────────────────────────────
// SIGNAL GENERATORS — each is a labelled "column" on the board. A stock-based
// generator inspects (analysis + OHLCV + fundamentals) and emits a full signal
// card (LTP, entry, SL, targets+dates, reason, backtested accuracy, social text).
// Astro generators emit market-level timing cards (honest, traditional framing).
// ADD A GENERATOR: append to GEN_META + write its gen() — board updates itself.
// ─────────────────────────────────────────────────────────────────────────
import { detectPatterns } from './patterns.mjs'
const round = (x, d = 2) => x == null ? null : +(+x).toFixed(d)
const ema = (a, len) => { const k = 2 / (len + 1); const o = [a[0]]; for (let i = 1; i < a.length; i++) o.push(a[i] * k + o[i - 1] * (1 - k)); return o }

export const GEN_META = [
  { id: 'confluence', label: '⭐ Top Confluence Picks', color: '#2962FF', desc: 'Highest-conviction: 2+ generators agree + Vedic bias aligned — each with a position-sized trade plan' },
  { id: 'fno', label: '📊 Futures & Options', color: '#7C3AED', desc: 'F&O-eligible stocks, indices & commodities — direction + lot size + a concrete options play (reuses all signal logic)' },
  { id: 'momentum', label: '🚀 Momentum & Early Movers', color: '#F59E0B', desc: 'Wide net across the FULL NSE universe — stocks surging on volume NOW or poised to break out. Catches moves early (a day before / during live market); higher-risk & less filtered than the confluence picks' },
  { id: 'vol_accum', label: 'Volume + Accumulation', color: '#0E9F6E', desc: 'Coiling with rising up-volume in an uptrend (swing upside)' },
  { id: 'vp_fib', label: 'Volume Profile + Fib', color: '#D97706', desc: 'Price at a high-volume node (POC) coinciding with a Fib level' },
  { id: 'money_flow', label: 'Money Flow', color: '#0E7FA3', desc: 'MFI & OBV rising with price — money flowing in' },
  { id: 'multibagger', label: 'Multibagger Quality', color: '#7C3AED', desc: 'Ownership strong: promoter/FII/DII up, low pledge, uptrend' },
  { id: 'harmonic', label: 'Harmonic & Chart Patterns', color: '#EA580C', desc: 'Bullish harmonic / chart-pattern breakout completing' },
  { id: 'vedic_astro', label: 'Vedic Astro · Nifty & Gold', color: '#9333EA', desc: 'VedicAstro · Vyapar Ratna · Planet Positions · Combinations · KP — real positions, traditional reading (no edge claim)' },
  { id: 'astro_timing', label: 'Hora & Rahu-Kaal Timing', color: '#DB2777', desc: 'Intraday timing windows for Nifty & Gold (tradition)' },
  { id: 'option_buildup', label: 'Option Chain Build-Up', color: '#DC2626', desc: 'Live NIFTY/BANKNIFTY option OI via Angel One — PCR, support/resistance' },
]
// id → meta lookup (robust against reordering — never index GEN_META by position)
const M = Object.fromEntries(GEN_META.map(g => [g.id, g]))

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
  // ETA days = ATR-velocity estimate blended with measured backtest avg (sharper dates)
  const eta = a.etaDays || [a.bt.avgDaysT1, a.bt.avgDaysT2, a.bt.avgDaysT3]
  const targets = [
    { price: a.targets[0], pct: pct(a.targets[0]), by: addDays(eta[0]), days: eta[0] },
    { price: a.targets[1], pct: pct(a.targets[1]), by: addDays(eta[1]), days: eta[1] },
    { price: a.targets[2], pct: pct(a.targets[2]), by: addDays(eta[2]), days: eta[2] },
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
    rr: a.rr, rsi: a.rsi, confidence: conf, accuracy, backtestTrades: n,
    delivery: st._deliv ? st._deliv.pct : null,
    changePct: a.changePct, setupType: a.setupType, // for pre-move filtering (alert BEFORE the move)
    footprint: a._footprint || null,                // smart-money accumulation footprint (pre-move)
    rs: a._rs || null,                              // relative strength vs NIFTY
    social,
  }
}

// ── stock-based generators. ctx = { st, d, a, f, addDays } ──
const STOCK_GENS = {
  // Volume + Accumulation: real big-money footprint (RVOL, up/down vol, dry-up, stealth)
  // + NSE delivery % (truest "strong hands" confirmation when available)
  vol_accum: ({ st, a, addDays }) => {
    const V = a.vol || {}
    const dlv = st._deliv
    const strongDeliv = dlv && dlv.pct >= 60
    const strong = (V.volScore >= 40) || V.stealthAccum || (V.accRatio >= 1.3 && (V.vol1GtVol5 || V.dryUp)) || (strongDeliv && V.vol5GtAvg)
    if (!(strong && a.emaStack && a.higherLows)) return null
    let sig = V.signals.slice(0, 3)
    if (dlv) sig = [`Delivery ${dlv.pct}% (${dlv.pct >= 65 ? 'strong hands' : dlv.pct >= 45 ? 'mixed' : 'mostly intraday'})`, ...sig].slice(0, 3)
    return mk(M.vol_accum, st, a, `Accumulation (vol ${V.volScore}/100): ${sig.join('; ')}`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays)
  },
  vp_fib: ({ st, d, a, addDays }) => {
    const vp = volProfile(d); const swingLo = Math.min(...d.l.slice(-40)), swingHi = Math.max(...d.h.slice(-40))
    const fibs = [0.382, 0.5, 0.618, 0.786].map(f => swingHi - (swingHi - swingLo) * f)
    const nearPOC = Math.abs(a.price - vp.poc) / a.price < 0.012
    const nearFib = fibs.some(fp => Math.abs(a.price - fp) / a.price < 0.012)
    return nearPOC && nearFib && a.emaStack
      ? mk(M.vp_fib, st, a, `At POC ₹${round(vp.poc)} + Fib confluence — institutional magnet zone`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays) : null
  },
  money_flow: ({ st, d, a, addDays }) => {
    const m = mfi(d), ob = obv(d), i = d.c.length - 1
    const mfiRising = m[i] != null && m[i] > 50 && m[i] < 80 && m[i] > (m[i - 3] ?? 0)
    const obvRising = ob[i] > ob[i - 5]
    return mfiRising && obvRising && a.emaStack && a.price > a.entry * 0.999
      ? mk(M.money_flow, st, a, `MFI ${round(m[i], 0)} rising + OBV up — money flowing in`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays) : null
  },
  harmonic: ({ st, d, a, addDays }) => {
    const pat = (() => { try { return detectPatterns(d) } catch { return null } })()
    if ((a.harmonic?.bullish || pat) && a.bullish && a.emaStack) {
      const name = a.harmonic?.bullish ? a.harmonic.pattern : pat.pattern
      const extra = pat && a.harmonic?.bullish && pat.pattern !== a.harmonic.pattern ? ` + ${pat.pattern}` : ''
      return mk(M.harmonic, st, a, `Bullish ${name}${extra} — pattern breakout/continuation zone`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays)
    }
    return null
  },
  multibagger: ({ st, a, f, addDays }) => {
    if (!f) return null
    const ok = x => x === 'up' || x === 'stable'
    const q = ok(f.promoter.status) && (ok(f.fii.status) || ok(f.dii.status)) && f.pledge?.low
    return q && a.emaStack
      ? mk(M.multibagger, st, a, `Quality: Promoter ${f.promoter.status}, FII ${f.fii.status}, DII ${f.dii.status}, Pledge ${f.pledge?.pct ?? 0}%`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays) : null
  },
  // Momentum & Early Movers — WIDE net across the full universe. Catches (a) stocks moving
  // NOW on volume (intraday/day-of), and (b) stocks poised to break out (a day before).
  // Lower bar than the other gens by design — labelled higher-risk. Ranked by fresh momentum.
  momentum: ({ st, a, addDays }) => {
    const V = a.vol || {}
    const rvol = V.rvol ?? 1
    const chg = a.changePct ?? 0
    const fp = a._footprint
    const movingNow = chg >= 3 && rvol >= 1.5 && a.bullish
    const bigMove = chg >= 5 && rvol >= 1.8
    const preBreak = a.nearBreakout && rvol >= 1.3 && (a.emaStack || a.higherLows)
    const squeezeFire = a.squeeze && chg >= 1.5 && rvol >= 1.3
    const volSurge = V.vol1GtVol5 && chg >= 2 && a.bullish
    const footprintPre = fp && fp.strong && a.bullish && chg < 3   // accumulation footprint, BEFORE it runs
    if (!(movingNow || bigMove || preBreak || squeezeFire || volSurge || footprintPre)) return null
    const tag = (bigMove || movingNow) ? `🚀 Moving now +${chg.toFixed(1)}% on ${rvol}× volume`
      : footprintPre ? `🕵️ Accumulation footprint — smart money in before the move: ${fp.flags[0]}`
        : preBreak ? `About to break the 20-day high on ${rvol}× volume`
          : squeezeFire ? `Squeeze firing — volatility expanding up (+${chg.toFixed(1)}%)`
            : `Volume surge ${rvol}× with price up +${chg.toFixed(1)}%`
    const card = mk(M.momentum, st, a, tag, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays)
    // rank freshest, strongest momentum first (change% + relative volume + pre-move score + footprint)
    card._momScore = Math.round(chg * 3 + rvol * 6 + a.moveScore * 0.3 + (fp?.score || 0) * 0.4)
    card.movingNow = movingNow || bigMove
    return card
  },
}

// run the price-only generators (no fundamentals) for one stock
export function runPriceGenerators(st, d, a, addDays) {
  const out = []
  for (const id of ['vol_accum', 'vp_fib', 'money_flow', 'harmonic', 'momentum']) { try { const s = STOCK_GENS[id]({ st, d, a, addDays }); if (s) out.push(s) } catch { } }
  return out
}
export function runMultibagger(st, a, f, addDays) { try { return STOCK_GENS.multibagger({ st, a, f, addDays }) } catch { return null } }

// ── astro cards come from the real Vedic ephemeris engine (5 methods × Nifty/Gold)
//    plus Hora/Rahu-Kaal timing. All honestly framed: real positions, tradition reading.
export { vedicMarketSignals, horaSignals, panchangSummary, assetBiasSignals, dailyBias } from './astroEngine.mjs'
