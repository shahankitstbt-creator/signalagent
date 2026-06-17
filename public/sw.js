// ProTrader PWA service worker — NETWORK-FIRST (so new deploys never get stuck on a
// stale cached shell). Only immutable hashed /assets/* are cache-first. v2.
const CACHE = 'protrader-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  // hashed build assets are content-addressed & immutable → cache-first
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r }))))
    return
  }
  // HTML navigations + JSON data + everything else → network-first, cache for offline fallback
  e.respondWith(
    fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r })
      .catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('/index.html') : Response.error())))
  )
})

// system notification pushed from the page (target/SL hit)
self.addEventListener('message', e => {
  const d = e.data || {}
  if (d.type === 'notify') self.registration.showNotification(d.title, { body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, vibrate: [120, 60, 120], data: d.url || '/' })
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => { for (const c of cs) if ('focus' in c) return c.focus(); return self.clients.openWindow(e.notification.data || '/') }))
})
