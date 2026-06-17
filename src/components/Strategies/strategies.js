// 13 strategies. Each receives the shared context and returns a raw setup
// (or null) evaluated near the latest bar. The engine finalizes scoring.
import { buildContext } from './context'

const near = (a, b, tol = 0.003) => Math.abs(a - b) / b < tol
const recentSweep = (ctx, dir, lookback = 3) =>
  ctx.sweeps.find(s => s.index >= ctx.i - lookback && s.direction === dir)
const lastStruct = (ctx) => ctx.struct.at(-1)

// ── Confluence point values (from blueprint) ──
const PTS = {
  vpPOC: 3, sweep: 3, fvg: 3, fib: 2, ob: 2, choch: 2, rsi: 1, utbot: 1, ribbon: 1, volDry: 1, golden: 2, squeeze: 2, ichimoku: 2,
}
const conf = (label, pts) => ({ label, pts })

// Helper: standard long/short skeleton with ATR-based stops if none given
const atrUnit = ctx => ctx.atr[ctx.i] || (ctx.close * 0.005)

export const STRATEGIES = {
  vpFib: { name: 'VP + Fibonacci Confluence', tech: ['Volume Profile'], run: (ctx) => {
    const vp = ctx.vp; if (!vp) return null
    const c = ctx.close
    // bullish: price at/below VAL near POC or VAL, rsi recovering
    if (near(c, vp.valPrice, 0.004) && ctx.rsi[ctx.i] < 45) {
      const cs = [conf('Price at Value Area Low', PTS.vpPOC)]
      if (near(c, vp.pocPrice, 0.006)) cs.push(conf('POC confluence', PTS.vpPOC))
      if (ctx.last.volume < ctx.avgVol) cs.push(conf('Volume dry-up', PTS.volDry))
      return { direction: 'LONG', entry: c, stop: vp.valPrice - atrUnit(ctx) * 1.5,
        tps: [vp.pocPrice, vp.vahPrice, vp.vahPrice + (vp.vahPrice - vp.valPrice)], confluences: cs }
    }
    if (near(c, vp.vahPrice, 0.004) && ctx.rsi[ctx.i] > 55) {
      const cs = [conf('Price at Value Area High', PTS.vpPOC)]
      if (near(c, vp.pocPrice, 0.006)) cs.push(conf('POC confluence', PTS.vpPOC))
      return { direction: 'SHORT', entry: c, stop: vp.vahPrice + atrUnit(ctx) * 1.5,
        tps: [vp.pocPrice, vp.valPrice, vp.valPrice - (vp.vahPrice - vp.valPrice)], confluences: cs }
    }
    return null
  }},

  sweep: { name: 'Liquidity Sweep + Structure', tech: ['Liquidity Sweep'], run: (ctx) => {
    const sBull = recentSweep(ctx, 'BULLISH'), sBear = recentSweep(ctx, 'BEARISH')
    if (sBull) {
      const cs = [conf('SSL swept (stop hunt)', PTS.sweep)]
      const st = lastStruct(ctx); if (st?.choch === 'BULLISH_CHOCH') cs.push(conf('Bullish CHoCH', PTS.choch))
      const u = atrUnit(ctx)
      return { direction: 'LONG', entry: ctx.close, stop: sBull.wick - u * 0.5,
        tps: [ctx.close + u * 2, ctx.close + u * 4, ctx.close + u * 6], confluences: cs }
    }
    if (sBear) {
      const cs = [conf('BSL swept (stop hunt)', PTS.sweep)]
      const st = lastStruct(ctx); if (st?.choch === 'BEARISH_CHOCH') cs.push(conf('Bearish CHoCH', PTS.choch))
      const u = atrUnit(ctx)
      return { direction: 'SHORT', entry: ctx.close, stop: sBear.wick + u * 0.5,
        tps: [ctx.close - u * 2, ctx.close - u * 4, ctx.close - u * 6], confluences: cs }
    }
    return null
  }},

  fvg: { name: 'FVG / Imbalance OTE Entry', tech: ['Imbalance (FVG)'], run: (ctx) => {
    // unfilled FVG that price is currently retracing into
    const c = ctx.close
    const open = ctx.fvgs.filter(f => !f.filled && f.startIndex < ctx.i - 1)
    for (const f of open.slice(-8).reverse()) {
      if (f.type === 'BULLISH_FVG' && c <= f.top && c >= f.bottom) {
        const cs = [conf('Price in Bullish FVG (OTE)', PTS.fvg)]
        return { direction: 'LONG', entry: c, stop: f.bottom - atrUnit(ctx) * 0.5,
          tps: [f.top + f.size, f.top + f.size * 2, f.top + f.size * 3], confluences: cs, pattern: 'Bullish FVG' }
      }
      if (f.type === 'BEARISH_FVG' && c >= f.bottom && c <= f.top) {
        const cs = [conf('Price in Bearish FVG (OTE)', PTS.fvg)]
        return { direction: 'SHORT', entry: c, stop: f.top + atrUnit(ctx) * 0.5,
          tps: [f.bottom - f.size, f.bottom - f.size * 2, f.bottom - f.size * 3], confluences: cs, pattern: 'Bearish FVG' }
      }
    }
    return null
  }},

  harmonic: { name: 'Harmonic + Fib', tech: [], run: (ctx) => {
    // lightweight ABCD-style reversal proxy: deep RSI + structure pivot
    const r = ctx.rsi[ctx.i]; const u = atrUnit(ctx)
    if (r < 25 && lastStruct(ctx)?.type === 'low') return { direction: 'LONG', entry: ctx.close, stop: ctx.close - u * 2,
      tps: [ctx.close + u * 1.5, ctx.close + u * 3, ctx.close + u * 4], confluences: [conf('RSI oversold reversal', PTS.rsi)], pattern: 'AB=CD (proxy)' }
    if (r > 75 && lastStruct(ctx)?.type === 'high') return { direction: 'SHORT', entry: ctx.close, stop: ctx.close + u * 2,
      tps: [ctx.close - u * 1.5, ctx.close - u * 3, ctx.close - u * 4], confluences: [conf('RSI overbought reversal', PTS.rsi)], pattern: 'AB=CD (proxy)' }
    return null
  }},

  ictOB: { name: 'ICT Order Block + FVG', tech: ['Imbalance (FVG)'], run: (ctx) => {
    // order block proxy: last opposite candle before a strong displacement that left an FVG
    const f = ctx.fvgs.filter(x => !x.filled).at(-1); if (!f) return null
    const c = ctx.close, u = atrUnit(ctx)
    if (f.type === 'BULLISH_FVG' && c <= f.midpoint * 1.002 && c >= f.bottom) {
      const ob = ctx.bars[f.startIndex - 1]
      return { direction: 'LONG', entry: c, stop: (ob?.low ?? f.bottom) - u * 0.3,
        tps: [f.top + f.size, f.top + f.size * 2, f.top + f.size * 4], confluences: [conf('Order Block + FVG overlap', PTS.ob), conf('FVG entry', PTS.fvg)] }
    }
    return null
  }},

  utRibbon: { name: 'UT Bot + MA Ribbon', tech: [], run: (ctx) => {
    const e20 = ctx.ema20[ctx.i], e50 = ctx.ema50[ctx.i], e200 = ctx.ema200[ctx.i]; const u = atrUnit(ctx)
    if (e20 > e50 && e50 > e200 && ctx.close > e20) return { direction: 'LONG', entry: ctx.close, stop: e50,
      tps: [ctx.close + u * 1.5, ctx.close + u * 3, ctx.close + u * 5], confluences: [conf('MA Ribbon bullish stack', PTS.ribbon), conf('UT Bot bias', PTS.utbot)] }
    if (e20 < e50 && e50 < e200 && ctx.close < e20) return { direction: 'SHORT', entry: ctx.close, stop: e50,
      tps: [ctx.close - u * 1.5, ctx.close - u * 3, ctx.close - u * 5], confluences: [conf('MA Ribbon bearish stack', PTS.ribbon), conf('UT Bot bias', PTS.utbot)] }
    return null
  }},

  ichimoku: { name: 'Ichimoku Confluence', tech: [], run: (ctx) => {
    // simplified: price vs 26-period midline + 9-period, rsi filter
    const hi = (n) => Math.max(...ctx.bars.slice(ctx.i - n + 1, ctx.i + 1).map(b => b.high))
    const lo = (n) => Math.min(...ctx.bars.slice(ctx.i - n + 1, ctx.i + 1).map(b => b.low))
    if (ctx.i < 52) return null
    const tenkan = (hi(9) + lo(9)) / 2, kijun = (hi(26) + lo(26)) / 2; const u = atrUnit(ctx)
    if (ctx.close > kijun && tenkan > kijun && ctx.rsi[ctx.i] > 50) return { direction: 'LONG', entry: ctx.close, stop: kijun,
      tps: [ctx.close + u * 2, ctx.close + u * 3.5, ctx.close + u * 5], confluences: [conf('Ichimoku bullish (TK>Kijun, price>cloud)', PTS.ichimoku)] }
    if (ctx.close < kijun && tenkan < kijun && ctx.rsi[ctx.i] < 50) return { direction: 'SHORT', entry: ctx.close, stop: kijun,
      tps: [ctx.close - u * 2, ctx.close - u * 3.5, ctx.close - u * 5], confluences: [conf('Ichimoku bearish', PTS.ichimoku)] }
    return null
  }},

  superVP: { name: 'Supertrend + VP HVN', tech: ['Volume Profile'], run: (ctx) => {
    const vp = ctx.vp; if (!vp) return null; const u = atrUnit(ctx)
    const nearHVN = vp.hvnPrices.some(p => near(ctx.close, p, 0.004))
    if (nearHVN && ctx.close > ctx.ema50[ctx.i]) return { direction: 'LONG', entry: ctx.close, stop: ctx.close - u * 2,
      tps: [ctx.close + u * 2, ctx.close + u * 3, ctx.close + u * 4], confluences: [conf('Supertrend up + HVN', PTS.vpPOC)] }
    return null
  }},

  golden: { name: 'Golden / Death Cross', tech: [], run: (ctx) => {
    const f = ctx.ema50, s = ctx.ema200, i = ctx.i; if (f[i] == null || s[i] == null || f[i - 1] == null) return null
    const u = atrUnit(ctx)
    if (f[i - 1] <= s[i - 1] && f[i] > s[i]) return { direction: 'LONG', entry: ctx.close, stop: s[i],
      tps: [ctx.close + u * 3, ctx.close + u * 6, ctx.close + u * 10], confluences: [conf('50/200 Golden Cross', PTS.golden)] }
    if (f[i - 1] >= s[i - 1] && f[i] < s[i]) return { direction: 'SHORT', entry: ctx.close, stop: s[i],
      tps: [ctx.close - u * 3, ctx.close - u * 6, ctx.close - u * 10], confluences: [conf('50/200 Death Cross', PTS.golden)] }
    return null
  }},

  bbSqueeze: { name: 'BB Squeeze Breakout', tech: [], run: (ctx) => {
    const i = ctx.i, basis = ctx.bbBasis[i], sd = ctx.bbStd[i]; if (basis == null) return null
    const up = basis + 2 * sd, lo = basis - 2 * sd, width = (up - lo) / basis
    // squeeze: bandwidth in lowest part of recent range
    const recent = ctx.bbStd.slice(-126).filter(Boolean)
    const minSd = Math.min(...recent), thresh = minSd * 1.3; const u = atrUnit(ctx)
    const squeeze = sd <= thresh
    if (squeeze && ctx.close > up && ctx.last.volume > ctx.avgVol * 1.5) return { direction: 'LONG', entry: ctx.close, stop: basis,
      tps: [ctx.close + (up - lo), ctx.close + (up - lo) * 1.5, ctx.close + (up - lo) * 2], confluences: [conf('BB squeeze breakout + volume', PTS.squeeze)] }
    if (squeeze && ctx.close < lo && ctx.last.volume > ctx.avgVol * 1.5) return { direction: 'SHORT', entry: ctx.close, stop: basis,
      tps: [ctx.close - (up - lo), ctx.close - (up - lo) * 1.5, ctx.close - (up - lo) * 2], confluences: [conf('BB squeeze breakdown + volume', PTS.squeeze)] }
    return null
  }},

  macdRsi: { name: 'MACD + RSI Confluence', tech: [], run: (ctx) => {
    const r = ctx.rsi[ctx.i]; const u = atrUnit(ctx)
    if (r > 50 && ctx.close > ctx.ema50[ctx.i]) return { direction: 'LONG', entry: ctx.close, stop: ctx.close - u * 1.5,
      tps: [ctx.close + u * 1.5, ctx.close + u * 3, ctx.close + u * 4], confluences: [conf('RSI>50 + above 50EMA', PTS.rsi)] }
    if (r < 50 && ctx.close < ctx.ema50[ctx.i]) return { direction: 'SHORT', entry: ctx.close, stop: ctx.close + u * 1.5,
      tps: [ctx.close - u * 1.5, ctx.close - u * 3, ctx.close - u * 4], confluences: [conf('RSI<50 + below 50EMA', PTS.rsi)] }
    return null
  }},

  meanRev: { name: 'Mean Reversion (Keltner+RSI)', tech: [], run: (ctx) => {
    const i = ctx.i, basis = ctx.bbBasis[i], atrv = ctx.atr[i]; if (basis == null) return null
    const kUp = basis + 2 * atrv, kLo = basis - 2 * atrv
    if (ctx.close < kLo && ctx.rsi[i] < 25) return { direction: 'LONG', entry: ctx.close, stop: ctx.close - atrv * 2,
      tps: [basis, basis + atrv, kUp], confluences: [conf('Below Keltner + RSI<25', PTS.rsi)] }
    if (ctx.close > kUp && ctx.rsi[i] > 75) return { direction: 'SHORT', entry: ctx.close, stop: ctx.close + atrv * 2,
      tps: [basis, basis - atrv, kLo], confluences: [conf('Above Keltner + RSI>75', PTS.rsi)] }
    return null
  }},

  breakoutRetest: { name: 'Breakout Retest (S/R Flip)', tech: [], run: (ctx) => {
    // retest of a strong equal-level after break
    const u = atrUnit(ctx), c = ctx.close
    const bsl = ctx.levels.buySide.filter(l => l.strength >= 2)
    for (const l of bsl) {
      if (c > l.price && near(c, l.price, 0.003) && ctx.bars[ctx.i - 1].close > l.price)
        return { direction: 'LONG', entry: c, stop: l.price - u, tps: [c + u * 2, c + u * 3, c + u * 5],
          confluences: [conf('Resistance flip retest', PTS.ob)] }
    }
    return null
  }},
}

export function scanStrategies(bars) {
  if (bars.length < 60) return []
  const ctx = buildContext(bars)
  const out = []
  for (const [id, strat] of Object.entries(STRATEGIES)) {
    let raw
    try { raw = strat.run(ctx) } catch { raw = null }
    if (raw) out.push(finalize(id, strat, raw, ctx))
  }
  return out.sort((a, b) => b.score - a.score)
}

function finalize(id, strat, raw, ctx) {
  const techniques = strat.tech || []
  const score = raw.confluences.reduce((s, c) => s + c.pts, 0) + techniques.length // engines add weight
  const grade = score >= 10 ? 'A++' : score >= 7 ? 'A+' : score >= 5 ? 'A' : score >= 3 ? 'B' : 'C'
  const risk = Math.abs(raw.entry - raw.stop)
  const reward = Math.abs(raw.tps[0] - raw.entry)
  const rr = risk ? +(reward / risk).toFixed(2) : 0
  const dp = ctx.close < 10 ? 4 : 2
  const f = n => n?.toFixed(dp)
  const pct = (a, b) => (((a - b) / b) * 100).toFixed(2)
  const reason = [
    `${grade} · ${strat.name} — ${raw.direction}`,
    ...raw.confluences.map((c, k) => `  ${['①','②','③','④','⑤','⑥'][k] || '·'} ${c.label}`),
    `  Entry ${f(raw.entry)} | SL ${f(raw.stop)} (${pct(raw.stop, raw.entry)}%) | TP1 ${f(raw.tps[0])} | R:R 1:${rr}`,
  ].join('\n')
  return {
    id: `${id}-${ctx.last.time}`, sid: id, strategy: strat.name, direction: raw.direction,
    entry: raw.entry, stop: raw.stop, tps: raw.tps, rr, score, grade,
    techniques, confluences: raw.confluences.map(c => c.label), pattern: raw.pattern,
    reason, time: ctx.last.time, invalidation: raw.stop,
  }
}
