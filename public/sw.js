/* RetailOS Morocco service worker.
 *
 * Strategy (deliberately conservative for a financial application):
 *  - Static assets (/_next/static, /icons, fonts): cache-first (immutable, content-hashed).
 *  - Navigations (HTML): network-first; if offline, serve the last cached copy of that page,
 *    else the /offline fallback.
 *  - /api/* is NEVER cached: sales, stock and money must always reflect the server.
 *
 * There is no offline write queue: creating sales offline is not supported (documented).
 */
const VERSION = "v1"
const STATIC_CACHE = `retailos-static-${VERSION}`
const PAGE_CACHE = `retailos-pages-${VERSION}`
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGE_CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC_CACHE, PAGE_CACHE].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return // never cache

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.endsWith(".woff2")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      })
    )
    return
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          if (res.ok) {
            const cache = await caches.open(PAGE_CACHE)
            cache.put(req, res.clone())
          }
          return res
        } catch {
          const cache = await caches.open(PAGE_CACHE)
          return (await cache.match(req)) || (await cache.match(OFFLINE_URL)) || new Response("Offline", { status: 503 })
        }
      })()
    )
  }
})
