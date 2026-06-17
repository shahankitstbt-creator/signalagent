# signalagent — ProTrader OS

A browser-based Indian-market **Signal Board**: a kanban where each column is a signal
generator (Volume+Accumulation, Volume Profile+Fib, Money Flow, Multibagger Quality,
Harmonic & Chart Patterns, Vedic Astro for Nifty/Gold, Hora timing, live Option-Chain
build-up) and each card is a full trade idea (LTP, entry, SL, three targets + dates,
measured backtest hit-rate) with ready-to-post social copy.

## Run locally
```bash
npm install
npm run scan      # generate public/*.json (universe scan; --full for all NSE equities)
npm start         # build + serve on http://localhost:6767
```

## Stack
React + Vite + Tailwind v4 + Zustand + lightweight-charts. Data: Yahoo Finance
(via proxy) + Angel One SmartAPI (read-only, for live option OI). See `CLAUDE.md`.

## ⚠️ Disclaimer
Educational only. Not investment advice. Not SEBI-registered. Astrology features are
traditional/educational and have no proven market edge. Accuracy figures shown are
*measured backtest* hit-rates, never guarantees. Trade at your own risk.
