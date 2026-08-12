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
| **📐 VP·Fib·VWAP** | Volume-Profile POC/VAL + Fibonacci retracement + VWAP align → institutional magnet zone. |
| **🚀 Momentum** | Price breaking out with volume; RSI/trend confirmation; enters near a 20-day high with room (not extended). |
| **📈 Volume Accumulation** | Rising OBV/volume while price still flat — stealth institutional buying. |
| **💧 Money Flow** | MFI rising + OBV up — money flowing in. |
| **💎 Multibagger** | Quality screen: promoter stable, FII/DII up, pledge 0%, fundamentals. |
| **🔺 Harmonic / Chart Patterns** | XABCD harmonics + classic patterns at Fibonacci completion zones. |
| **🎯 Smart-Money Desk** | NIFTY/BankNifty/Gold multi-timeframe (10 TFs) + option positioning + far-expiry OI. |
| **🔄 Reversal / Mean-Reversion** | Oversold-bounce longs / overbought-fade shorts at a liquidity sweep. **Defers to trend** (see rule 4). |
| **Commodities** | Gold / Crude / Silver — trend + breakout (price above 20&50 EMA, near 20-day high), ATR-based SL/targets. |
| **🧲 Gamma / Dealer Map** | GEX walls, gamma flip, dealer support/resistance (context, not a trade). |
| **🔯 Vedic + Hora** | Astro timing — tradition only, NO proven edge; never sized on its own. |

---

## 3. TRADE-BOOK RULES (how a signal becomes a position)

**Sizing** — risk-based: ~1% risk per trade; Cash ≤4% deploy/position, F&O ~10%, Daily ~10%.
**Hard cap** — total invested per sleeve can **NEVER exceed ₹10L**. When full → no new trade until one closes.
**One position per underlying** in the main book. **F&O reserve** — ₹3L of the F&O sleeve is kept for index + commodities so stock options can't crowd them out.

**Cash-book quality gate** (from loss analysis):
- No penny stocks (**entry ≥ ₹50**).
- **No chasing** — skip if the stock already ran ≥8% today.

**Daily-Income (DAY TRADE)**:
- Liquid **F&O-eligible names only** (no micro-caps that gap).
- Entries from the confluence desks (VP+Fib / momentum / volume / money-flow).
- **Book +1.5% / cut −2.5% intraday**; anything unresolved **squares off by the next session** (max 1-day hold — no multi-day carries).

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
(As of last check: Cash steady, Daily positive, **F&O the weak spot** — under review.)

---

## 7. WHAT WE NEVER DO
- Never claim >80%/100%/"sure"/"guaranteed" accuracy — no system can.
- Never place real orders (Angel API is READ-ONLY).
- Never deploy above ₹10L per book.
- Never trade a name in loss-cooldown or from a benched desk.
- Never show an inflated/estimated number as if it were real.
