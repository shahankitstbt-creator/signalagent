// Theme: Obsidian ships both light + dark. Default = light; user can toggle to dark.
// Choice persists in localStorage and is applied to <html data-theme> so every view follows it.
const KEY = 'pt_theme'
const root = () => document.documentElement

export function initTheme() {
  let t
  try { t = localStorage.getItem(KEY) } catch { t = null }
  if (t !== 'light' && t !== 'dark') t = 'light'   // light by default
  root().setAttribute('data-theme', t)
  return t
}
export function getTheme() { return root().getAttribute('data-theme') || 'light' }
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark'
  root().setAttribute('data-theme', next)
  try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
  return next
}
