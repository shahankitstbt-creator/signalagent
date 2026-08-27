# STOCKSBYVARSHA — System Rules & Daily Operating Manual

> Single source of truth for how the engine generates signals, manages trades, and improves itself.
> **Honesty rule (overrides everything):** every number shown is the REAL measured figure. We never
> claim a guaranteed % — 85% accuracy is an *aspiration the engine works toward*, not a promise. All
> output is educational, not advice; not SEBI-registered.

---

## 1. AIMS & GOALS

| Segment | Capital | Goal |
|---|---|---|
| **Cash book** (delivery/equity) | ₹10L | **7–10% / month** |
| **F&O book** (options/futures) | ₹10L | **10–15% / month** |
| **Daily-Income** (day trade) | ₹10L | **₹10,000 / day (~1%)** |
| **Overall accuracy** | — | **climb toward 85% measured win-rate** (rolling, never expires) |

Book total = **₹30L**. Each book is hard-capped at ₹10L deployed — **never invest above the capital**.

---

## 2. SIGNAL GENERATORS (the desks) & their rules

Every generator produces `entry`, `sl`, `targets[]` (price, %, ETA date+time), `reason`, `grade`.

| Desk | Rule / edge |
|---|---|
| **⭐ Confluence (Top Picks)** | Highest conviction — fires only when **2+ generators agree** on the same stock (+ Vedic bias + delivery). Grade A++/A+. |
| **📊 Point & Figure** | **P&F double-top breakout** (box + 3-box reversal → noise/time filtered) confirmed by the **EMA trend cloud** — only with the trend. A tracked desk with entry/SL/targets, measured honestly in the ledger. Also a standalone **any-asset/any-timeframe P&F chart** at `/pnf.html` (📊 P&F nav link) with multi-timeframe confluence. |
| **🎯 1-Month Movers (10–20%)** | Curated CROSS-DESK list: LIQUID (F&O-eligible or delivery ≥45%), high-conviction (grade A+/A++ or confidence ≥65) **LONGs whose target sits ~10–20% above entry** (~1-month horizon). Pulled from momentum/vol_accum/confluence/vp_fib/money_flow/harmonic, deduped, ranked by conviction. **Display-only discovery overlay** (underlying signals still trade via their own desks — no double-trade). Educational, NOT a guarantee; each has entry/SL/targets. |
| **📐 VP·Fib·VWAP** | Volume-Profile POC/VAL + Fibonacci retracement + VWAP align → institutional magnet zone. |
| **🚀 Momentum** | Price breaking out with volume; RSI/trend confirmation; enters near a 20-day high with room (not extended). |
| **📈 Volume Accumulation** | Rising OBV/volume while price still flat — stealth institutional buying. |
| **💧 Money Flow** | MFI rising + OBV up — money flowing in. |
| **💎 Multibagger** | Quality screen: promoter stable, FII/DII up, pledge 0%, fundamentals. |
| **🔺 Harmonic / Chart Patterns** | XABCD harmonics + classic patterns at Fibonacci completion zones. |
| **🎯 Smart-Money Desk** | NIFTY/BankNifty/Gold multi-timeframe (10 TFs) + option positioning + far-expiry OI. |
| **🔄 Reversal / Mean-Reversion** | Oversold-bounce longs / overbought-fade shorts at a liquidity sweep. **Defers to trend** (see rule 4). |
| **📉 Short / Sell** | The SELL side — spots **distribution breakdowns** (close below 20-day support on volume), **overbought/profit-booking reversals** (RSI hot + rejection wick at highs), and **bull traps** (failed breakout) BEFORE the drop. SHORT: stop ABOVE structure, targets below; F&O-eligible → PE / short-futures. Liquid names only; **defers to trend** (never SHORT a name the trend desks are BUYing). Tracked in the ledger. |
| **Commodities** | Gold / Crude / Silver — trend + breakout (price above 20&50 EMA, near 20-day high), ATR-based SL/targets. |
| **🧲 Gamma / Dealer Map** | GEX walls, gamma flip, dealer support/resistance (context, not a trade). |
| **🔯 Vedic + Hora** | Astro timing — tradition only, NO proven edge; never sized on its own. |

---

## 3. TRADE-BOOK RULES (how a signal becomes a position)

**Sizing** — risk-based: ~1% risk per trade; Cash ≤4% deploy/position, F&O ~10%, Daily ~10%.
**Hard cap** — total invested per sleeve can **NEVER exceed ₹10L**. When full → no new trade until one closes.
**One position per underlying** in the main book. **F&O reserve** — ₹3L of the F&O sleeve is kept for index + commodities so stock options can't crowd them out.

**Cash-book = CONCENTRATED, LIQUID swing trades** (updated per user 2026-08-17):
- **Fewer, bigger swings** — up to **~10% (₹1L) per position**, capped at **12 concurrent** so there's always room for the best fresh setups (was 26 tiny ~₹40k positions).
- **Liquid + quality only** — a cash swing must be **F&O-eligible OR delivery ≥ 45%** AND **grade A+/A++ or confidence ≥ 65**. No illiquid, no-grade micro-caps (they gap and bleed).
- No penny stocks (**entry ≥ ₹50**); **no chasing** — skip if it already ran ≥8% today.
- Existing weak micro-cap positions wind down naturally via their stops/targets; new capital goes to concentrated liquid names.

**Daily-Income (DAY TRADE)**:
- Liquid **F&O-eligible names only** (no micro-caps that gap).
- Entries from the confluence desks (VP+Fib / momentum / volume / money-flow).
- **Book +1.5% / cut −2.5% intraday**; **flat by the 15:30 close** — no overnight carry (§4b).
- **ONE day-trade per name PER DAY** — never re-buy a name already day-traded today (no same-stock churn / scalping loop).
- Max 8 positions · ~10% (₹1L) each · stop opening new once the ₹10k day-goal is in hand.

---

## 4. EXIT / RISK MANAGEMENT RULES

1. **Honor the STOP (Cash + F&O)** — the moment price hits the SL, **EXIT**, on every scan. Never sit past the stop — *except* the one quality-averaging case below.
2. **Average when setup + company are both strong — even past the SL** — a top-quality CASH long (A++/A+, delivery ≥55) that dips ~6% gets **one add** to improve the cost basis and **widen the SL to structure**. Then that widened stop is final — if it breaks, it exits. (Averaging a weak name is itself a logged mistake — see rule 7.)
3. **F&O is ALWAYS HEDGED** — no naked options. Every F&O option is booked as a **vertical debit spread** (buy the ATM leg, sell an OTM leg for ~50% credit). Net debit = the **defined max loss** (half a naked long); the short leg caps both tails. F&O never carries undefined risk.
4. **Partial book** — book 50% at +40%; trail the rest (A++/A+ → cost-to-cost; others → +10% floor).
5. **No contradictions** — a reversal SHORT is dropped if any trend desk is LONG that name (and vice-versa).
6. **Loss cooldown** — after a stop-out, the name is **benched for 5 days** (don't re-buy what just stopped you).
7. **Every loss gets a post-mortem, kept in memory** — on each booked loss the engine records **what we missed, why it happened, and the fix**, then avoids repeating it. **We do NOT bench whole desks** — a weak desk is FIXED by these lessons + the contradiction filter + the cooldown. Win-rate is used only to *rank* desks when capital is tight, never to block them.

---

## 4b. MARKET HOURS — when the book may change (IST)

The paper book obeys **real Indian market hours** (`marketSession()` in tradebook.mjs). No fills happen off-session.

| Segment | Trading window (IST) |
|---|---|
| NSE Stocks / Cash / F&O / Nifty 50 / index options | **09:15 – 15:30** |
| Commodities — Gold / Crude / Silver (MCX) | **09:15 – 23:30** |

- **No fills when the market is shut** — outside these windows the book only marks-to-market; it cannot open, stop, trail, or exit.
- **Day-trades are flat by 15:30** — every Daily-Income position is **squared off at the 15:30 close** (exit stamped 15:30 IST). Nothing carries overnight; new day-trades stop opening after **15:00**.
- **No new day-trade in the last 30 min** (need time to manage/exit before close).
- **Holidays & weekends → the trade book NEVER changes.** No opens, no exits, no square-offs; a pending close defers to the next trading session. NSE holiday list is in `NSE_HOLIDAYS`.

---

## 4b². LOG BOOKS — Daily + Monthly (two separate records)

Two log books, viewable from the **Log Book button** in the Trading Journal header (beside Refresh):
- **DAILY log** (`dailyRollover`, `stats.dailyLog`): at the first scan of each new day, records the finished day — **start capital, end capital, P&L + win-rate per sleeve, that day's trades, and the day's mistakes**. **Records only — no capital reset** (capital carries within the month). Skips empty weekend/holiday days.
- **MONTHLY log** (`stats.monthlyLog`, see §4c): same fields per month, **and resets all sleeves to ₹10L fresh**.

## 4c. MONTHLY CYCLE — logbook + fresh ₹10L start (every month)

At the **first scan of each new month** the engine automatically (`monthlyRollover()`):
1. **Writes the finished month to the LOG BOOK** (`trade_book.monthlyLog` + `stats.monthlyLog`): per sleeve — **start capital ₹10L, end capital, P&L, %, win-rate, trade count** — plus the month's **compact trade list** and the **major mistakes** (from the loss post-mortems dated that month).
2. **Starts every sleeve FRESH at ₹10L** — flat (no carried positions), realised P&L zeroed, capital reset. Book restarts at ₹30L total.
3. **Learning PERSISTS** — loss lessons / post-mortems / cooldowns carry across months, so the system keeps improving; only capital + positions + realised reset.

So each month is a clean, comparable scorecard, and the history is never lost. **Every month behaves the same** — this is a permanent routine.

## 4d. RELIABILITY — the system is SELF-CORRECTING (detect + auto-fix + verify)

Rules are enforced in CODE, not just documented. Four layers so a breach cannot persist:
1. **Structural prevention** — the breach is impossible to create (e.g. one day-trade per name/day; hard ₹10L cap at open; no naked F&O; no off-session fills).
2. **Auto-remediation** (`syncTradeBook`, every scan, before save) — if a breach somehow exists it is **FIXED immediately**: any Daily trade still open after 15:30 is force-squared; any sleeve over its ₹10L cap is trimmed; any naked F&O is hedged. A violation can't survive a single cycle.
3. **Self-audit** (`checkIntegrity`, every scan → `stats.integrity`) — flags cash drift, over-cap, P&L-vs-price-direction, option P&L outside ±100%, naked F&O, daily overnight/past-close/over-count/churn, past-stop-in-hours. Any residue surfaces the **same scan**.
4. **Redundant scheduling** — square-off crons at **15:31 & 15:36 IST**; self-improve at **17:32 + 18:02 IST backup** (staleness-guarded → runs once/day even if a run is dropped).

Honesty: this makes the system self-correcting — it does NOT claim literal perfection (no honest system can). A breach is caught and auto-fixed, not merely documented.

---

## 5. DAILY AUTOMATED TASKS (runs itself — no manual steps)

| When (IST) | Task |
|---|---|
| **Every 15 min (mkt hours)** | Live scan → refresh board, mark positions to market, honor stops, fire Telegram entry/exit on copy-worthy trades |
| **Every 30 min (after mkt)** | Keep board & prices current |
| **~17:32 daily** | Full close: evaluate every trade (win/loss), update track record, **run self-improvement**, weekly roll-up, redeploy |

**Self-improvement (every evening):**
- Re-measure each desk's win-rate → **bench proven losers**, concentrate on proven winners.
- **Tighten selectivity** (qualityBar) toward the 85% aim — fewer, higher-quality signals.
- **Learn from losses** — categorize why each loss happened; apply the cooldown; keep the lesson.
- Diagnose missed ≥5% movers → tune the pre-move score gate.

---

## 6. SEGMENT PERFORMANCE MONITORING (which book to trust)

The engine tracks each book's **MTD return vs goal + pace** and **win-rate**. Watch the leaderboard in the
Journal tiles + the `stats.segmentRank` field. **Capital should follow the book that is consistent AND highest-returning.**
(As of last check: Cash steady, Daily strongest, **F&O the weak spot** — hedged + under review.)

### 📅 REVIEW MILESTONE — 30 August 2026
This is a **30-day monitored run**. We keep the whole system running exactly as defined here — every day —
and **review the full result on 30 Aug 2026**. Do NOT wait until the 30th to act:
- **Daily evaluation is MANDATORY** — the post-market self-improvement (≈18:00 IST) runs every trading day:
  measure each sleeve's return-vs-goal + win-rate, run every loss post-mortem (rule 7), tighten selectivity,
  update `goal.json`/`learning.json`, and record which segment is most consistent + highest-returning.
- Between now and 30 Aug: apply the lessons daily, keep the books within their goals (Cash 7–10%/mo,
  F&O 10–15%/mo, Daily ₹10k/day), and let the segment leaderboard show which sleeve earns more capital.
- **On 30 Aug 2026:** produce the 30-day verdict — realised P&L + win-rate per sleeve, whether each goal was
  met, what the loss journal taught us, and where capital should concentrate next.

---

## 6a. WHAT WINS vs LOSES (from 438-trade analysis, 2026-08-27) — take BETTER trades

Codified from real results (re-analyse monthly). **Concentrate on proven winners, cut the leaks:**
- **Best desks:** 🥇 **money_flow 81%**, multibagger 63%, F&O 56% (leverage). **Weight these highest.**
- **Leaks to fix:** **confluence 48% (net −₹33k)** — "Top Picks" is net-negative; **vp_fib** wins small / loses big (bad R:R); vol_accum 38%, reversal 33%.
- **Grade is miscalibrated:** **A+ wins (58%, +₹190k)** but **A++ *loses* (47%, −₹25k)**. → Rank/trade by **measured desk win-rate FIRST, grade second** (applied in the book's selection sort). Never assume A++ = best.
- **Hold window:** **5–10 days wins most (61%)**; 2–4 days worst. Lean to the swing sweet spot.
- **#1 loss cause = false breakouts (25×)** → require a **confirmed close beyond the level + volume; enter the retest**, not the first poke. **#2 = option time-decay (32×)** → don't hold weak-moving options (6-day time-stop).
- **Cash is the weak sleeve (44%, −₹7k)** → highest selectivity + the R:R/expectancy fixes.

**Honesty:** a 75%+ overall win-rate across all desks is not achievable — only money_flow clears it. Higher *traded* win-rate comes from **concentration on the winners**, not a blanket promise.

---

## 6b. LONG-ONLY UNIVERSE (no shorting these)

**NEVER fire a SHORT** on **F&O-eligible stocks**, **indices** (Nifty, BankNifty, Sensex, MidcpNifty, FinNifty), or **commodities** (Gold, Silver, Crude, XAUUSD, XAGUSD). These trade **long-only** (buy / CE only). Enforced at every source: the Short/Sell desk, reversal shorts, index-option PE, commodity shorts, and a trade-book backstop that refuses to open a short on any of them. (Shorts may still appear on **non-F&O cash stocks** — those are informational; cash delivery can't be shorted anyway.)

---

## 7. WHAT WE NEVER DO
- Never claim >80%/100%/"sure"/"guaranteed" accuracy — no system can.
- Never place real orders (Angel API is READ-ONLY).
- Never deploy above ₹10L per book.
- Never trade a name in loss-cooldown or from a benched desk.
- Never show an inflated/estimated number as if it were real.
