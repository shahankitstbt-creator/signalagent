// ─────────────────────────────────────────────────────────────────────────
// VEDIC ASTRO ENGINE — real, dependency-free ephemeris (planet longitudes to
// ~0.1–0.5°), sidereal (Lahiri), nakshatra/sign, tithi, hora, KP sub-lord.
// The ASTRONOMY here is genuinely accurate. The market INTERPRETATION is
// presented as tradition / educational only — astrology has no proven edge on
// markets, so NO accuracy % is ever attached. SEBI disclaimer on every card.
// Methods: VedicAstro · Vyapar Ratna · Planet Positions · Planet Combination · KP.
// ─────────────────────────────────────────────────────────────────────────
const D2R = Math.PI / 180, R2D = 180 / Math.PI
const norm360 = x => ((x % 360) + 360) % 360
const norm180 = x => { let v = norm360(x); return v > 180 ? v - 360 : v }
const sin = d => Math.sin(d * D2R), cos = d => Math.cos(d * D2R)

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
const SIGN_LORD = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter']
const NAK = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati']
// Vimshottari dasha order + years (sums 120)
const DASHA = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']
const DASHA_YRS = [7, 20, 6, 10, 7, 18, 16, 19, 17]
const NAK_LORD = i => DASHA[i % 9]                       // nakshatra lord = Vimshottari order
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_RULER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
// Chaldean order for planetary hours (hora)
const CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon']
const TITHI = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima/Amavasya']

// JD (UT) from a JS Date (getTime is UTC ms)
const julian = date => date.getTime() / 86400000 + 2440587.5

// ── Sun: tropical-of-date ecliptic longitude (Meeus) ──
function sunLon(T) {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M)
  return norm360(L0 + C)
}
// ── Moon: tropical-of-date longitude (Meeus, abbreviated main terms ~0.3°) ──
const MOON_T = [[6288774, 0, 0, 1, 0], [1274027, 2, 0, -1, 0], [658314, 2, 0, 0, 0], [213618, 0, 0, 2, 0], [-185116, 0, 1, 0, 0], [-114332, 0, 0, 0, 2], [58793, 2, 0, -2, 0], [57066, 2, -1, -1, 0], [53322, 2, 0, 1, 0], [45758, 2, -1, 0, 0], [-40923, 0, 1, -1, 0], [-34720, 1, 0, 0, 0], [-30383, 0, 1, 1, 0], [15327, 2, 0, 0, -2], [-12528, 0, 0, 1, 2], [10980, 0, 0, 1, -2], [10675, 4, 0, -1, 0], [10034, 0, 0, 3, 0]]
function moonLon(T) {
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
  const M = 357.5291092 + 35999.0502909 * T
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T
  const F = 93.272095 + 483202.0175233 * T
  let s = 0
  for (const [co, d, m, mp, f] of MOON_T) s += co * sin(D * d + M * m + Mp * mp + F * f)
  return norm360(Lp + s / 1e6)
}
// ── mean lunar node (Rahu), tropical-of-date ──
const nodeLon = T => norm360(125.04452 - 1934.136261 * T)

// ── planets: heliocentric → geocentric J2000 ecliptic longitude (Keplerian, Standish) ──
// elements: [a, e, I, L, longPeri, longNode] at J2000 + per-century rates
const PLANETS = {
  Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  Venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  Earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  Mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  Jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  Saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
}
function helio(name, T) {
  const [b, r] = PLANETS[name]
  const a = b[0] + r[0] * T, e = b[1] + r[1] * T, I = b[2] + r[2] * T
  const L = b[3] + r[3] * T, peri = b[4] + r[4] * T, node = b[5] + r[5] * T
  const M = norm180(L - peri) * D2R, w = (peri - node) * D2R, N = node * D2R, Ir = I * D2R
  let E = M
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(w), sw = Math.sin(w), cN = Math.cos(N), sN = Math.sin(N), cI = Math.cos(Ir), sI = Math.sin(Ir)
  return {
    x: (cw * cN - sw * sN * cI) * xp + (-sw * cN - cw * sN * cI) * yp,
    y: (cw * sN + sw * cN * cI) * xp + (-sw * sN + cw * cN * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp,
  }
}
function planetLonJ2000(name, T) {
  const p = helio(name, T), earth = helio('Earth', T)
  return norm360(Math.atan2(p.y - earth.y, p.x - earth.x) * R2D)
}

const AYAN0 = 23.853                                       // Lahiri ayanamsa at J2000 (deg)
const ayanamsa = T => AYAN0 + 1.39697 * T                  // ~50.29"/yr drift

// full sky for a moment → sidereal longitudes for the 9 grahas
export function computeChart(date) {
  const T = (julian(date) - 2451545.0) / 36525
  const ay = ayanamsa(T)
  const sid = {}
  sid.Sun = norm360(sunLon(T) - ay)
  sid.Moon = norm360(moonLon(T) - ay)
  const rahu = norm360(nodeLon(T) - ay)
  sid.Rahu = rahu; sid.Ketu = norm360(rahu + 180)
  for (const name of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) sid[name] = norm360(planetLonJ2000(name, T) - AYAN0)
  // sun/moon difference (tithi) — ayanamsa cancels, use sidereal
  const elong = norm360(sid.Moon - sid.Sun)
  const tIdx = Math.floor(elong / 12)
  const paksha = tIdx < 15 ? 'Shukla (waxing)' : 'Krishna (waning)'
  const tithiName = TITHI[tIdx % 15]
  const out = {}
  for (const [name, lon] of Object.entries(sid)) out[name] = describe(name, lon)
  return { date, planets: out, tithi: { index: tIdx, name: tithiName, paksha }, weekday: date.getDay() }
}

function describe(name, lon) {
  const signIdx = Math.floor(lon / 30)
  const nakIdx = Math.floor(lon / (13 + 1 / 3))
  const sub = kpSubLord(lon)
  return {
    name, lon: +lon.toFixed(2),
    sign: SIGNS[signIdx], signLord: SIGN_LORD[signIdx],
    nakshatra: NAK[nakIdx], nakLord: NAK_LORD(nakIdx), subLord: sub,
    deg: +(lon - signIdx * 30).toFixed(1),
  }
}
// KP sub-lord at a sidereal longitude
function kpSubLord(lon) {
  const nak = 13 + 1 / 3
  const nakIdx = Math.floor(lon / nak)
  const pos = lon - nakIdx * nak
  let start = nakIdx % 9
  let acc = 0
  for (let k = 0; k < 9; k++) {
    const li = (start + k) % 9
    const span = (DASHA_YRS[li] / 120) * nak
    acc += span
    if (pos <= acc + 1e-9) return DASHA[li]
  }
  return DASHA[start]
}

// ── traditional market interpretation (HONEST: tradition only, no edge claim) ──
// significator grahas by market (classical karaka associations)
const KARAKA = {
  NIFTY: { primary: ['Mercury', 'Jupiter'], mood: 'Moon', name: 'Nifty 50' },   // trade/markets=Mercury, finance/expansion=Jupiter
  GOLD: { primary: ['Sun', 'Venus', 'Jupiter'], mood: 'Moon', name: 'Gold (MCX/Spot)' }, // gold metal=Sun/Jupiter, luxury=Venus
}
const BENEFIC = new Set(['Jupiter', 'Venus', 'Mercury', 'Moon'])
const STRONG_SIGN = { // own/exalted signs by planet (supportive placement, traditionally)
  Sun: ['Leo', 'Aries'], Moon: ['Cancer', 'Taurus'], Mars: ['Aries', 'Scorpio', 'Capricorn'],
  Mercury: ['Gemini', 'Virgo'], Jupiter: ['Sagittarius', 'Pisces', 'Cancer'],
  Venus: ['Taurus', 'Libra', 'Pisces'], Saturn: ['Capricorn', 'Aquarius', 'Libra'],
}
const WEAK_SIGN = { Sun: ['Libra'], Moon: ['Scorpio'], Mars: ['Cancer'], Mercury: ['Pisces'], Jupiter: ['Capricorn'], Venus: ['Virgo'], Saturn: ['Aries'] }

function leanFrom(score) { return score >= 2 ? 'Bullish lean' : score <= -2 ? 'Bearish lean' : 'Neutral / range' }
function biasColor(b) { return b.startsWith('Bullish') ? 'up' : b.startsWith('Bearish') ? 'down' : 'flat' }

const DISCLAIMER = 'Tradition / educational only — astrology has NO proven market edge. Not advice. Not SEBI-registered.'
function astroSocial(mkt, method, bias, reason) {
  return `🪐 ${KARAKA[mkt].name} — ${method} (traditional view)\nReading: ${bias}.\n${reason}\nHonest take: shared as tradition & market-psychology, never a guaranteed signal. Real edge stays structure + volume + risk.\n📌 ${DISCLAIMER}\n#${mkt === 'NIFTY' ? 'nifty' : 'gold'} #panchang #astrology`
}
function card(mkt, method, bias, reason, lines) {
  return { generator: 'vedic_astro', isAstro: true, symbol: mkt, method, name: KARAKA[mkt].name, bias, biasTone: biasColor(bias), reason, lines: lines || null, social: astroSocial(mkt, method, bias, reason) }
}

// score a market from significator placement (shared by several methods)
function karakaScore(chart, mkt) {
  let sc = 0; const notes = []
  for (const g of KARAKA[mkt].primary) {
    const p = chart.planets[g]
    if ((STRONG_SIGN[g] || []).includes(p.sign)) { sc += 1.2; notes.push(`${g} strong in ${p.sign}`) }
    else if ((WEAK_SIGN[g] || []).includes(p.sign)) { sc -= 1.2; notes.push(`${g} weak in ${p.sign}`) }
    // significator with a benefic star-lord = supportive
    if (BENEFIC.has(p.nakLord)) sc += 0.5; else sc -= 0.3
  }
  // waxing moon = supportive sentiment in tradition
  if (chart.tithi.paksha.startsWith('Shukla')) { sc += 0.8; notes.push('Shukla paksha (waxing Moon)') } else { sc -= 0.4; notes.push('Krishna paksha (waning Moon)') }
  return { sc, notes }
}

// ── the 5 method cards per market ──
export function vedicMarketSignals(date) {
  const chart = computeChart(date)
  const out = []
  for (const mkt of ['NIFTY', 'GOLD']) {
    const K = KARAKA[mkt], moon = chart.planets.Moon
    const ks = karakaScore(chart, mkt)

    // 1) VedicAstro — panchang overview
    out.push(card(mkt, 'VedicAstro', leanFrom(ks.sc),
      `${WEEKDAY[chart.weekday]} (ruler ${DAY_RULER[chart.weekday]}). Moon in ${moon.sign} · ${moon.nakshatra} (lord ${moon.nakLord}). ${chart.tithi.name}, ${chart.tithi.paksha}. ${ks.notes.slice(0, 2).join('; ')}.`,
      [{ k: 'Tithi', v: `${chart.tithi.name} · ${chart.tithi.paksha}` }, { k: 'Moon', v: `${moon.sign} · ${moon.nakshatra}` }, { k: 'Day lord', v: DAY_RULER[chart.weekday] }]))

    // 2) Vyapar Ratna — Moon nakshatra + market karaka, waxing/waning timing
    const vrScore = ks.sc + (BENEFIC.has(moon.nakLord) ? 0.8 : -0.6)
    const friendly = K.primary.includes(moon.nakLord) || BENEFIC.has(moon.nakLord)
    out.push(card(mkt, 'Vyapar Ratna', leanFrom(vrScore),
      `Moon transits ${moon.nakshatra} (lord ${moon.nakLord}) — ${friendly ? 'a supportive star for trade/sentiment' : 'a cautious star for fresh longs'} in tradition. ${chart.tithi.paksha} favours ${chart.tithi.paksha.startsWith('Shukla') ? 'building positions' : 'lighter risk / booking'}. Key karaka ${K.primary[0]} in ${chart.planets[K.primary[0]].sign}.`))

    // 3) Planet Positions — factual sidereal sky (genuinely accurate)
    const order = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu']
    out.push(card(mkt, 'Planet Positions', leanFrom(ks.sc),
      `Significators for ${K.name}: ${K.primary.join(', ')}. ${ks.notes.filter(n => /strong|weak/.test(n)).join('; ') || 'significators in neutral signs'}.`,
      order.map(g => ({ k: g, v: `${chart.planets[g].sign} ${chart.planets[g].deg}° · ${chart.planets[g].nakshatra}` }))))

    // 4) Planet Combination — conjunctions / aspects today
    const combos = conjunctions(chart)
    const comboScore = combos.reduce((a, c) => a + c.tone, 0) + ks.sc * 0.5
    out.push(card(mkt, 'Planet Combination', leanFrom(comboScore),
      combos.length ? combos.map(c => c.text).join(' · ') : 'No tight conjunctions today; planets dispersed across signs.',
      combos.length ? combos.map(c => ({ k: c.pair, v: c.note })) : null))

    // 5) KP Astro — ruling planets & Moon sub-lord
    const rp = { day: DAY_RULER[chart.weekday], rasiLord: moon.signLord, starLord: moon.nakLord, subLord: moon.subLord }
    const kpFav = BENEFIC.has(rp.subLord) || K.primary.includes(rp.subLord)
    const kpScore = (kpFav ? 1.5 : -1.2) + (BENEFIC.has(rp.starLord) ? 0.6 : -0.4) + ks.sc * 0.3
    out.push(card(mkt, 'KP Astro', leanFrom(kpScore),
      `Ruling planets — Day ${rp.day}, Moon rasi-lord ${rp.rasiLord}, star-lord ${rp.starLord}, sub-lord ${rp.subLord}. KP weights the sub-lord most: ${rp.subLord} is ${kpFav ? 'favourable' : 'a caution signator'} for ${K.name} in tradition.`,
      [{ k: 'Day lord', v: rp.day }, { k: 'Rasi lord', v: rp.rasiLord }, { k: 'Star lord', v: rp.starLord }, { k: 'Sub lord', v: rp.subLord }]))
  }
  return out
}

// conjunctions within 8° (same/adjacent sign), with a traditional tone
function conjunctions(chart) {
  const names = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']
  const res = []
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = chart.planets[names[i]], b = chart.planets[names[j]]
    const sep = Math.abs(norm180(a.lon - b.lon))
    if (sep <= 8) {
      const benefics = BENEFIC.has(names[i]) && BENEFIC.has(names[j])
      const malefic = !BENEFIC.has(names[i]) && !BENEFIC.has(names[j])
      const tone = benefics ? 1 : malefic ? -1 : 0
      res.push({ pair: `${names[i]}–${names[j]}`, note: `${sep.toFixed(1)}° in ${a.sign}`, tone, text: `${names[i]}+${names[j]} conjunct in ${a.sign} (${sep.toFixed(0)}°) — ${benefics ? 'benefic blend' : malefic ? 'cautious blend' : 'mixed'}` })
    }
  }
  return res.slice(0, 4)
}

// ── Hora / Rahu-Kaal intraday timing (tradition). Equal-hour horas from ~06:00 IST. ──
const RAHU = { 0: '16:30–18:00', 1: '07:30–09:00', 2: '15:00–16:30', 3: '12:00–13:30', 4: '13:30–15:00', 5: '10:30–12:00', 6: '09:00–10:30' }
export function horaSignals(date) {
  const wd = date.getDay()
  // build the day's hora lords (24 hours from 06:00), Chaldean starting at day ruler
  const startIdx = CHALDEAN.indexOf(DAY_RULER[wd])
  const horas = []
  for (let h = 0; h < 12; h++) { // 06:00 → 18:00 (trading-relevant span)
    const lord = CHALDEAN[(startIdx + h) % 7]
    const hh = 6 + h
    horas.push({ time: `${String(hh).padStart(2, '0')}:00–${String(hh + 1).padStart(2, '0')}:00`, lord })
  }
  const fav = horas.filter(x => ['Jupiter', 'Mercury', 'Venus', 'Moon'].includes(x.lord)).map(x => `${x.time} (${x.lord})`)
  const caution = horas.filter(x => ['Saturn', 'Mars', 'Rahu'].includes(x.lord)).map(x => `${x.time} (${x.lord})`)
  const mk = (sym, label) => ({
    generator: 'astro_timing', isAstro: true, symbol: sym, method: 'Hora Timing', name: `${label} timing`,
    bias: 'Timing only', biasTone: 'flat',
    reason: `Day lord ${DAY_RULER[wd]}. Rahu Kaal (avoid fresh entries): ${RAHU[wd]} IST. Traditionally favourable horas: ${fav.slice(0, 3).join(', ') || '—'}.`,
    lines: [{ k: 'Rahu Kaal', v: RAHU[wd] + ' IST' }, { k: 'Favourable horas', v: fav.slice(0, 3).join(', ') || '—' }, { k: 'Caution horas', v: caution.slice(0, 3).join(', ') || '—' }],
    social: `🕉️ ${label} — Hora timing (${WEEKDAY[wd]})\nRahu Kaal: ${RAHU[wd]} IST — many avoid fresh trades here.\nFavourable horas: ${fav.slice(0, 3).join(', ') || '—'}.\nHonest take: timing tradition only, no proven edge. ${DISCLAIMER}\n#panchang #${sym === 'NIFTY' ? 'nifty' : 'gold'} #intraday`,
  })
  return [mk('NIFTY', 'Nifty 50'), mk('GOLD', 'Gold')]
}

// CLI smoke test
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('astroEngine.mjs')) {
  const c = computeChart(new Date())
  console.log('Sidereal positions (Lahiri):')
  for (const [n, p] of Object.entries(c.planets)) console.log(`  ${n.padEnd(8)} ${p.sign.padEnd(11)} ${String(p.deg).padStart(5)}°  ${p.nakshatra} (${p.nakLord})  sub:${p.subLord}`)
  console.log('Tithi:', c.tithi.name, c.tithi.paksha)
  console.log('\nVedic market cards:', vedicMarketSignals(new Date()).length)
  console.log('Hora cards:', horaSignals(new Date()).length)
}
