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
// TWO capital pools: ₹10L for cash/equity, a SEPARATE ₹10L dedicated to F&O + options.
const CAP_CASH = 1000000
const CAP_FO = 1000000
export const CAPITAL = CAP_CASH + CAP_FO
const RISK_PCT = 1                    // risk ~1% of the sleeve per trade
const MAX_DEPLOY_PCT = 4              // cash: ≤4% of the cash sleeve per position
const FO_DEPLOY_PCT = 10             // F&O/option: ≤10% of the F&O sleeve per position
const FNO_MARGIN = 0.20              // futures margin ≈ 20% of notional (paper model)
const FNO_MAX_MARGIN_PCT = 12        // skip an F&O trade whose smallest lot needs >12% of the F&O sleeve
const STOCK_OPT_PREM_PCT = 0.035    // est. monthly ATM stock-option premium ≈ 3.5% of spot (higher IV than index)
const MAX_OPEN = 70                   // concurrent positions across both sleeves (options are cheap → many fit the F&O sleeve)

export function loadBook() {
  let b
  try { b = JSON.parse(readFileSync(PATH, 'utf8')); b.open ||= {}; b.closed ||= [] }
  catch { b = { startedAt: null, open: {}, closed: [], updatedAt: null } }
  // migrate to two-pool model (keeps the existing cash book, adds a fresh ₹10L F&O sleeve)
  b.capitalCash ??= CAP_CASH
  b.capitalFO ??= CAP_FO
  b.capitalStart = b.capitalCash + b.capitalFO
  if (b.cashCash == null) b.cashCash = b.cash != null ? b.cash : CAP_CASH   // existing single pool → cash sleeve
  if (b.cashFO == null) b.cashFO = CAP_FO                                    // brand-new F&O money
  delete b.cash
  return b
}
const save = b => { b.updatedAt = new Date().toISOString(); try { writeFileSync(PATH, JSON.stringify(b, null, 2)) } catch {} }
const gradeRank = s => ({ 'A++': 5, 'A+': 4, 'A': 3, 'B': 2, 'C': 1 })[s.grade] || (s.generator === 'momentum' ? 2 : 2)

// position sizing — the engine decides quantity from risk (entry→SL) + deploy caps.
// F&O-eligible symbols are booked as F&O (lot-sized, leveraged) rather than cash.
function sizeTrade(sig, fnoLots = {}) {
  const entry = sig.entry, sl = sig.sl
  if (!entry || !sl) return null
  const foRisk = CAP_FO * RISK_PCT / 100, foDeploy = CAP_FO * FO_DEPLOY_PCT / 100, foMax = CAP_FO * FNO_MAX_MARGIN_PCT / 100
  // OPTION BUY (CE/PE) — defined risk = premium paid; sized off the F&O sleeve
  if (sig.optType && sig.lot && sig.entryPremium) {
    const lot = sig.lot, prem = sig.entryPremium, perLot = prem * lot
    if (perLot > foMax) return null
    const lots = Math.max(1, Math.floor(Math.min(foRisk * 2, foDeploy) / perLot))
    const qty = lots * lot
    return { kind: 'OPT', sleeve: 'FO', optType: sig.optType, qty, lots, lotSize: lot, entryPremium: prem, invested: Math.round(prem * qty), notional: Math.round(entry * qty) }
  }
  const lotFromMap = fnoLots[sig.symbol] || fnoLots[sig.underlying]
  if (lotFromMap && !sig.lot) sig = { ...sig, lot: lotFromMap }
  const isFno = sig.generator === 'fno' || !!sig.optionPlay || !!sig.lot
  if (isFno && sig.lot) {
    // F&O STOCK → buy a defined-risk ATM stock OPTION (CE for long, PE for short) — leverage + capped loss
    const lotSize = sig.lot
    const optType = (sig.direction === 'SHORT' || sig.direction === 'BEARISH') ? 'PE' : 'CE'
    const prem = Math.round(entry * STOCK_OPT_PREM_PCT)                 // est. monthly ATM stock-option premium
    const perLot = prem * lotSize
    if (!prem || perLot > foMax) return null
    const lots = Math.max(1, Math.floor(Math.min(foRisk * 2, foDeploy) / perLot))
    const qty = lots * lotSize
    return { kind: 'OPT', sleeve: 'FO', optType, stockOption: true, qty, lots, lotSize, entryPremium: prem, invested: Math.round(prem * qty), notional: Math.round(entry * qty) }
  }
  if (entry <= sl) return null   // long cash guard
  const riskAmt = CAP_CASH * RISK_PCT / 100, maxDeploy = CAP_CASH * MAX_DEPLOY_PCT / 100, riskPerShare = entry - sl
  let qty = Math.floor(riskAmt / riskPerShare)
  if (qty * entry > maxDeploy) qty = Math.floor(maxDeploy / entry)
  if (qty < 1) return null
  return { kind: 'CASH', sleeve: 'CASH', qty, lots: null, lotSize: null, invested: Math.round(qty * entry), notional: Math.round(qty * entry) }
}

// P&L for a position at a given underlying exit price. Long options use an ATM premium model
// (~0.5 delta; premium can't go below 0, so loss is capped at the premium paid — the built-in hedge).
function pnlFor(pos, exitPrice, bearish) {
  if (pos.kind === 'OPT') {
    const moveFav = bearish ? (pos.entryPrice - exitPrice) : (exitPrice - pos.entryPrice)
    const exitPrem = Math.max(0, pos.entryPremium + 0.5 * moveFav)
    return Math.round((exitPrem - pos.entryPremium) * pos.qty)
  }
  return Math.round((exitPrice - pos.entryPrice) * pos.qty * (bearish ? -1 : 1))
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
export function syncTradeBook(ledger, closedNow, todayISO, nowISO = new Date().toISOString(), fnoLots = {}) {
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
    const bearish = pos.direction === 'SHORT' || pos.direction === 'BEARISH'
    const dir = bearish ? -1 : 1
    if (live && live.status === 'open') {                       // still open → mark to market
      pos.ltp = live.ltp ?? pos.ltp
      pos.unrealizedPnl = pnlFor(pos, pos.ltp, bearish)
      pos.unrealizedPct = pos.invested ? +((pos.unrealizedPnl / pos.invested) * 100).toFixed(2) : 0
      continue
    }
    const c = closedById[id]                                    // closed → realise P&L + journal
    const exitPrice = c?.closePrice ?? pos.ltp ?? pos.entryPrice
    const result = (c?.result || 'expired').toUpperCase()
    const pnl = pnlFor(pos, exitPrice, bearish)
    const maxT = c?.maxTarget || 0
    const predBy = (maxT > 0 && pos.targets?.[maxT - 1]?.by) || pos.targets?.[0]?.by || null
    const exitDate = c?.closedAt || todayISO
    const hitOnTime = result === 'WIN' && predBy ? exitDate <= predBy : null
    const expectationMatch = result === 'WIN'
      ? `Hit T${maxT || 1}${hitOnTime === false ? ' — later than predicted' : hitOnTime ? ' — on/ahead of predicted date' : ''}`
      : result === 'LOSS' ? 'Stopped out before reaching any target' : 'Expired without hitting target or stop'
    if (pos.sleeve === 'FO') b.cashFO += pos.invested + pnl; else b.cashCash += pos.invested + pnl
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

  // 2) OPEN new trades. Two separate pools: cash trades draw the ₹10L cash sleeve, F&O + options
  // draw the dedicated ₹10L F&O sleeve — so F&O/options can never be crowded out by cash.
  const isIdxOpt = s => s.optType && (s.symbol === 'NIFTY' || s.symbol === 'BANKNIFTY')
  const catRank = s => isIdxOpt(s) ? 4 : s.optType ? 3 : (s.generator === 'fno' || s.lot || fnoLots[s.symbol] || fnoLots[s.underlying]) ? 2 : 1
  // only block ids already OPEN — NOT closed ones (a symbol must be re-tradable after its trade closes;
  // ids are generator:symbol, so keeping closed ids here permanently barred re-entry).
  const seen = new Set(Object.keys(b.open))
  const openSyms = new Set(Object.values(b.open).map(p => p.symbol))    // one live position per underlying
  const cands = Object.values(ledger.active)
    .filter(s => s.status === 'open' && !seen.has(s.id) && s.openedAt >= b.startedAt && s.entry && s.sl && Array.isArray(s.targets) && s.targets.length)
    .sort((a, z) => catRank(z) - catRank(a) || gradeRank(z) - gradeRank(a) || (z.footprint?.score || 0) - (a.footprint?.score || 0) || (z.confidence || 0) - (a.confidence || 0))
  let opened = 0
  for (const s of cands) {
    if (Object.keys(b.open).length >= MAX_OPEN) break
    const sym = s.symbol || s.underlying
    if (openSyms.has(sym)) continue                                     // already holding this stock
    const size = sizeTrade(s, fnoLots)
    if (!size) continue
    const pool = size.sleeve === 'FO' ? b.cashFO : b.cashCash
    if (size.invested > pool) continue
    openSyms.add(sym)
    if (size.sleeve === 'FO') b.cashFO -= size.invested; else b.cashCash -= size.invested
    b.open[s.id] = {
      sleeve: size.sleeve,
      id: s.id, symbol: s.symbol || s.underlying, name: s.name || null, generator: s.generator, gen: s.label || s.generator,
      kind: size.kind, direction: s.direction || 'LONG', grade: s.grade || null,
      optType: size.optType || null, entryPremium: size.entryPremium || null, optionPlay: s.optionPlay || null,
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
  b.equity = Math.round(b.cashCash + b.cashFO + investedOpen + unrealized)
  // per-sleeve equity
  const foOpen = open.filter(p => p.sleeve === 'FO'), cashOpen = open.filter(p => p.sleeve !== 'FO')
  const foVal = foOpen.reduce((a, p) => a + (p.invested || 0) + (p.unrealizedPnl || 0), 0)
  const cashVal = cashOpen.reduce((a, p) => a + (p.invested || 0) + (p.unrealizedPnl || 0), 0)
  const foClosedPnl = b.closed.filter(t => t.sleeve === 'FO').reduce((a, t) => a + t.realizedPnl, 0)
  const cashClosedPnl = b.closed.filter(t => t.sleeve !== 'FO').reduce((a, t) => a + t.realizedPnl, 0)
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
    equity: b.equity, cash: Math.round(b.cashCash + b.cashFO), investedOpen,
    cashSleeve: { capital: b.capitalCash, cash: Math.round(b.cashCash), equity: Math.round(b.cashCash + cashVal), pct: +(((b.cashCash + cashVal - b.capitalCash) / b.capitalCash) * 100).toFixed(2), open: cashOpen.length, closedPnl: Math.round(cashClosedPnl) },
    foSleeve: { capital: b.capitalFO, cash: Math.round(b.cashFO), equity: Math.round(b.cashFO + foVal), pct: +(((b.cashFO + foVal - b.capitalFO) / b.capitalFO) * 100).toFixed(2), open: foOpen.length, closedPnl: Math.round(foClosedPnl) },
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
