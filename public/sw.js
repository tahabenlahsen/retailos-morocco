/* RetailOS: cache only public static assets. Authenticated HTML, RSC and APIs are network-only.
 * An already-open, verified POS may continue offline using identity-scoped IndexedDB data.
 * Cold offline navigation gets a generic response, never another user's cached document.
 */
const STATIC_CACHE = "retailos-static-v3"
self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()) })
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("retailos-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  )
})
self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => new Response(
      "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Offline</title><h1>Offline</h1><p>Reconnect to sign in. An already open, verified POS can continue offline.</p></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    )))
    return
  }
  // No extension-only allowlist: an authenticated route could end with .woff2.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok && !res.redirected && !res.headers.get("content-type")?.includes("text/html")) await cache.put(req, res.clone())
      return res
    }))
  }
})
