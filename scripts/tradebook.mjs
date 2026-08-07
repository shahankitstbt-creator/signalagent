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
// THREE capital pools: ₹10L cash/equity, ₹10L F&O+options, ₹10L "Daily Income" (experiment).
const CAP_CASH = 1000000
const CAP_FO = 1000000
const CAP_DAILY = 1000000
export const CAPITAL = CAP_CASH + CAP_FO + CAP_DAILY
const RISK_PCT = 1                    // risk ~1% of the sleeve per trade
// ── Daily Income sleeve (separate ₹10L, 30-day monitor) — aims for a small, consistent
// 1–2% booked per day: take the best LONG momentum setups, book fast at +target / cut fast,
// square off if not resolved. This is an HONEST experiment, NOT a guaranteed daily return. ──
// exits are return-on-invested (works for cash AND leveraged options). Cash moves ~1:1 with price;
// options swing far more per rupee, so they get wider take/stop bands.
const DAILY_TAKE = 1.8               // CASH: book at +1.8% (inside the 1–2% aim)
const DAILY_STOP = 1.2               // CASH: cut at −1.2%
const DAILY_TAKE_OPT = 18            // OPTION: book at +18% premium (leverage → contributes the daily 1–2%)
const DAILY_STOP_OPT = 12            // OPTION: cut at −12% premium
const DAILY_MAX_OPEN = 8             // few, high-conviction names at a time (cash / F&O / options)
const MAX_DEPLOY_PCT = 4              // cash: ≤4% of the cash sleeve per position
const FO_DEPLOY_PCT = 10             // F&O/option: ≤10% of the F&O sleeve per position
const FNO_MARGIN = 0.20              // futures margin ≈ 20% of notional (paper model)
const FNO_MAX_MARGIN_PCT = 12        // skip an F&O trade whose smallest lot needs >12% of the F&O sleeve
const STOCK_OPT_PREM_PCT = 0.035    // est. monthly ATM stock-option premium ≈ 3.5% of spot (higher IV than index)
const BOOK_AT_PCT = 40              // book 50% of a position once it's up this much
const TRAIL_EXIT_PCT = 10          // after partial book, exit the runner if it gives back to this
const MAX_OPEN = 70                   // concurrent positions across both sleeves (options are cheap → many fit the F&O sleeve)

export function loadBook() {
  let b
  try { b = JSON.parse(readFileSync(PATH, 'utf8')); b.open ||= {}; b.closed ||= [] }
  catch { b = { startedAt: null, open: {}, closed: [], updatedAt: null } }
  // migrate to three-pool model (cash + F&O + daily-income sleeves)
  b.capitalCash ??= CAP_CASH
  b.capitalFO ??= CAP_FO
  b.capitalDaily ??= CAP_DAILY
  b.capitalStart = b.capitalCash + b.capitalFO + b.capitalDaily
  if (b.cashCash == null) b.cashCash = b.cash != null ? b.cash : CAP_CASH   // existing single pool → cash sleeve
  if (b.cashFO == null) b.cashFO = CAP_FO                                    // F&O money
  if (b.cashDaily == null) b.cashDaily = CAP_DAILY                          // brand-new daily-income money
  b.dailyStartedAt ??= null                                                 // set when the first daily trade opens
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
const daysBetween = (a, b) => { const d = (Date.parse(b) - Date.parse(a)) / 86400000; return isNaN(d) ? 0 : Math.max(0, Math.round(d)) }
const DTE0 = 20   // ~trading days to monthly expiry at entry (paper model)
function pnlFor(pos, exitPrice, bearish, daysHeld = 0) {
  if (pos.kind === 'OPT') {
    // Realistic-ish ATM option: premium = decaying time-value (THETA, √time) + intrinsic (delta≈0.55).
    // A flat/adverse held option BLEEDS premium (theta); only a real favourable move pays.
    const moveFav = bearish ? (pos.entryPrice - exitPrice) : (exitPrice - pos.entryPrice)
    const held = Math.min(Math.max(0, daysHeld), DTE0)
    const timeValue = pos.entryPremium * Math.sqrt((DTE0 - held) / DTE0)   // theta decay
    const intrinsicGain = 0.55 * moveFav                                   // delta on the move
    const exitPrem = Math.max(0, timeValue + intrinsicGain)
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
  const entered = [], exited = []   // events THIS run → Telegram entry/exit alerts

  // index close info (this run's closures + full history summaries)
  const closedById = {}
  for (const c of (closedNow || [])) closedById[c.id] = c
  for (const h of (ledger.history || [])) if (!closedById[h.id]) closedById[h.id] = h

  // 1) UPDATE / CLOSE booked positions
  for (const id of Object.keys(b.open)) {
    const pos = b.open[id]

    // ── DAILY INCOME sleeve (cash / F&O / options): fast scalp exits by return-on-invested —
    //    book at +take / cut −stop / square off EOD. P&L via pnlFor so options price on premium. ──
    if (pos.sleeve === 'DAILY') {
      const live = ledger.active[id.slice(6)]          // strip "daily:" prefix → base signal id
      const bearish = pos.direction === 'SHORT' || pos.direction === 'BEARISH'
      const held = daysBetween(pos.entryDate, todayISO)
      const ltp = live?.ltp ?? pos.ltp ?? pos.entryPrice
      const pnl = pnlFor(pos, ltp, bearish, held)
      const retPct = pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0
      const take = pos.kind === 'OPT' ? DAILY_TAKE_OPT : DAILY_TAKE
      const stop = pos.kind === 'OPT' ? DAILY_STOP_OPT : DAILY_STOP
      let result = null, why = null
      if (retPct >= take) { result = 'WIN'; why = `Booked +${retPct}% (daily target)` }
      else if (retPct <= -stop) { result = 'LOSS'; why = `Cut at ${retPct}% (daily stop)` }
      else if (held >= 1) { result = retPct >= 0 ? 'WIN' : 'LOSS'; why = `Squared off same-day at ${retPct >= 0 ? '+' : ''}${retPct}%` }
      if (!result) {                                    // same session, still running → mark to market
        pos.ltp = ltp; pos.unrealizedPnl = pnl; pos.unrealizedPct = retPct; continue
      }
      b.cashDaily += pos.invested + pnl
      const rec = { ...pos, exitPrice: ltp, exitDate: todayISO, exitAt: nowISO, result, maxTarget: result === 'WIN' ? 1 : 0, realizedPnl: pnl, realizedPct: retPct, daysHeld: held, expectationMatch: why, failureReason: result === 'LOSS' ? why : null, unrealizedPnl: undefined, unrealizedPct: undefined }
      b.closed.push(rec); exited.push(rec); delete b.open[id]
      continue
    }

    const live = ledger.active[id]
    const bearish = pos.direction === 'SHORT' || pos.direction === 'BEARISH'
    const dir = bearish ? -1 : 1
    if (live && live.status === 'open') {                       // still open → mark to market
      const held = daysBetween(pos.entryDate, todayISO)
      pos.ltp = live.ltp ?? pos.ltp
      pos.unrealizedPnl = pnlFor(pos, pos.ltp, bearish, held)
      pos.unrealizedPct = pos.invested ? +((pos.unrealizedPnl / pos.invested) * 100).toFixed(2) : 0
      pos.peakPct = Math.max(pos.peakPct ?? 0, pos.unrealizedPct)
      // PARTIAL BOOK 50% at +40% — but F&O trades in WHOLE LOTS, so only if ≥2 lots (you can't
      // book half of a single lot). Cash can book any share count.
      const isLot = !!(pos.lotSize && pos.lots)
      const canPartial = isLot ? pos.lots >= 2 : pos.qty >= 2
      if (!pos.partialBooked && pos.unrealizedPct >= BOOK_AT_PCT && canPartial) {
        const bookLots = isLot ? Math.floor(pos.lots / 2) : 0
        const halfQty = isLot ? bookLots * pos.lotSize : Math.floor(pos.qty / 2)
        const perUnit = pnlFor({ ...pos, qty: 1 }, pos.ltp, bearish, held)
        const bookedPnl = Math.round(perUnit * halfQty)
        const bookedInv = Math.round(pos.invested * halfQty / pos.qty)
        if (pos.sleeve === 'FO') b.cashFO += bookedInv + bookedPnl; else b.cashCash += bookedInv + bookedPnl
        const pRec = { ...pos, qty: halfQty, lots: isLot ? bookLots : null, invested: bookedInv, exitPrice: pos.ltp, exitDate: todayISO, exitAt: nowISO, result: 'WIN', partial: true, maxTarget: 0, realizedPnl: bookedPnl, realizedPct: bookedInv ? +((bookedPnl / bookedInv) * 100).toFixed(2) : 0, daysHeld: held, expectationMatch: `Partial book (${isLot ? bookLots + ' lot' + (bookLots > 1 ? 's' : '') : '50%'}) at +${pos.unrealizedPct}% — rest trailed`, failureReason: null, unrealizedPnl: undefined, unrealizedPct: undefined }
        b.closed.push(pRec); exited.push(pRec)
        pos.qty -= halfQty; if (isLot) pos.lots -= bookLots; pos.invested -= bookedInv; pos.partialBooked = true
        pos.unrealizedPnl = pnlFor(pos, pos.ltp, bearish, held); pos.unrealizedPct = pos.invested ? +((pos.unrealizedPnl / pos.invested) * 100).toFixed(2) : 0
      }
      // SL management. After a partial book, OR for a SINGLE lot that already peaked ≥+40% (can't
      // split it), protect it: SOLID signals (A++/A+) → SL to COST-TO-COST (breakeven, exit only if
      // it returns to entry) so a strong move runs free; weaker signals lock a +10% trailing floor.
      const solid = pos.grade === 'A++' || pos.grade === 'A+'
      const floor = solid ? 0 : TRAIL_EXIT_PCT
      const manage = pos.partialBooked || (isLot && pos.lots === 1 && (pos.peakPct ?? 0) >= BOOK_AT_PCT)
      if (manage && pos.unrealizedPct <= floor) {
        const pnl = pnlFor(pos, pos.ltp, bearish, held)
        if (pos.sleeve === 'FO') b.cashFO += pos.invested + pnl; else b.cashCash += pos.invested + pnl
        const trRec = { ...pos, exitPrice: pos.ltp, exitDate: todayISO, exitAt: nowISO, result: pnl >= 0 ? 'WIN' : 'LOSS', maxTarget: 0, realizedPnl: pnl, realizedPct: pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0, daysHeld: held, expectationMatch: solid ? `Runner stopped at cost-to-cost (peaked +${pos.peakPct}%)` : `Runner trailed out at +${pos.unrealizedPct}% (peaked +${pos.peakPct}%)`, failureReason: null, unrealizedPnl: undefined, unrealizedPct: undefined }
        b.closed.push(trRec); exited.push(trRec)
        delete b.open[id]
      }
      continue
    }
    const c = closedById[id]                                    // closed → realise P&L + journal
    const exitPrice = c?.closePrice ?? pos.ltp ?? pos.entryPrice
    const result = (c?.result || 'expired').toUpperCase()
    const pnl = pnlFor(pos, exitPrice, bearish, c?.daysHeld ?? daysBetween(pos.entryDate, c?.closedAt || todayISO))
    const maxT = c?.maxTarget || 0
    const predBy = (maxT > 0 && pos.targets?.[maxT - 1]?.by) || pos.targets?.[0]?.by || null
    const exitDate = c?.closedAt || todayISO
    const hitOnTime = result === 'WIN' && predBy ? exitDate <= predBy : null
    const expectationMatch = result === 'WIN'
      ? `Hit T${maxT || 1}${hitOnTime === false ? ' — later than predicted' : hitOnTime ? ' — on/ahead of predicted date' : ''}`
      : result === 'LOSS' ? 'Stopped out before reaching any target' : 'Expired without hitting target or stop'
    if (pos.sleeve === 'FO') b.cashFO += pos.invested + pnl; else b.cashCash += pos.invested + pnl
    const fRec = {
      ...pos, exitPrice, exitDate, exitAt: nowISO, result, maxTarget: maxT,
      realizedPnl: pnl, realizedPct: pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0,
      priceMovePct: +(((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * dir).toFixed(2),
      daysHeld: c?.daysHeld ?? null, targetPredictedBy: predBy, hitOnTime, expectationMatch,
      failureReason: result === 'WIN' ? null : failReason(c, pos),
      unrealizedPnl: undefined, unrealizedPct: undefined,
    }
    b.closed.push(fRec); exited.push(fRec)
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
  const openSyms = new Set(Object.values(b.open).filter(p => p.sleeve !== 'DAILY').map(p => p.symbol))    // one live cash/F&O position per underlying (daily sleeve tracked separately)
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
    entered.push(b.open[s.id])
    opened++
  }

  // 2b) DAILY INCOME sleeve — separate ₹10L. Take the best LONG cash setups, size from the daily
  //     pool; fast scalp exits (+target / −stop / square-off) are handled in the update loop above.
  const dailyOpenCount0 = Object.keys(b.open).filter(k => k.startsWith('daily:')).length
  const dailySyms = new Set(Object.values(b.open).filter(p => p.sleeve === 'DAILY').map(p => p.symbol))
  let dailyOpened = 0
  for (const s of cands) {
    if (dailyOpenCount0 + dailyOpened >= DAILY_MAX_OPEN) break
    if (!s.entry || !s.sl) continue
    const sym = s.symbol || s.underlying
    if (dailySyms.has(sym)) continue
    const key = 'daily:' + s.id
    if (b.open[key]) continue
    const size = sizeTrade(s, fnoLots)                                  // cash / F&O-option / index-option, shorts → PE
    if (!size) continue
    if (size.invested > b.cashDaily) continue
    b.cashDaily -= size.invested
    if (!b.dailyStartedAt) b.dailyStartedAt = todayISO
    dailySyms.add(sym)
    b.open[key] = {
      sleeve: 'DAILY', id: key, baseId: s.id, symbol: sym, name: s.name || null,
      generator: s.generator, gen: s.label || s.generator,
      kind: size.kind, direction: s.direction || 'LONG', grade: s.grade || null,
      optType: size.optType || null, entryPremium: size.entryPremium || null, optionPlay: s.optionPlay || null,
      qty: size.qty, lots: size.lots, lotSize: size.lotSize, notional: size.notional,
      entryPrice: s.entry, sl: s.sl, targets: s.targets, invested: size.invested,
      entryDate: todayISO, entryAt: nowISO, ltp: s.ltp ?? s.entry,
      dailyTake: size.kind === 'OPT' ? DAILY_TAKE_OPT : DAILY_TAKE, dailyStop: size.kind === 'OPT' ? DAILY_STOP_OPT : DAILY_STOP,
      footprint: s.footprint || null, delivery: s.delivery ?? null, rr: s.rr ?? null,
      reason: s.reason || s.setupType || 'Daily-income scalp',
      unrealizedPnl: 0, unrealizedPct: 0,
    }
    entered.push(b.open[key]); dailyOpened++
  }

  computeStats(b)
  save(b)
  Object.defineProperty(b, '_entered', { value: entered, enumerable: false })
  Object.defineProperty(b, '_exited', { value: exited, enumerable: false })
  console.log(`Trade book: +${opened} main +${dailyOpened} daily · ${Object.keys(b.open).length} open · ${b.closed.length} closed · equity ₹${b.equity.toLocaleString('en-IN')} (${b.stats.totalPct >= 0 ? '+' : ''}${b.stats.totalPct}%)`)
  return b
}

// Daily-income 30-day monitor: realised P&L grouped by day, % of the ₹10L sleeve, and how many
// days actually landed in the 1–2% aim. Honest scoreboard for the experiment.
function dailyMonitor(b, dailyClosed) {
  const byDay = {}
  for (const t of dailyClosed) { const d = t.exitDate; if (!d) continue; (byDay[d] ||= { pnl: 0, trades: 0, wins: 0 }); byDay[d].pnl += t.realizedPnl; byDay[d].trades++; if (t.result === 'WIN') byDay[d].wins++ }
  const days = Object.entries(byDay).sort().map(([date, v]) => ({ date, pnl: Math.round(v.pnl), pct: +((v.pnl / b.capitalDaily) * 100).toFixed(2), trades: v.trades, wins: v.wins }))
  const last30 = days.slice(-30)
  const n = last30.length
  return {
    log: last30, tradingDays: n,
    daysPositive: last30.filter(d => d.pct > 0).length,
    daysInBand: last30.filter(d => d.pct >= 1 && d.pct <= 2).length,
    daysHitMin: last30.filter(d => d.pct >= 1).length,
    avgDayPct: n ? +(last30.reduce((a, d) => a + d.pct, 0) / n).toFixed(2) : null,
    targetBand: [1, 2],
  }
}

function computeStats(b) {
  const open = Object.values(b.open)
  const investedOpen = open.reduce((a, p) => a + (p.invested || 0), 0)
  const unrealized = open.reduce((a, p) => a + (p.unrealizedPnl || 0), 0)
  b.equity = Math.round(b.cashCash + b.cashFO + b.cashDaily + investedOpen + unrealized)
  // per-sleeve equity
  const foOpen = open.filter(p => p.sleeve === 'FO'), cashOpen = open.filter(p => p.sleeve !== 'FO' && p.sleeve !== 'DAILY')
  const foVal = foOpen.reduce((a, p) => a + (p.invested || 0) + (p.unrealizedPnl || 0), 0)
  const cashVal = cashOpen.reduce((a, p) => a + (p.invested || 0) + (p.unrealizedPnl || 0), 0)
  const foClosedPnl = b.closed.filter(t => t.sleeve === 'FO').reduce((a, t) => a + t.realizedPnl, 0)
  const cashClosedPnl = b.closed.filter(t => t.sleeve !== 'FO' && t.sleeve !== 'DAILY').reduce((a, t) => a + t.realizedPnl, 0)
  // MAIN portfolio = cash + F&O (the ₹20L swing book). Daily-income sleeve is tracked separately.
  const mainClosed = b.closed.filter(t => t.sleeve !== 'DAILY')
  const mainCapital = b.capitalCash + b.capitalFO
  const wins = mainClosed.filter(t => t.result === 'WIN'), losses = mainClosed.filter(t => t.result === 'LOSS')
  const decided = wins.length + losses.length
  const realized = mainClosed.reduce((a, t) => a + t.realizedPnl, 0)
  const grossWin = wins.reduce((a, t) => a + t.realizedPnl, 0)
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.realizedPnl, 0))
  const onTimeWins = wins.filter(t => t.hitOnTime === true).length
  // monthly realised P&L (main sleeves) vs the 5–7% aim
  const monthly = {}
  for (const t of mainClosed) { const m = (t.exitDate || '').slice(0, 7); if (!m) continue; (monthly[m] ||= { pnl: 0, trades: 0 }); monthly[m].pnl += t.realizedPnl; monthly[m].trades++ }
  const months = Object.entries(monthly).sort().map(([month, v]) => ({ month, pnl: Math.round(v.pnl), pct: +((v.pnl / mainCapital) * 100).toFixed(2), trades: v.trades }))
  // DAILY-INCOME sleeve (separate ₹10L, 30-day experiment)
  const dailyOpen = open.filter(p => p.sleeve === 'DAILY')
  const dailyVal = dailyOpen.reduce((a, p) => a + (p.invested || 0) + (p.unrealizedPnl || 0), 0)
  const dailyClosed = b.closed.filter(t => t.sleeve === 'DAILY')
  const dWins = dailyClosed.filter(t => t.result === 'WIN').length
  b.stats = {
    equity: b.equity, cash: Math.round(b.cashCash + b.cashFO + b.cashDaily), investedOpen,
    cashSleeve: { capital: b.capitalCash, cash: Math.round(b.cashCash), equity: Math.round(b.cashCash + cashVal), pct: +(((b.cashCash + cashVal - b.capitalCash) / b.capitalCash) * 100).toFixed(2), open: cashOpen.length, closedPnl: Math.round(cashClosedPnl) },
    foSleeve: { capital: b.capitalFO, cash: Math.round(b.cashFO), equity: Math.round(b.cashFO + foVal), pct: +(((b.cashFO + foVal - b.capitalFO) / b.capitalFO) * 100).toFixed(2), open: foOpen.length, closedPnl: Math.round(foClosedPnl) },
    dailySleeve: {
      capital: b.capitalDaily, cash: Math.round(b.cashDaily), equity: Math.round(b.cashDaily + dailyVal),
      pct: +(((b.cashDaily + dailyVal - b.capitalDaily) / b.capitalDaily) * 100).toFixed(2),
      open: dailyOpen.length, closedCount: dailyClosed.length,
      winRate: dailyClosed.length ? +((dWins / dailyClosed.length) * 100).toFixed(1) : null,
      closedPnl: Math.round(dailyClosed.reduce((a, t) => a + t.realizedPnl, 0)),
      startedAt: b.dailyStartedAt, monitor: dailyMonitor(b, dailyClosed),
    },
    open: cashOpen.length + foOpen.length, closedCount: mainClosed.length, wins: wins.length, losses: losses.length,
    winRate: decided ? +((wins.length / decided) * 100).toFixed(1) : null,
    realizedPnl: Math.round(realized), realizedPct: +((realized / mainCapital) * 100).toFixed(2),
    unrealizedPnl: Math.round(unrealized),
    totalPct: +(((b.equity - b.capitalStart) / b.capitalStart) * 100).toFixed(2),
    profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : (grossWin ? null : null),
    avgWinPct: wins.length ? +(wins.reduce((a, t) => a + t.realizedPct, 0) / wins.length).toFixed(2) : null,
    avgLossPct: losses.length ? +(losses.reduce((a, t) => a + t.realizedPct, 0) / losses.length).toFixed(2) : null,
    onTimeWinRate: wins.length ? +((onTimeWins / wins.length) * 100).toFixed(1) : null,
    monthly: months, monthTarget: { min: 5, max: 7 },
  }
}
