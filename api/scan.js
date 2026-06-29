// Vercel serverless function — manual "ScanNow": triggers the GitHub Actions
// workflow (which scans + deploys). The GitHub token lives ONLY here as a server
// env var (GH_DISPATCH_TOKEN) — never exposed to the browser.
const REPO = 'shahankitstbt-creator/signalagent'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return }
  const token = process.env.GH_DISPATCH_TOKEN
  if (!token) { res.status(503).json({ ok: false, error: 'ScanNow not enabled yet — needs a one-time GitHub token in server env.' }); return }
  const tf = ['daily', 'weekly', 'intraday', 'auto'].includes(req.query.tf) ? req.query.tf : 'auto'
  const dispatch = body => fetch(`https://api.github.com/repos/${REPO}/actions/workflows/scan.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'protrader-scannow' },
    body: JSON.stringify(body),
  })
  try {
    let r = await dispatch({ ref: 'main', inputs: { tf } })
    if (r.status === 422) r = await dispatch({ ref: 'main' }) // workflow has no inputs yet → plain dispatch (session-based)
    if (r.status === 204) { res.status(200).json({ ok: true, tf }); return }
    const t = await r.text()
    res.status(502).json({ ok: false, error: `GitHub ${r.status}: ${t.slice(0, 160)}` })
  } catch (e) { res.status(502).json({ ok: false, error: String(e && e.message || e) }) }
}
