// Auto-publish: deploy the freshly-scanned public/*.json to Vercel (production).
// Called by the scheduled scan launchers so the live site refreshes hands-free.
import { execSync } from 'node:child_process'
import { env } from './env.mjs'

const E = env()
if (!E.VERCEL_TOKEN) { console.log('publish: no VERCEL_TOKEN in .env — skipping deploy'); process.exit(0) }
try {
  execSync(`npx --yes vercel@latest deploy --prod --yes --scope vishalcurators-projects --token=${E.VERCEL_TOKEN}`,
    { cwd: process.cwd(), stdio: 'inherit', timeout: 5 * 60000 })
  console.log('publish: deployed to production ✓')
} catch (e) { console.log('publish: deploy failed —', e.message) }
