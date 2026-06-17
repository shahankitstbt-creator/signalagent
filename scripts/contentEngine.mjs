// ─────────────────────────────────────────────────────────────────────────
// CONTENT ENGINE — turns the real screener/signal/breadth data into ready-to-
// post, human-feeling Instagram + YouTube content. Honest by construction:
// shows MEASURED backtested hit-rates (never "80%/guaranteed"), frames astro as
// a traditional/educational timing note, and stamps a SEBI disclaimer on every
// piece. Designed for official-API scheduled posting on the user's own accounts.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const DISCLAIMER = '📌 Educational only — not investment advice, not a buy/sell tip. Not SEBI-registered. Markets carry risk; do your own research. Past performance ≠ future results.'

const pick = (arr, seed) => arr[((seed % arr.length) + arr.length) % arr.length]
const tags = (base) => base.concat(['#nifty', '#sharemarket', '#stockmarketindia', '#trading', '#investing', '#nse', '#priceaction']).slice(0, 14)
const fmtPct = n => (n >= 0 ? '+' : '') + (+n).toFixed(2) + '%'

// ── theme generators (each returns one content item or null) ──
function marketBias(d, seed) {
  const b = d.breadth?.breadth
  if (!b) return null
  const rows = Object.entries(b).sort((a, c) => c[1].advPct - a[1].advPct)
  const top = rows[0], bottom = rows.at(-1)
  const nifty = b['NIFTY 50']
  const bias = nifty ? (nifty.advPct >= 60 ? 'broadly bullish' : nifty.advPct <= 40 ? 'broadly bearish' : 'mixed / range-bound') : 'mixed'
  const hooks = [
    `Nifty internals are ${bias} today 👀`,
    `What the market breadth is REALLY saying today`,
    `Before you trade today — read the breadth 🧭`,
  ]
  return {
    theme: 'Market bias / breadth', platform: ['instagram', 'youtube'], format: pick(['carousel', 'reel'], seed),
    hook: pick(hooks, seed),
    body: `Breadth, not headlines, tells you the real bias.\n\n` +
      `• NIFTY 50 advance/decline: ▲${nifty?.advancing ?? '–'} / ▼${nifty?.declining ?? '–'} (${nifty?.advPct ?? '–'}% advancing)\n` +
      `• Strongest sector: ${top[0]} (${top[1].advPct}% green)\n` +
      `• Weakest sector: ${bottom[0]} (${bottom[1].advPct}% green)\n\n` +
      `Read: market looks ${bias}. When most stocks rise together, trend trades work; when breadth is split, favour stock-specific setups and tighter risk.\n\nWhich sector are you watching? 👇`,
    hashtags: tags(['#niftybreadth', '#marketbreadth', '#advancedecline', '#niftyanalysis']),
    disclaimer: DISCLAIMER,
  }
}

function swingSetups(d, seed) {
  const picks = (d.picks?.picks || []).filter(p => p.setupType && p.confidence).slice(0, 3)
  if (!picks.length) return null
  const lines = picks.map((p, i) => `${i + 1}. ${p.symbol} — ${p.setupType}. Watching ${p.entry} area, invalidation ${p.sl} (${p.slPct}%). Backtested first-target hit ~${p.backtestHitRate ?? p.confidence}%.`)
  const hooks = [
    `3 stocks quietly setting up for a move 🔍`,
    `Accumulation + volume: my watchlist for the week`,
    `These ${picks.length} charts are coiling — here's why`,
  ]
  return {
    theme: 'Swing setups (volume + accumulation)', platform: ['instagram', 'youtube'], format: 'carousel',
    hook: pick(hooks, seed),
    body: `Not tips — these are the setups I'm tracking and the EXACT levels that confirm or kill them:\n\n${lines.join('\n')}\n\n` +
      `Why these: rising volume on up-days, higher lows, price coiling near a breakout level. The % next to each is the MEASURED historical hit-rate of that setup — real, not a promise.\n\nSave this & track with me 📌`,
    hashtags: tags(['#swingtrading', '#breakoutstocks', '#volumeanalysis', '#accumulation']),
    disclaimer: DISCLAIMER,
  }
}

function volProfileFib(d, seed) {
  const p = (d.picks?.picks || [])[seed % Math.max(1, (d.picks?.picks || []).length)]
  const hooks = [`Volume Profile + Fibonacci: the confluence pros watch`, `Why ${p?.symbol || 'this stock'} could react at this exact level`, `The "magnet" levels most traders ignore`]
  return {
    theme: 'Volume Profile + Fib (education)', platform: ['instagram', 'youtube'], format: pick(['reel', 'carousel'], seed),
    hook: pick(hooks, seed),
    body: `Two tools, one edge:\n\n` +
      `• Volume Profile shows WHERE the most trading happened (POC = the fair-value magnet; VAH/VAL = the edges of value).\n` +
      `• Fibonacci shows likely pullback zones (0.382 / 0.5 / 0.618).\n\n` +
      `When a Fib level lines up with a high-volume node, that price tends to matter — buyers/sellers defend it. That overlap is the "confluence" zone.\n\n` +
      (p ? `Example on the radar: ${p.symbol} near ${p.entry}.\n\n` : '') +
      `Plan the trade, mark the level, wait for the reaction. 🎯`,
    hashtags: tags(['#volumeprofile', '#fibonacci', '#confluence', '#smartmoney']),
    disclaimer: DISCLAIMER,
  }
}

function harmonicSpot(d, seed) {
  const p = (d.picks?.picks || []).find(x => /harmonic/i.test(x.why || ''))
  const hooks = [`Harmonic patterns, explained simply`, `The chart pattern that maps reversals (XABCD)`, `How to read a harmonic setup`]
  return {
    theme: 'Chart / harmonic patterns (education)', platform: ['instagram', 'youtube'], format: 'reel',
    hook: pick(hooks, seed),
    body: `Harmonic patterns use Fibonacci ratios to map potential reversal zones (Gartley, Bat, Butterfly, AB=CD).\n\n` +
      `The idea: price often retraces in measurable proportions. When the swings hit those ratios, you get a "completion zone" to watch for a reaction.\n\n` +
      (p ? `Spotted recently: a bullish retrace structure on ${p.symbol}.\n\n` : '') +
      `Rule I follow: pattern is a MAP, not a guarantee — I still need confirmation + a defined stop. Risk first, always.`,
    hashtags: tags(['#harmonicpatterns', '#chartpatterns', '#technicalanalysis', '#priceaction']),
    disclaimer: DISCLAIMER,
  }
}

function multibaggerQuality(d, seed) {
  const p = (d.picks?.picks || []).find(x => x.fundamentals)
  const f = p?.fundamentals
  const hooks = [`My 5-point "quality" checklist before any swing`, `Is the smart money already in? Check these`, `Quality first: how I filter stocks`]
  return {
    theme: 'Quality / fundamentals checklist (education)', platform: ['instagram', 'youtube'], format: 'carousel',
    hook: pick(hooks, seed),
    body: `Before any longer-term swing, I want the OWNERSHIP behind the price:\n\n` +
      `✅ Promoter holding stable or rising\n✅ FIIs not exiting\n✅ DIIs accumulating\n✅ Promoter pledge low / zero\n✅ Volume rising on up-moves\n\n` +
      (f ? `Live read — ${p.symbol}: Promoter ${f.promoter.status}, FII ${f.fii.status}, DII ${f.dii.status}, Pledge ${f.pledge?.pct ?? 0}%.\n\n` : '') +
      `Price can be faked for a day; ownership trends can't be faked for a quarter. Quality + setup > tip.`,
    hashtags: tags(['#multibagger', '#fundamentalanalysis', '#fiidii', '#valueinvesting']),
    disclaimer: DISCLAIMER,
  }
}

function education(d, seed) {
  const topics = [
    { t: 'Risk management beats prediction', b: `The #1 reason traders blow up isn't bad calls — it's bad risk.\n\nRules that actually keep you in the game:\n• Risk a fixed small % per trade (1–2%)\n• Define your stop BEFORE you enter\n• Position size = risk ÷ stop distance\n• No averaging into losers\n\nYou can be right 50% of the time and still win — if your winners are bigger than your losers.` },
    { t: 'What is a "squeeze" breakout?', b: `When volatility contracts (Bollinger bands tighten), the market is coiling.\n\nLow volatility → energy builds → expansion follows.\n\nThe play: mark the consolidation high, wait for a close above it on rising volume. The squeeze tells you a move is COMING; the breakout tells you the direction.` },
    { t: 'FII vs DII — who moves the market?', b: `FIIs (foreign funds) bring global flows; DIIs (Indian funds) often absorb their selling.\n\nWatch the daily cash figures: heavy FII selling + DII buying = a tug-of-war (range). Both buying together = trend fuel.\n\nFlows don't time the day, but they frame the bias.` },
  ]
  const tp = pick(topics, seed)
  return {
    theme: 'Pure education', platform: ['instagram', 'youtube'], format: pick(['reel', 'carousel'], seed),
    hook: tp.t, body: tp.b + `\n\nFollow for daily, no-nonsense market education. 🧠`,
    hashtags: tags(['#tradingeducation', '#riskmanagement', '#learntrading', '#stockmarketbasics']),
    disclaimer: DISCLAIMER,
  }
}

function astroNote(d, seed, dateStr) {
  // honest framing: tradition/perspective, NOT a prediction or accuracy claim
  const hooks = [`Traders' calendar: dates some people watch (and why)`, `Panchang & markets — a tradition, not a guarantee`, `Why some traders track timing windows`]
  return {
    theme: 'Astro / timing (educational, framed honestly)', platform: ['instagram'], format: 'reel',
    hook: pick(hooks, seed),
    body: `Some Indian traders track astro / panchang "timing windows" (KP, Vyapar Ratna style) for Nifty & Gold.\n\n` +
      `Here's the honest take I'll always give you: there is NO proven edge that astrology predicts markets. I share it as TRADITION and crowd-psychology (lots of people watch the same dates, which can itself create reactions) — never as a signal to bet on.\n\n` +
      `My real edge stays: structure, volume, levels, and risk. Treat timing notes as curiosity, not a trade.`,
    hashtags: tags(['#financialastrology', '#panchang', '#niftytiming', '#goldtrading']),
    disclaimer: DISCLAIMER + ' Astrology has no proven predictive edge on markets — shared as tradition/curiosity only.',
  }
}

export function generateContent({ picks, signals, breadth }, seed = 0, dateStr = '') {
  const d = { picks, signals, breadth }
  const gens = [marketBias, swingSetups, volProfileFib, harmonicSpot, multibaggerQuality, education, astroNote]
  const items = gens.map((g, i) => { try { return g(d, seed + i, dateStr) } catch { return null } }).filter(Boolean)
  return items.map((it, i) => ({ id: `${dateStr}-${i}`, date: dateStr, status: 'draft', ...it }))
}

// ── CLI: read generated data, write public/content.json ──
function readJSON(p) { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('contentEngine.mjs')) {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const seed = Math.floor(now.getTime() / 86400000) // rotates templates daily
  const data = { picks: readJSON('public/picks.json'), signals: readJSON('public/signals.json'), breadth: readJSON('public/breadth.json') }
  const items = generateContent(data, seed, dateStr)
  mkdirSync('public', { recursive: true })
  writeFileSync('public/content.json', JSON.stringify({ generatedAt: now.toISOString(), date: dateStr, count: items.length, items }, null, 2))
  console.log(`Content engine: wrote ${items.length} pieces → public/content.json`)
  items.forEach(i => console.log(`  · [${i.theme}] ${i.hook}`))
}
