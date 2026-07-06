// Futures & Options helper — NSE F&O universe (lot sizes) + option-play suggestions.
// The F&O tab reuses ALL existing signal logic (confluence, volume, delivery, astro,
// option-chain OI) but filtered to F&O-eligible instruments, with a lot-sized plan
// and a concrete options strategy per setup.
import { getText } from './lib.mjs'

// { SYMBOL: nearMonthLotSize } from NSE fo_mktlots.csv (best-effort)
export async function fetchFnoLots() {
  const t = await getText('https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv', 2)
  const lots = {}
  if (!t || t.length < 500) return lots
  const lines = t.trim().split(/\r?\n/)
  const head = lines[0].split(',').map(s => s.trim().toUpperCase())
  const iSym = head.indexOf('SYMBOL')
  const iLot = iSym + 1 // first (near) month lot column
  if (iSym < 0) return lots
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(',').map(s => s.trim())
    const sym = (c[iSym] || '').toUpperCase(), lot = parseInt(c[iLot])
    if (sym && lot > 0) lots[sym] = lot
  }
  return lots
}

const strikeStep = px => px < 100 ? 2.5 : px < 250 ? 5 : px < 500 ? 10 : px < 1000 ? 20 : px < 2500 ? 50 : 100
export const atmStrike = px => { const s = strikeStep(px); return +(Math.round(px / s) * s).toFixed(px < 100 ? 1 : 0) }

// concrete options play for a directional stock/commodity setup
export function optionPlay(direction, spot) {
  if (!spot) return direction === 'SELL' ? 'Buy ATM Put / short futures' : direction === 'BUY' ? 'Buy ATM Call / long futures' : 'Range — sell strangle'
  const step = strikeStep(spot), atm = atmStrike(spot)
  if (direction === 'SELL') return `Buy ${atm} PE (ATM) or ${atm + step} PE (ITM) — near expiry; or short futures`
  if (direction === 'BUY') return `Buy ${atm} CE (ATM) or ${atm - step} CE (ITM) — near expiry; or long futures`
  return `Range: sell ${atm + 2 * step} CE + ${atm - 2 * step} PE (strangle)`
}
