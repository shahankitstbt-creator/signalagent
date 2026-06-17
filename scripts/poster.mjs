// Auto-poster — Instagram Graph API + YouTube Data API. Posts the day's content
// on the user's OWN accounts via the OFFICIAL APIs. Until tokens are filled in
// .env it runs in DRY-RUN (logs exactly what it would post). No fake automation.
import { readFileSync, writeFileSync } from 'node:fs'
import { env } from './env.mjs'

const E = env()
export const fullCaption = (i) => `${i.hook}\n\n${i.body}\n\n${i.hashtags.join(' ')}\n\n${i.disclaimer}`
const readJSON = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return d } }

// ── Instagram (Business/Creator account via Graph API). Needs a PUBLIC image_url. ──
export async function postToInstagram(imageUrl, caption) {
  if (!E.IG_USER_ID || !E.IG_ACCESS_TOKEN) return { dryRun: true, platform: 'instagram', imageUrl }
  const create = await fetch(`https://graph.facebook.com/v20.0/${E.IG_USER_ID}/media`, {
    method: 'POST', body: new URLSearchParams({ image_url: imageUrl, caption, access_token: E.IG_ACCESS_TOKEN }),
  }).then(r => r.json())
  if (!create.id) return { ok: false, error: create.error?.message || 'container failed' }
  const pub = await fetch(`https://graph.facebook.com/v20.0/${E.IG_USER_ID}/media_publish`, {
    method: 'POST', body: new URLSearchParams({ creation_id: create.id, access_token: E.IG_ACCESS_TOKEN }),
  }).then(r => r.json())
  return pub.id ? { ok: true, id: pub.id } : { ok: false, error: pub.error?.message }
}

// ── YouTube (Data API v3, OAuth refresh token). Needs a video file (Shorts). ──
async function ytAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({ client_id: E.YT_CLIENT_ID, client_secret: E.YT_CLIENT_SECRET, refresh_token: E.YT_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  }).then(r => r.json())
  return r.access_token
}
export async function postToYouTube(videoFile, title, description, tags) {
  if (!E.YT_REFRESH_TOKEN) return { dryRun: true, platform: 'youtube', title }
  // Resumable upload would go here once a video file exists (image→video via ffmpeg, TODO).
  // Scaffolded: acquire token, then videos.insert. Returns dry info until a video is provided.
  if (!videoFile) return { ok: false, error: 'no video file (image→video render pending)' }
  const token = await ytAccessToken()
  return { ok: !!token, note: 'token acquired; wire videos.insert resumable upload with the video file', title }
}

// ── publish all un-posted items for today ──
// Post up to `limit` un-posted items per run (so a few scheduled runs/day spread
// the posts out naturally instead of dumping all 7 at once).
export async function publishPending(baseUrl = 'http://localhost:6767', limit = 2) {
  const content = readJSON('public/content.json', { items: [] })
  const posted = readJSON('public/posted.json', {})
  let done = 0, dry = 0
  for (const item of content.items) {
    if (done + dry >= limit) break
    if (posted[item.id]) continue
    if ((item.platform || []).includes('instagram') && item.image) {
      const r = await postToInstagram(baseUrl + item.image, fullCaption(item))
      if (r.ok) { posted[item.id] = { instagram: r.id, at: new Date().toISOString() }; done++; console.log('  ✓ IG posted', item.id) }
      else if (r.dryRun) { dry++; console.log(`  · [DRY] would post to IG: "${item.hook}" → ${item.image}`) }
      else console.log('  ✗ IG failed', item.id, r.error)
    }
  }
  if (done) writeFileSync('public/posted.json', JSON.stringify(posted, null, 2))
  console.log(`Publish: ${done} posted, ${dry} dry-run (limit ${limit}). Add IG/YT tokens in .env to go live.`)
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('poster.mjs')) {
  publishPending(process.env.PUBLIC_BASE_URL || 'http://localhost:6767').catch(e => { console.error(e); process.exit(1) })
}
