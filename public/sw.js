/* The System — service worker.
 * Two jobs: deliver push notifications, and keep the shell available offline. */

const CACHE = 'system-v2'
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

/* Network-first for navigation so a deploy is picked up immediately;
   cache-first for hashed assets, which never change under the same name. */
self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && url.pathname.startsWith('/assets/')) {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(request, copy))
      }
      return res
    }).catch(() => hit))
  )
})

self.addEventListener('push', (e) => {
  let payload = {}
  try { payload = e.data ? e.data.json() : {} } catch { payload = { title: 'THE SYSTEM', body: e.data?.text() } }

  const severity = payload.severity || 'INFO'
  e.waitUntil(
    self.registration.showNotification(payload.title || 'THE SYSTEM', {
      body: payload.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.tag || `sys-${severity}`,
      renotify: severity === 'DANGER',
      requireInteraction: severity === 'DANGER',
      vibrate: severity === 'DANGER' ? [80, 40, 80, 40, 160] : [40],
      data: { url: payload.link || '/' },
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = e.notification.data?.url || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(target)
          return c.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
