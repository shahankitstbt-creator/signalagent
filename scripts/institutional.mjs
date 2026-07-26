// ─────────────────────────────────────────────────────────────────────────
// INSTITUTIONAL FOOTPRINT — the smart-money positioning that front-runs index moves.
// (1) FII/DII cash flow (who's buying/selling the market), (2) FII derivatives
// positioning from NSE's participant-wise OI (Future Index Long vs Short = the single
// clearest bias tell). Published EOD → tells you the regime for the NEXT session,
// i.e. BEFORE the move. All best-effort with graceful fallback. Stored history lets us
// read the CHANGE (FIIs ADDING shorts = fresh bearish intent).
// ─────────────────────────────────────────────────────────────────────────
import { getText, getJSON, sleep } from './lib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

const HIST = 'public/fii_history.json'
export function loadFiiHistory() { try { return JSON.parse(readFileSync(HIST, 'utf8')) } catch { return [] } }
function saveFiiHistory(h) { try { writeFileSync(HIST, JSON.stringify(h.slice(-120), null, 2)) } catch {} }

// FII/DII cash market net (₹ crore) — who moved the actual market today
export async function fetchFiiDiiCash() {
  try {
    const j = await getJSON('https://www.nseindia.com/api/fiidiiTradeReact')
    if (!Array.isArray(j)) return null
    const pick = c => { const r = j.find(x => (x.category || '').toUpperCase().includes(c)); return r ? +parseFloat(r.netValue).toFixed(0) : null }
    const date = j[0]?.date || null
    return { date, fiiCash: pick('FII'), diiCash: pick('DII') }
  } catch { return null }
}

// Participant-wise OI (contracts). Row per Client/DII/FII/Pro. The index-futures net
// (Long − Short) for FII is the core positioning read.
export async function fetchParticipantOI(today = new Date()) {
  for (let back = 0; back < 7; back++) {
    const d = new Date(today); d.setDate(today.getDate() - back)
    const wd = d.getDay(); if (wd === 0 || wd === 6) continue
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), yy = d.getFullYear()
    const url = `https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_${dd}${mm}${yy}.csv`
    let txt; try { txt = await getText(url, 2) } catch { txt = null }
    if (txt && /Future Index Long/.test(txt)) {
      const rows = {}
      for (const line of txt.trim().split(/\r?\n/)) {
        const c = line.split(',').map(s => s.trim().replace(/"/g, ''))
        if (['Client', 'DII', 'FII', 'Pro', 'TOTAL'].includes(c[0])) {
          rows[c[0]] = {
            futIdxLong: +c[1] || 0, futIdxShort: +c[2] || 0,
            optIdxCallLong: +c[5] || 0, optIdxPutLong: +c[6] || 0,
            optIdxCallShort: +c[7] || 0, optIdxPutShort: +c[8] || 0,
          }
        }
      }
      if (rows.FII) return { date: `${yy}-${mm}-${dd}`, rows }
    }
    await sleep(300)
  }
  return null
}

// Combine cash + derivatives + day-over-day change into a market-regime bias.
export function institutionalBias(today = new Date()) {
  return (async () => {
    const cash = await fetchFiiDiiCash()
    const part = await fetchParticipantOI(today)
    const hist = loadFiiHistory()
    if (!part && !cash) return { available: false, bias: 'neutral', score: 0, reasons: ['FII/DII data not reachable this run'], fii: null }

    const fii = part?.rows?.FII
    const futIdxNet = fii ? fii.futIdxLong - fii.futIdxShort : null
    const futRatio = fii && fii.futIdxShort ? +(fii.futIdxLong / fii.futIdxShort).toFixed(2) : null
    const optIdxCallNet = fii ? fii.optIdxCallLong - fii.optIdxCallShort : null
    const optIdxPutNet = fii ? fii.optIdxPutLong - fii.optIdxPutShort : null

    // record history + compute change vs previous session
    const date = part?.date || cash?.date || today.toISOString().slice(0, 10)
    const prev = hist.length ? hist[hist.length - 1] : null
    if (!hist.length || hist[hist.length - 1].date !== date) {
      hist.push({ date, futIdxNet, fiiCash: cash?.fiiCash ?? null, diiCash: cash?.diiCash ?? null })
      saveFiiHistory(hist)
    }
    const dNet = prev && futIdxNet != null && prev.futIdxNet != null ? futIdxNet - prev.futIdxNet : null

    let score = 0; const reasons = []
    if (futIdxNet != null) {
      if (futIdxNet < -100000) { score -= 3; reasons.push(`FII net SHORT ${Math.round(-futIdxNet / 1000)}k index futures (long/short ${futRatio}) — heavily bearish positioning`) }
      else if (futIdxNet < 0) { score -= 1; reasons.push(`FII net short index futures (${futRatio})`) }
      else if (futIdxNet > 100000) { score += 3; reasons.push(`FII net LONG ${Math.round(futIdxNet / 1000)}k index futures — bullish positioning`) }
      else { score += 1; reasons.push(`FII net long index futures (${futRatio})`) }
    }
    if (dNet != null && Math.abs(dNet) > 10000) {
      if (dNet < 0) { score -= 1; reasons.push(`FIIs ADDED ${Math.round(-dNet / 1000)}k net shorts vs last session — fresh bearish intent`) }
      else { score += 1; reasons.push(`FIIs covered ${Math.round(dNet / 1000)}k shorts / added longs — easing bearishness`) }
    }
    if (cash?.fiiCash != null) {
      if (cash.fiiCash < -1500) { score -= 1; reasons.push(`FII sold ₹${Math.round(-cash.fiiCash)}cr in cash`) }
      else if (cash.fiiCash > 1500) { score += 1; reasons.push(`FII bought ₹${Math.round(cash.fiiCash)}cr in cash`) }
    }
    if (optIdxPutNet != null && optIdxCallNet != null) {
      if (optIdxPutNet > 0 && optIdxCallNet < 0) reasons.push('FII long puts + short calls — hedged/bearish options tilt')
      else if (optIdxCallNet > 0 && optIdxPutNet < 0) reasons.push('FII long calls + short puts — bullish options tilt')
    }
    const bias = score <= -2 ? 'bearish' : score >= 2 ? 'bullish' : 'neutral'
    return {
      available: true, bias, score, reasons,
      fii: { futIdxNet, futRatio, dNet, optIdxCallNet, optIdxPutNet, cash: cash?.fiiCash ?? null },
      dii: { cash: cash?.diiCash ?? null }, date,
    }
  })()
}
