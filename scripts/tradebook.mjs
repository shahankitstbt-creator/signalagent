// ─────────────────────────────────────────────────────────────────────────
// TRADE BOOK / JOURNAL — a ₹10L paper portfolio that takes EVERY high-conviction
// signal as a real, position-sized trade, then journals the outcome honestly:
// entry/exit time+price, whether it hit its target by the PREDICTED date, P&L in
// ₹, and — on a loss — WHY it failed. This is the forward test + the seed for the
// automated algo. Source of truth for prices/close is the signal ledger; this layer
// adds capital, sizing, P&L and the journal. Stored in public/trade_book.json.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs'

const PATH = 'public/trade_book.json'
export const CAPITAL = 1000000        // ₹10,00,000 starting capital
const RISK_PCT = 1                    // risk ~1% of capital per trade (₹10k)
const MAX_DEPLOY_PCT = 4              // ≤4% of capital per position → a diversified ~25-name book
const FNO_MARGIN = 0.20              // futures margin ≈ 20% of notional (paper model)
const FNO_MAX_MARGIN_PCT = 12        // skip an F&O trade whose smallest lot needs >12% of capital
const MAX_OPEN = 25                   // realistic concurrent-position cap for ₹10L

export function loadBook() {
  try { const b = JSON.parse(readFileSync(PATH, 'utf8')); b.open ||= {}; b.closed ||= []; return b }
  catch { return { capitalStart: CAPITAL, cash: CAPITAL, startedAt: null, open: {}, closed: [], updatedAt: null } }
}
const save = b => { b.updatedAt = new Date().toISOString(); try { writeFileSync(PATH, JSON.stringify(b, null, 2)) } catch {} }
const gradeRank = s => ({ 'A++': 5, 'A+': 4, 'A': 3, 'B': 2, 'C': 1 })[s.grade] || (s.generator === 'momentum' ? 2 : 2)

// position sizing — the engine decides quantity from risk (entry→SL) + deploy caps
function sizeTrade(sig) {
  const entry = sig.entry, sl = sig.sl
  if (!entry || !sl || entry <= sl) return null
  const riskAmt = CAPITAL * RISK_PCT / 100
  const maxDeploy = CAPITAL * MAX_DEPLOY_PCT / 100
  const riskPerShare = entry - sl
  const isFno = sig.generator === 'fno' || !!sig.optionPlay || !!sig.lot
  if (isFno && sig.lot) {
    const lotSize = sig.lot
    const oneLotMargin = lotSize * entry * FNO_MARGIN
    if (oneLotMargin > CAPITAL * FNO_MAX_MARGIN_PCT / 100) return null   // smallest lot too big for this book
    let lots = Math.max(1, Math.floor(riskAmt / (riskPerShare * lotSize)))
    if (lots * oneLotMargin > maxDeploy) lots = Math.max(1, Math.floor(maxDeploy / oneLotMargin))
    const qty = lots * lotSize
    const notional = qty * entry
    return { kind: 'FNO', qty, lots, lotSize, invested: Math.round(notional * FNO_MARGIN), notional: Math.round(notional) }
  }
  let qty = Math.floor(riskAmt / riskPerShare)
  if (qty * entry > maxDeploy) qty = Math.floor(maxDeploy / entry)
  if (qty < 1) return null
  return { kind: 'CASH', qty, lots: null, lotSize: null, invested: Math.round(qty * entry), notional: Math.round(qty * entry) }
}

function failReason(c, pos) {
  if (!c || !c.result) return 'Force-closed with no market data available.'
  if (c.result === 'loss') {
    const d = c.daysHeld || 0
    return d <= 1
      ? 'Hit stop-loss almost immediately — likely a false breakout / gap-down; setup invalidated within a day.'
      : `Hit stop-loss after ${d} day(s) — no follow-through; the trend/base failed to develop as expected.`
  }
  if (c.result === 'expired') return 'Neither target nor stop reached in the tracking window — thesis stalled; capital recycled.'
  return null
}

// Reconcile the book with the ledger: close finished trades, open new ones, mark-to-market.
export function syncTradeBook(ledger, closedNow, todayISO, nowISO = new Date().toISOString()) {
  const b = loadBook()
  if (!b.startedAt) b.startedAt = todayISO

  // index close info (this run's closures + full history summaries)
  const closedById = {}
  for (const c of (closedNow || [])) closedById[c.id] = c
  for (const h of (ledger.history || [])) if (!closedById[h.id]) closedById[h.id] = h

  // 1) UPDATE / CLOSE booked positions
  for (const id of Object.keys(b.open)) {
    const pos = b.open[id]
    const live = ledger.active[id]
    if (live && live.status === 'open') {                       // still open → mark to market
      pos.ltp = live.ltp ?? pos.ltp
      const dir = pos.direction === 'SHORT' ? -1 : 1
      pos.unrealizedPnl = Math.round((pos.ltp - pos.entryPrice) * pos.qty * dir)
      pos.unrealizedPct = pos.invested ? +((pos.unrealizedPnl / pos.invested) * 100).toFixed(2) : 0
      continue
    }
    const c = closedById[id]                                    // closed → realise P&L + journal
    const exitPrice = c?.closePrice ?? pos.ltp ?? pos.entryPrice
    const result = (c?.result || 'expired').toUpperCase()
    const dir = pos.direction === 'SHORT' ? -1 : 1
    const pnl = Math.round((exitPrice - pos.entryPrice) * pos.qty * dir)
    const maxT = c?.maxTarget || 0
    const predBy = (maxT > 0 && pos.targets?.[maxT - 1]?.by) || pos.targets?.[0]?.by || null
    const exitDate = c?.closedAt || todayISO
    const hitOnTime = result === 'WIN' && predBy ? exitDate <= predBy : null
    const expectationMatch = result === 'WIN'
      ? `Hit T${maxT || 1}${hitOnTime === false ? ' — later than predicted' : hitOnTime ? ' — on/ahead of predicted date' : ''}`
      : result === 'LOSS' ? 'Stopped out before reaching any target' : 'Expired without hitting target or stop'
    b.cash += pos.invested + pnl
    b.closed.push({
      ...pos, exitPrice, exitDate, exitAt: nowISO, result, maxTarget: maxT,
      realizedPnl: pnl, realizedPct: pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0,
      priceMovePct: +(((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * dir).toFixed(2),
      daysHeld: c?.daysHeld ?? null, targetPredictedBy: predBy, hitOnTime, expectationMatch,
      failureReason: result === 'WIN' ? null : failReason(c, pos),
      unrealizedPnl: undefined, unrealizedPct: undefined,
    })
    delete b.open[id]
  }
  if (b.closed.length > 4000) b.closed = b.closed.slice(-4000)

  // 2) OPEN new trades from TODAY's signals (priority: grade → footprint → confidence), within capacity
  const seen = new Set([...Object.keys(b.open), ...b.closed.map(t => t.id)])
  const openSyms = new Set(Object.values(b.open).map(p => p.symbol))    // one position per underlying
  const cands = Object.values(ledger.active)
    .filter(s => s.status === 'open' && !seen.has(s.id) && s.openedAt >= b.startedAt && s.entry && s.sl && Array.isArray(s.targets) && s.targets.length)
    .sort((a, z) => gradeRank(z) - gradeRank(a) || (z.footprint?.score || 0) - (a.footprint?.score || 0) || (z.confidence || 0) - (a.confidence || 0))
  let opened = 0
  for (const s of cands) {
    if (Object.keys(b.open).length >= MAX_OPEN) break
    const sym = s.symbol || s.underlying
    if (openSyms.has(sym)) continue                                     // already holding this stock
    const size = sizeTrade(s)
    if (!size || size.invested > b.cash) continue
    openSyms.add(sym)
    b.cash -= size.invested
    b.open[s.id] = {
      id: s.id, symbol: s.symbol || s.underlying, name: s.name || null, generator: s.generator, gen: s.label || s.generator,
      kind: size.kind, direction: s.direction || 'LONG', grade: s.grade || null,
      qty: size.qty, lots: size.lots, lotSize: size.lotSize, notional: size.notional,
      entryPrice: s.entry, sl: s.sl, targets: s.targets, invested: size.invested,
      entryDate: s.openedAt, entryAt: nowISO, ltp: s.ltp ?? s.entry,
      footprint: s.footprint || null, delivery: s.delivery ?? null, rr: s.rr ?? null,
      reason: s.reason || s.setupType || (Array.isArray(s.precursors) ? s.precursors[0] : null) || null,
      unrealizedPnl: 0, unrealizedPct: 0,
    }
    opened++
  }

  computeStats(b)
  save(b)
  console.log(`Trade book: +${opened} new trades · ${Object.keys(b.open).length} open · ${b.closed.length} closed · equity ₹${b.equity.toLocaleString('en-IN')} (${b.stats.totalPct >= 0 ? '+' : ''}${b.stats.totalPct}%)`)
  return b
}

function computeStats(b) {
  const open = Object.values(b.open)
  const investedOpen = open.reduce((a, p) => a + (p.invested || 0), 0)
  const unrealized = open.reduce((a, p) => a + (p.unrealizedPnl || 0), 0)
  b.equity = Math.round(b.cash + investedOpen + unrealized)
  const wins = b.closed.filter(t => t.result === 'WIN'), losses = b.closed.filter(t => t.result === 'LOSS')
  const decided = wins.length + losses.length
  const realized = b.closed.reduce((a, t) => a + t.realizedPnl, 0)
  const grossWin = wins.reduce((a, t) => a + t.realizedPnl, 0)
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.realizedPnl, 0))
  const onTimeWins = wins.filter(t => t.hitOnTime === true).length
  // monthly realised P&L vs the 5–7% aim
  const monthly = {}
  for (const t of b.closed) { const m = (t.exitDate || '').slice(0, 7); if (!m) continue; (monthly[m] ||= { pnl: 0, trades: 0 }); monthly[m].pnl += t.realizedPnl; monthly[m].trades++ }
  const months = Object.entries(monthly).sort().map(([month, v]) => ({ month, pnl: Math.round(v.pnl), pct: +((v.pnl / b.capitalStart) * 100).toFixed(2), trades: v.trades }))
  b.stats = {
    equity: b.equity, cash: Math.round(b.cash), investedOpen,
    open: open.length, closedCount: b.closed.length, wins: wins.length, losses: losses.length,
    winRate: decided ? +((wins.length / decided) * 100).toFixed(1) : null,
    realizedPnl: Math.round(realized), realizedPct: +((realized / b.capitalStart) * 100).toFixed(2),
    unrealizedPnl: Math.round(unrealized),
    totalPct: +(((b.equity - b.capitalStart) / b.capitalStart) * 100).toFixed(2),
    profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : (grossWin ? null : null),
    avgWinPct: wins.length ? +(wins.reduce((a, t) => a + t.realizedPct, 0) / wins.length).toFixed(2) : null,
    avgLossPct: losses.length ? +(losses.reduce((a, t) => a + t.realizedPct, 0) / losses.length).toFixed(2) : null,
    onTimeWinRate: wins.length ? +((onTimeWins / wins.length) * 100).toFixed(1) : null,
    monthly: months, monthTarget: { min: 5, max: 7 },
  }
}
