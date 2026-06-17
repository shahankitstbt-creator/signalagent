import { create } from 'zustand'

// Client-side target/SL hit watcher. Polls live LTP for open signals and fires
// a notification + in-app popup the first time price crosses each SL/target.
const FIRED = 'pt_hit_fired'
const loadFired = () => { try { return JSON.parse(localStorage.getItem(FIRED)) || {} } catch { return {} } }
const saveFired = f => { try { localStorage.setItem(FIRED, JSON.stringify(f)) } catch {} }

let timer = null

async function ltpFor(sym) {
  try {
    const d = await fetch(`/yahoo/v8/finance/chart/${encodeURIComponent(sym)}.NS?interval=1d&range=1d`).then(r => r.json())
    const r = d?.chart?.result?.[0]
    return r?.meta?.regularMarketPrice ?? (r?.indicators?.quote?.[0]?.close || []).filter(x => x != null).at(-1) ?? null
  } catch { return null }
}

export const useHitAlerts = create((set, get) => ({
  enabled: localStorage.getItem('pt_alerts_on') === '1',
  permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  popups: [],
  fired: loadFired(),
  busy: false,

  async enable() {
    let perm = get().permission
    if (typeof Notification !== 'undefined' && perm !== 'granted') { try { perm = await Notification.requestPermission() } catch {} }
    localStorage.setItem('pt_alerts_on', '1')
    set({ enabled: true, permission: perm })
    get().start()
  },
  disable() { localStorage.setItem('pt_alerts_on', '0'); set({ enabled: false }); if (timer) { clearInterval(timer); timer = null } },
  dismiss(id) { set(s => ({ popups: s.popups.filter(p => p.id !== id) })) },

  notify(title, body, tag, tone) {
    const id = tag + ':' + Date.now()
    set(s => ({ popups: [...s.popups, { id, title, body, tone }].slice(-4) }))
    setTimeout(() => get().dismiss(id), 13000)
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller)
        navigator.serviceWorker.controller.postMessage({ type: 'notify', title, body, tag, url: '/' })
      else if (typeof Notification !== 'undefined' && Notification.permission === 'granted')
        new Notification(title, { body, icon: '/icon-192.png', tag })
    } catch {}
  },

  start() {
    if (timer || !get().enabled) return
    const tick = () => get().check()
    tick()
    timer = setInterval(tick, 180000) // every 3 minutes
  },

  async check() {
    if (get().busy) return
    set({ busy: true })
    try {
      const b = await fetch('/board.json?t=' + Date.now()).then(r => r.json())
      const bySym = {}
      for (const g of b.generators || []) for (const s of g.signals || [])
        if (s.entry != null && Array.isArray(s.targets) && !s.isAstro && !s.isOption && !s.placeholder)
          (bySym[s.symbol] = bySym[s.symbol] || []).push(s)
      const syms = Object.keys(bySym).slice(0, 60)
      const fired = { ...get().fired }
      for (const sym of syms) {
        const ltp = await ltpFor(sym)
        if (ltp == null) continue
        for (const s of bySym[sym]) {
          const isBuy = (s.direction || 'LONG') === 'LONG'
          const slKey = `${sym}|SL|${s.sl}`
          if (isBuy && ltp <= s.sl && !fired[slKey]) { fired[slKey] = 1; get().notify(`🔴 Stop-loss hit — ${sym}`, `Price ₹${ltp} hit the stop ₹${s.sl}. Manage risk.`, slKey, 'down') }
          s.targets.forEach((t, k) => {
            const key = `${sym}|T${k + 1}|${t.price}`
            if (isBuy && ltp >= t.price && !fired[key]) { fired[key] = 1; get().notify(`🎯 Target ${k + 1} hit — ${sym}`, `Price ₹${ltp} reached T${k + 1} ₹${t.price} (+${t.pct}%).`, key, 'up') }
          })
        }
        await new Promise(r => setTimeout(r, 120))
      }
      saveFired(fired); set({ fired })
    } catch {} finally { set({ busy: false }) }
  },
}))
