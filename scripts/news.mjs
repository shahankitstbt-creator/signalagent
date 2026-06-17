// News tracker — pulls headlines from top Indian market-news sources (RSS) and
// tags any NSE stocks mentioned, so news-driven moves can be watched.
// NOTE: X/Twitter handles need the paid X API; RSS from the leading outlets is the
// practical, auth-free equivalent and is what we track here.
import { getText } from './lib.mjs'

const SOURCES = [
  { name: 'ET Markets', url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms' },
  { name: 'Moneycontrol', url: 'https://www.moneycontrol.com/rss/marketreports.xml' },
  { name: 'Livemint Markets', url: 'https://www.livemint.com/rss/markets' },
  { name: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss' },
]
const STOP = new Set(['limited', 'ltd', 'india', 'industries', 'finance', 'bank', 'company', 'corporation', 'services', 'shares', 'stock', 'stocks', 'market', 'markets', 'group', 'enterprises', 'motors', 'power', 'steel', 'global', 'capital'])

function parseRSS(xml, source) {
  const items = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = re.exec(xml)) && items.length < 15) {
    const block = m[1]
    const grab = tag => { const r = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`)); return r ? r[1].trim() : '' }
    const title = grab('title')
    if (title) items.push({ title, link: grab('link'), date: grab('pubDate'), source })
  }
  return items
}

export async function trackNews(universe) {
  const all = []
  for (const s of SOURCES) { const xml = await getText(s.url, 1); if (xml) all.push(...parseRSS(xml, s.name)) }
  // build a matcher: symbol token + distinctive (>4 char, non-stopword) name words
  const idx = (universe || []).map(u => ({
    sym: u.symbol,
    words: [u.symbol.toLowerCase(), ...String(u.name || '').toLowerCase().replace(/[.,]/g, '').split(/\s+/).filter(w => w.length > 4 && !STOP.has(w))],
  }))
  for (const it of all) {
    const low = ' ' + it.title.toLowerCase() + ' '
    const hit = new Set()
    for (const u of idx) if (u.words.some(w => w && low.includes(w))) hit.add(u.sym)
    it.symbols = [...hit].slice(0, 4)
  }
  // de-dup by title, newest sources first
  const seen = new Set()
  return all.filter(it => { const k = it.title.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 40)
}
