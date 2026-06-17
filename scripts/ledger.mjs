// Signal ledger — persists every emitted trade signal, evaluates each open one
// against later price action (win = T1 before SL, loss = SL before T1, expired),
// and yields a live per-generator + overall track record. Closed signals leave
// the board (only `active` is shown). Stored in public/ledger.json.
import { readFileSync, writeFileSync } from 'node:fs'

const PATH = 'public/ledger.json'
const EXPIRE_DAYS = 60

export function loadLedger() {
  try { const l = JSON.parse(readFileSync(PATH, 'utf8')); l.active ||= {}; l.history ||= []; return l }
  catch { return { active: {}, history: [], updatedAt: null } }
}
export function saveLedger(l) { l.updatedAt = new Date().toISOString(); try { writeFileSync(PATH, JSON.stringify(l)) } catch {} }

const idOf = c => `${c.generator}:${c.symbol}`

// Open a new signal or refresh an existing open one (entry/SL/targets are LOCKED
// on open — we never move the goalposts; only LTP/confidence refresh).
export function openOrUpdate(ledger, card, todayISO, todayTs) {
  const id = idOf(card)
  const ex = ledger.active[id]
  if (ex && ex.status === 'open') { ex.ltp = card.ltp; ex.confidence = card.confidence; ex.lastSeen = todayISO; return ex }
  const t = card.targets.map(x => x.price)
  ledger.active[id] = {
    ...card, id, openedAt: todayISO, openTs: todayTs, status: 'open', lastSeen: todayISO,
    t1: t[0], t2: t[1], t3: t[2],
  }
  return ledger.active[id]
}

// Evaluate every open signal against bars after it opened. barsBySymbol[sym] = {time,h,l,c}
export function evaluate(ledger, barsBySymbol, todayISO, todayTs) {
  for (const id of Object.keys(ledger.active)) {
    const s = ledger.active[id]
    if (s.status !== 'open') continue
    const b = barsBySymbol[s.symbol]
    if (b && b.time && b.time.length) {
      s.ltp = b.c[b.c.length - 1]
      let res = null
      for (let i = 0; i < b.time.length; i++) {
        if (b.time[i] <= s.openTs) continue
        if (b.l[i] <= s.sl) { res = { result: 'loss', ts: b.time[i], price: s.sl }; break }
        if (b.h[i] >= s.t1) {
          let mt = 1; if (b.h[i] >= s.t3) mt = 3; else if (b.h[i] >= s.t2) mt = 2
          res = { result: 'win', ts: b.time[i], price: s.t1, maxTarget: mt }; break
        }
      }
      if (!res && (todayTs - s.openTs) / 86400 > EXPIRE_DAYS) res = { result: 'expired', ts: todayTs, price: s.ltp }
      if (res) { close(ledger, id, res, todayISO) }
    } else if ((todayTs - s.openTs) / 86400 > EXPIRE_DAYS) {
      close(ledger, id, { result: 'expired', ts: todayTs, price: s.ltp }, todayISO)
    }
  }
}
function close(ledger, id, res, todayISO) {
  const s = ledger.active[id]
  s.status = 'closed'; s.result = res.result; s.closedAt = todayISO
  s.closePrice = res.price; s.maxTarget = res.maxTarget || 0
  s.daysHeld = Math.max(1, Math.round((res.ts - s.openTs) / 86400))
  s.returnPct = +(((res.price - s.entry) / s.entry) * 100).toFixed(2)
  ledger.history.push({ id, generator: s.generator, symbol: s.symbol, result: s.result, openedAt: s.openedAt, closedAt: s.closedAt, daysHeld: s.daysHeld, returnPct: s.returnPct, maxTarget: s.maxTarget, confidence: s.confidence })
  delete ledger.active[id]
  if (ledger.history.length > 4000) ledger.history = ledger.history.slice(-4000)
}

// Per-generator + overall measured track record from closed history.
export function trackRecord(ledger, genMeta) {
  const blank = () => ({ win: 0, loss: 0, expired: 0, open: 0, returnSum: 0 })
  const per = {}; for (const g of genMeta) per[g.id] = blank()
  const all = blank()
  for (const h of ledger.history) {
    const p = per[h.generator] || (per[h.generator] = blank())
    if (h.result === 'win') { p.win++; all.win++; p.returnSum += h.returnPct; all.returnSum += h.returnPct }
    else if (h.result === 'loss') { p.loss++; all.loss++; p.returnSum += h.returnPct; all.returnSum += h.returnPct }
    else { p.expired++; all.expired++ }
  }
  for (const s of Object.values(ledger.active)) { (per[s.generator] || (per[s.generator] = blank())).open++; all.open++ }
  const fin = o => { const decided = o.win + o.loss; return { ...o, decided, winRate: decided ? +((o.win / decided) * 100).toFixed(1) : null, avgReturn: decided ? +(o.returnSum / decided).toFixed(2) : null } }
  const generators = {}; for (const k in per) generators[k] = fin(per[k])
  return { overall: fin(all), generators, target: 80 }
}
