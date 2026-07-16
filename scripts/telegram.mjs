// Telegram alerts — posts new high-conviction signals to a channel in a rich,
// Purvesh-style format (entry zones, SL, targets+dates+book%, lot, reason).
// Needs TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in env. Dedups via public/tg_sent.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { env } from './env.mjs'
const E = env()
const BOOK = ['Book 50%', 'Book 25% (or 50% if skipping T3)', 'Target — trail 25% with TSL at T1']

export function formatSignal(s, dateStr) {
  const isFno = s.generator === 'fno' || !!s.optionPlay
  const dir = s.direction || 'BUY'
  const dot = dir === 'BUY' ? '🟢' : dir === 'SELL' ? '🔴' : '🟡'
  const t = s.targets || []
  const entry = s.entry ?? s.spot ?? s.ltp
  const sl = s.sl
  const risk = (entry != null && sl != null) ? entry - sl : 0
  const e2 = (entry != null && risk) ? +(entry - 0.4 * risk).toFixed(2) : entry
  const L = []
  L.push('📈 *STOCKSBYVARSHA*')
  L.push('━━━━━━━━━━━━━━━━━━')
  L.push(`${dot} *${dir} — ${s.underlying || s.symbol}*${isFno ? '' : '  (CASH)'}`)
  if (isFno && s.optionPlay) L.push(`👉 ${s.optionPlay}`)
  L.push('')
  L.push(`Type: ${s.kind || 'Stock'}${s.expiry ? `  |  Expiry: ${s.expiry}` : ''}`)
  L.push(`Spot/LTP: ₹${s.spot ?? s.ltp ?? entry ?? '—'}${s.grade ? `  |  Grade: ${s.grade}` : ''}`)
  L.push('━━━━━━━━━━━━━━━━━━')
  if (entry != null) {
    L.push(`📍 E1 (entry): ₹${entry}  ·  ${dateStr}`)
    if (e2 !== entry) L.push(`📍 E2 (add on dip): ₹${e2}`)
  }
  if (sl != null) L.push(`🛑 SL: ₹${sl}${s.slPct != null ? ` (${s.slPct}%)` : ''}  ·  15-min closing basis`)
  t.forEach((x, i) => L.push(`${i === 2 ? '🚀' : '🎯'} T${i + 1}: ₹${x.price} (+${x.pct}%) by ${x.by} — ${BOOK[i] || 'book'}`))
  L.push('━━━━━━━━━━━━━━━━━━')
  if (s.lot) L.push(`📦 Lot: ${s.lot}${s.futures ? `  ·  ${s.futures}` : ''}`)
  if (s.reason) L.push(`💡 Why: ${s.reason}`)
  const meta = []
  if (s.delivery != null) meta.push(`Delivery ${s.delivery}%`)
  if (s.rr) meta.push(`R:R 1:${s.rr}`)
  if (s.accuracy != null) meta.push(`backtested ~${s.accuracy}%`)
  if (s.pcr != null) meta.push(`PCR ${s.pcr}`)
  if (meta.length) L.push(`📊 ${meta.join('  ·  ')}`)
  L.push(`🕐 ${dateStr} IST`)
  L.push('📌 _Educational only, not advice. Not SEBI-registered._')
  return L.join('\n')
}

export async function sendTelegram(text) {
  if (process.argv.includes('--no-telegram') || process.env.TG_DISABLE) return { ok: false, skipped: true }  // local/test runs
  const token = E.TELEGRAM_BOT_TOKEN, chat = E.TELEGRAM_CHAT_ID
  if (!token || !chat) return { ok: false, skipped: true }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    })
    const j = await r.json()
    return { ok: !!j.ok, error: j.description }
  } catch (e) { return { ok: false, error: e.message } }
}

const loadSent = () => { try { return JSON.parse(readFileSync('public/tg_sent.json', 'utf8')) } catch { return {} } }
const saveSent = sent => { const k = Object.keys(sent); const s = k.length > 1500 ? Object.fromEntries(k.slice(-1500).map(x => [x, sent[x]])) : sent; try { writeFileSync('public/tg_sent.json', JSON.stringify(s)) } catch {} }

// A setup is "extended" (the move already started) — we only alert BEFORE the move.
function isExtended(s) {
  if (s.changePct != null && s.changePct >= 3) return true                       // already popped ≥3% today
  if (s.ltp != null && s.entry != null && s.ltp > s.entry * 1.025) return true    // price already ran past entry
  if (s.rsi != null && s.rsi > 72) return true                                    // already overbought
  const preMove = ['Squeeze breakout', 'Breakout watch', 'Accumulation', 'Momentum building']
  if (s.setupType && !preMove.includes(s.setupType)) return true
  return false
}

// Post ONLY the highest-conviction PRE-MOVE setups (A++). One alert per symbol ever
// (no duplicate for an entry made days ago). NOT "100% sure" — that doesn't exist.
export async function notifyNewSignals(board, dateStr) {
  if (!E.TELEGRAM_BOT_TOKEN || !E.TELEGRAM_CHAT_ID) { console.log('Telegram: no creds — skipping'); return }
  const sent = loadSent()
  const gens = board.generators || []
  const cands = []
  const fno = gens.find(g => g.id === 'fno')
  if (fno) for (const s of fno.signals) if (s.kind === 'Stock' && (s.grade === 'A++' || (s.grade === 'A+' && (s.delivery ?? 0) >= 60))) cands.push(s)
  const conf = gens.find(g => g.id === 'confluence')
  if (conf) for (const s of conf.signals) if (s.grade === 'A++') cands.push(s)
  let count = 0, skipped = 0
  const seen = new Set()                                            // in-run guard (belt & suspenders vs same symbol twice)
  for (const s of cands) {
    const sym = String(s.underlying || s.symbol || '').toUpperCase().trim()
    if (!sym) continue
    const id = 'entry:' + sym                                       // stable, normalized → one alert per symbol EVER
    if (seen.has(id) || sent[id]) continue
    seen.add(id)
    if (isExtended(s)) { sent[id] = dateStr; skipped++; continue }  // move already started → skip (and don't re-check)
    const res = await sendTelegram(formatSignal(s, dateStr))
    if (res.skipped) break
    if (res.ok) { sent[id] = dateStr; count++; await new Promise(r => setTimeout(r, 1300)) }
    if (count >= 8) break
  }
  saveSent(sent)
  console.log(`Telegram: ${count} A++ pre-move alerts (${skipped} skipped — move already started)`)
}

// UPDATE alerts for positions that just resolved (target hit / SL hit) — never re-send an entry.
export async function notifyClosures(closed, dateStr) {
  if (!E.TELEGRAM_BOT_TOKEN || !E.TELEGRAM_CHAT_ID || !closed || !closed.length) return
  const sent = loadSent()
  let count = 0
  for (const s of closed) {
    const sym = String(s.symbol || s.underlying || '').toUpperCase().trim()
    const id = 'close:' + sym + ':' + s.result + ':' + (s.closePrice ?? '')
    if (sent[id]) continue
    const res = await sendTelegram(formatUpdate(s, dateStr))
    if (res.skipped) break
    if (res.ok) { sent[id] = dateStr; count++; await new Promise(r => setTimeout(r, 1200)) }
  }
  saveSent(sent)
  if (count) console.log(`Telegram: ${count} update alerts (target/SL hit)`)
}

function formatUpdate(s, dateStr) {
  const win = s.result === 'win'
  const L = []
  L.push('📈 *STOCKSBYVARSHA — UPDATE*')
  L.push('━━━━━━━━━━━━━━━━━━')
  L.push(`${win ? '🎯' : '🔴'} *${win ? `TARGET HIT (T${s.maxTarget || 1})` : 'STOP-LOSS HIT'} — ${s.symbol}*`)
  L.push(`Entry ₹${s.entry} → ${win ? 'T' + (s.maxTarget || 1) : 'SL'} ₹${s.closePrice}  (${s.returnPct > 0 ? '+' : ''}${s.returnPct}%)`)
  L.push(`Held ${s.daysHeld} day(s) · opened ${s.openedAt}`)
  L.push(`🕐 ${dateStr} IST · 📌 _Educational only, not advice._`)
  return L.join('\n')
}

// CLI: send a sample of the current board's top signal to verify format/delivery
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('telegram.mjs')) {
  const b = JSON.parse(readFileSync('public/board.json', 'utf8'))
  const fno = b.generators.find(g => g.id === 'fno')
  const conf = b.generators.find(g => g.id === 'confluence')
  const sample = (fno?.signals || [])[0] || (conf?.signals || [])[0]
  if (!sample) { console.log('no signal to sample'); process.exit(0) }
  const msg = formatSignal(sample, b.date || new Date().toISOString().slice(0, 10))
  console.log('--- preview ---\n' + msg + '\n---------------')
  sendTelegram(msg).then(r => console.log('send:', r.ok ? 'OK ✓' : (r.skipped ? 'skipped (no creds)' : 'FAIL — ' + r.error)))
}
