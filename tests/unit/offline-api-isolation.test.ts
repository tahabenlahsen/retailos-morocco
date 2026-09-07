import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api-client"
import { apiCache } from "@/lib/offline/cache"
import { idb } from "@/lib/offline/db"
import { clearOfflineIdentity, getIdentityGeneration, getOfflineIdentity, scopedKey, verifyOfflineIdentity } from "@/lib/offline/identity"

vi.mock("@/lib/offline/db", () => ({
  idbAvailable: () => true,
  idb: { get: vi.fn(), set: vi.fn(), keys: vi.fn(), delete: vi.fn() },
}))
const records = new Map<string, unknown>()
const owner = { businessId: "b1", userId: "u1" }
const me = { business: { id: "b1" }, user: { id: "u1" } }
function authenticate() { verifyOfflineIdentity(me, getIdentityGeneration()) }
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(status === 200 ? { success: true, data } : { success: false, error: { code: "UNAUTHORIZED", message: "expired" } }), { status, headers: { "content-type": "application/json" } })
}
beforeEach(() => {
  clearOfflineIdentity(false)
  records.clear()
  vi.resetAllMocks()
  vi.stubGlobal("window", { dispatchEvent: vi.fn() })
  vi.stubGlobal("fetch", vi.fn())
  vi.mocked(idb.get).mockImplementation(async (store, key) => records.get(`${store}:${key}`) as never)
  vi.mocked(idb.set).mockImplementation(async (store, key, value) => { records.set(`${store}:${key}`, value); return key })
})
afterEach(() => { vi.unstubAllGlobals() })

describe("API offline read-through authority", () => {
  it("establishes authority only after a successful network /api/me", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(me))
    expect(await api.getFresh("/api/me")).toEqual(me)
    expect(getOfflineIdentity()).toMatchObject(owner)
    expect(fetch).toHaveBeenCalledWith("/api/me", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }))
  })
  it("binds authenticated requests to the verified owner for server-side mismatch checks", async () => {
    authenticate()
    vi.mocked(fetch).mockResolvedValueOnce(response([]))
    await api.get("/api/products")
    expect(fetch).toHaveBeenCalledWith("/api/products", expect.objectContaining({ headers: expect.objectContaining({ "X-RetailOS-Business-Id": "b1", "X-RetailOS-User-Id": "u1" }) }))
  })
  it("allows the verified running identity to use cache through a network outage", async () => {
    authenticate()
    await apiCache.set("/api/me", me)
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"))
    expect(await api.get("/api/me")).toEqual(me)
    expect(getOfflineIdentity()).toMatchObject(owner)
  })
  it("does not revive a signed-out identity using /api/me cache", async () => {
    authenticate()
    await apiCache.set("/api/me", me)
    clearOfflineIdentity(false)
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"))
    await expect(api.get("/api/me")).rejects.toMatchObject({ code: "NETWORK" })
    expect(getOfflineIdentity()).toBeNull()
    expect(records.has(`apiCache:${scopedKey(owner, "/api/me")}`)).toBe(true)
  })
  it("getFresh never authorizes replay through an offline cache hit", async () => {
    authenticate()
    await apiCache.set("/api/me", me)
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"))
    await expect(api.getFresh("/api/me")).rejects.toMatchObject({ code: "NETWORK" })
  })
  it("invalidates on JSON 401 and does not fall back to cached data", async () => {
    authenticate()
    await apiCache.set("/api/me", me)
    vi.mocked(fetch).mockResolvedValueOnce(response(null, 401))
    await expect(api.get("/api/me")).rejects.toMatchObject({ status: 401 })
    expect(getOfflineIdentity()).toBeNull()
  })
  it("also invalidates on non-JSON 401", async () => {
    authenticate()
    vi.mocked(fetch).mockResolvedValueOnce(new Response("expired", { status: 401 }))
    await expect(api.get("/api/products")).rejects.toMatchObject({ status: 401 })
    expect(getOfflineIdentity()).toBeNull()
  })
  it("rejects late network results and does not cache them under the new identity", async () => {
    authenticate()
    let finish!: (value: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const request = api.get("/api/products")
    verifyOfflineIdentity({ business: { id: "b2" }, user: { id: "u2" } }, getIdentityGeneration())
    finish(response({ private: "old" }))
    await expect(request).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(idb.set).not.toHaveBeenCalled()
  })
  it("surfaces cache read errors instead of returning an empty successful result", async () => {
    authenticate()
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"))
    vi.mocked(idb.get).mockRejectedValueOnce(new Error("IDB broken"))
    await expect(api.get("/api/me")).rejects.toThrow("IDB broken")
  })
})
