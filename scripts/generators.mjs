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

// NOTE: tab order follows this array. astro_timing (Hora) is folded into the Vedic tab in the UI
// (not its own tab). Money Flow → US Stocks → US Indices are kept last, in that order.
export const GEN_META = [
  { id: 'confluence', label: '⭐ Top Confluence Picks', color: '#2962FF', desc: 'Highest-conviction: 2+ generators agree + Vedic bias aligned — each with a position-sized trade plan' },
  { id: 'movers', label: '🎯 1-Month Movers (10–20%)', color: '#00C853', desc: 'Curated across the momentum/accumulation/confluence desks: LIQUID, high-conviction LONGs whose targets sit ~10–20% above entry with a ~1-month horizon — the setups positioned for a big swing. Ranked by conviction. Educational discovery, NOT a guarantee — each has entry / SL / targets so you manage the risk.' },
  { id: 'option_buildup', label: '🎯 Smart-Money Desk', color: '#DC2626', desc: 'NIFTY · BankNifty · Gold · top F&O stocks — multi-timeframe (15m→1D) confluence of Volume Profile + Fib + VWAP + price action + live option OI positioning + far-expiry accumulation, with entry / SL / targets / dates per timeframe' },
  { id: 'fno', label: '📊 Futures & Options', color: '#7C3AED', desc: 'F&O-eligible stocks, indices & commodities — direction + lot size + a concrete options play (reuses all signal logic)' },
  { id: 'momentum', label: '🚀 Momentum & Early Movers', color: '#F59E0B', desc: 'Wide net across the FULL NSE universe — stocks surging on volume NOW or poised to break out. Catches moves early (a day before / during live market); higher-risk & less filtered than the confluence picks' },
  { id: 'reversal', label: '🔄 Reversal / Mean-Reversion', color: '#DB2777', desc: 'The OPPOSITE of momentum — fade extremes after the SL-hunt. LONG oversold bottoms (sell-side liquidity swept + hammer) and SHORT overbought tops (buy-side swept + shooting star). Two-sided; shorts book as PE options.' },
  { id: 'short_sell', label: '📉 Short / Sell', color: '#F23645', desc: 'The SELL side — identify DISTRIBUTION, tops, bull-traps & profit-booking BEFORE the drop. Three setups: breakdown below 20-day support (distribution), overbought rejection at the highs (profit-booking/reversal), and a failed breakout (bull trap). SHORT with stop ABOVE structure, targets below; F&O-eligible names trade as PE / short futures. Liquid names only.' },
  { id: 'vp_fib', label: '📐 VP + Fib + VWAP', color: '#D97706', desc: 'The confluence combo — Volume Profile POC + a key Fibonacci level + VWAP fair-value stacked in one zone = institutional magnet for a fast, high-odds reaction (triple stack = strongest)' },
  { id: 'vol_accum', label: 'Volume + Accumulation', color: '#0E9F6E', desc: 'Coiling with rising up-volume in an uptrend (swing upside)' },
  { id: 'multibagger', label: 'Multibagger Quality', color: '#7C3AED', desc: 'Ownership strong: promoter/FII/DII up, low pledge, uptrend' },
  { id: 'harmonic', label: 'Harmonic & Chart Patterns', color: '#EA580C', desc: 'Bullish harmonic / chart-pattern breakout completing' },
  { id: 'pnf', label: '📊 Point & Figure', color: '#00E5FF', desc: 'Point & Figure DOUBLE-TOP BREAKOUT confirmed by the EMA trend cloud — noise-filtered (box + 3-box reversal), trend-aligned entries only. Explore any asset/timeframe on the standalone P&F chart (/pnf.html).' },
  { id: 'vedic_astro', label: 'Vedic Astro · Nifty & Gold', color: '#9333EA', desc: 'VedicAstro · Vyapar Ratna · Planet Positions · Combinations · KP + Hora/Rahu-Kaal timing — real positions, traditional reading (no edge claim)' },
  { id: 'astro_timing', label: 'Hora & Rahu-Kaal Timing', color: '#DB2777', desc: 'Intraday timing windows for Nifty & Gold (tradition)' },
  { id: 'money_flow', label: 'Money Flow', color: '#0E7FA3', desc: 'MFI & OBV rising with price — money flowing in' },
  { id: 'us_stocks', label: '🇺🇸 US Stocks', color: '#1D4ED8', desc: 'US-listed common stocks (entire NYSE/Nasdaq/AMEX market) — the same pre-move engine (volume accumulation, breakout, momentum) with entry / SL / targets in $' },
  { id: 'us_index', label: '🇺🇸 US Indices', color: '#0EA5E9', desc: 'S&P 500 · Nasdaq 100 · Dow — multi-timeframe (15m→1D) directional confluence (Volume Profile + Fib + VWAP + price action) with entry / SL / targets per timeframe' },
  { id: 'gex', label: '🧲 Gamma / Dealer Map', color: '#7C3AED', desc: 'NIFTY & BankNifty gamma-exposure (SpotGamma-style): regime (NEG/POS gamma), gamma flip, call/put walls, locked range and per-strike dealer strength — the levels price is drawn to or accelerates through. Also drawn on the chart.' },
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
// rolling VWAP (typical-price × volume, cumulative over the last `len` bars) + σ bands.
// On intraday bars this approximates session VWAP; on daily it's an anchored fair-value line.
function vwapBands(d, len = 40) {
  const { h, l, c, v } = d, n = c.length
  let pv = 0, vv = 0; const tps = []
  for (let i = Math.max(0, n - len); i < n; i++) { const tp = (h[i] + l[i] + c[i]) / 3; pv += tp * v[i]; vv += v[i]; tps.push({ tp, v: v[i] }) }
  const vw = vv ? pv / vv : c[n - 1]
  const varr = tps.reduce((a, x) => a + x.v * (x.tp - vw) ** 2, 0) / (vv || 1)
  const sd = Math.sqrt(varr)
  return { vwap: vw, upper: vw + sd, lower: vw - sd, sd }
}
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

// Point & Figure: build X/O columns (box + 3-box reversal) and detect a DOUBLE-TOP BREAKOUT — the
// current up-column (X) prints a higher top than the previous X-column. Noise/time are filtered out,
// so only genuine multi-box demand counts. Returns { buy, box, cols }.
function pnfBreakout(d, rev = 3) {
  const N = d.h.length; if (N < 20) return { buy: false }
  const price = d.c[N - 1]
  const look = Math.min(N, 150)
  const rngs = []; for (let i = N - look; i < N; i++) rngs.push(d.h[i] - d.l[i])
  rngs.sort((x, y) => x - y); const med = rngs[Math.floor(rngs.length / 2)] || price * 0.01
  let box = Math.max(price * 1e-3, +(med).toPrecision(2)); if (!(box > 0)) return { buy: false }
  const fl = p => Math.floor(p / box) * box
  const build = () => {
    let cols = [], dir = null
    for (let i = N - look; i < N; i++) {
      const h = d.h[i], l = d.l[i]; if (h == null || l == null) continue
      if (dir === null) { dir = 'X'; cols.push({ dir, top: fl(h), bottom: fl(l) }); continue }
      const c = cols[cols.length - 1]
      if (dir === 'X') { const nt = fl(h); if (nt > c.top) c.top = nt; else if (fl(l) <= c.top - rev * box) { dir = 'O'; cols.push({ dir, top: c.top - box, bottom: fl(l) }) } }
      else { const nb = fl(l); if (nb < c.bottom) c.bottom = nb; else if (fl(h) >= c.bottom + rev * box) { dir = 'X'; cols.push({ dir, top: fl(h), bottom: c.bottom + box }) } }
    }
    return cols
  }
  let cols = build(), g = 0
  while (cols.length > 46 && g++ < 8) { box *= 1.5; cols = build() }
  const last = cols[cols.length - 1]; let prevX = null
  for (let i = cols.length - 2; i >= 0; i--) if (cols[i].dir === 'X') { prevX = cols[i]; break }
  const buy = !!(last && last.dir === 'X' && prevX && last.top > prevX.top)
  return { buy, box, cols, colTop: last?.top, prevTop: prevX?.top }
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
  // Volume Profile + Fibonacci + VWAP — the confluence combo. When the POC (highest-volume
  // price), a key Fib level, and VWAP fair-value all stack within a tight band, it's an
  // institutional magnet: price reacts sharply → high-odds, quick trade. Triple = strongest.
  vp_fib: ({ st, d, a, addDays }) => {
    const vp = volProfile(d)
    const vb = vwapBands(d, 40)
    const swingLo = Math.min(...d.l.slice(-40)), swingHi = Math.max(...d.h.slice(-40))
    const fibLabels = [[0.382, '38.2%'], [0.5, '50%'], [0.618, '61.8%'], [0.786, '78.6%']]
    const fibs = fibLabels.map(([f, lbl]) => [swingHi - (swingHi - swingLo) * f, lbl])
    const near = (x, tol = 0.012) => Math.abs(a.price - x) / a.price < tol
    const nearPOC = near(vp.poc)
    const fibHit = fibs.find(([fp]) => near(fp))
    const nearVWAP = near(vb.vwap, 0.01) || (a.price >= vb.lower && a.price <= vb.vwap)  // at/reclaiming VWAP from below
    if (!(nearPOC && fibHit && a.bullish && (a.rr || 0) >= 2)) return null               // VP+Fib base + R:R ≥ 2 (loss-analysis fix: vp_fib won 56% but lost money on bad R:R — now reward must beat risk 2:1)
    const triple = nearVWAP
    const reason = triple
      ? `Triple confluence: POC ₹${round(vp.poc)} + ${fibHit[1]} Fib + VWAP ₹${round(vb.vwap)} stacked — institutional magnet, high-odds reaction`
      : `POC ₹${round(vp.poc)} + ${fibHit[1]} Fib confluence (VWAP ₹${round(vb.vwap)})`
    const card = mk(M.vp_fib, st, a, reason, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays)
    card.vwap = round(vb.vwap); card.poc = round(vp.poc); card.fib = fibHit[1]; card.triple = triple
    if (triple) card.confidence = Math.min(95, (card.confidence || 60) + 8)             // triple stack = stronger
    return card
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
  momentum: ({ st, d, a, addDays }) => {
    const V = a.vol || {}
    const rvol = V.rvol ?? 1
    const chg = a.changePct ?? 0
    const fp = a._footprint
    // EXHAUSTION GUARD (fix for buying blow-off tops): don't chase a bar that is EXTREMELY overbought AND
    // already rejecting (big upper wick) — that's the top, not a continuation. Same lesson as the Desk.
    const j = d.c.length - 1, o = d.o || d.c
    const rng = Math.max(d.h[j] - d.l[j], 1e-9)
    const upWick = (d.h[j] - Math.max(o[j], d.c[j])) / rng
    const blowOff = a.rsi != null && a.rsi >= 80 && upWick >= 0.45
    if (blowOff) return null
    const movingNow = chg >= 3 && rvol >= 1.5 && a.bullish
    const bigMove = chg >= 5 && rvol >= 1.8
    // CONFIRMED breakout (loss-analysis fix for the #1 loss = false breakouts): require the close to be
    // ABOVE the prior 20-day high with volume — NOT just "near" it. No entering the first poke.
    const i = d.c.length - 1, hi20 = i > 21 ? Math.max(...d.h.slice(i - 21, i)) : Infinity
    const confirmedBreak = d.c[i] > hi20 && rvol >= 1.4 && (a.emaStack || a.higherLows)
    const squeezeFire = a.squeeze && chg >= 1.5 && rvol >= 1.3
    const volSurge = V.vol1GtVol5 && chg >= 2 && a.bullish
    const footprintPre = fp && fp.strong && a.bullish && chg < 3   // accumulation footprint, BEFORE it runs
    if (!(movingNow || bigMove || confirmedBreak || squeezeFire || volSurge || footprintPre)) return null
    const tag = (bigMove || movingNow) ? `🚀 Moving now +${chg.toFixed(1)}% on ${rvol}× volume`
      : footprintPre ? `🕵️ Accumulation footprint — smart money in before the move: ${fp.flags[0]}`
        : confirmedBreak ? `Confirmed close above the 20-day high ₹${round(hi20)} on ${rvol}× volume`
          : squeezeFire ? `Squeeze firing — volatility expanding up (+${chg.toFixed(1)}%)`
            : `Volume surge ${rvol}× with price up +${chg.toFixed(1)}%`
    const card = mk(M.momentum, st, a, tag, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays)
    // rank freshest, strongest momentum first (change% + relative volume + pre-move score + footprint)
    card._momScore = Math.round(chg * 3 + rvol * 6 + a.moveScore * 0.3 + (fp?.score || 0) * 0.4)
    card.movingNow = movingNow || bigMove
    return card
  },
  // 📉 SHORT / SELL — spot DISTRIBUTION, tops, traps & profit-booking BEFORE the drop. Bearish only,
  // liquid names. SL ABOVE structure, targets BELOW. F&O-eligible names become PE / short-futures plays.
  short_sell: ({ st, d, a, addDays }) => {
    const c = d.c, h = d.h, l = d.l, v = d.v, i = c.length - 1
    if (i < 45) return null
    const price = c[i]
    let dv = 0; for (let k = i - 19; k <= i; k++) dv += (v[k] || 0) * (c[k] || 0); dv /= 20
    if (dv < 3e7 || price < 20) return null                                       // tradeable shorts only (liquid)
    const e20 = ema(c, 20), e50 = ema(c, 50)
    let atr = 0; for (let k = i - 13; k <= i; k++) atr += Math.max(h[k] - l[k], Math.abs(h[k] - c[k - 1]), Math.abs(l[k] - c[k - 1])); atr /= 14
    const rsi = a.rsi, bearCandle = c[i] < c[i - 1] && c[i] < (h[i] + l[i]) / 2
    const below = price < e20[i] && price < e50[i]
    const swingHi = Math.max(...h.slice(-20)), supp = Math.min(...l.slice(i - 20, i))
    const rvol = (a.vol && a.vol.rvol) || 1, upperWick = (h[i] - Math.max(c[i], c[i - 1])) / (atr || 1)
    const breakdown = below && price <= supp * 1.003 && rvol >= 1.2 && bearCandle                 // distribution
    const overbought = rsi != null && rsi >= 68 && bearCandle && h[i] >= swingHi * 0.985 && upperWick >= 0.5  // profit-booking
    const hi20prev = Math.max(...h.slice(i - 22, i - 2))
    const trap = h.slice(-3).some(x => x > hi20prev) && c[i] < hi20prev && bearCandle             // bull trap
    const setup = breakdown ? 'Distribution breakdown' : overbought ? 'Overbought reversal — profit-booking' : trap ? 'Bull trap — failed breakout' : null
    if (!setup) return null
    const entry = round(price), sl = round(Math.max(swingHi, price + 1.6 * atr)), risk = Math.max(sl - entry, atr)
    const tps = [entry - 1.5 * risk, entry - 2.5 * risk, entry - 4 * risk].map(x => round(Math.max(x, price * 0.55)))
    const dpt = Math.max(atr * 0.55, entry * 0.004); const eta = tps.map(t => Math.max(1, Math.round((entry - t) / dpt)))
    for (let k = 1; k < eta.length; k++) if (eta[k] <= eta[k - 1]) eta[k] = eta[k - 1] + 2
    const conf = Math.min(90, 58 + (breakdown ? 8 : 0) + (rvol >= 1.6 ? 8 : rvol >= 1.3 ? 4 : 0) + (rsi >= 72 ? 6 : 0) + (below ? 4 : 0))
    const reason = breakdown ? `Distribution: closed below 20-day support ₹${round(supp)} on ${round(rvol, 1)}× volume, under 20 & 50 EMA — supply in control`
      : overbought ? `Profit-booking/reversal: RSI ${Math.round(rsi)} + rejection wick at the highs ₹${round(swingHi)} — buyers exhausted`
        : `Bull trap: poked above ₹${round(hi20prev)} then closed back below — trapped longs will sell`
    return {
      generator: 'short_sell', symbol: st.symbol, name: st.name, sector: st.sector, indices: st.indices,
      label: M.short_sell.label, direction: 'SHORT', dirTone: 'down', setupType: setup,
      ltp: entry, entry, sl, slPct: round(((sl - entry) / entry) * 100, 1),
      targets: tps.map((t, k) => ({ price: t, pct: round(((entry - t) / entry) * 100, 1), by: addDays(eta[k]), days: eta[k] })),
      rsi: round(rsi, 0), confidence: conf, grade: conf >= 78 ? 'A+' : conf >= 65 ? 'A' : 'B',
      rr: round((entry - tps[0]) / (sl - entry), 2), reason,
      optionPlay: `Buy PE (bearish) / short futures — ${setup}`, delivery: st._deliv ? st._deliv.pct : null,
      social: `📉 ${st.symbol} — SELL/SHORT (${setup})\n${reason}\nEntry ₹${entry} · SL ₹${sl} · T1 ₹${tps[0]}\n📌 Educational only, not advice. Not SEBI-registered.`,
    }
  },
  // Point & Figure double-top breakout, CONFIRMED by the EMA trend cloud (only with the trend).
  pnf: ({ st, d, a, addDays }) => {
    const pf = pnfBreakout(d)
    if (!(pf.buy && a.emaStack && a.bullish)) return null                 // breakout + trend up (never against the cloud)
    const card = mk(M.pnf, st, a, `P&F double-top breakout above ₹${round(pf.prevTop)} (box ₹${round(pf.box)}) with EMA cloud up — noise-filtered demand`, a.bt.trades >= 4 ? a.bt.hitRate : null, addDays)
    card.pnfBox = round(pf.box); card.pnfBreak = round(pf.prevTop)
    return card
  },
}

// run the price-only generators (no fundamentals) for one stock
export function runPriceGenerators(st, d, a, addDays) {
  const out = []
  for (const id of ['vol_accum', 'vp_fib', 'money_flow', 'harmonic', 'momentum', 'pnf', 'short_sell']) { try { const s = STOCK_GENS[id]({ st, d, a, addDays }); if (s) out.push(s) } catch { } }
  return out
}
export function runMultibagger(st, a, f, addDays) { try { return STOCK_GENS.multibagger({ st, a, f, addDays }) } catch { return null } }

// ── astro cards come from the real Vedic ephemeris engine (5 methods × Nifty/Gold)
//    plus Hora/Rahu-Kaal timing. All honestly framed: real positions, tradition reading.
export { vedicMarketSignals, horaSignals, panchangSummary, assetBiasSignals, dailyBias } from './astroEngine.mjs'
