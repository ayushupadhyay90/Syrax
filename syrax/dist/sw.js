/* Syrax service worker — makes the app installable on desktop Chrome and
   Android Chrome. Navigation is NETWORK-FIRST so the user NEVER sees a stale
   bundle again (they were burned by cached builds before); the cache only
   kicks in when the network is down. Static assets are cache-first — Vite
   hashes every filename, so a new deploy automatically gets a fresh URL. */
const CACHE = 'syrax-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['/']).catch(() => {}))
      .catch(() => {}),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const sameOrigin = new URL(req.url).origin === self.location.origin

  if (req.mode === 'navigate') {
    // network-first (always fresh) → cached shell only when offline
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
            }
            return res
          }),
      ),
    )
  }
})
