// UNIT TESTS — pure logic across the platform. Bundles the src indicator/math
// modules (extensionless imports) via esbuild, imports the scripts/ modules
// directly, and asserts behaviour + COMPLIANCE (no forbidden claims, disclaimers).
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0; const fails = []
const ok = (name, cond) => { if (cond) pass++; else { fail++; fails.push(name) } }
const noNaN = (arr) => arr.every(v => v == null || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'object')

// ── bundle src indicators+math ──
execSync('npx esbuild tests/_entry.mjs --bundle --format=esm --platform=node --outfile=tests/_bundle.mjs', { stdio: 'pipe' })
const { math, INDICATORS, indicatorDefaults } = await import('./_bundle.mjs?' + Date.now())
const sig = await import('../scripts/signalEngine.mjs')
const content = await import('../scripts/contentEngine.mjs')
const angel = await import('../scripts/angelClient.mjs')
const lib = await import('../scripts/lib.mjs')

// synthetic bars
const bars = []; let p = 100
for (let i = 0; i < 400; i++) { const o = p, c = p + Math.sin(i / 9) * 4 + (i % 7 - 3); const h = Math.max(o, c) + Math.random() * 2, l = Math.min(o, c) - Math.random() * 2; bars.push({ time: 1700000000 + i * 86400, open: o, high: h, low: l, close: c, volume: 1000 + Math.abs(i % 13) * 400 }); p = Math.max(5, c) }
const close = bars.map(b => b.close)

// ── math ──
ok('ema length', math.ema(close, 20).length === 400)
ok('ema no NaN', noNaN(math.ema(close, 20)))
ok('ema seeds after warmup', math.ema(close, 20)[19] != null && math.ema(close, 20)[10] == null)
ok('sma correct value', Math.abs(math.sma([2, 4, 6], 3)[2] - 4) < 1e-9)
ok('rma no NaN', noNaN(math.rma(close, 14)))
ok('atr positive', math.atr(bars, 14).slice(20).every(v => v == null || v > 0))
ok('stdev non-negative', math.stdev(close, 20).slice(20).every(v => v >= 0))
ok('linreg no NaN', noNaN(math.linreg(close, 11)))

// ── all indicators compute, finite, defaults valid ──
let indOk = 0
for (const [id, def] of Object.entries(INDICATORS)) {
  try {
    const opts = indicatorDefaults(id)
    const res = def.compute(bars, opts)
    const finite = (res.series || []).every(s => s.data.every(d => Number.isFinite(d.value ?? d.open ?? 0)))
    ok(`indicator ${id} computes`, !!res && Array.isArray(res.series))
    ok(`indicator ${id} finite`, finite)
    ok(`indicator ${id} has inputs schema`, Array.isArray(def.inputs))
    indOk++
  } catch (e) { ok(`indicator ${id} computes`, false) }
}
ok('indicator count >= 25', Object.keys(INDICATORS).length >= 25)

// ── signal engine (uses the scanner's {o,h,l,c,v} array shape) ──
const d = { o: bars.map(b => b.open), h: bars.map(b => b.high), l: bars.map(b => b.low), c: close, v: bars.map(b => b.volume) }
const H = sig.prep(d)
ok('prep has rsi/atr/ema', H.rsi.length === 400 && H.atr.length === 400 && H.e20.length === 400)
ok('LOGICS non-empty', sig.LOGICS.length >= 12)
for (const L of sig.LOGICS) {
  ok(`logic ${L.id} returns boolean`, typeof L.signal(H, bars.length - 1) === 'boolean')
  const bt = sig.backtestLogic(H, L)
  ok(`logic ${L.id} backtest valid`, bt.trades >= 0 && bt.wins <= bt.trades)
}
const eng = sig.runEngine(d)
ok('runEngine per-logic', Object.keys(eng).length === sig.LOGICS.length)
ok('MIN_ACCURACY sane', sig.MIN_ACCURACY >= 50 && sig.MIN_ACCURACY <= 100)

// ── lib ──
ok('rsiSeries 0-100', lib.rsiSeries(close, 14).filter(Boolean).every(v => v >= 0 && v <= 100))
ok('atrSeries no NaN', noNaN(lib.atrSeries(bars.map(b => b.high), bars.map(b => b.low), close, 14)))
ok('pivots sorted', (() => { const pv = lib.pivots(bars.map(b => b.high), bars.map(b => b.low), 3); return pv.every((x, i) => i === 0 || x.i >= pv[i - 1].i) })())

// ── content engine + COMPLIANCE ──
const rj = p => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const cData = { picks: rj('public/picks.json'), signals: rj('public/signals.json'), breadth: rj('public/breadth.json') }
const items = content.generateContent(cData, 42, '2026-06-17')
ok('content generates pieces', items.length >= 5)
ok('every piece has hook+body', items.every(i => i.hook && i.body))
ok('every piece has hashtags', items.every(i => Array.isArray(i.hashtags) && i.hashtags.length > 0))
ok('every piece has SEBI disclaimer', items.every(i => /not SEBI-registered/i.test(i.disclaimer)))
const blob = JSON.stringify(items).toLowerCase()
ok('COMPLIANCE: no "guaranteed"', !blob.includes('guaranteed'))
ok('COMPLIANCE: no "money minting"', !blob.includes('money minting') && !blob.includes('money-minting'))
ok('COMPLIANCE: no "80% accuracy" claim', !/\b80%\s*accuracy/.test(blob) && !/above 80%/.test(blob))
ok('COMPLIANCE: astro framed honest', items.filter(i => /astro/i.test(i.theme)).every(i => /no proven|tradition|not a (signal|prediction)/i.test(i.body)))

// ── Angel TOTP ──
const t1 = angel.totp('OL66HAG6QU6D6OMDZP2OL6NHEU', 1700000000000)
ok('TOTP is 6 digits', /^\d{6}$/.test(t1))
ok('TOTP deterministic', angel.totp('OL66HAG6QU6D6OMDZP2OL6NHEU', 1700000000000) === t1)
ok('TOTP rolls per 30s window', angel.totp('OL66HAG6QU6D6OMDZP2OL6NHEU', 1700000000000) !== angel.totp('OL66HAG6QU6D6OMDZP2OL6NHEU', 1700000040000))

// ── Black-Scholes (replicated from OptionChain) ──
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
const N = x => 0.5 * (1 + erf(x / Math.SQRT2))
const bs = (S, K, T, iv, type) => { const r = 0.065; const d1 = (Math.log(S / K) + (r + iv * iv / 2) * T) / (iv * Math.sqrt(T)); const d2 = d1 - iv * Math.sqrt(T); return type === 'C' ? S * N(d1) - K * Math.exp(-r * T) * N(d2) : K * Math.exp(-r * T) * N(-d2) - S * N(-d1) }
ok('BS ATM call > 0', bs(100, 100, 0.05, 0.15, 'C') > 0)
ok('BS deep ITM call ≈ intrinsic', Math.abs(bs(150, 100, 0.05, 0.15, 'C') - (150 - 100 * Math.exp(-0.065 * 0.05))) < 1)
ok('BS put-call parity', Math.abs((bs(100, 100, 0.1, 0.2, 'C') - bs(100, 100, 0.1, 0.2, 'P')) - (100 - 100 * Math.exp(-0.065 * 0.1))) < 0.5)

// ── summary ──
console.log(`\nUNIT TESTS: ${pass} passed, ${fail} failed (indicators tested: ${indOk}/${Object.keys(INDICATORS).length})`)
if (fail) { console.log('FAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1) }
else console.log('✓ ALL UNIT TESTS PASSED')
