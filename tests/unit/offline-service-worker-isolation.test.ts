import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

function worker(fetch = vi.fn()) {
  const handlers = new Map<string, (event: { request?: unknown; respondWith?: (value: Promise<Response>) => void; waitUntil?: (value: Promise<unknown>) => void }) => void>()
  const caches = { keys: vi.fn().mockResolvedValue(["retailos-pages-v2", "retailos-static-v2", "retailos-static-v3", "unrelated-app"]), delete: vi.fn().mockResolvedValue(true), open: vi.fn() }
  runInNewContext(readFileSync(resolve("public/sw.js"), "utf8"), {
    self: { location: { origin: "https://shop.test" }, addEventListener: (name: string, handler: typeof handlers extends Map<string, infer V> ? V : never) => handlers.set(name, handler), skipWaiting: vi.fn(), clients: { claim: vi.fn() } },
    caches, fetch, Response, URL,
  })
  return { handlers, caches, fetch }
}

describe("service worker document isolation", () => {
  it("never stores authenticated navigation HTML", async () => {
    const app = worker(vi.fn().mockResolvedValue(new Response("PRIVATE HTML")))
    let response!: Promise<Response>
    app.handlers.get("fetch")!({ request: { method: "GET", mode: "navigate", url: "https://shop.test/pos" }, respondWith: (value) => { response = value } })
    expect(await (await response).text()).toBe("PRIVATE HTML")
    expect(app.caches.open).not.toHaveBeenCalled()
  })
  it("returns generic offline HTML without ever looking up a prior user's document", async () => {
    const app = worker(vi.fn().mockRejectedValue(new TypeError("offline")))
    let response!: Promise<Response>
    app.handlers.get("fetch")!({ request: { method: "GET", mode: "navigate", url: "https://shop.test/pos" }, respondWith: (value) => { response = value } })
    const result = await response
    expect(result.status).toBe(503)
    expect(await result.text()).toContain("Reconnect to sign in")
    expect(app.caches.open).not.toHaveBeenCalled()
  })
  it("removes old global page caches on activation, without touching unrelated caches", async () => {
    const app = worker()
    let activation!: Promise<unknown>
    app.handlers.get("activate")!({ waitUntil: (value) => { activation = value } })
    await activation
    expect(app.caches.delete.mock.calls).toEqual([["retailos-pages-v2"], ["retailos-static-v2"]])
  })
  it("does not intercept APIs, RSC or extension-only private routes", () => {
    const app = worker()
    const respondWith = vi.fn()
    for (const path of ["/api/me", "/pos?_rsc=secret", "/private.woff2"]) {
      app.handlers.get("fetch")!({ request: { method: "GET", mode: "cors", url: `https://shop.test${path}` }, respondWith })
    }
    expect(respondWith).not.toHaveBeenCalled()
    expect(app.caches.open).not.toHaveBeenCalled()
  })
})
