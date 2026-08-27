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
const DAILY_TAKE = 1.8               // book at +1.8% — target now LARGER than the stop (positive expectancy)
const DAILY_STOP = 1.2               // cut at −1.2% (was −2.5%, which made R:R inverted → guaranteed losing math). R:R 1.5:1; at 56% win, expectancy ≈ +0.44%/trade instead of −0.26%. Liquid names hold a 1.2% stop.
const DAILY_MAX_HOLD = 1             // DAY TRADE: winners book at +target intraday, losers cut at −stop; anything unresolved squares off by the next session (no multi-day holds)
const DAILY_MAX_OPEN = 8             // fewer, higher-quality names (one loser can't tank the day)
const DAILY_POS_PCT = 10             // ~10% of the ₹10L pool per position
const DAILY_TARGET_INR = 10000       // daily profit aim (₹10k ≈ 1%)
// FRESH-START token for the Daily-Income sleeve. Bump this date to WIPE the daily book clean (remove
// all prior daily trades + P&L, reset capital to ₹10L, restart the 30-day monitor). Runs exactly once.
const DAILY_RESET_TOKEN = '2026-08-12'
const DAILY_MIN_CONF = 65            // confidence gate
// cash-intraday uses the institutional confluence generators: Volume Profile+Fib+VWAP, multi-gen
// confluence, momentum, volume accumulation, money-flow. LIQUID names only (no gapping micro-caps).
const DAILY_QUALITY_GENS = new Set(['confluence', 'vp_fib', 'momentum', 'vol_accum', 'money_flow'])
const DAILY_MIN_PRICE = 100          // skip penny/micro-caps (they gap through stops)
const DAILY_MIN_DELIV = 45           // volume/strong-hands confirmation (NSE delivery %)
const LOSS_COOLDOWN_DAYS = 5         // after a stop-out, DON'T re-enter the same name for a week — learn from the mistake
// CASH-book quality gate (from loss analysis): skip penny/illiquid names and don't CHASE an already-extended move
const CASH_MIN_PRICE = 50           // no sub-₹50 penny stocks (false-breakout prone)
const CASH_MAX_CHASE = 8            // skip if the stock already ran ≥8% today (chasing = buying the top)

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
const MAX_DEPLOY_PCT = 10             // cash: CONCENTRATE — up to ~10% (₹1L) per swing (fewer, bigger, quality names)
const CASH_MAX_OPEN = 12             // cap concurrent CASH swings at 12 → keeps room for fresh high-conviction setups
const CASH_MIN_DELIVERY = 45         // LIQUIDITY/quality floor for a cash swing when it's not an F&O-eligible name
const FO_DEPLOY_PCT = 10             // F&O/option: ≤10% of the F&O sleeve per position
const FO_STOCKOPT_CAP = 700000      // reserve ₹3L of the F&O sleeve for INDEX options + COMMODITIES (Gold/Crude/Silver)
const FNO_MARGIN = 0.20              // futures margin ≈ 20% of notional (paper model)
const FNO_MAX_MARGIN_PCT = 12        // skip an F&O trade whose smallest lot needs >12% of the F&O sleeve
const STOCK_OPT_PREM_PCT = 0.035    // est. monthly ATM stock-option premium ≈ 3.5% of spot (higher IV than index)
const FO_OPT_MAX_HOLD = 6           // TIME-STOP: never hold an F&O option/spread >6 days (theta bleed) — recycle
const BOOK_AT_PCT = 40              // book 50% of a position once it's up this much
const TRAIL_EXIT_PCT = 10          // after partial book, exit the runner if it gives back to this
const MAX_OPEN = 70                   // concurrent positions across both sleeves (options are cheap → many fit the F&O sleeve)

// ── MARKET SESSION (IST) — the paper book only executes fills during REAL market hours, squares off
// day-trades at 15:30, trades commodities until 23:30, and NEVER changes on weekends/holidays.
// Equity/F&O/Index: 09:15–15:30 IST · Commodities (Gold/Crude/Silver, MCX): 09:15–23:30 IST. ──
const NSE_HOLIDAYS = new Set([   // 2026 NSE trading holidays (extend as the official list is published)
  '2026-01-26', '2026-02-16', '2026-03-06', '2026-03-25', '2026-04-01', '2026-04-03', '2026-04-14',
  '2026-05-01', '2026-08-15', '2026-08-25', '2026-09-05', '2026-10-02', '2026-10-20', '2026-11-09',
  '2026-11-10', '2026-11-24', '2026-12-25',
])
export function marketSession(nowISO = new Date().toISOString()) {
  const ist = new Date(new Date(nowISO).getTime() + 5.5 * 3600 * 1000)   // shift so UTC getters read IST wall-clock
  const dow = ist.getUTCDay(), istDate = ist.toISOString().slice(0, 10)
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  const tradingDay = dow >= 1 && dow <= 5 && !NSE_HOLIDAYS.has(istDate)
  const OPEN = 555, EQ_CLOSE = 930, COMM_CLOSE = 1410   // 09:15, 15:30, 23:30 in minutes-of-day
  return {
    istDate, istMins: mins, tradingDay,
    equityOpen:        tradingDay && mins >= OPEN && mins <= EQ_CLOSE,       // NSE cash/F&O/index fills allowed
    commodityOpen:     tradingDay && mins >= OPEN && mins <= COMM_CLOSE,     // MCX commodity fills allowed
    equityClosedForDay: tradingDay && mins > EQ_CLOSE,                       // after 15:30 → square off day-trades
    dailyEntryOpen:    tradingDay && mins >= OPEN && mins <= EQ_CLOSE - 30,  // no NEW day-trades in the last 30 min
  }
}
// is a given position's market open right now? commodities run late; everything else on the equity clock.
const canFillNow = (pos, sess) => (pos.commodity || pos.kind === 'COMM') ? sess.commodityOpen : sess.equityOpen

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
  // RETROFIT HEDGE: any F&O OPTION opened before hedging existed is defined to capped risk NOW —
  // max loss/profit bounded at ±its current net cost (a long option can't lose more than premium
  // anyway; this just enforces the same defined-risk model the new debit spreads use). No new naked F&O.
  for (const p of Object.values(b.open)) {
    if (p && p.sleeve === 'FO' && p.kind === 'OPT' && !p.hedged && p.qty > 0) {
      p.hedged = true; p.netDebit = Math.round(p.invested / p.qty); p.longPrem = p.entryPremium ?? p.netDebit
      p.hedgeNote = `Retrofit to defined-risk — max loss capped at net ₹${p.invested}`
    }
  }
  // DAILY-INCOME FRESH START (one-time, token-guarded): the prior daily trades contained mistakes, so
  // REMOVE them all — wipe every daily open + closed trade, zero the sleeve's realised P&L, reset capital
  // to ₹10L, and restart the 30-day monitor. Rules (SYSTEM_RULES §3/§4b) are unchanged — only the slate.
  if (b.dailyResetToken !== DAILY_RESET_TOKEN) {
    for (const k of Object.keys(b.open)) if (b.open[k]?.sleeve === 'DAILY') delete b.open[k]
    b.closed = (b.closed || []).filter(t => t.sleeve !== 'DAILY')   // remove ALL previous daily trades
    if (b.realizedTotal) b.realizedTotal.DAILY = 0
    b.capitalDaily = CAP_DAILY
    b.cashDaily = CAP_DAILY
    b.dailyStartedAt = null                                          // set again on the first fresh daily trade
    b.dailyResetToken = DAILY_RESET_TOKEN
  }
  return b
}
const save = b => { b.updatedAt = new Date().toISOString(); try { writeFileSync(PATH, JSON.stringify(b, null, 2)) } catch {} }
const gradeRank = s => ({ 'A++': 5, 'A+': 4, 'A': 3, 'B': 2, 'C': 1 })[s.grade] || (s.generator === 'momentum' ? 2 : 2)

// position sizing — the engine decides quantity from risk (entry→SL) + deploy caps.
// F&O-eligible symbols are booked as F&O (lot-sized, leveraged) rather than cash.
// Wrap a naked long option into a HEDGED vertical debit spread: sell an OTM leg for ~50% credit.
// net debit (per unit) = long premium − short credit = the DEFINED max loss; the short leg also caps
// the upside at the spread width. invested = net debit × qty → the sleeve risks half a naked long.
function hedgeSpread(o) {
  const shortPrem = Math.round(o.entryPremium * 0.5)          // OTM leg sold ≈ half the ATM premium
  const netDebit = o.entryPremium - shortPrem                 // per-unit cost = max loss
  return {
    ...o, hedged: true, longPrem: o.entryPremium, shortPrem, netDebit,
    invested: Math.round(netDebit * o.qty),
    hedgeNote: `Hedged ${o.optType} debit spread — long ₹${o.entryPremium} / short ₹${shortPrem}; net debit ₹${netDebit} = defined max loss`,
  }
}

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
  // OPTION BUY (CE/PE) → ALWAYS HEDGED as a vertical DEBIT SPREAD: buy the ATM leg, sell an OTM leg
  // for ~50% credit. Net debit (= max loss) is HALF the naked premium, and it is DEFINED — the short
  // leg caps the downside AND the upside. No naked F&O in this book. (see hedgeSpread())
  if (sig.optType && sig.lot && sig.entryPremium) {
    const lot = sig.lot, prem = sig.entryPremium, perLot = prem * lot
    if (perLot > foMax) return null
    const lots = Math.max(1, Math.floor(Math.min(foRisk * 2, foDeploy) / perLot))
    const qty = lots * lot
    return hedgeSpread({ kind: 'OPT', sleeve: 'FO', optType: sig.optType, qty, lots, lotSize: lot, entryPremium: prem, notional: Math.round(entry * qty) })
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
    return hedgeSpread({ kind: 'OPT', sleeve: 'FO', optType, stockOption: true, qty, lots, lotSize, entryPremium: prem, notional: Math.round(entry * qty) })
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
    // DEFINED-RISK SPREAD P&L is driven by the UNDERLYING move, NOT by theta. A hedged debit spread
    // tracks price: reaching the target → +100% of the net debit, hitting the stop → −100%. This fixes
    // the old bug where a winning call (underlying UP) still showed a huge loss purely from time decay.
    const moveFav = bearish ? (pos.entryPrice - exitPrice) : (exitPrice - pos.entryPrice)   // rupees in our favour
    const debit = pos.netDebit ?? (pos.invested / pos.qty)   // per-unit net cost = the DEFINED max loss
    const t1 = pos.targets?.[0]?.price
    const upDist = Math.max(1e-6, Math.abs((t1 != null ? t1 - pos.entryPrice : pos.entryPrice * 0.03)))   // entry→target (rupees)
    const dnDist = Math.max(1e-6, Math.abs((pos.sl != null ? pos.entryPrice - pos.sl : pos.entryPrice * 0.02)))  // entry→stop (rupees)
    let val
    if (moveFav >= 0) val = debit + debit * Math.min(1, moveFav / upDist)   // toward +100% at target
    else val = debit * Math.max(0, 1 - (-moveFav) / dnDist)                 // toward −100% (0 value) at stop
    // slight time premium only while barely-moved and near expiry (kept small so it never dominates)
    return Math.round((val - debit) * pos.qty)
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

// ── LOSS-LEARNING: on every booked loss, run a PRO-TRADER POST-MORTEM — name exactly what we missed,
// WHY it happened, and the FIX — then keep it in memory (b.lossJournal + b.lossLessons) so the same
// mistake is avoided next time. This is how a real desk compounds: it doesn't repeat its errors. ──
function diagnoseLoss(rec) {
  const entry = rec.entryPrice || 0, sl = rec.sl || 0
  const stopWidthPct = entry && sl ? Math.abs(entry - sl) / entry * 100 : 0
  const held = rec.daysHeld
  const gave = (rec.peakPct ?? 0) >= 8   // was in decent profit, then lost it
  // Ordered most-specific → most-general; each returns {category, missed, why, fix}.
  if (gave)
    return { category: 'gave back an open gain', missed: 'a trailing stop / partial book while it was up', why: `ran to +${rec.peakPct}% then reversed all the way to the stop`, fix: 'trail sooner — book part at +40% and pull the stop to cost-to-cost so a winner never becomes a loser' }
  if (rec.averaged)
    return { category: 'averaged a loser that kept falling', missed: 'confirmation that the setup + company were truly strong before adding', why: 'added on the dip but price broke the widened structural stop anyway', fix: 'only average A++ names with delivery ≥55 AND price still above the higher-timeframe base — otherwise take the first stop' }
  if (rec.sleeve === 'DAILY')
    return { category: 'daily scalp stopped (intraday noise)', missed: 'a tighter confirmation trigger before entry', why: 'intraday chop hit the 2.5% stop before the move developed', fix: 'enter only on a reclaim of VWAP/POC with volume; skip the first 15 min noise' }
  if (entry && entry < 100)
    return { category: 'illiquid / low-price name', missed: 'a liquidity filter', why: 'thin low-priced name gapped straight through the stop', fix: 'keep the ≥₹50 floor and prefer F&O-eligible liquid names where the stop actually fills' }
  if (rec.generator === 'reversal')
    return { category: 'counter-trend reversal failed', missed: 'a structure shift (CHoCH/BOS) before fading the trend', why: 'faded a move that was still trending — the trend won', fix: 'take a reversal ONLY after a confirmed CHoCH and never when a trend desk is positioned the opposite way' }
  if (held != null && held <= 1 && stopWidthPct <= 5)
    return { category: 'false breakout (stopped ≤1 day)', missed: 'a confirmation close above the level + volume', why: 'entered the breakout before it held — it failed the next candle', fix: 'require a confirmed close beyond the level with above-average volume; enter the retest, not the first poke' }
  if (stopWidthPct > 8)
    return { category: 'stop too wide (loose risk)', missed: 'a tighter structural stop', why: `${stopWidthPct.toFixed(1)}% stop meant a normal pullback booked a big loss`, fix: 'anchor the stop to the nearest swing/LVN, size down to keep ~1% risk — never widen risk to fit a position' }
  return { category: 'no follow-through (trend/base failed)', missed: 'stronger confluence at entry', why: 'thesis stalled — the base/trend did not extend as expected', fix: 'demand one more confirming factor (VP node / FVG / structure) before committing capital' }
}
function recordLoss(b, rec) {
  b.lossCooldown ||= {}; b.lossLessons ||= {}; b.lossJournal ||= []
  const sym = rec.symbol || rec.underlying
  if (sym) b.lossCooldown[sym] = rec.exitDate || (rec.exitAt || '').slice(0, 10)
  const d = diagnoseLoss(rec)
  // aggregate lesson by category (with the fix attached)
  const L = (b.lossLessons[d.category] ||= { count: 0, avgLossPct: 0, lastSymbol: null, lastDate: null, fix: d.fix })
  L.avgLossPct = +(((L.avgLossPct * L.count) + (rec.realizedPct || 0)) / (L.count + 1)).toFixed(2)
  L.count++; L.lastSymbol = sym; L.lastDate = rec.exitDate || null; L.fix = d.fix
  // per-trade post-mortem, newest first, capped — the searchable "what went wrong" log
  b.lossJournal.unshift({
    date: rec.exitDate || (rec.exitAt || '').slice(0, 10), symbol: sym, sleeve: rec.sleeve || 'CASH',
    generator: rec.generator || null, grade: rec.grade || null, lossPct: rec.realizedPct ?? null,
    category: d.category, missed: d.missed, why: d.why, fix: d.fix,
  })
  if (b.lossJournal.length > 80) b.lossJournal = b.lossJournal.slice(0, 80)
}

// Reconcile the book with the ledger: close finished trades, open new ones, mark-to-market.
// current book equity + per-sleeve equity from the live state (same formula computeStats uses).
function bookEquity(b) {
  const open = Object.values(b.open || {})
  return Math.round((b.cashCash || 0) + (b.cashFO || 0) + (b.cashDaily || 0) + open.reduce((a, p) => a + (p.invested || 0) + (p.unrealizedPnl || 0), 0))
}
function sleeveEquity(b, sl) {
  const cash = sl === 'CASH' ? b.cashCash : sl === 'FO' ? b.cashFO : b.cashDaily
  return Math.round((cash || 0) + Object.values(b.open || {}).filter(p => p.sleeve === sl).reduce((a, p) => a + (p.invested || 0) + (p.unrealizedPnl || 0), 0))
}

// ── DAILY ROLLOVER: at the first scan of a new calendar day, write the finished day to the DAILY LOG
// BOOK — start capital, end capital, P&L + win-rate per sleeve, and that day's trades + mistakes. Unlike
// the monthly rollover it does NOT reset capital (capital carries within the month); it only RECORDS. ──
function dailyRollover(b, todayISO) {
  const day = todayISO
  if (!day) return null
  if (b.dayKey == null) {   // first ever run — anchor the day baseline, no log yet
    b.dayKey = day; b.dayOpenEquity = bookEquity(b)
    b.dayOpenSleeve = { CASH: sleeveEquity(b, 'CASH'), FO: sleeveEquity(b, 'FO'), DAILY: sleeveEquity(b, 'DAILY') }
    return null
  }
  if (day === b.dayKey) return null   // same day — nothing to do
  const prev = b.dayKey
  const endEq = bookEquity(b)
  const startEq = Math.round(b.dayOpenEquity ?? CAPITAL)
  const capMap = { CASH: CAP_CASH, FO: CAP_FO, DAILY: CAP_DAILY }
  const closedPrev = b.closed.filter(t => (t.exitDate || '') === prev)
  const wasTradingDay = marketSession(prev + 'T06:00:00.000Z').tradingDay
  // roll the day baseline forward regardless (so tomorrow measures from today's close)
  const advance = () => { b.dayKey = day; b.dayOpenEquity = endEq; b.dayOpenSleeve = { CASH: sleeveEquity(b, 'CASH'), FO: sleeveEquity(b, 'FO'), DAILY: sleeveEquity(b, 'DAILY') } }
  if (!wasTradingDay && closedPrev.length === 0) { advance(); return null }   // skip empty weekend/holiday entries
  const snap = { day: prev, startCapital: startEq, endCapital: endEq, pnl: endEq - startEq, pct: +(((endEq - startEq) / (startEq || CAPITAL)) * 100).toFixed(2), sleeves: {}, trades: [], mistakes: [] }
  for (const sl of ['CASH', 'FO', 'DAILY']) {
    const s0 = Math.round(b.dayOpenSleeve?.[sl] ?? capMap[sl]); const s1 = sleeveEquity(b, sl)
    const dec = closedPrev.filter(t => (t.sleeve || 'CASH') === sl && !t.partial && (t.result === 'WIN' || t.result === 'LOSS'))
    const wins = dec.filter(t => t.result === 'WIN').length
    snap.sleeves[sl] = { startCapital: s0, endCapital: s1, pnl: s1 - s0, trades: dec.length, winRate: dec.length ? +((wins / dec.length) * 100).toFixed(1) : null }
  }
  snap.trades = closedPrev.map(t => ({ sym: t.symbol, sleeve: t.sleeve, dir: t.direction, result: t.result, pnl: Math.round(t.realizedPnl || 0), pct: t.realizedPct, partial: !!t.partial }))
  const dayLosses = (b.lossJournal || []).filter(l => (l.date || '') === prev)
  const byCat = {}; for (const l of dayLosses) { (byCat[l.category] ||= { category: l.category, count: 0, fix: l.fix }).count++ }
  snap.mistakes = Object.values(byCat).sort((a, z) => z.count - a.count).slice(0, 6)
  b.dailyLog = (b.dailyLog || []); b.dailyLog.push(snap)
  if (b.dailyLog.length > 180) b.dailyLog = b.dailyLog.slice(-180)   // ~6 months of trading days
  advance()
  return snap
}

// ── MONTHLY ROLLOVER: at the first scan of a new month, write the finished month to the LOG BOOK
// (start capital, end capital, P&L + win-rate per sleeve, that month's trades, and the major mistakes),
// then START FRESH — all three sleeves reset to ₹10L, flat, clean. Learning (lossLessons/journal)
// PERSISTS across months so the system keeps improving. Runs exactly once per month. ──
function monthlyRollover(b, todayISO) {
  const curMonth = (todayISO || '').slice(0, 7)
  if (!curMonth) return null
  if (b.monthKey == null) { b.monthKey = curMonth; return null }   // first ever run — just anchor, no rollover
  if (curMonth === b.monthKey) return null                          // same month — nothing to do
  const prev = b.monthKey
  const capMap = { CASH: CAP_CASH, FO: CAP_FO, DAILY: CAP_DAILY }
  const snap = { month: prev, startCapital: CAPITAL, endCapital: 0, pnl: 0, sleeves: {}, trades: [], mistakes: [], closedAt: todayISO }
  for (const sl of ['CASH', 'FO', 'DAILY']) {
    const closedMonth = b.closed.filter(t => (t.sleeve || 'CASH') === sl && (t.exitDate || '').startsWith(prev))
    const realizedMonth = closedMonth.reduce((a, t) => a + (t.realizedPnl || 0), 0)
    const openVal = Object.values(b.open).filter(p => p.sleeve === sl).reduce((a, p) => a + (p.unrealizedPnl || 0), 0)  // flatten open at last mark
    const pnl = realizedMonth + openVal
    const dec = closedMonth.filter(t => !t.partial && (t.result === 'WIN' || t.result === 'LOSS'))
    const wins = dec.filter(t => t.result === 'WIN').length
    snap.sleeves[sl] = { startCapital: capMap[sl], endCapital: Math.round(capMap[sl] + pnl), pnl: Math.round(pnl), pct: +((pnl / capMap[sl]) * 100).toFixed(2), trades: dec.length, winRate: dec.length ? +((wins / dec.length) * 100).toFixed(1) : null }
    snap.pnl += pnl
  }
  snap.endCapital = Math.round(CAPITAL + snap.pnl)
  snap.pct = +((snap.pnl / CAPITAL) * 100).toFixed(2)
  // compact trade log for the month (so the trades are kept, not the whole object)
  snap.trades = b.closed.filter(t => (t.exitDate || '').startsWith(prev)).map(t => ({ sym: t.symbol, sleeve: t.sleeve, dir: t.direction, result: t.result, pnl: Math.round(t.realizedPnl || 0), pct: t.realizedPct, entryDate: t.entryDate, exitDate: t.exitDate, partial: !!t.partial }))
  // major mistakes of the month (from the per-trade post-mortems dated in that month)
  const monthLosses = (b.lossJournal || []).filter(l => (l.date || '').startsWith(prev))
  const byCat = {}
  for (const l of monthLosses) { (byCat[l.category] ||= { category: l.category, count: 0, fix: l.fix }); byCat[l.category].count++ }
  snap.mistakes = Object.values(byCat).sort((a, z) => z.count - a.count).slice(0, 8)
  b.monthlyLog = (b.monthlyLog || []); b.monthlyLog.push(snap)
  if (b.monthlyLog.length > 36) b.monthlyLog = b.monthlyLog.slice(-36)   // keep 3 years
  // FRESH START — flat, ₹10L each. Learning persists; capital/positions/realised reset.
  b.open = {}
  b.closed = []
  b.realizedTotal = { CASH: 0, FO: 0, DAILY: 0 }
  b.capitalCash = CAP_CASH; b.capitalFO = CAP_FO; b.capitalDaily = CAP_DAILY
  b.cashCash = CAP_CASH; b.cashFO = CAP_FO; b.cashDaily = CAP_DAILY
  b.dailyStartedAt = null
  b.startedAt = todayISO
  b.monthKey = curMonth
  // the new month starts flat at ₹30L → reset the DAILY baseline so day-1 measures from ₹30L
  b.dayKey = todayISO; b.dayOpenEquity = CAPITAL
  b.dayOpenSleeve = { CASH: CAP_CASH, FO: CAP_FO, DAILY: CAP_DAILY }
  return snap
}

export function syncTradeBook(ledger, closedNow, todayISO, nowISO = new Date().toISOString(), fnoLots = {}, genWinRates = {}) {
  const b = loadBook()
  if (!b.startedAt) b.startedAt = todayISO
  const rolledDay = dailyRollover(b, todayISO)   // new day? → log the finished day (records only, no reset)
  if (rolledDay) console.log(`DAILY LOG: ${rolledDay.day} — ₹${rolledDay.startCapital.toLocaleString('en-IN')} → ₹${rolledDay.endCapital.toLocaleString('en-IN')} (${rolledDay.pnl >= 0 ? '+' : ''}${rolledDay.pnl})`)
  const rolled = monthlyRollover(b, todayISO)   // new month? → log the old month + fresh ₹10L start
  if (rolled) console.log(`MONTHLY ROLLOVER: ${rolled.month} closed at ₹${rolled.endCapital.toLocaleString('en-IN')} (${rolled.pct >= 0 ? '+' : ''}${rolled.pct}%). New month starts fresh at ₹30L.`)
  const sess = marketSession(nowISO)   // IST market session — gates every fill (open/close/square-off)
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
    // SELF-HEAL HEDGE (belt-and-suspenders over the load-time retrofit): any F&O option still naked is
    // converted to defined-risk here — this loop runs every scan on every open position, so nothing
    // stays naked even if it slipped through opening. netDebit floored to avoid a 0-cost no-op.
    if (pos.sleeve === 'FO' && pos.kind === 'OPT' && !pos.hedged) {
      pos.hedged = true
      pos.netDebit = Math.max(1, Math.round((pos.invested || 0) / Math.max(1, pos.qty || 1)))
      pos.longPrem = pos.entryPremium ?? pos.netDebit
      pos.hedgeNote = pos.hedgeNote || `Auto-hedged to defined-risk — max loss capped at net ₹${pos.invested}`
    }

    // ── DAILY INCOME sleeve (liquid cash, VP+Fib+Momentum+Volume entries): book the quick gain at
    //    +target; on a loss, exit only at the STRUCTURAL SL (below VP support/swing low) — NOT a blind
    //    fixed % that micro-caps gap straight through. Hold a good setup up to DAILY_MAX_HOLD days. ──
    if (pos.sleeve === 'DAILY') {
      const live = ledger.active[id.slice(6)]          // strip "daily:" prefix → base signal id
      const held = daysBetween(pos.entryDate, todayISO)
      const ltp = live?.ltp ?? pos.ltp ?? pos.entryPrice
      const pnl = pnlFor(pos, ltp, false, held)        // daily = long cash
      const retPct = pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0
      let result = null, why = null
      const carried = pos.entryDate < todayISO          // survived into a new session → must be squared flat
      if (sess.equityOpen) {                            // intraday take/stop fills only during 09:15–15:30 IST
        if (retPct >= DAILY_TAKE) { result = 'WIN'; why = `Booked +${retPct}% (target)` }
        else if (retPct <= -DAILY_STOP) { result = 'LOSS'; why = `Stopped at ${retPct}% (tight intraday stop)` }
      }
      if (!result && sess.tradingDay && (sess.equityClosedForDay || carried)) {   // 15:30 SQUARE-OFF — day-trades never carry overnight (only on a trading day; no changes on holidays)
        result = retPct >= 0 ? 'WIN' : 'LOSS'
        why = `Squared off at 15:30 close at ${retPct >= 0 ? '+' : ''}${retPct}% (intraday — no overnight hold)`
      }
      if (!result) {                                    // market shut or still working → mark to market, hold
        pos.ltp = ltp; pos.unrealizedPnl = pnl; pos.unrealizedPct = retPct; continue
      }
      b.cashDaily += pos.invested + pnl; bankRealised('DAILY', pnl)
      const squaredOff = !sess.equityOpen               // exit came from the 15:30 close, not an intraday fill
      const exitAt = squaredOff ? `${todayISO}T10:00:00.000Z` : nowISO   // 15:30 IST = 10:00 UTC
      const rec = { ...pos, exitPrice: ltp, exitDate: todayISO, exitAt, result, maxTarget: result === 'WIN' ? 1 : 0, realizedPnl: pnl, realizedPct: retPct, daysHeld: held, expectationMatch: why, failureReason: result === 'LOSS' ? why : null, unrealizedPnl: undefined, unrealizedPct: undefined }
      if (result === 'LOSS') recordLoss(b, rec)
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
      // MARKET-HOURS GATE: only execute fills (average / stop / partial / trail) while THIS position's
      // market is open (equity 09:15–15:30, commodities till 23:30). Outside hours — and on weekends/
      // holidays — we just mark to market and HOLD. You cannot exit a trade when the market is shut.
      if (!canFillNow(pos, sess)) continue
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
      // ── HONOR THE STOP (applies to CASH + F&O): if price has hit the SL, EXIT NOW — never let a
      // position sit past its stop. Top-quality cash names get ONE average-in above (which widens the
      // SL); everything else — and any averaged name that breaks its widened SL — is stopped out here. ──
      const hitStop = bearish ? (pos.ltp >= pos.sl) : (pos.ltp <= pos.sl)
      if (pos.sl && hitStop) {
        const pnl = pnlFor(pos, pos.sl, bearish, held)
        if (pos.sleeve === 'FO') b.cashFO += pos.invested + pnl; else b.cashCash += pos.invested + pnl
        bankRealised(pos.sleeve, pnl)
        const slRec = { ...pos, exitPrice: pos.sl, exitDate: todayISO, exitAt: nowISO, result: pnl >= 0 ? 'WIN' : 'LOSS', maxTarget: 0, realizedPnl: pnl, realizedPct: pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0, daysHeld: held, expectationMatch: `Exited at stop-loss ₹${pos.sl}${pos.averaged ? ' (widened after averaging)' : ''}`, failureReason: pnl < 0 ? 'Hit stop-loss — exited per plan' : null, unrealizedPnl: undefined, unrealizedPct: undefined }
        if (slRec.result === 'LOSS') recordLoss(b, slRec)
        b.closed.push(slRec); exited.push(slRec); delete b.open[id]
        continue
      }
      // ── TIME-STOP for F&O OPTIONS: a monthly option/spread must NOT be held for weeks — theta bleeds
      // it even when the direction is right. Recycle after FO_OPT_MAX_HOLD days at the current mark. ──
      if (pos.kind === 'OPT' && held >= FO_OPT_MAX_HOLD) {
        const pnl = pnlFor(pos, pos.ltp, bearish, held)
        if (pos.sleeve === 'FO') b.cashFO += pos.invested + pnl; else b.cashCash += pos.invested + pnl
        bankRealised(pos.sleeve, pnl)
        const tsRec = { ...pos, exitPrice: pos.ltp, exitDate: todayISO, exitAt: nowISO, result: pnl >= 0 ? 'WIN' : 'LOSS', maxTarget: 0, realizedPnl: pnl, realizedPct: pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0, daysHeld: held, expectationMatch: `Time-stop: option held ${held}d (>${FO_OPT_MAX_HOLD}d) — recycled at ₹${pos.ltp} to stop theta bleed`, failureReason: pnl < 0 ? `Time-stop after ${held} days — option decayed; recycled` : null, unrealizedPnl: undefined, unrealizedPct: undefined }
        if (tsRec.result === 'LOSS') recordLoss(b, tsRec)
        b.lossCooldown ||= {}; b.lossCooldown[pos.symbol || pos.underlying] = todayISO   // cool off — don't re-open the same option next scan (prevents churn + stale-entry re-buy)
        b.closed.push(tsRec); exited.push(tsRec); delete b.open[id]
        continue
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
        if (trRec.result === 'LOSS') recordLoss(b, trRec)
        b.closed.push(trRec); exited.push(trRec)
        delete b.open[id]
      }
      continue
    }
    const c = closedById[id]                                    // closed → realise P&L + journal
    if (!sess.tradingDay) continue                              // holiday/weekend → never change the book; defer this close to the next session
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
    if (result === 'LOSS') recordLoss(b, fRec)
    b.closed.push(fRec); exited.push(fRec)
    delete b.open[id]
  }
  if (b.closed.length > 4000) b.closed = b.closed.slice(-4000)

  // 2) OPEN new trades. Two separate pools: cash trades draw the ₹10L cash sleeve, F&O + options
  // draw the dedicated ₹10L F&O sleeve — so F&O/options can never be crowded out by cash.
  const isIdxOpt = s => s.optType && (s.symbol === 'NIFTY' || s.symbol === 'BANKNIFTY')
  // commodities + index options get top priority so they always get F&O capital (never crowded out by stock options)
  const catRank = s => (s.commodity || isIdxOpt(s)) ? 4 : s.optType ? 3 : (s.generator === 'fno' || s.lot || fnoLots[s.symbol] || fnoLots[s.underlying]) ? 2 : 1
  // "reserved" = any F&O that is NOT a commodity and NOT an index → capped so index+commodities keep ₹3L
  const isReservedFO = (s, size) => size.sleeve === 'FO' && !s.commodity && s.symbol !== 'NIFTY' && s.symbol !== 'BANKNIFTY'
  // only block ids already OPEN — NOT closed ones (a symbol must be re-tradable after its trade closes;
  // ids are generator:symbol, so keeping closed ids here permanently barred re-entry).
  const seen = new Set(Object.keys(b.open))
  const openSyms = new Set(Object.values(b.open).filter(p => p.sleeve !== 'DAILY').map(p => p.symbol))    // one live cash/F&O position per underlying (daily sleeve tracked separately)
  // WE DO NOT SUPPRESS DESKS. Every desk keeps trading — a weak desk is FIXED by learning from each
  // loss (post-mortem below), by the reversal↔trend contradiction filter, and by the 5-day name
  // cooldown — NOT by benching the whole desk. `genWinRates` is used only to RANK (best-proven desks
  // sort first when capital is tight), never to block. Confidence still weights the sort.
  const deskEdge = s => { const r = genWinRates[s.generator]; return (r && r.decided >= 20) ? r.winRate : 55 }
  const inCooldown = sym => { const d = b.lossCooldown?.[sym]; return d && daysBetween(d, todayISO) < LOSS_COOLDOWN_DAYS }   // don't re-enter a name that just stopped us out
  const cands = Object.values(ledger.active)
    .filter(s => s.status === 'open' && !seen.has(s.id) && s.openedAt >= b.startedAt && s.entry && s.sl && Array.isArray(s.targets) && s.targets.length)
    .sort((a, z) => catRank(z) - catRank(a) || gradeRank(z) - gradeRank(a) || (z.footprint?.score || 0) - (a.footprint?.score || 0) || (deskEdge(z) - deskEdge(a)) || (z.confidence || 0) - (a.confidence || 0))
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
  // non-commodity / non-index F&O already deployed — capped so index+commodities keep ₹3L of room
  let foStockOpt = Object.values(b.open).filter(p => p.sleeve === 'FO' && !p.commodity && p.symbol !== 'NIFTY' && p.symbol !== 'BANKNIFTY').reduce((a, p) => a + (p.invested || 0), 0)
  let opened = 0
  let cashOpenCount = Object.values(b.open).filter(p => p.sleeve === 'CASH').length
  // CASH SWING QUALITY GATE: concentrate on LIQUID, high-conviction names — F&O-eligible OR strong delivery
  // (not illiquid micro-caps that gap), AND grade A+/A++ or high confidence. Blocks the weak micro-cap churn.
  const liquidQualityCash = s => {
    const sym = s.symbol || s.underlying
    const liquid = !!(fnoLots[sym] || fnoLots[s.underlying]) || (s.delivery ?? 0) >= CASH_MIN_DELIVERY
    const quality = s.grade === 'A++' || s.grade === 'A+' || (s.confidence || 0) >= 72   // raised 65→72: fewer, higher-conviction cash swings
    return liquid && quality
  }
  const IDX = new Set(['NIFTY', 'BANKNIFTY', 'SENSEX', 'MIDCPNIFTY', 'FINNIFTY', 'NIFTYNXT50', 'BANKEX'])
  for (const s of cands) {
    if (Object.keys(b.open).length >= MAX_OPEN) break
    const sym = s.symbol || s.underlying
    // LONG-ONLY backstop: never TAKE a short on an F&O stock, index, or commodity (user rule).
    if ((s.direction === 'SHORT' || s.direction === 'BEARISH') && (fnoLots[sym] || fnoLots[s.underlying] || s.commodity || IDX.has(String(sym || '').toUpperCase()))) continue
    if (openSyms.has(sym)) continue                                     // already holding this stock
    if (inCooldown(sym)) continue                                       // recently stopped out → cooldown (don't repeat)
    const size = sizeTrade(s, fnoLots)
    if (!size) continue
    // MARKET-HOURS GATE: only OPEN a new trade when that segment's market is live (commodities till 23:30,
    // everything else 09:15–15:30). No new fills off-session / on holidays.
    if (!((s.commodity || size.kind === 'COMM') ? sess.commodityOpen : sess.equityOpen)) continue
    if (size.sleeve === 'CASH') {
      if (s.entry < CASH_MIN_PRICE || (s.changePct || 0) >= CASH_MAX_CHASE) continue  // no pennies, no chasing extended moves
      if (cashOpenCount >= CASH_MAX_OPEN) continue                       // CONCENTRATE — cap swings, keep room for the best setups
      if (!liquidQualityCash(s)) continue                               // LIQUID + quality only (no illiquid micro-caps)
    }
    if (deployed[size.sleeve] + size.invested > CAPOF[size.sleeve]) continue   // ₹10L sleeve cap
    const stockOpt = isReservedFO(s, size)
    if (stockOpt && foStockOpt + size.invested > FO_STOCKOPT_CAP) continue      // reserve F&O room for index/commodities
    const pool = size.sleeve === 'FO' ? b.cashFO : b.cashCash
    if (size.invested > pool) continue
    openSyms.add(sym)
    if (size.sleeve === 'CASH') cashOpenCount++
    if (stockOpt) foStockOpt += size.invested
    deployed[size.sleeve] += size.invested
    if (size.sleeve === 'FO') b.cashFO -= size.invested; else b.cashCash -= size.invested
    b.open[s.id] = {
      sleeve: size.sleeve,
      id: s.id, symbol: s.symbol || s.underlying, name: s.name || null, generator: s.generator, gen: s.label || s.generator,
      kind: size.kind, direction: s.direction || 'LONG', grade: s.grade || null, confidence: s.confidence ?? s.confluenceScore ?? null,
      optType: size.optType || null, entryPremium: size.entryPremium || null, optionPlay: s.optionPlay || null,
      // CARRY the hedge fields from sizeTrade — dropping them left F&O options stored as NAKED (bug)
      hedged: size.hedged || false, netDebit: size.netDebit ?? null, longPrem: size.longPrem ?? null, shortPrem: size.shortPrem ?? null, hedgeNote: size.hedgeNote || null, stockOption: size.stockOption || false, commodity: size.commodity || s.commodity || false,
      qty: size.qty, lots: size.lots, lotSize: size.lotSize, notional: size.notional,
      entryPrice: s.entry, sl: s.sl, targets: s.targets, invested: size.invested,
      entryDate: todayISO, entryAt: nowISO, ltp: s.ltp ?? s.entry,   // entryDate = actual entry day (not the signal's first-seen date → prevents instant time-stop churn)
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
  // ONE day-trade per name PER DAY — never re-buy a name already day-traded today (stops the same-stock
  // churn, e.g. booking +1.5% on TORNTPHARM 8× in a session). It's a day-trade book, not a scalping loop.
  const dailyTradedToday = new Set(b.closed.filter(t => t.sleeve === 'DAILY' && t.exitDate === todayISO).map(t => t.symbol || t.underlying))
  const safeScore = s => gradeRank(s) * 25 + (s.confidence || s.confluenceScore || 0) + ((s.delivery || 0) / 2) + ((s.footprint && !s.footprint.weak) ? 15 : 0)
  const dailyCands = cands
    .filter(s => s.entry && s.sl && s.entry > s.sl && !s.commodity && !s.optType   // liquid cash equities only
      && (s.direction || 'LONG') !== 'SHORT' && (s.direction || 'LONG') !== 'BEARISH'
      && DAILY_QUALITY_GENS.has(s.generator)                       // VP+Fib+VWAP / confluence / momentum / volume / money-flow
      && s.entry >= DAILY_MIN_PRICE
      && (fnoLots[s.symbol] || fnoLots[s.underlying])              // LIQUID: F&O-eligible names only (no micro-caps that gap −5%)
      && (s.grade === 'A++' || s.grade === 'A+' || s.grade === 'A' || (s.confidence || 0) >= DAILY_MIN_CONF))
    .sort((a, z) => safeScore(z) - safeScore(a))
  // GOAL-AWARE: once today's Daily-Income P&L (booked + open) has reached the ₹10k goal, STOP opening
  // new day-trades — the specific daily goal is in hand, so don't add fresh risk. (Existing trades run on.)
  const dailyTodayPnl = b.closed.filter(t => t.sleeve === 'DAILY' && t.exitDate === todayISO).reduce((a, t) => a + (t.realizedPnl || 0), 0)
    + Object.values(b.open).filter(p => p.sleeve === 'DAILY').reduce((a, p) => a + (p.unrealizedPnl || 0), 0)
  const dailyGoalHit = dailyTodayPnl >= DAILY_TARGET_INR
  let dailyOpened = 0
  for (const s of dailyCands) {
    if (!sess.dailyEntryOpen) break                                     // day-trades only 09:15–15:00 IST (need time to manage/exit before 15:30)
    if (dailyGoalHit) break                                             // ₹10k day-goal reached → stop adding day-trades
    if ((deployed.DAILY || 0) >= CAP_DAILY) break
    if (Object.keys(b.open).filter(k => k.startsWith('daily:')).length >= DAILY_MAX_OPEN) break
    const sym = s.symbol || s.underlying
    if (dailySyms.has(sym)) continue
    if (dailyTradedToday.has(sym)) continue                            // already day-traded today → no re-entry (no churn)
    if (inCooldown(sym)) continue                                       // recently stopped out → cooldown
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
      kind: 'CASH', direction: 'LONG', grade: s.grade || null, confidence: s.confidence ?? s.confluenceScore ?? null,
      optType: null, entryPremium: null, optionPlay: null,
      qty: size.qty, lots: null, lotSize: null, notional: size.notional,
      entryPrice: s.entry, sl: s.sl, targets: s.targets, invested: size.invested,
      entryDate: todayISO, entryAt: nowISO, ltp: s.ltp ?? s.entry,
      dailyTake: DAILY_TAKE, structuralSL: s.sl,
      footprint: s.footprint || null, delivery: s.delivery ?? null, rr: s.rr ?? null,
      reason: s.reason || s.setupType || 'Safe daily-income — high-confidence long',
      unrealizedPnl: 0, unrealizedPct: 0,
    }
    entered.push(b.open[key]); dailyOpened++
  }

  // ══ AUTO-REMEDIATION: the book self-CORRECTS every scan — it doesn't just detect a rule breach, it
  //    FIXES it before saving, so a violation cannot persist even one cycle. (Belt-and-suspenders over
  //    the structural prevention + the self-audit.) ══
  // (1) Any Daily-Income trade still open after 15:30 → force square-off NOW (day-trades are never carried).
  if (sess.tradingDay && sess.equityClosedForDay) {
    for (const id of Object.keys(b.open)) {
      const pos = b.open[id]; if (pos.sleeve !== 'DAILY') continue
      const held = daysBetween(pos.entryDate, todayISO)
      const px = pos.ltp ?? pos.entryPrice
      const pnl = pnlFor(pos, px, false, held)
      b.cashDaily += pos.invested + pnl; bankRealised('DAILY', pnl)
      const rec = { ...pos, exitPrice: px, exitDate: todayISO, exitAt: `${todayISO}T10:00:00.000Z`, result: pnl >= 0 ? 'WIN' : 'LOSS', maxTarget: pnl >= 0 ? 1 : 0, realizedPnl: pnl, realizedPct: pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0, daysHeld: held, expectationMatch: 'Auto-squared at 15:30 close (remediation backstop)', failureReason: pnl < 0 ? 'Squared at 15:30 close' : null, unrealizedPnl: undefined, unrealizedPct: undefined }
      if (rec.result === 'LOSS') recordLoss(b, rec)
      b.closed.push(rec); exited.push(rec); delete b.open[id]
      console.log(`[REMEDIATE] force-squared stray daily ${pos.symbol} at 15:30 close`)
    }
  }
  // (2) Any sleeve over its ₹10L cap → trim the NEWEST positions until back under cap (can't sit over-deployed).
  for (const sl of ['CASH', 'FO', 'DAILY']) {
    const cap = { CASH: CAP_CASH, FO: CAP_FO, DAILY: CAP_DAILY }[sl]
    let dep = Object.values(b.open).filter(p => p.sleeve === sl).reduce((a, p) => a + (p.invested || 0), 0)
    if (dep <= cap) continue
    const newest = Object.entries(b.open).filter(([, p]) => p.sleeve === sl).sort((a, z) => String(z[1].entryAt || '').localeCompare(String(a[1].entryAt || '')))
    for (const [id, pos] of newest) {
      if (dep <= cap) break
      const bearish = pos.direction === 'SHORT' || pos.direction === 'BEARISH' || pos.optType === 'PE'
      const held = daysBetween(pos.entryDate, todayISO)
      const px = pos.ltp ?? pos.entryPrice
      const pnl = pnlFor(pos, px, bearish, held)
      if (pos.sleeve === 'FO') b.cashFO += pos.invested + pnl; else if (pos.sleeve === 'DAILY') b.cashDaily += pos.invested + pnl; else b.cashCash += pos.invested + pnl
      bankRealised(pos.sleeve, pnl)
      const rec = { ...pos, exitPrice: px, exitDate: todayISO, exitAt: nowISO, result: pnl >= 0 ? 'WIN' : 'LOSS', maxTarget: 0, realizedPnl: pnl, realizedPct: pos.invested ? +((pnl / pos.invested) * 100).toFixed(2) : 0, daysHeld: held, expectationMatch: 'Trimmed — sleeve was over its ₹10L cap (remediation)', failureReason: null, unrealizedPnl: undefined, unrealizedPct: undefined }
      b.closed.push(rec); exited.push(rec); delete b.open[id]; dep -= (pos.invested || 0)
      console.log(`[REMEDIATE] trimmed ${pos.symbol} — ${sl} was over ₹10L cap`)
    }
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

// ── SELF-VERIFICATION: runs every scan and flags data-integrity / P&L bugs BEFORE the user sees them.
// This is the guard against the class of bug that mis-marked winning options as losses. Any issue is
// surfaced in stats.integrity + console so it's caught the same day. ──
function checkIntegrity(b, todayISO) {
  const issues = []
  const add = (level, code, msg, detail) => issues.push({ level, code, msg, detail: detail ?? null })
  const sess = marketSession()
  const CAP = { CASH: b.capitalCash, FO: b.capitalFO, DAILY: b.capitalDaily }
  const deployed = { CASH: 0, FO: 0, DAILY: 0 }
  for (const p of Object.values(b.open)) deployed[p.sleeve] = (deployed[p.sleeve] || 0) + (p.invested || 0)
  // 1) CASH INVARIANT per sleeve: cashX == capitalX + realizedTotalX − deployedX
  for (const sl of ['CASH', 'FO', 'DAILY']) {
    const cashField = sl === 'CASH' ? b.cashCash : sl === 'FO' ? b.cashFO : b.cashDaily
    const expect = (CAP[sl] || 0) + ((b.realizedTotal?.[sl]) || 0) - (deployed[sl] || 0)
    if (Math.abs((cashField || 0) - expect) > 5) add('CRITICAL', 'cash-drift', `${sl} cash drift`, `cash ${Math.round(cashField)} vs expected ${Math.round(expect)} (Δ${Math.round(cashField - expect)})`)
    // 2) HARD ₹10L CAP
    if ((deployed[sl] || 0) > (CAP[sl] || 0) + 1) add('CRITICAL', 'over-cap', `${sl} deployed over its ₹10L cap`, `deployed ${Math.round(deployed[sl])} > cap ${CAP[sl]}`)
  }
  // 3) EQUITY finite
  if (!Number.isFinite(b.equity)) add('CRITICAL', 'equity-nan', 'equity is not a finite number', String(b.equity))
  // per-position checks
  for (const p of Object.values(b.open)) {
    const bearish = p.direction === 'SHORT' || p.direction === 'BEARISH' || p.optType === 'PE'
    const moveFavPct = p.entryPrice ? ((bearish ? (p.entryPrice - p.ltp) : (p.ltp - p.entryPrice)) / p.entryPrice) * 100 : 0
    const uPct = p.unrealizedPct ?? 0
    // 4) P&L CONTRADICTS PRICE DIRECTION (the theta-bug signature)
    if (moveFavPct >= 1 && uPct < -5) add('HIGH', 'pnl-vs-direction', `${p.symbol}: price moved FAVOURABLY +${moveFavPct.toFixed(1)}% but P&L shows ${uPct}%`, `${p.kind} ${p.optType || ''} entry ${p.entryPrice} ltp ${p.ltp}`)
    if (moveFavPct <= -1 && uPct > 5) add('HIGH', 'pnl-vs-direction', `${p.symbol}: price moved AGAINST ${moveFavPct.toFixed(1)}% but P&L shows +${uPct}%`, `${p.kind} ${p.optType || ''} entry ${p.entryPrice} ltp ${p.ltp}`)
    // 5) DEFINED-RISK bound: an option can't be worse than −100% (net debit) or better than +100%
    if (p.kind === 'OPT' && (uPct < -100.5 || uPct > 100.5)) add('HIGH', 'opt-bound', `${p.symbol}: option P&L ${uPct}% outside defined-risk ±100%`, null)
    // 6) NAKED F&O option
    if (p.sleeve === 'FO' && p.kind === 'OPT' && !p.hedged) add('HIGH', 'naked-fo', `${p.symbol}: F&O option is NOT hedged`, null)
    // 7) DAILY carried overnight (should have squared at 15:30)
    if (p.sleeve === 'DAILY' && p.entryDate && p.entryDate < todayISO) add('HIGH', 'daily-overnight', `${p.symbol}: daily position carried overnight (entry ${p.entryDate})`, null)
    // 8) past stop but still open DURING an open market (off-hours holding is expected)
    const pastStop = p.sl && (bearish ? p.ltp >= p.sl : p.ltp <= p.sl)
    const marketOpenForP = (p.commodity || p.kind === 'COMM') ? sess.commodityOpen : sess.equityOpen
    if (pastStop && marketOpenForP) add('MEDIUM', 'past-stop', `${p.symbol}: still open past its stop during market hours`, `ltp ${p.ltp} vs sl ${p.sl}`)
    // 9) NaN unrealized
    if (!Number.isFinite(p.unrealizedPnl ?? 0)) add('HIGH', 'pos-nan', `${p.symbol}: unrealized P&L is NaN`, null)
  }
  // ── DAILY-INCOME RULE ENFORCEMENT (self-audit backstop; the engine also prevents these structurally) ──
  const dailyOpen = Object.values(b.open).filter(p => p.sleeve === 'DAILY')
  // 10) too many day-trades open
  if (dailyOpen.length > DAILY_MAX_OPEN) add('HIGH', 'daily-overcount', `Daily-Income has ${dailyOpen.length} open (rule: ≤${DAILY_MAX_OPEN})`, null)
  // 11) BACKSTOP — a day-trade still open after the 15:30 close on a trading day (square-off should have run)
  if (sess.equityClosedForDay) for (const p of dailyOpen) add('CRITICAL', 'daily-past-close', `${p.symbol}: day-trade still OPEN after 15:30 — should be squared off`, `entry ${p.entryDate}`)
  // 12) same name day-traded more than once today (churn)
  const dtCount = {}
  for (const t of b.closed) if (t.sleeve === 'DAILY' && (t.exitDate || '') === todayISO && !t.partial) { const k = t.symbol || t.underlying; dtCount[k] = (dtCount[k] || 0) + 1 }
  for (const [sym, n] of Object.entries(dtCount)) if (n > 1) add('MEDIUM', 'daily-churn', `${sym} day-traded ${n}× today (rule: 1 per name/day)`, null)
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  issues.sort((a, z) => order[a.level] - order[z.level])
  for (const i of issues) console.log(`[INTEGRITY ${i.level}] ${i.code}: ${i.msg}${i.detail ? ' — ' + i.detail : ''}`)
  return { ok: issues.length === 0, count: issues.length, critical: issues.filter(i => i.level === 'CRITICAL').length, issues: issues.slice(0, 20), checkedAt: new Date().toISOString() }
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
  // realised P&L from the UNTRUNCATED realizedTotal (b.closed is capped at 4000 → would understate after
  // that; realizedTotal is the source of truth that also drives cash/equity, so the numbers reconcile).
  const foClosedPnl = b.realizedTotal?.FO || 0
  const cashClosedPnl = b.realizedTotal?.CASH || 0
  // MAIN portfolio = cash + F&O (the ₹20L swing book). Daily-income sleeve is tracked separately.
  const mainClosed = b.closed.filter(t => t.sleeve !== 'DAILY')
  const mainCapital = b.capitalCash + b.capitalFO
  // WIN-RATE counts each SETUP once — EXCLUDE partial-book records (a partial +40% booking is not a
  // second "win"; the runner's final exit is the setup's outcome). Otherwise win-rate is inflated.
  const decidedRecs = mainClosed.filter(t => !t.partial)
  const wins = decidedRecs.filter(t => t.result === 'WIN'), losses = decidedRecs.filter(t => t.result === 'LOSS')
  const decided = wins.length + losses.length
  const realized = (b.realizedTotal?.CASH || 0) + (b.realizedTotal?.FO || 0)                          // untruncated (reconciles with equity)
  const grossWin = mainClosed.filter(t => t.result === 'WIN').reduce((a, t) => a + t.realizedPnl, 0)  // profit factor uses every cash event
  const grossLoss = Math.abs(mainClosed.filter(t => t.result === 'LOSS').reduce((a, t) => a + t.realizedPnl, 0))
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
  // LOSS-LEARNING: prune expired cooldowns; surface why losses happened (top categories) so they inform avoidance
  if (b.lossCooldown && todayISO) for (const [sym, d] of Object.entries(b.lossCooldown)) { const dd = (Date.parse(todayISO) - Date.parse(d)) / 86400000; if (isNaN(dd) || dd >= LOSS_COOLDOWN_DAYS) delete b.lossCooldown[sym] }
  const FIX_BY_CAT = {
    'gave back an open gain': 'trail sooner — book part at +40% and pull the stop to cost-to-cost',
    'averaged a loser that kept falling': 'only average A++ names (delivery ≥55) still above their base — else take the first stop',
    'daily scalp stopped (intraday noise)': 'enter only on a VWAP/POC reclaim with volume; skip the first 15 min',
    'illiquid / low-price name': 'keep the ≥₹50 floor; prefer liquid F&O-eligible names where the stop fills',
    'counter-trend reversal failed': 'take a reversal ONLY after a confirmed CHoCH and never against a trend desk',
    'false breakout (stopped ≤1 day)': 'require a confirmed close beyond the level + volume; enter the retest',
    'stop too wide (loose risk)': 'anchor the stop to the nearest swing/LVN and size down to ~1% risk',
    'no follow-through (trend/base failed)': 'demand one more confluence (VP node / FVG / structure) before entry',
  }
  const lessons = Object.entries(b.lossLessons || {}).map(([category, v]) => ({ category, count: v.count, avgLossPct: v.avgLossPct, lastSymbol: v.lastSymbol, fix: v.fix || FIX_BY_CAT[category] || null })).sort((a, z) => z.count - a.count)
  const lossJournal = (b.lossJournal || []).slice(0, 12)   // recent per-trade post-mortems (what we missed + fix)
  // SEGMENT LEADERBOARD — which book is consistent (win-rate ≥55%) AND highest-returning
  const segWin = arr => { const d = arr.filter(t => !t.partial); const w = d.filter(t => t.result === 'WIN').length, n = d.filter(t => t.result === 'WIN' || t.result === 'LOSS').length; return n ? +((w / n) * 100).toFixed(1) : null }
  const cashClosedArr = mainClosed.filter(t => (t.sleeve || 'CASH') !== 'FO'), foClosedArr = mainClosed.filter(t => t.sleeve === 'FO')
  const segmentRank = [
    { key: 'CASH', name: 'Cash', pct: +(((b.cashCash + cashVal - b.capitalCash) / b.capitalCash) * 100).toFixed(2), winRate: segWin(cashClosedArr), trades: cashClosedArr.length },
    { key: 'FO', name: 'F&O', pct: +(((b.cashFO + foVal - b.capitalFO) / b.capitalFO) * 100).toFixed(2), winRate: segWin(foClosedArr), trades: foClosedArr.length },
    { key: 'DAILY', name: 'Daily', pct: +(((b.cashDaily + dailyVal - b.capitalDaily) / b.capitalDaily) * 100).toFixed(2), winRate: segWin(dailyClosed), trades: dailyClosed.length },
  ].sort((a, z) => z.pct - a.pct).map((x, i) => ({ ...x, rank: i + 1, consistent: x.winRate != null && x.winRate >= 55 }))
  b.stats = {
    equity: b.equity, cash: Math.round(b.cashCash + b.cashFO + b.cashDaily), investedOpen,
    cashSleeve: { capital: b.capitalCash, cash: Math.round(b.cashCash), equity: Math.round(b.cashCash + cashVal), pct: +(((b.cashCash + cashVal - b.capitalCash) / b.capitalCash) * 100).toFixed(2), open: cashOpen.length, closedPnl: Math.round(cashClosedPnl), goal: monthlyGoal(b, 'CASH', b.capitalCash, { unreal: cashUnreal }, todayISO) },
    foSleeve: { capital: b.capitalFO, cash: Math.round(b.cashFO), equity: Math.round(b.cashFO + foVal), pct: +(((b.cashFO + foVal - b.capitalFO) / b.capitalFO) * 100).toFixed(2), open: foOpen.length, closedPnl: Math.round(foClosedPnl), goal: monthlyGoal(b, 'FO', b.capitalFO, { unreal: foUnreal }, todayISO) },
    dailySleeve: {
      capital: b.capitalDaily, cash: Math.round(b.cashDaily), deployed: Math.round(dailyOpen.reduce((a, p) => a + (p.invested || 0), 0)), equity: Math.round(b.cashDaily + dailyVal),
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
    profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? 99.99 : null),
    avgWinPct: wins.length ? +(wins.reduce((a, t) => a + t.realizedPct, 0) / wins.length).toFixed(2) : null,
    avgLossPct: losses.length ? +(losses.reduce((a, t) => a + t.realizedPct, 0) / losses.length).toFixed(2) : null,
    onTimeWinRate: wins.length ? +((onTimeWins / wins.length) * 100).toFixed(1) : null,
    monthly: months, monthTarget: { min: 5, max: 7 },
    lessons: lessons.slice(0, 6), lossJournal, activeCooldowns: Object.keys(b.lossCooldown || {}).length,
    segmentRank,
    monthKey: b.monthKey || null,
    // MONTHLY LOG BOOK — each finished month: start/end capital, P&L, per-sleeve, top mistakes (trades count only; full trades in trade_book.monthlyLog)
    monthlyLog: (b.monthlyLog || []).map(m => ({ month: m.month, startCapital: m.startCapital, endCapital: m.endCapital, pnl: m.pnl, pct: m.pct, sleeves: m.sleeves, mistakes: m.mistakes, tradeCount: m.trades?.length || 0 })),
    // DAILY LOG BOOK — each finished day: start/end capital, P&L, per-sleeve, that day's trades + mistakes (last 60 days)
    dailyLog: (b.dailyLog || []).slice(-60).reverse(),
  }
  b.stats.integrity = checkIntegrity(b, todayISO)   // daily self-verification — flags P&L/data bugs
}
