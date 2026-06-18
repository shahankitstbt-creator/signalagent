// NSE Delivery % — the truest "big money entered" signal. NSE's daily security-wise
// bhavcopy reports DELIV_PER = % of traded volume actually taken delivery of (held)
// vs intraday churn. High volume + high delivery % = genuine accumulation, not day-traders.
// Best-effort: NSE archives sometimes rate-limit server scraping → graceful fallback.
import { getText, sleep } from './lib.mjs'

function parseDelivery(txt, map) {
  const lines = txt.trim().split(/\r?\n/)
  const head = lines[0].split(',').map(s => s.trim())
  const iSym = head.indexOf('SYMBOL'), iSer = head.indexOf('SERIES')
  const iPer = head.indexOf('DELIV_PER'), iQty = head.indexOf('DELIV_QTY'), iVol = head.indexOf('TTL_TRD_QNTY')
  if (iSym < 0 || iPer < 0) return
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(',').map(s => s.trim())
    if (c[iSer] !== 'EQ') continue
    const pct = parseFloat(c[iPer])
    if (!isNaN(pct)) map[c[iSym]] = { pct: +pct.toFixed(1), qty: +c[iQty] || 0, vol: +c[iVol] || 0 }
  }
}

// returns { map: { SYMBOL: {pct, qty, vol} }, date: 'YYYY-MM-DD'|null }
export async function fetchDelivery(today = new Date()) {
  const map = {}
  for (let back = 0; back < 7; back++) {
    const d = new Date(today); d.setDate(today.getDate() - back)
    const wd = d.getDay(); if (wd === 0 || wd === 6) continue
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), yy = d.getFullYear()
    const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${yy}.csv`
    const txt = await getText(url, 2)
    if (txt && /SYMBOL/.test(txt) && txt.length > 1000) {
      parseDelivery(txt, map)
      if (Object.keys(map).length > 100) { console.log(`Delivery: ${Object.keys(map).length} stocks from ${dd}-${mm}-${yy}`); return { map, date: `${yy}-${mm}-${dd}` } }
    }
    await sleep(400)
  }
  console.log('Delivery: NSE bhavcopy not reachable — proceeding without delivery data')
  return { map: {}, date: null }
}

// strength label for a delivery %
export const delivLabel = pct => pct >= 65 ? 'strong hands' : pct >= 45 ? 'mixed' : 'mostly intraday'

// CLI smoke test
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('delivery.mjs')) {
  fetchDelivery().then(r => {
    console.log('date:', r.date, '| stocks:', Object.keys(r.map).length)
    const top = Object.entries(r.map).filter(([, v]) => v.vol > 100000).sort((a, b) => b[1].pct - a[1].pct).slice(0, 8)
    top.forEach(([s, v]) => console.log(`  ${s.padEnd(12)} deliv ${v.pct}%  vol ${(v.vol / 1e5).toFixed(1)}L`))
  })
}
