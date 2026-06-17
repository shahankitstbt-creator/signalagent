// ProTrader PWA service worker — app-shell cache + fresh data.
const CACHE = 'protrader-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  // Always fetch fresh data + API (board/signals/yahoo); fall back to cache offline.
  const isData = url.pathname.endsWith('.json') || url.pathname.startsWith('/yahoo') || url.pathname.startsWith('/api')
  if (isData) {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r }).catch(() => caches.match(e.request)))
    return
  }
  // App shell: cache-first, fall back to network, then index.html for SPA routes.
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request).catch(() => caches.match('/index.html'))))
})

// Show a notification pushed from the page (target/SL hit).
self.addEventListener('message', e => {
  const d = e.data || {}
  if (d.type === 'notify') {
    self.registration.showNotification(d.title, { body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, vibrate: [120, 60, 120], data: d.url || '/' })
  }
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => { for (const c of cs) if ('focus' in c) return c.focus(); return self.clients.openWindow(e.notification.data || '/') }))
})
