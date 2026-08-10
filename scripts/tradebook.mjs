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
// SAFEST daily-income design (user: "safest one", ₹10k/day is fine): buy the UNDERLYING in CASH —
// no options, no leverage, no theta decay — on ONLY the highest-confidence long setups. Book a small
// gain fast, keep a tight stop, square off EOD. Aim ~₹10k/day (~1% of ₹10L) — an AIM, not a promise.
const DAILY_TAKE = 1.5               // book at +1.5% (lock a safe, consistent gain)
const DAILY_STOP = 0.8               // tight −0.8% stop
const DAILY_TAKE_OPT = 18            // (unused now — daily sleeve is cash-only for safety)
const DAILY_STOP_OPT = 12
const DAILY_MAX_OPEN = 12            // up to 12 safe cash names
const DAILY_POS_PCT = 8              // ~8% of the ₹10L pool per position (~₹9–10L working)
const DAILY_TARGET_INR = 10000       // daily profit aim (₹10k ≈ 1%)
const DAILY_MIN_CONF = 65            // safety gate: only setups at/above this confidence

// ── PER-SEGMENT GOALS (user-set) — the engine tracks month-to-date progress + pace toward each. ──
const SEGMENT_GOALS = {
  CASH:  { monthlyMin: 7,  monthlyMax: 10 },   // % / month on the ₹10L cash book
  FO:    { monthlyMin: 10, monthlyMax: 15 },   // % / month on the ₹10L F&O book
  DAILY: { dailyInr: DAILY_TARGET_INR },       // ₹ / day on the ₹10L daily-income sleeve
}
// ── AVERAGING / SL-to-structure (moderate): for a top-quality, still-valid setup, add ONCE on a dip
// and widen the stop to the next structural support instead of stopping out. Capital stays capped. ──
const AVG_MAX_MULT = 1.5             // final position ≤ 1.5× the base size
const AVG_TRIGGER_PCT = 6           // consider averaging once price is ~6% underwater (near the SL zone)
const AVG_MIN_DELIVERY = 55         // "good company" proxy — strong delivery %/hands
const AVG_SL_WIDEN_PCT = 5          // widen SL ~5% below the average-in price (to structure)
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
  // NORMALISE: any legacy open position without a sleeve is the original CASH book. Guarantees every
  // position belongs to exactly one sleeve, so deployment/cash grouping can never leak (was inflating cash equity).
  for (const p of Object.values(b.open)) if (p && !p.sleeve) p.sleeve = 'CASH'
  return b
}
const save = b => { b.updatedAt = new Date().toISOString(); try { writeFileSync(PATH, JSON.stringify(b, null, 2)) } catch {} }
const gradeRank = s => ({ 'A++': 5, 'A+': 4, 'A': 3, 'B': 2, 'C': 1 })[s.grade] || (s.generator === 'momentum' ? 2 : 2)

// position sizing — the engine decides quantity from risk (entry→SL) + deploy caps.
// F&O-eligible symbols are booked as F&O (lot-sized, leveraged) rather than cash.
function sizeTrade(sig, fnoLots = {}) {
  const entry = sig.entry, sl = sig.sl
  if (!entry || !sl) return null
  // COMMODITY (Gold/Crude/Silver) → F&O sleeve, price-move P&L (unleveraged paper model; ₹-budget
  // sized so P&L is % move × budget — currency-independent and can't blow up like an option).
  if (sig.commodity) {
    const budget = CAP_FO * FO_DEPLOY_PCT / 100     // ~₹1L slice of the F&O sleeve per commodity
    const qty = Math.max(1, Math.floor(budget / entry))
    return { kind: 'COMM', sleeve: 'FO', qty, lots: null, lotSize: null, invested: Math.round(qty * entry), notional: Math.round(qty * entry) }
  }
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

// Daily-Income sizing — SAFEST: CASH only (buy the underlying). No options/leverage → P&L is bounded
// by the real price move, so the sleeve can never balloon past ₹10L + realised profit. Deploys ~8%
// of the pool per position; invested is always ≤ the price paid, and never exceeds free daily cash.
function sizeDaily(sig) {
  const entry = sig.entry, sl = sig.sl
  if (!entry || !sl || entry <= sl) return null                      // long cash only, defined downside
  const target = CAP_DAILY * DAILY_POS_PCT / 100                     // ~₹80k target deploy per position
  const qty = Math.max(1, Math.floor(target / entry))
  return { kind: 'CASH', optType: null, qty, lots: null, lotSize: null, entryPremium: null, invested: Math.round(qty * entry), notional: Math.round(qty * entry) }
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
  // Banked realised P&L per sleeve — survives closed-array slicing; cash is DERIVED from it below
  // (cash = capital + bankedRealised − deployed) so incremental drift is impossible. Migrate once.
  if (!b.realizedTotal) {
    b.realizedTotal = { CASH: 0, FO: 0, DAILY: 0 }
    for (const t of b.closed) { const sl = t.sleeve || 'CASH'; b.realizedTotal[sl] = (b.realizedTotal[sl] || 0) + (t.realizedPnl || 0) }
  }
  const bankRealised = (sleeve, pnl) => { b.realizedTotal[sleeve] = (b.realizedTotal[sleeve] || 0) + pnl }

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
      b.cashDaily += pos.invested + pnl; bankRealised('DAILY', pnl)
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
      // AVERAGE ONCE on a dip — for a top-quality, still-valid CASH long (good company = strong delivery,
      // good setup = A++/A+): add on the dip to improve the cost basis and widen the SL to structure,
      // instead of stopping out. Capped at AVG_MAX_MULT× base, within the sleeve's ₹10L and free cash.
      if (!pos.averaged && !bearish && pos.kind === 'CASH' && (pos.grade === 'A++' || pos.grade === 'A+')
        && (pos.delivery ?? 0) >= AVG_MIN_DELIVERY && pos.unrealizedPct <= -AVG_TRIGGER_PCT && (pos.peakPct ?? 0) < BOOK_AT_PCT) {
        const base = pos.baseInvested || pos.invested
        const sleeveDep = Object.values(b.open).filter(p => p.sleeve === pos.sleeve).reduce((a, p) => a + (p.invested || 0), 0)
        const capRoom = (pos.sleeve === 'FO' ? CAP_FO : CAP_CASH) - sleeveDep
        const cashRoom = pos.sleeve === 'FO' ? b.cashFO : b.cashCash
        const addBudget = Math.max(0, Math.min(base * (AVG_MAX_MULT - 1), capRoom, cashRoom))
        const addQty = pos.ltp > 0 ? Math.floor(addBudget / pos.ltp) : 0
        if (addQty > 0) {
          const addCost = Math.round(addQty * pos.ltp)
          pos.entryPrice = +(((pos.entryPrice * pos.qty) + (pos.ltp * addQty)) / (pos.qty + addQty)).toFixed(2)  // blended cost basis
          pos.qty += addQty; pos.invested += addCost; pos.baseInvested = base; pos.averaged = true
          if (pos.sleeve === 'FO') b.cashFO -= addCost; else b.cashCash -= addCost   // (cash re-derived in §2 anyway)
          pos.sl = +(pos.ltp * (1 - AVG_SL_WIDEN_PCT / 100)).toFixed(2)              // widen SL to structure below the add
          pos.avgNote = `Averaged once at ₹${pos.ltp} (${pos.grade}, delivery ${pos.delivery ?? '—'}%) — new avg ₹${pos.entryPrice}, SL widened to ₹${pos.sl}`
          pos.unrealizedPnl = pnlFor(pos, pos.ltp, bearish, held); pos.unrealizedPct = pos.invested ? +((pos.unrealizedPnl / pos.invested) * 100).toFixed(2) : 0
        }
      }
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
        bankRealised(pos.sleeve, bookedPnl)
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
    bankRealised(pos.sleeve, pnl)
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
    bankRealised(pos.sleeve, pnl)
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
  // HARD CAP: total invested per sleeve can NEVER exceed its ₹10L. Track live-deployed cost so a new
  // trade only opens if it fits under the ₹10L — when the sleeve is full, no new trade until one closes.
  const CAPOF = { CASH: CAP_CASH, FO: CAP_FO, DAILY: CAP_DAILY }
  const deployed = { CASH: 0, FO: 0, DAILY: 0 }
  for (const p of Object.values(b.open)) deployed[p.sleeve] = (deployed[p.sleeve] || 0) + (p.invested || 0)
  // DERIVE cash from the invariant (capital + banked realised − deployed) — self-heals any drift,
  // slicing-safe, and guarantees cash + deployed − realised == capital exactly, every run.
  b.cashCash = Math.round(b.capitalCash + (b.realizedTotal.CASH || 0) - (deployed.CASH || 0))
  b.cashFO = Math.round(b.capitalFO + (b.realizedTotal.FO || 0) - (deployed.FO || 0))
  b.cashDaily = Math.round(b.capitalDaily + (b.realizedTotal.DAILY || 0) - (deployed.DAILY || 0))
  let opened = 0
  for (const s of cands) {
    if (Object.keys(b.open).length >= MAX_OPEN) break
    const sym = s.symbol || s.underlying
    if (openSyms.has(sym)) continue                                     // already holding this stock
    const size = sizeTrade(s, fnoLots)
    if (!size) continue
    if (deployed[size.sleeve] + size.invested > CAPOF[size.sleeve]) continue   // ₹10L sleeve cap
    const pool = size.sleeve === 'FO' ? b.cashFO : b.cashCash
    if (size.invested > pool) continue
    openSyms.add(sym)
    deployed[size.sleeve] += size.invested
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

  // 2b) DAILY INCOME sleeve — SAFEST cash longs only, highest-confidence setups, ~₹10k/day aim.
  //     Hard ₹10L cap (deployed.DAILY): when full, no new trade until one squares off.
  const dailySyms = new Set(Object.values(b.open).filter(p => p.sleeve === 'DAILY').map(p => p.symbol))
  const safeScore = s => gradeRank(s) * 25 + (s.confidence || s.confluenceScore || 0) + ((s.delivery || 0) / 2) + ((s.footprint && !s.footprint.weak) ? 15 : 0)
  const dailyCands = cands
    .filter(s => s.entry && s.sl && s.entry > s.sl && !s.commodity && !s.optType   // safe cash equities only
      && (s.direction || 'LONG') !== 'SHORT' && (s.direction || 'LONG') !== 'BEARISH'
      && (s.grade === 'A++' || s.grade === 'A+' || s.grade === 'A' || (s.confidence || 0) >= DAILY_MIN_CONF))  // high-confidence gate
    .sort((a, z) => safeScore(z) - safeScore(a))
  let dailyOpened = 0
  for (const s of dailyCands) {
    if ((deployed.DAILY || 0) >= CAP_DAILY) break
    if (Object.keys(b.open).filter(k => k.startsWith('daily:')).length >= DAILY_MAX_OPEN) break
    const sym = s.symbol || s.underlying
    if (dailySyms.has(sym)) continue
    const key = 'daily:' + s.id
    if (b.open[key]) continue
    const size = sizeDaily(s)                                           // CASH only, ~8% of pool
    if (!size) continue
    if (deployed.DAILY + size.invested > CAP_DAILY) continue            // ₹10L hard cap
    if (size.invested > b.cashDaily) continue
    b.cashDaily -= size.invested
    deployed.DAILY += size.invested
    if (!b.dailyStartedAt) b.dailyStartedAt = todayISO
    dailySyms.add(sym)
    b.open[key] = {
      sleeve: 'DAILY', id: key, baseId: s.id, symbol: sym, name: s.name || null,
      generator: s.generator, gen: s.label || s.generator,
      kind: 'CASH', direction: 'LONG', grade: s.grade || null,
      optType: null, entryPremium: null, optionPlay: null,
      qty: size.qty, lots: null, lotSize: null, notional: size.notional,
      entryPrice: s.entry, sl: s.sl, targets: s.targets, invested: size.invested,
      entryDate: todayISO, entryAt: nowISO, ltp: s.ltp ?? s.entry,
      dailyTake: DAILY_TAKE, dailyStop: DAILY_STOP,
      footprint: s.footprint || null, delivery: s.delivery ?? null, rr: s.rr ?? null,
      reason: s.reason || s.setupType || 'Safe daily-income — high-confidence long',
      unrealizedPnl: 0, unrealizedPct: 0,
    }
    entered.push(b.open[key]); dailyOpened++
  }

  computeStats(b, todayISO)
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

// month-to-date return vs a monthly % goal, with simple day-of-month pace.
function monthlyGoal(b, sleeve, capital, deployedVal, todayISO) {
  const g = SEGMENT_GOALS[sleeve]; if (!g) return null
  const mk = (todayISO || '').slice(0, 7)
  const realizedMTD = b.closed.filter(t => (t.sleeve || 'CASH') === sleeve && (t.exitDate || '').startsWith(mk)).reduce((a, t) => a + (t.realizedPnl || 0), 0)
  const mtdPnl = realizedMTD + (deployedVal.unreal || 0)                 // booked this month + open MTM
  const pct = +((mtdPnl / capital) * 100).toFixed(2)
  const dom = Math.max(1, parseInt((todayISO || '2026-01-01').slice(8, 10), 10))
  const frac = Math.min(1, dom / 30)                                     // rough month-elapsed fraction
  const expectMin = +(g.monthlyMin * frac).toFixed(2)
  const projected = frac > 0 ? +(pct / frac).toFixed(1) : null          // end-of-month projection
  const status = pct >= g.monthlyMax * frac ? 'ahead' : pct >= expectMin ? 'on pace' : 'behind'
  return { type: 'monthly', min: g.monthlyMin, max: g.monthlyMax, mtdPct: pct, mtdPnl: Math.round(mtdPnl), expectMin, projected, status }
}

function computeStats(b, todayISO) {
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
  const cashUnreal = cashOpen.reduce((a, p) => a + (p.unrealizedPnl || 0), 0)
  const foUnreal = foOpen.reduce((a, p) => a + (p.unrealizedPnl || 0), 0)
  // DAILY-INCOME sleeve (separate ₹10L, 30-day experiment)
  const dailyOpen = open.filter(p => p.sleeve === 'DAILY')
  const dailyVal = dailyOpen.reduce((a, p) => a + (p.invested || 0) + (p.unrealizedPnl || 0), 0)
  const dailyUnreal = dailyOpen.reduce((a, p) => a + (p.unrealizedPnl || 0), 0)
  const dailyClosed = b.closed.filter(t => t.sleeve === 'DAILY')
  const dWins = dailyClosed.filter(t => t.result === 'WIN').length
  const dailyTodayPnl = dailyClosed.filter(t => t.exitDate === todayISO).reduce((a, t) => a + (t.realizedPnl || 0), 0) + dailyUnreal
  b.stats = {
    equity: b.equity, cash: Math.round(b.cashCash + b.cashFO + b.cashDaily), investedOpen,
    cashSleeve: { capital: b.capitalCash, cash: Math.round(b.cashCash), equity: Math.round(b.cashCash + cashVal), pct: +(((b.cashCash + cashVal - b.capitalCash) / b.capitalCash) * 100).toFixed(2), open: cashOpen.length, closedPnl: Math.round(cashClosedPnl), goal: monthlyGoal(b, 'CASH', b.capitalCash, { unreal: cashUnreal }, todayISO) },
    foSleeve: { capital: b.capitalFO, cash: Math.round(b.cashFO), equity: Math.round(b.cashFO + foVal), pct: +(((b.cashFO + foVal - b.capitalFO) / b.capitalFO) * 100).toFixed(2), open: foOpen.length, closedPnl: Math.round(foClosedPnl), goal: monthlyGoal(b, 'FO', b.capitalFO, { unreal: foUnreal }, todayISO) },
    dailySleeve: {
      capital: b.capitalDaily, cash: Math.round(b.cashDaily), equity: Math.round(b.cashDaily + dailyVal),
      pct: +(((b.cashDaily + dailyVal - b.capitalDaily) / b.capitalDaily) * 100).toFixed(2),
      open: dailyOpen.length, closedCount: dailyClosed.length,
      winRate: dailyClosed.length ? +((dWins / dailyClosed.length) * 100).toFixed(1) : null,
      closedPnl: Math.round(dailyClosed.reduce((a, t) => a + t.realizedPnl, 0)),
      startedAt: b.dailyStartedAt, targetInr: DAILY_TARGET_INR, monitor: dailyMonitor(b, dailyClosed),
      goal: { type: 'daily', targetInr: DAILY_TARGET_INR, todayPnl: Math.round(dailyTodayPnl), status: dailyTodayPnl >= DAILY_TARGET_INR ? 'hit' : dailyTodayPnl > 0 ? 'progress' : 'flat' },
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
