// Vercel Cron → triggers the DAILY scan workflow reliably (Vercel cron doesn't
// drop runs like GitHub's schedule does). Fires each morning pre-market.
const REPO = 'shahankitstbt-creator/signalagent'
export default async function handler(req, res) {
  const token = process.env.GH_DISPATCH_TOKEN
  if (!token) { res.status(503).json({ ok: false, error: 'no dispatch token' }); return }
  const tf = ['daily', 'intraday', 'weekly'].includes(req.query.tf) ? req.query.tf : 'daily'
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/scan.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'protrader-cron' },
      body: JSON.stringify({ ref: 'main', inputs: { tf } }),
    })
    res.status(r.status === 204 ? 200 : 502).json({ ok: r.status === 204, tf })
  } catch (e) { res.status(502).json({ ok: false, error: String(e && e.message || e) }) }
}
