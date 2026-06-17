// Tiny .env loader (no dependency). Returns merged process.env + .env file.
import { readFileSync } from 'node:fs'

let cached = null
export function env() {
  if (cached) return cached
  const e = { ...process.env }
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !line.trim().startsWith('#')) e[m[1]] = m[2]
    }
  } catch { /* no .env */ }
  cached = e
  return e
}
