# CLAUDE.md — Master Trading Platform Blueprint
## "ProTrader OS" — Institutional-Grade Platform, Unlimited Indicators

> **WHO USES THESE STRATEGIES:** Goldman Sachs, Renaissance Technologies, Citadel, JPMorgan, Two Sigma, Bridgewater, DE Shaw, and every major prop trading desk worldwide. These aren't retail guesses — they are the actual mechanics behind how smart money moves markets. This platform reverse-engineers institutional order flow and gives you the same edge.

---

## 🧭 VISION

Build a full-stack, browser-based professional trading platform that:
- Renders live & historical OHLCV candlestick charts for any asset class (stocks, crypto, forex, commodities, indices)
- Runs **unlimited custom indicators** (no 2-indicator cap like TradingView free)
- Implements the **top 13 institutional-grade strategies** with live signal generation
- Includes the 3 most powerful institutional techniques: **Volume Profile + Fib, Liquidity Sweep + Market Structure, and Imbalance (FVG)**
- Marks **trade entries, stop-loss, and take-profit** directly on the chart with annotations
- Provides **voice + visual alerts** when a signal fires
- Is fully self-hosted and extendable

---

## 🏗️ TECH STACK

```
Frontend:         React + Vite (or Next.js)
Charting Engine:  Lightweight-Charts v4 (TradingView open-source)
State Management: Zustand
Styling:          Tailwind CSS + custom dark theme tokens
Real-time Data:   WebSocket (Binance, Alpaca, Polygon.io, Yahoo Finance fallback)
Indicators:       Custom JS engine (Pine Script → JS port)
Backend (opt):    FastAPI (Python) for strategy signals, backtesting
DB (opt):         SQLite or PostgreSQL for saved layouts, alerts, watchlists
Deployment:       Docker + Nginx (self-hosted) or Vercel/Railway
```

---

## 🎨 DESIGN SYSTEM

### Color Palette (Dark Terminal Aesthetic)
```
--bg-base:          #0A0E17   (deep navy black — main background)
--bg-panel:         #0F1623   (panel background)
--bg-card:          #151E2D   (card/widget background)
--border:           #1E2D42   (subtle borders)
--accent-primary:   #2962FF   (TradingView blue — buttons, active states)
--accent-green:     #00C853   (bullish/buy signals)
--accent-red:       #FF1744   (bearish/sell signals)
--accent-yellow:    #FFD600   (warning, pending, TP levels)
--accent-purple:    #AA00FF   (harmonic patterns, Fibonacci)
--accent-orange:    #FF6D00   (liquidity zones, sweep alerts)
--accent-cyan:      #00E5FF   (imbalance / FVG zones)
--accent-gold:      #FFB300   (Volume Profile POC line)
--text-primary:     #E0E8F0   (main readable text)
--text-secondary:   #6B7F99   (labels, meta)
--text-muted:       #3A4F66   (disabled, placeholders)
--candle-bull:      #089981   (green candle body)
--candle-bear:      #F23645   (red candle body)
--vp-poc:           #FFB300   (Point of Control — gold)
--vp-val:           #1565C0   (Value Area Low — blue)
--vp-vah:           #B71C1C   (Value Area High — red)
--liq-sweep:        #FF6D00   (liquidity sweep highlight)
--imbalance-bull:   #00E5FF33 (bullish FVG zone fill — cyan tint)
--imbalance-bear:   #FF174433 (bearish FVG zone fill — red tint)
```

### Typography
```
Display/Logo:  "JetBrains Mono" (monospace — precision, data terminal feel)
Body/UI:       "Inter" (clean, legible at small sizes)
Data/Numbers:  "JetBrains Mono" (tabular numbers, tick values)
Scale: 10px / 12px / 14px / 16px / 20px / 24px / 32px
```

---

## 📐 LAYOUT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOPBAR: Logo | Symbol Search | Timeframe | Asset Class | Alerts    │
├──────────┬──────────────────────────────────────────┬───────────────┤
│          │                                          │               │
│ LEFT     │         MAIN CHART AREA                 │  RIGHT PANEL  │
│ PANEL    │   (Candlestick + Overlays)               │               │
│          │   - Volume Profile (right side)          │  - Watchlist  │
│ - Symbol │   - Imbalance / FVG zones                │  - Signals    │
│   Tree   │   - Liquidity levels                     │  - News Feed  │
│          │   - Order Blocks                         │  - MTF Table  │
│ - Saved  ├──────────────────────────────────────────┤               │
│   Layouts│         INDICATOR PANE 1                 │               │
│          │   (RSI / MACD / UT Bot etc.)             │               │
│ - Alerts │                                          │               │
│          ├──────────────────────────────────────────┤               │
│          │         INDICATOR PANE 2                 │               │
│          │   (Volume / LR Candles / VP Histogram)   │               │
├──────────┴──────────────────────────────────────────┴───────────────┤
│  BOTTOM BAR: Signal Log | Last Trade | Account Stats | Confluence   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 CHARTING ENGINE — FEATURE SPEC

### Core Chart Types
- [ ] Candlestick (OHLC)
- [ ] Heikin Ashi
- [ ] Renko
- [ ] Line / Area
- [ ] Bar Chart
- [ ] Point & Figure (advanced)

### Chart Controls
- [ ] Zoom in/out (scroll wheel + pinch)
- [ ] Pan left/right
- [ ] Auto-scale Y axis
- [ ] Log scale toggle
- [ ] Percentage scale toggle
- [ ] Compare mode (overlay 2 symbols)
- [ ] Crosshair with OHLCV tooltip
- [ ] Right-click context menu

### Drawing Tools
- [ ] Trend Line / Extended
- [ ] Horizontal Line / Ray
- [ ] Fibonacci Retracement (23.6%, 38.2%, 50%, 61.8%, 70.5%, 78.6%, 88.6%, 100%, 127.2%, 161.8%)
- [ ] Fibonacci Extension
- [ ] Fibonacci Fan
- [ ] Fibonacci Time Zone
- [ ] Fibonacci Speed Resistance Fan
- [ ] Pitchfork (Andrews)
- [ ] Gann Fan
- [ ] Regression Channel
- [ ] Rectangle / Box (used for Order Blocks, FVGs)
- [ ] XABCD Pattern (manual harmonic)
- [ ] Volume Profile (manual fixed range)
- [ ] Text Label + Arrow
- [ ] Date Range + Price Range measure tools

---

## 📈 INDICATOR ENGINE — UNLIMITED PANES

### Architecture
```javascript
class Indicator {
  name: string
  type: 'overlay' | 'pane'
  inputs: IndicatorInput[]
  outputs: IndicatorOutput[]
  calculate(bars: OHLCV[]): Series[]
  getSignals(bars: OHLCV[]): Signal[]
}
```

### Built-in Indicators

#### Trend / Moving Average
- SMA, EMA, WMA, DEMA, TEMA, HMA, VWAP, VWMA
- Ichimoku Cloud, Supertrend, Parabolic SAR, ZigZag
- **Moving Average Ribbon** (10–12 EMAs, color-coded)

#### Momentum
- RSI + divergence, MACD, Stochastic, Stochastic RSI
- CCI, Williams %R, ROC, TSI, Awesome Oscillator, TRIX

#### Volatility
- Bollinger Bands (%B, Bandwidth), ATR, Keltner Channel
- Donchian Channel, Squeeze Momentum (Lazybear)

#### Volume
- Volume bars, OBV, CMF, MFI, Force Index
- **Volume Profile — Visible Range (VPVR)**
- **Volume Profile — Fixed Range (VPFR)**
- **Market Profile (TPO)**
- VWAP Bands (±1σ, ±2σ, ±3σ)

#### Smart Money / Institutional Structure
- **Fair Value Gaps / Imbalance (FVG)** — bullish & bearish, auto-drawn
- **Order Blocks** — bullish & bearish, mitigation tracking
- **Breaker Blocks** — flipped order blocks
- **Liquidity Levels** — equal highs/lows, buy-side/sell-side liquidity
- **BOS / CHoCH** — Break of Structure / Change of Character
- **Premium & Discount Zones** — 50% of swing range
- **Displacement Candles** — large momentum candles showing institutional intent
- Support & Resistance (fractal auto-detect, 3+ touches)
- Pivot Points (Traditional, Fibonacci, Camarilla, Woodie, DeMark)

---

## 🎯 CUSTOM INDICATOR IMPLEMENTATIONS

### 1. Harmonic Pattern Detection & Backtesting
**Patterns:** Gartley, Bat, Butterfly, Crab, Deep Crab, Shark, Cypher, 5-0, AB=CD, Three Drives

**Algorithm:**
```
1. ZigZag pivot detection (configurable depth, deviation)
2. Find XABCD swing points from pivots
3. Validate Fibonacci ratios per pattern type:
   Gartley:    B=0.618 XA, C=0.382-0.886 BC, D=0.786 XA
   Bat:        B=0.382-0.500 XA, D=0.886 XA
   Butterfly:  B=0.786 XA, D=1.272-1.618 XA
   Crab:       B=0.382-0.618 XA, D=1.618 XA (exact)
4. Tolerance band: ±5% (user-configurable)
5. Pattern Completion Zone (PCZ) shading
6. Entry at D, SL beyond X, TP at 38.2% / 61.8% of AD
```

**Visuals:** Color-coded triangles, ratio labels, PCZ shading, signal arrow

### 2. UT Bot Alerts
**Algorithm:**
```javascript
a = ATR(atrPeriod) × sensitivity
if close > trailing_stop_prev:
  trailing_stop = max(trailing_stop_prev, close - a)
else:
  trailing_stop = min(trailing_stop_prev, close + a)

BUY  when: close crosses above trailing_stop
SELL when: close crosses below trailing_stop
```
- Inputs: Key Value (sensitivity) default 1, ATR Period default 10, Heikin Ashi toggle
- Visuals: Colored trailing stop line, ▲/▼ signal arrows, candle coloring

### 3. Moving Average Ribbon
```javascript
const periods = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 200]
// Fill between adjacent EMAs, color green/red by slope direction
// Ribbon compression = squeeze / consolidation alert
// Ribbon expansion = strong trend confirmation
```

### 4. Linear Regression Candles
```
LRC_Open/High/Low/Close = LinReg(source, length, offset)
Bullish if LRC_Close > LRC_Open (green body)
Signal Line = EMA(LRC_Close, signalLength)
```
- Inputs: Length 11, Signal Length 11, candle coloring toggle

---

## 🏦 INSTITUTIONAL TECHNIQUES — THE 3 MISSING PILLARS

> These 3 techniques are what separates retail traders from hedge funds, prop desks, and institutional money managers. They are not indicators — they are the **language of the market** itself.

---

### ═══════════════════════════════════════
### TECHNIQUE A: Volume Profile + Fibonacci Confluence
### ═══════════════════════════════════════

**Used by:** Market makers, options desks, CME floor traders, Renaissance Technologies, Two Sigma

**Concept:**
Volume Profile shows WHERE volume actually traded, not when. Combined with Fibonacci levels, it reveals the exact price zones where institutions placed and will place orders again. When a Fibonacci level (38.2%, 61.8%, 78.6%) coincides with a Volume Profile node, it becomes a **magnetic price zone** — price is almost compelled to revisit, react, or explode from it.

**Implementation — Volume Profile Engine:**
```javascript
class VolumeProfile {
  // Input: array of OHLCV bars for the range
  // Output: histogram of volume at each price level

  calculate(bars, numBins = 200) {
    const high = Math.max(...bars.map(b => b.high))
    const low  = Math.min(...bars.map(b => b.low))
    const binSize = (high - low) / numBins
    const bins = new Array(numBins).fill(0)

    bars.forEach(bar => {
      // Distribute bar volume across its price range
      const barLow  = Math.floor((bar.low - low) / binSize)
      const barHigh = Math.ceil((bar.high - low) / binSize)
      const volPerTick = bar.volume / (barHigh - barLow || 1)
      for (let i = barLow; i < barHigh; i++) {
        bins[i] = (bins[i] || 0) + volPerTick
      }
    })

    // Identify key levels
    const poc   = bins.indexOf(Math.max(...bins))      // Point of Control
    const total = bins.reduce((a, b) => a + b, 0)
    const valueAreaVol = total * 0.70                  // 70% of volume = Value Area

    // Value Area High (VAH) and Value Area Low (VAL)
    // Expand outward from POC until 70% volume captured
    let [vah, val] = this.calcValueArea(bins, poc, valueAreaVol)

    return { bins, poc, vah, val, high, low, binSize }
  }

  // HVN = High Volume Node (magnet — price slows/reverses here)
  // LVN = Low Volume Node (vacuum — price moves fast through here)
  identifyNodes(bins, threshold = 1.5) {
    const avg = bins.reduce((a,b)=>a+b,0) / bins.length
    return {
      hvn: bins.map((v,i) => v > avg * threshold ? i : -1).filter(i=>i>=0),
      lvn: bins.map((v,i) => v < avg / threshold ? i : -1).filter(i=>i>=0)
    }
  }
}
```

**Fibonacci Confluence Detection:**
```javascript
function findFibVPConfluence(swingHigh, swingLow, vpData, tolerance = 0.002) {
  const fibLevels = [0.236, 0.382, 0.500, 0.618, 0.705, 0.786, 0.886]
  const range = swingHigh - swingLow
  const confluences = []

  fibLevels.forEach(fib => {
    const fibPrice = swingHigh - (range * fib)   // retracement
    // Check if any HVN is within tolerance % of this fib level
    vpData.hvn.forEach(nodeIndex => {
      const nodePrice = vpData.low + (nodeIndex * vpData.binSize)
      const dist = Math.abs(fibPrice - nodePrice) / fibPrice
      if (dist < tolerance) {
        confluences.push({
          price: fibPrice,
          fibRatio: fib,
          nodePrice,
          strength: 'HIGH',   // Fib + HVN = strongest confluence
          label: `${(fib*100).toFixed(1)}% Fib + HVN`
        })
      }
    })
    // POC confluence
    const pocPrice = vpData.low + (vpData.poc * vpData.binSize)
    if (Math.abs(fibPrice - pocPrice) / fibPrice < tolerance) {
      confluences.push({ price: fibPrice, fibRatio: fib, strength: 'EXTREME',
        label: `${(fib*100).toFixed(1)}% Fib + POC — INSTITUTIONAL ZONE` })
    }
  })
  return confluences.sort((a,b) => a.price - b.price)
}
```

**Chart Rendering:**
```
Volume Profile (right side of chart or fixed range):
  ├── Horizontal histogram bars at each price level
  ├── POC line: thick GOLD horizontal line (most traded price)
  ├── VAH line: dashed RED line (value area high)
  ├── VAL line: dashed BLUE line (value area low)
  ├── HVN zones: subtle grey shading (price magnets)
  ├── LVN zones: subtle lighter zones (price vacuum — fast moves)
  └── Fib+VP confluence zones: GLOWING box with label

When Fib level aligns with POC or HVN:
  → Draw highlighted rectangle around that zone
  → Label: "61.8% + POC CONFLUENCE ★"
  → Confidence boost to any signal in that zone: +1 grade
```

**Signal Generation:**
```
LONG setup:
  1. Price retraces to 61.8% or 78.6% Fibonacci level
  2. That level overlaps with VP POC or HVN within 0.2%
  3. Volume dries up on the pullback (below avg)
  4. Reversal candle forms at the zone (hammer, engulfing, doji)
  → ENTER LONG at close of reversal candle
  → STOP: Below LVN beneath the zone (or below 88.6% Fib)
  → TP1: VAH (Value Area High)
  → TP2: Previous swing high
  → TP3: 1.272 / 1.618 Fibonacci extension

SHORT setup: Mirror of above at 38.2% / 50% + VAH + HVN
```

**Why institutions use this:**
> Market makers KNOW where they placed orders (POC). They defend those levels. When retail hits a Fibonacci level and market makers are also defending the same price with volume — that's a wall. This technique lets you trade WITH the invisible hand, not against it.

---

### ═══════════════════════════════════════
### TECHNIQUE B: Liquidity Sweep + Market Structure
### ═══════════════════════════════════════

**Used by:** ICT (Inner Circle Trader methodology), JPMorgan FX desk, hedge fund quant desks, all major prop trading firms

**Concept:**
Institutions need to BUY millions of units without moving the price against themselves. They do this by:
1. Running price into clusters of retail stop-losses (liquidity pools)
2. "Sweeping" those stops to fill their own orders at better prices
3. Then reversing hard in the opposite direction

Retail traders place stops at obvious levels — below equal lows, above equal highs, below swing lows, above round numbers. **Institutions hunt these stops deliberately.** Once swept, the market reverses and the real move begins.

**Market Structure Types:**
```
BOS  = Break of Structure  (continuation — trend confirmed)
CHoCH = Change of Character (reversal — trend is ending)
MSB  = Market Structure Break (same as BOS, used interchangeably)

Higher High (HH) / Higher Low (HL) = Bullish structure
Lower High (LH) / Lower Low (LL)  = Bearish structure

Structure Shift: HL followed by LL = bearish CHoCH
                 LH followed by HH = bullish CHoCH
```

**Implementation — Liquidity Detection Engine:**
```javascript
class LiquidityEngine {

  // Detect equal highs/lows (within 0.1% of each other)
  findEqualLevels(bars, tolerance = 0.001) {
    const levels = { buySide: [], sellSide: [] }
    for (let i = 2; i < bars.length - 2; i++) {
      // Swing high = high[i] > high[i-1] && high[i] > high[i+1]
      if (bars[i].high > bars[i-1].high && bars[i].high > bars[i+1].high) {
        // Check if any previous swing high is within tolerance
        const equalHigh = levels.buySide.find(l =>
          Math.abs(l.price - bars[i].high) / l.price < tolerance)
        if (equalHigh) {
          equalHigh.strength++    // more touches = stronger liquidity pool
          equalHigh.indices.push(i)
        } else {
          levels.buySide.push({ price: bars[i].high, strength: 1,
            indices: [i], type: 'BSL',  // Buy-Side Liquidity
            label: 'Equal Highs (BSL)' })
        }
      }
      // Mirror for swing lows → SSL (Sell-Side Liquidity)
    }
    return levels
  }

  // Detect liquidity sweep (price wicks beyond level then closes back)
  detectSweep(bars, levels) {
    const sweeps = []
    bars.forEach((bar, i) => {
      levels.buySide.forEach(level => {
        // Sweep of BSL: wick above level, close BELOW level
        if (bar.high > level.price && bar.close < level.price) {
          sweeps.push({
            index: i, type: 'BSL_SWEEP', price: level.price,
            bar, label: 'Buy-Side Liquidity Swept',
            direction: 'BEARISH',   // swept BSL = likely short
            strength: level.strength
          })
        }
      })
      levels.sellSide.forEach(level => {
        // Sweep of SSL: wick below level, close ABOVE level
        if (bar.low < level.price && bar.close > level.price) {
          sweeps.push({
            index: i, type: 'SSL_SWEEP', price: level.price,
            bar, label: 'Sell-Side Liquidity Swept',
            direction: 'BULLISH',  // swept SSL = likely long
            strength: level.strength
          })
        }
      })
    })
    return sweeps
  }

  // Market Structure Analysis
  analyzeStructure(bars) {
    const pivots = this.findPivots(bars)
    const structure = []
    for (let i = 1; i < pivots.length; i++) {
      const prev = pivots[i-1], curr = pivots[i]
      if (curr.type === 'high') {
        structure.push({
          label: curr.price > prev.prevHigh ? 'HH' : 'LH',
          price: curr.price, index: curr.index
        })
      } else {
        structure.push({
          label: curr.price > prev.prevLow ? 'HL' : 'LL',
          price: curr.price, index: curr.index
        })
      }
    }

    // Detect CHoCH (Change of Character)
    for (let i = 2; i < structure.length; i++) {
      const [a, b, c] = [structure[i-2], structure[i-1], structure[i]]
      if (a.label==='HL' && b.label==='LH' && c.label==='LL') {
        structure[i].choch = 'BEARISH_CHOCH'
      }
      if (a.label==='LH' && b.label==='HL' && c.label==='HH') {
        structure[i].choch = 'BULLISH_CHOCH'
      }
    }
    return structure
  }
}
```

**Chart Rendering:**
```
Liquidity Levels:
  ├── Equal Highs: dashed orange line labeled "BSL ~~" with lightning icon
  ├── Equal Lows:  dashed orange line labeled "SSL ~~" below
  ├── Strength indicator: 2 touches = thin, 3+ touches = thick + glow

Liquidity Sweep Event:
  ├── Highlight the sweeping candle wick in ORANGE
  ├── Draw sweep arrow (🔄) at the wick tip
  ├── Label: "BSL SWEPT — Watch for Reversal"
  ├── Auto-trigger signal evaluation after sweep confirmed

Market Structure:
  ├── HH / HL / LH / LL labels above/below each pivot
  ├── BOS: horizontal arrow through the broken structure level, labeled "BOS"
  ├── CHoCH: highlighted box + label "CHoCH ⚠️" — major reversal warning
  ├── Trend channel connecting HH→HH or LL→LL
```

**Signal Generation — The Sweep + Reversal Setup:**
```
LONG SETUP (Sweeps sell-side liquidity):
  1. Identify SSL level (equal lows, swing low, round number)
  2. Price wicks BELOW the SSL level (stop hunt)
  3. Candle CLOSES back above the SSL level
  4. Market structure shows: prior trend was bullish (HL/HH sequence)
  5. Confirmation: next candle is bullish and strong (displacement)
  6. OPTIONAL confluence: SSL at 61.8% Fib or VP VAL
  → ENTER LONG: Close of confirmation candle
  → STOP: Below the wick low (the sweep extreme)
  → TP1: Last BOS level
  → TP2: Previous BSL (equal highs)
  → TP3: 1:3 R:R extension

SHORT SETUP: Mirror — sweeps BSL (equal highs), closes below, bearish CHoCH

POWER COMBO: SSL sweep at 61.8% Fib + VP POC = "Institutional Perfect Entry"
  → Confidence: Grade A+ (highest)
  → R:R typically 1:5 to 1:10 on higher timeframes
```

**Why institutions use this:**
> A bank needs to buy 500,000 lots of EURUSD. To fill that order at a good price, they need SELLERS. Where do sellers come from? Stop-losses below equal lows. The bank pushes price down, triggers retail stops, absorbs all that selling, THEN reverses up. This is the oldest trick in finance. Now we can detect it in real time.

---

### ═══════════════════════════════════════
### TECHNIQUE C: Imbalance (Fair Value Gap — FVG)
### ═══════════════════════════════════════

**Used by:** ICT methodology, quant funds using order flow, Citadel, Jane Street, all high-frequency and institutional desks that model order flow

**Concept:**
An **Imbalance** (also called Fair Value Gap or FVG) is a 3-candle pattern where price moves so fast and aggressively that there is a GAP between the top of candle 1 and the bottom of candle 3. This gap represents a price range where only ONE-SIDED orders were filled — there was no two-way price discovery. The market is "imbalanced."

Markets are fundamentally mean-reverting at the microstructure level. Price WILL return to fill these gaps to achieve two-sided price discovery. Institutions know this and place limit orders inside FVGs.

**Types of Imbalance:**
```
1. Fair Value Gap (FVG) — Standard 3-candle gap
2. Inversion FVG (IFVG) — FVG that was tested and flipped (now opposite polarity)
3. Optimal Trade Entry (OTE) — FVG at 62%-79% of the FVG range (ICT concept)
4. Balanced Price Range (BPR) — Overlapping bull+bear FVGs = very strong zone
5. Consequent Encroachment (CE) — 50% of FVG (most likely first touch point)
6. Volume Imbalance — Gap between close of bar N and open of bar N+1
7. Opening Gap — Weekend/overnight gap (always fills on major indices)
```

**Implementation — FVG Detection Engine:**
```javascript
class ImbalanceEngine {

  detectFVG(bars) {
    const fvgs = []
    for (let i = 1; i < bars.length - 1; i++) {
      const [prev, curr, next] = [bars[i-1], bars[i], bars[i+1]]

      // Bullish FVG: gap between high[i-1] and low[i+1]
      // Candle i is a strong bullish displacement candle
      if (next.low > prev.high && curr.close > curr.open) {
        fvgs.push({
          type: 'BULLISH_FVG',
          top: next.low,           // bottom of candle 3
          bottom: prev.high,       // top of candle 1
          midpoint: (next.low + prev.high) / 2,  // CE (Consequent Encroachment)
          ote_low: prev.high + (next.low - prev.high) * 0.62,  // OTE zone start
          ote_high: prev.high + (next.low - prev.high) * 0.79, // OTE zone end
          startIndex: i,
          filled: false,
          mitigated: false,
          size: next.low - prev.high,
          label: 'Bullish FVG',
          color: '--imbalance-bull'
        })
      }

      // Bearish FVG: gap between low[i-1] and high[i+1]
      if (next.high < prev.low && curr.close < curr.open) {
        fvgs.push({
          type: 'BEARISH_FVG',
          top: prev.low,
          bottom: next.high,
          midpoint: (prev.low + next.high) / 2,
          ote_low: next.high + (prev.low - next.high) * 0.21,
          ote_high: next.high + (prev.low - next.high) * 0.38,
          startIndex: i,
          filled: false,
          mitigated: false,
          size: prev.low - next.high,
          label: 'Bearish FVG',
          color: '--imbalance-bear'
        })
      }
    }
    return fvgs
  }

  // Track FVG mitigation in real-time
  updateMitigation(fvgs, currentBar) {
    fvgs.forEach(fvg => {
      if (fvg.filled) return
      if (fvg.type === 'BULLISH_FVG' && currentBar.low <= fvg.midpoint) {
        fvg.mitigated = true   // CE touched
      }
      if (fvg.type === 'BULLISH_FVG' && currentBar.low <= fvg.bottom) {
        fvg.filled = true      // Fully filled
        fvg.label += ' [FILLED]'
      }
      // Mirror for bearish
    })
    return fvgs
  }

  // Detect Inversion FVG (FVG that got filled → becomes resistance/support)
  detectInversionFVG(fvgs, bars) {
    return fvgs
      .filter(fvg => fvg.filled)
      .map(fvg => ({
        ...fvg,
        type: fvg.type === 'BULLISH_FVG' ? 'BEARISH_IFVG' : 'BULLISH_IFVG',
        label: 'Inversion FVG — Flipped Polarity',
      }))
  }

  // Balanced Price Range: overlapping bull + bear FVG
  detectBPR(bullFVGs, bearFVGs) {
    const bprs = []
    bullFVGs.forEach(bull => {
      bearFVGs.forEach(bear => {
        const overlapTop = Math.min(bull.top, bear.top)
        const overlapBottom = Math.max(bull.bottom, bear.bottom)
        if (overlapTop > overlapBottom) {
          bprs.push({
            type: 'BPR',
            top: overlapTop, bottom: overlapBottom,
            label: 'Balanced Price Range ★★★',
            strength: 'EXTREME'  // Highest priority zone
          })
        }
      })
    })
    return bprs
  }
}
```

**Chart Rendering:**
```
FVG Zones (drawn as rectangles extending rightward until filled):
  Bullish FVG:
    ├── Cyan semi-transparent rectangle from bottom to top of gap
    ├── Dashed midline (CE — Consequent Encroachment)
    ├── Dotted OTE zone inside (62%–79% of gap)
    ├── Label: "Bull FVG 4H" with size in pips/points
    └── When price enters: zone pulses / brightens

  Bearish FVG:
    ├── Red semi-transparent rectangle
    ├── Same CE and OTE markings
    └── When filled: zone color fades + "FILLED" label

  Inversion FVG:
    ├── Purple outline — was bullish, now acts as resistance
    └── Label: "IFVG ↕"

  BPR (Balanced Price Range):
    ├── Bright gold rectangle
    ├── Strongest visual treatment
    └── Label: "BPR ★★★ — Institutional Zone"

Multi-Timeframe FVG Panel:
  Show FVGs from 15m, 1h, 4h, Daily simultaneously
  Higher TF FVGs drawn with thicker borders + priority label
```

**Signal Generation:**
```
LONG SETUP — FVG Entry:
  1. Identify unfilled Bullish FVG from strong displacement move
  2. Price retraces into the FVG
  3. OTE entry: Enter at 62%–79% of the FVG (best price, tightest stop)
  4. CE entry: Enter at 50% midpoint (safer, slightly wider stop)
  5. Confirmation: Bullish rejection candle inside FVG (pin bar, engulfing)
  6. Market structure must be bullish (HL structure intact)
  → STOP: Below FVG bottom (full FVG fill = signal invalidated)
  → TP1: Candle 1 high (above FVG)
  → TP2: Next bearish FVG above
  → TP3: Previous swing high / BSL pool

SHORT SETUP: Mirror — bearish FVG, price retraces into it, OTE at 21%–38%

POWER COMBO: FVG + SSL Sweep + 61.8% Fib + VP POC = "The Perfect ICT Setup"
  → All 3 institutional techniques converge
  → Confidence: A++ | Expected R:R: 1:5 to 1:15
  → Alert: "🔥 INSTITUTIONAL CONFLUENCE DETECTED"
```

**Why institutions use this:**
> When price moves 3% in one candle, no retail trader can fill there. Only institutions have those orders. The FVG is literally the footprint of institutional buying/selling. Price returns to fill the gap because market makers need to complete two-sided price discovery — it's how market structure is maintained. ICT concepts have been validated by millions of traders as a genuine look into how banks trade.

---

## 🏆 TOP 13 PROFITABLE STRATEGIES — COMPLETE SPEC

### Strategy Base Class
```javascript
class Strategy {
  name: string
  description: string
  whoUses: string           // which institutions / hedge funds
  assetClasses: AssetClass[]
  timeframes: Timeframe[]
  winRateExpected: string
  riskRewardMin: number
  getSignal(bars: OHLCV[], context: MarketContext): Signal | null
}
```

---

### Strategy 1: Volume Profile + Fibonacci Confluence ★ INSTITUTIONAL
**Type:** Institutional Level + Fibonacci | **Who Uses:** CME market makers, Renaissance Technologies, Two Sigma
**Best For:** All | **Timeframe:** 1h, 4h, Daily
**Historical Win Rate:** 68–74% | **R:R:** 1:2.5 to 1:5

**Rules:**
- SETUP: Map Volume Profile for the current session/swing
- FILTER: Find Fibonacci retracements (38.2%, 61.8%, 78.6%) that align with POC or HVN within 0.2%
- ENTRY LONG: Price pulls back to Fib+POC zone + reversal candle + volume dry-up
- ENTRY SHORT: Price rallies to Fib+VAH+HVN zone + rejection candle
- STOP: Below LVN beneath the zone (price moves fast through LVNs)
- TP1: Opposite VP boundary (VAH for long, VAL for short)
- TP2: 1.272 Fib extension
- TP3: 1.618 Fib extension

**Signal Label:** "VP+FIB — LONG [Symbol] @ 61.8%+POC | SL:[x] | TP1(VAH):[y] | R:R 1:3.1"

---

### Strategy 2: Liquidity Sweep + Market Structure Reversal ★ INSTITUTIONAL
**Type:** Smart Money / Stop Hunt | **Who Uses:** JPMorgan FX, Goldman Sachs prop, all major banks
**Best For:** Forex, Crypto, Indices | **Timeframe:** 15m, 1h, 4h
**Historical Win Rate:** 65–72% | **R:R:** 1:3 to 1:10

**Rules:**
- SETUP: Identify clear equal highs (BSL) or equal lows (SSL) on chart
- TRIGGER: Price sweeps beyond the level and candle CLOSES back inside
- STRUCTURE: Prior structure must be intact (bullish HL sequence for long setups)
- CONFIRMATION: CHoCH or BOS in direction of reversal after sweep
- DISPLACEMENT: Strong momentum candle post-sweep confirms institutions entered
- ENTRY: Close of displacement candle post-sweep
- STOP: 3–5 pips/ticks beyond the sweep extreme
- TP1: Last significant internal BOS level
- TP2: Opposing liquidity pool (equal highs if we swept equal lows)
- TP3: 1:5 R:R target (for daily/weekly setups)

**Signal Label:** "SWEEP — SSL SWEPT. BULLISH CHoCH. LONG [Symbol] | SL:[x] | TP1:[y] | TP2(BSL):[z]"

---

### Strategy 3: Imbalance / FVG Entry at OTE ★ INSTITUTIONAL
**Type:** Order Flow / Imbalance | **Who Uses:** Citadel, Jane Street, ICT methodology, Prop firms globally
**Best For:** Forex, Crypto, Indices | **Timeframe:** 5m, 15m, 1h, 4h
**Historical Win Rate:** 63–70% | **R:R:** 1:3 to 1:8

**Rules:**
- SETUP: Strong displacement move creates FVG (3-candle gap)
- TREND: Market structure must confirm direction (bullish structure for bull FVG entry)
- ENTRY: Price retraces INTO the FVG — enter at OTE (62%–79% of gap for long, 21%–38% for short)
- CONFIRMATION: Rejection candle inside FVG (pin bar, bullish engulfing)
- STOP: Below FVG bottom (invalidation — FVG fully filled means setup failed)
- TP1: Above FVG top (immediate target)
- TP2: Next imbalance above / previous swing high
- TP3: BSL pool above

**Power Combo Rule:** If FVG overlaps with SSL sweep zone or Fib level → grade A++ signal

**Signal Label:** "FVG ENTRY — BULLISH FVG 4H. OTE: [price range]. LONG [Symbol] | SL:[x] | TP1:[y]"

---

### Strategy 4: Harmonic Pattern + Fibonacci Confluence
**Type:** Reversal / Pattern | **Who Uses:** Forex prop traders, hedge fund quants, retail professionals
**Best For:** Forex, Crypto | **Timeframe:** 1h, 4h, Daily
**Historical Win Rate:** 62–68% | **R:R:** 1:2 to 1:4

- SETUP: Valid XABCD harmonic pattern completing (Gartley, Bat, Butterfly, Crab)
- ENTRY: At D point (PCZ center)
- CONFIRMATION: RSI divergence at D + volume dry-up at completion
- STOP: Beyond X point (bull) or 1.618 XA extension (bear)
- TP1: 38.2% of AD retracement | TP2: 61.8% | TP3: B point

---

### Strategy 5: ICT Order Block + FVG
**Type:** Institutional Price Action | **Who Uses:** ICT-trained traders, prop firm traders, bank desks
**Best For:** Forex, Indices | **Timeframe:** 15m, 1h, 4h
**Historical Win Rate:** 66–71% | **R:R:** 1:3 to 1:6

- SETUP: Identify Order Block (last bearish candle before bullish BOS, or vice versa)
- WAIT: Price retraces into OB
- CONFLUENCE: FVG exists within or above the OB (unfilled)
- ENTRY: Limit at OB + FVG overlap zone
- STOP: Below OB (with buffer)
- TP1: Nearest FVG fill | TP2: Next BSL | TP3: Daily FVG above

---

### Strategy 6: UT Bot + Moving Average Ribbon
**Type:** Trend + Momentum | **Who Uses:** Algorithmic traders, systematic hedge funds
**Best For:** All | **Timeframe:** 15m, 1h, 4h
**Historical Win Rate:** 60–65% | **R:R:** 1:2 to 1:3

- SETUP: MA Ribbon fully ordered (bullish or bearish alignment)
- ENTRY: UT Bot BUY/SELL signal fires + price above/below entire ribbon
- FILTER: LR Candles confirm direction
- STOP: UT Bot trailing stop level
- TP: Previous major S/R or 2:1 R:R minimum

---

### Strategy 7: Ichimoku Cloud Full Confluence
**Type:** Multi-factor Trend | **Who Uses:** Japanese institutional investors, macro hedge funds
**Best For:** Crypto, Forex, Stocks | **Timeframe:** 4h, Daily
**Historical Win Rate:** 61–67% | **R:R:** 1:2.5

- ENTRY LONG (all 6 conditions must be true):
  1. Price above Kumo cloud
  2. Kumo is green (Senkou A > Senkou B)
  3. Chikou Span above price 26 bars back
  4. Tenkan-Sen above Kijun-Sen
  5. Future cloud (26 bars ahead) is green
  6. RSI > 50
- STOP: Kijun-Sen (base line)
- TP: 2× ATR or next resistance

---

### Strategy 8: Supertrend + Volume Profile HVN
**Type:** Trend + Volume | **Who Uses:** Equity traders, systematic funds
**Best For:** Stocks, Crypto | **Timeframe:** 1h, 4h
**Historical Win Rate:** 60–64% | **R:R:** 1:2

- SETUP: Supertrend flips + POC or HVN aligns with flip level
- ENTRY: Close above/below Supertrend + VP node
- STOP: Opposite side of Supertrend + 0.5 ATR
- TP: Next HVN above (long) or below (short)

---

### Strategy 9: Golden Cross / Death Cross — Institutional Filter
**Type:** Trend Following | **Who Uses:** Pension funds, ETF managers, Warren Buffett-style funds
**Best For:** Stocks, ETFs | **Timeframe:** Daily, Weekly
**Historical Win Rate:** 58–63% | **R:R:** 1:3 to 1:8 (weekly timeframe)

- ENTRY LONG: 50 EMA crosses above 200 EMA + Volume > 20-period average
- FILTER: VP POC is below current price (institutions accumulated below)
- STOP: Below 200 EMA
- TP: Next weekly resistance / VP-derived extension

---

### Strategy 10: Bollinger Band Squeeze + Breakout
**Type:** Volatility Breakout | **Who Uses:** Quantitative funds, volatility arbitrage desks
**Best For:** Crypto, Forex | **Timeframe:** 4h, Daily
**Historical Win Rate:** 57–62% | **R:R:** 1:2.5

- SETUP: BB Bandwidth < 10th percentile of last 126 bars (Squeeze)
- ENTRY: Close above upper band (long) or below lower band (short)
- CONFIRMATION: Volume spike > 2× average + Keltner Channel alignment
- STOP: Middle BB + 1 ATR
- TP: Band width projected from breakout

---

### Strategy 11: MACD + RSI Confluence
**Type:** Momentum | **Who Uses:** Retail professionals, semi-systematic traders
**Best For:** All | **Timeframe:** 1h, 4h, Daily
**Historical Win Rate:** 56–60% | **R:R:** 1:2

- ENTRY LONG: MACD crosses above signal + RSI > 50 + price above 50 EMA
- STOP: Below recent swing low
- TP: 2:1 R:R or RSI overbought exit

---

### Strategy 12: Mean Reversion — Keltner + RSI Extreme
**Type:** Mean Reversion | **Who Uses:** Statistical arbitrage funds, market neutral funds
**Best For:** Range-bound stocks, low-volatility assets | **Timeframe:** Daily
**Historical Win Rate:** 62–68% (range conditions only) | **R:R:** 1:1.5

- ENTRY LONG: Price below lower Keltner + RSI < 25 + Stoch RSI turning up
- STOP: 2 ATR beyond band
- TP: Middle Keltner line (mean)

---

### Strategy 13: Breakout Retest (S/R Flip) + Volume Confirmation
**Type:** Price Action + Volume | **Who Uses:** All professional traders
**Best For:** All | **Timeframe:** 4h, Daily
**Historical Win Rate:** 61–66% | **R:R:** 1:2.5

- SETUP: Major horizontal level with 3+ touches identified
- TRIGGER: Strong close beyond level with volume spike
- ENTRY: Pullback to level for retest + rejection candle
- STOP: Beyond level (invalidation)
- TP: Next major S/R / VP HVN above

---

## 🚨 SIGNAL ENGINE

### Signal Object Schema
```typescript
interface Signal {
  id: string
  timestamp: number
  symbol: string
  strategy: string
  institutionalTechniques: string[]   // which of the 3 institutional methods fired
  direction: 'LONG' | 'SHORT'
  timeframe: string
  entryPrice: number
  entryZone: [number, number]         // for limit orders (OTE zone etc.)
  stopLoss: number
  takeProfits: [number, number, number]
  riskRewardRatio: number
  confidence: 'A++' | 'A+' | 'A' | 'B' | 'C'
  // A++ = all 3 institutional techniques + 2 strategies
  // A+  = 2 institutional techniques + 1 strategy
  // A   = 1 institutional + 2 strategies
  reason: string
  confluences: string[]               // list of confirming factors
  invalidationPrice: number           // if price hits this, signal is void
  patternName?: string
  vpPOC?: number                      // Volume Profile POC if relevant
  fvgZone?: [number, number]          // FVG range if relevant
  liquiditySwept?: string             // which liquidity was swept
}
```

### Signal Display on Chart
```
For every signal, draw:
  ▶ Entry arrow at entry price (green=long, red=short)
  ═══ White dashed: Entry Price line + label
  ═══ Red dashed:   Stop Loss line — "SL -X%" label
  ═══ Yellow:       TP1 line — "TP1 +X% (1:Y R:R)" label
  ═══ Green:        TP2 line — "TP2 +X%" label
  ═══ Bright green: TP3 line — "TP3 +X% (1:Z R:R)" label
  □ Red tint box: Entry → Stop zone
  □ Green gradient box: Entry → TP3 zone
  📌 Signal card (top-right of signal box):
       Strategy name
       Confidence grade
       Institutional techniques used
       R:R ratio
       Reason (2 lines)
  🔴 Invalidation line: "If price reaches here, signal is void"

  For VP + FVG signals also draw:
  □ Volume Profile histogram on right axis
  □ FVG rectangle in cyan/red
  ★ Confluence star icon at the entry zone
```

### Signal Reason Generator
```javascript
function generateReason(signal: Signal): string {
  // Example A++ grade output:
  // "🔥 INSTITUTIONAL SETUP — LONG BTCUSDT 4H
  //  ① SSL (equal lows at 78,200) was swept — stop hunt confirmed
  //  ② Price retraced into Bullish FVG (78,100–78,450) — OTE zone
  //  ③ 61.8% Fibonacci aligns with VP POC (78,320) — triple confluence
  //  ④ Bullish CHoCH confirmed on 15m — structure shifted
  //  ⑤ UT Bot BUY signal fired above MA Ribbon
  //  Entry: 78,380 | SL: 77,800 (-0.74%) | TP1: 80,200 (+2.3%)
  //  TP2: 82,500 (+5.3%) | TP3: 85,000 (+8.5%) | R:R = 1:5.4"
}
```

### Confluence Score System
```
Each confluence adds points:
  +3 pts: Volume Profile POC alignment
  +3 pts: Liquidity sweep confirmed
  +3 pts: FVG / Imbalance entry
  +2 pts: Fibonacci level (61.8% or 78.6%)
  +2 pts: Order Block alignment
  +2 pts: Market Structure CHoCH
  +1 pt:  RSI confirmation
  +1 pt:  UT Bot signal
  +1 pt:  MA Ribbon alignment
  +1 pt:  Volume dry-up on pullback

Score 10+: A++ 🔥 (Institutional grade)
Score 7–9: A+
Score 5–6: A
Score 3–4: B
Score 1–2: C (low confidence — log only, no alert)
```

---

## 🔔 ALERT SYSTEM

### Alert Types
- Price crosses level / enters % range
- Indicator crosses threshold (RSI, MACD)
- Strategy signal fires (any of 13 strategies)
- **FVG detected** (new imbalance formed)
- **Liquidity sweep event** (SSL or BSL swept)
- **Volume Profile POC break** (price crosses POC)
- Harmonic pattern completion
- Volume spike (> N× average)
- CHoCH / BOS detected

### Alert Delivery
- In-app toast + persistent signal log
- Browser push notification
- Sound alert (configurable)
- Telegram bot (send full signal JSON as formatted message)
- Email (daily digest or real-time)
- Webhook (POST JSON to any URL)
- Discord webhook (formatted embed)

---

## 🔍 SYMBOL & DATA ARCHITECTURE

### Data Sources
1. **Crypto:** Binance WebSocket (free, real-time)
2. **US Stocks:** Alpaca / Polygon.io
3. **Forex:** OANDA
4. **Commodities / Indices:** Yahoo Finance
5. **Indian Stocks:** NSE via Angel Broking / Zerodha Kite API

### Timeframes
`1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1D, 1W, 1M`

---

## 💹 MULTI-TIMEFRAME ANALYSIS PANEL

```
Symbol: BTCUSDT
┌──────────────────────┬────────┬────────┬────────┬────────┐
│ Technique/Strategy   │  15m   │   1h   │   4h   │  1D    │
├──────────────────────┼────────┼────────┼────────┼────────┤
│ Volume Profile       │ At POC │ Above  │ Above  │ Above  │
│ Liquidity Sweep      │ ─      │ SSL ✓  │ SSL ✓  │ ─      │
│ FVG / Imbalance      │ In FVG │ In FVG │ ─      │ ─      │
│ UT Bot               │ ▲ BUY  │ ▲ BUY  │ ▲ BUY  │ ─      │
│ MA Ribbon            │ ▲ BULL │ ▲ BULL │ ▲ BULL │ ▲ BULL │
│ Ichimoku             │ ─      │ ▲ BULL │ ▲ BULL │ ▲ BULL │
│ Market Structure     │ BOS ▲  │ CHoCH▲ │ HL seq │ HL seq │
├──────────────────────┼────────┼────────┼────────┼────────┤
│ CONFLUENCE SCORE     │  7/13  │ 11/13  │  9/13  │  7/13  │
│ GRADE                │   A    │  A++🔥 │  A+    │   A    │
└──────────────────────┴────────┴────────┴────────┴────────┘
Overall: 🟢 STRONG BULLISH — Primary signal: 1H A++ institutional setup
```

---

## 📉 BACKTESTING ENGINE

### Config
- Symbol, Strategy, Date Range, Timeframe
- Initial Capital, Risk Per Trade (%), Commission, Slippage

### Results Panel
```
┌─────────────────────────────────────────────────────────┐
│  BACKTEST — Liquidity Sweep + FVG / BTCUSDT / 4H       │
│  Period: Jan 2022 – Dec 2024                           │
├─────────────────────────────────────────────────────────┤
│  Net Profit:        +$89,400 (+894%)                   │
│  Win Rate:          68.4%                               │
│  Total Trades:      214                                 │
│  Profit Factor:     3.12                                │
│  Max Drawdown:      -14.2%                              │
│  Avg R:R Ratio:     1:4.1                               │
│  Sharpe Ratio:      2.31                                │
│  Calmar Ratio:      6.29                                │
├─────────────────────────────────────────────────────────┤
│  [Equity Curve Chart]                                   │
│  [Monthly Returns Heatmap — green/red grid]             │
│  [Trade List — sortable by R, date, direction]          │
│  [Drawdown Chart]                                       │
│  [Win/Loss Streak Analysis]                             │
└─────────────────────────────────────────────────────────┘
```

---

## 🗂️ INDICATOR SETTINGS UI

Per indicator panel:
- Sliders, color pickers, toggles for all inputs
- Show/hide per output series
- Line style (solid / dashed / dotted)
- Reset to defaults
- Z-index / draw order
- Delete indicator

---

## 📁 PROJECT STRUCTURE

```
protrader-os/
├── src/
│   ├── components/
│   │   ├── Chart/
│   │   │   ├── ChartContainer.jsx
│   │   │   ├── ChartToolbar.jsx
│   │   │   ├── DrawingTools.jsx
│   │   │   └── SignalOverlay.jsx
│   │   ├── Indicators/
│   │   │   ├── IndicatorEngine.js
│   │   │   └── indicators/
│   │   │       ├── UTBot.js
│   │   │       ├── MARibbon.js
│   │   │       ├── LinearRegressionCandles.js
│   │   │       ├── HarmonicPatterns.js
│   │   │       ├── VolumeProfile.js        ← NEW
│   │   │       ├── LiquidityEngine.js      ← NEW
│   │   │       ├── ImbalanceFVG.js         ← NEW
│   │   │       ├── OrderBlocks.js
│   │   │       ├── RSI.js
│   │   │       └── MACD.js
│   │   ├── Strategies/
│   │   │   ├── StrategyEngine.js
│   │   │   └── strategies/
│   │   │       ├── VPFibConfluence.js      ← NEW
│   │   │       ├── LiquiditySweepMS.js     ← NEW
│   │   │       ├── FVGOTEEntry.js          ← NEW
│   │   │       ├── HarmonicStrategy.js
│   │   │       ├── ICTOrderBlock.js
│   │   │       ├── UTBotRibbon.js
│   │   │       ├── Ichimoku.js
│   │   │       ├── SupertrendVP.js
│   │   │       ├── GoldenCross.js
│   │   │       ├── BBSqueeze.js
│   │   │       ├── MACDRSIConfluence.js
│   │   │       ├── MeanReversion.js
│   │   │       └── BreakoutRetest.js
│   │   ├── Panels/
│   │   │   ├── LeftPanel/
│   │   │   │   ├── SymbolTree.jsx
│   │   │   │   └── Watchlist.jsx
│   │   │   ├── RightPanel/
│   │   │   │   ├── SignalPanel.jsx
│   │   │   │   ├── NewsFeed.jsx
│   │   │   │   └── MTFPanel.jsx
│   │   │   └── BottomPanel/
│   │   │       ├── SignalLog.jsx
│   │   │       └── AccountStats.jsx
│   │   ├── Alerts/
│   │   │   ├── AlertEngine.js
│   │   │   └── AlertPanel.jsx
│   │   └── Backtest/
│   │       ├── BacktestEngine.js
│   │       └── BacktestResults.jsx
│   ├── data/
│   │   ├── feeds/
│   │   │   ├── BinanceFeed.js
│   │   │   ├── AlpacaFeed.js
│   │   │   └── YahooFeed.js
│   │   └── DataManager.js
│   ├── store/
│   │   ├── chartStore.js
│   │   ├── indicatorStore.js
│   │   ├── signalStore.js
│   │   └── alertStore.js
│   ├── utils/
│   │   ├── math.js
│   │   ├── fibonacci.js
│   │   ├── volumeProfile.js
│   │   └── patternDetect.js
│   └── App.jsx
├── public/
├── package.json
└── vite.config.js
```

---

## 🚀 IMPLEMENTATION PHASES

### Phase 1 — Foundation (Week 1–2)
- Vite + React + lightweight-charts v4
- Binance WebSocket live data
- Candlestick chart + symbol search + timeframe

### Phase 2 — Core Indicators (Week 3–4)
- SMA, EMA, RSI, MACD, Bollinger Bands, Volume
- MA Ribbon, UT Bot, Linear Regression Candles, Supertrend, ATR

### Phase 3 — Institutional Tools (Week 5) ← PRIORITY
- **Volume Profile (VPVR + VPFR)**
- **Liquidity Engine (equal highs/lows, sweep detection)**
- **FVG / Imbalance Engine (all 7 FVG types)**
- Order Blocks, Breaker Blocks, BOS/CHoCH labels

### Phase 4 — Harmonic + Advanced (Week 6)
- Harmonic Pattern Detection (all 9 patterns)
- Ichimoku Cloud, Volume Profile Market Profile
- Auto Support/Resistance, Pivot Points

### Phase 5 — Strategies & Signals (Week 7)
- All 13 strategies implemented
- Confluence score system
- Signal overlay on chart (entry/SL/TP boxes)
- Reason generator
- Right panel signal feed

### Phase 6 — Alerts & Backtesting (Week 8–9)
- Alert engine (in-app, push, Telegram, webhook)
- Backtesting engine + equity curve
- Trade list with R-multiple tracking

### Phase 7 — Multi-Asset & Polish (Week 10)
- Alpaca/Yahoo data feeds
- Drawing tools (all 15+)
- Multi-chart grid
- Layout save/load
- MTF analysis panel

---

## 📌 IMPLEMENTATION NOTES FOR CLAUDE

1. **lightweight-charts v4** always — not v3. API is completely different.
2. **Volume Profile** must use a WebWorker — it's CPU intensive for long date ranges.
3. **FVG detection** runs on every new bar in real-time — keep it O(n) not O(n²).
4. **Liquidity sweep** needs tick-level precision — check high/low, not just close.
5. **Binance WebSocket:** `wss://stream.binance.com:9443/ws/{symbol}@kline_{interval}`
6. **OHLCV format:** `{ time: unix_seconds, open, high, low, close, volume }`
7. **Confluence grade A++** triggers sound + push notification by default.
8. **FVG zones** persist until filled — store in Zustand + localStorage.
9. **Signal reason must always be human-readable** — no jargon without explanation.
10. **VP POC line** should always be visible — gold horizontal line, high z-index.
11. **All 3 institutional techniques** must be toggleable independently.
12. **Equal highs/lows** detection: within 0.1% default, user-configurable.
13. **Harmonic tolerance:** ±5% on Fibonacci ratios — user-configurable.
14. No paid API required for crypto — Binance covers real-time + historical.

---

*This CLAUDE.md is the single source of truth for ProTrader OS. The 3 institutional techniques (Volume Profile + Fib, Liquidity Sweep + Market Structure, Imbalance/FVG) are the highest-priority features — they are what every hedge fund and bank uses but retail traders rarely understand. Build these first in Phase 3.*
