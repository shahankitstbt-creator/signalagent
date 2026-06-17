// Angel One SmartAPI — READ-ONLY market data (login + LTP/candles). No orders.
import crypto from 'node:crypto'
import { env } from './env.mjs'

const E = env()
const BASE = 'https://apiconnect.angelone.in'

// ── TOTP (RFC 6238) from the base32 secret ──
function base32decode(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of (s || '').replace(/=+$/, '').toUpperCase()) { const v = alpha.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0') }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
export function totp(secret, atMs = Date.now()) {
  const key = base32decode(secret)
  const counter = Math.floor(atMs / 1000 / 30)
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', key).update(buf).digest()
  const o = h[h.length - 1] & 0xf
  const code = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff)
  return String(code % 1000000).padStart(6, '0')
}

const headers = (extra = {}) => ({
  'Content-Type': 'application/json', 'Accept': 'application/json',
  'X-UserType': 'USER', 'X-SourceID': 'WEB',
  'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '127.0.0.1', 'X-MACAddress': '00:00:00:00:00:00',
  'X-PrivateKey': E.ANGEL_API_KEY, ...extra,
})

let session = null // { jwt, feedToken, ts }

export async function login() {
  const body = { clientcode: E.ANGEL_CLIENT_CODE, password: E.ANGEL_MPIN, totp: totp(E.ANGEL_TOTP_SECRET) }
  const r = await fetch(`${BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  const j = await r.json()
  if (j?.status && j?.data?.jwtToken) { session = { jwt: j.data.jwtToken, feedToken: j.data.feedToken, ts: Date.now() }; return { ok: true } }
  return { ok: false, message: j?.message || j?.errorcode || 'login failed', raw: j }
}

async function ensure() { if (!session || Date.now() - session.ts > 6 * 3600e3) await login(); return session }

// LTP for one instrument. needs exchange (NSE/NFO/MCX), tradingsymbol, symboltoken.
export async function ltp(exchange, tradingsymbol, symboltoken) {
  const s = await ensure(); if (!s) return null
  const r = await fetch(`${BASE}/rest/secure/angelbroking/order/v1/getLtpData`, {
    method: 'POST', headers: headers({ Authorization: `Bearer ${s.jwt}` }),
    body: JSON.stringify({ exchange, tradingsymbol, symboltoken }),
  })
  const j = await r.json()
  return j?.data?.ltp ?? null
}

// Historical candles. interval e.g. ONE_DAY, ONE_HOUR, FIFTEEN_MINUTE.
export async function candles(exchange, symboltoken, interval, fromDate, toDate) {
  const s = await ensure(); if (!s) return null
  const r = await fetch(`${BASE}/rest/secure/angelbroking/historical/v1/getCandleData`, {
    method: 'POST', headers: headers({ Authorization: `Bearer ${s.jwt}` }),
    body: JSON.stringify({ exchange, symboltoken, interval, fromdate: fromDate, todate: toDate }),
  })
  const j = await r.json()
  // [ [time, o, h, l, c, v], ... ]
  return (j?.data || []).map(k => ({ time: Math.floor(new Date(k[0]).getTime() / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }))
}

// FULL market quote for a batch of NFO tokens (<=50). Returns data.fetched[].
async function quoteFull(tokens) {
  const s = await ensure(); if (!s) return []
  const r = await fetch(`${BASE}/rest/secure/angelbroking/market/v1/quote/`, {
    method: 'POST', headers: headers({ Authorization: `Bearer ${s.jwt}` }),
    body: JSON.stringify({ mode: 'FULL', exchangeTokens: { NFO: tokens } }),
  })
  const j = await r.json()
  return j?.data?.fetched || []
}

// ── Option-chain build-up for an index (default NIFTY) via Angel One ──
// Real OI snapshot → PCR, max-OI strikes (support/resistance), ATM. READ-ONLY.
let SCRIP = null // cached NFO option master
async function scripMaster() {
  if (SCRIP) return SCRIP
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 30000)
  try {
    const r = await fetch('https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json', { signal: ctrl.signal })
    const all = await r.json()
    SCRIP = all.filter(x => x.exch_seg === 'NFO' && x.instrumenttype === 'OPTIDX')
  } catch { SCRIP = [] } finally { clearTimeout(to) }
  return SCRIP
}
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
const parseExpiry = e => { const m = /(\d{2})([A-Z]{3})(\d{4})/.exec(e || ''); return m ? new Date(Date.UTC(+m[3], MONTHS[m[2]], +m[1])) : null }

export async function optionBuildup(index = 'NIFTY', step = 50) {
  try {
    const idTok = { NIFTY: ['NSE', 'Nifty 50', '99926000'], BANKNIFTY: ['NSE', 'Nifty Bank', '99926009'] }[index] || ['NSE', 'Nifty 50', '99926000']
    const spot = await ltp(...idTok)
    if (!spot) return { placeholder: true, reason: 'Angel One login/spot unavailable — add/verify credentials in .env to activate live OI.' }
    const master = await scripMaster()
    const opts = master.filter(x => x.name === index)
    if (!opts.length) return { placeholder: true, reason: 'Option master unavailable (Angel scrip file). Retry next scan.' }
    const today = Date.now() - 864e5
    const expiries = [...new Set(opts.map(o => o.expiry))].map(e => [e, parseExpiry(e)]).filter(([, d]) => d && d.getTime() >= today).sort((a, b) => a[1] - b[1])
    if (!expiries.length) return { placeholder: true, reason: 'No upcoming expiry found in option master.' }
    const expiry = expiries[0][0]
    const atm = Math.round(spot / step) * step
    const strikes = []; for (let k = -7; k <= 7; k++) strikes.push(atm + k * step)
    const wanted = opts.filter(o => o.expiry === expiry && strikes.includes(Math.round(+o.strike / 100)))
    const byToken = {}; wanted.forEach(o => { byToken[o.token] = { strike: Math.round(+o.strike / 100), type: o.symbol.endsWith('CE') ? 'CE' : 'PE' } })
    const tokens = Object.keys(byToken).slice(0, 50)
    const quotes = await quoteFull(tokens)
    if (!quotes.length) return { placeholder: true, reason: 'Angel quote returned no data (market may be pre-open). Live OI activates in session hours.' }
    const rows = {} // strike -> {ce, pe}
    for (const q of quotes) {
      const meta = byToken[String(q.symbolToken)]; if (!meta) continue
      const r = rows[meta.strike] || (rows[meta.strike] = { strike: meta.strike })
      r[meta.type] = { oi: q.opnInterest || 0, ltp: q.ltp || 0 }
    }
    const list = Object.values(rows).sort((a, b) => a.strike - b.strike)
    let ceOI = 0, peOI = 0, maxCE = { oi: 0 }, maxPE = { oi: 0 }
    for (const r of list) {
      const c = r.CE?.oi || 0, p = r.PE?.oi || 0; ceOI += c; peOI += p
      if (c > maxCE.oi) maxCE = { strike: r.strike, oi: c }
      if (p > maxPE.oi) maxPE = { strike: r.strike, oi: p }
    }
    const pcr = ceOI ? +(peOI / ceOI).toFixed(2) : 0
    const bias = pcr >= 1.15 ? 'Bullish lean (puts written below)' : pcr <= 0.8 ? 'Bearish lean (calls written above)' : 'Range / balanced'
    return {
      placeholder: false, index, spot, atm, expiry, pcr,
      resistance: maxCE.strike, support: maxPE.strike, ceOI, peOI, bias,
      strikes: list.map(r => ({ strike: r.strike, ceOI: r.CE?.oi || 0, peOI: r.PE?.oi || 0 })),
    }
  } catch (e) { return { placeholder: true, reason: 'Option build-up error: ' + e.message } }
}

// CLI smoke test (login only — prints status, never the token).
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('angelClient.mjs')) {
  console.log('TOTP now:', totp(E.ANGEL_TOTP_SECRET))
  const arg = process.argv[2]
  if (arg === 'options') {
    optionBuildup('NIFTY').then(o => console.log('Option build-up:', JSON.stringify(o, null, 2))).catch(e => console.log('err', e.message))
  } else {
    login().then(r => console.log('Angel login:', r.ok ? 'OK ✓ (session acquired, read-only)' : 'FAILED — ' + r.message))
      .catch(e => console.log('Angel login error:', e.message))
  }
}
