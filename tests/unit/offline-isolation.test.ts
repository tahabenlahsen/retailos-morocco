import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api-client"
import { idb } from "@/lib/offline/db"
import { apiCache, offlineCatalog } from "@/lib/offline/cache"
import { offlineQueue } from "@/lib/offline/queue"
import { clearOfflineIdentity, getIdentityGeneration, getOfflineIdentity, requireOfflineIdentity, scopedKey, verifyOfflineIdentity } from "@/lib/offline/identity"
import type { QueuedSale } from "@/lib/offline/queue-logic"

vi.mock("@/lib/offline/db", () => ({
  idbAvailable: () => true,
  idb: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), getAll: vi.fn(), keys: vi.fn() },
}))
vi.mock("@/lib/api-client", async (original) => {
  const actual = await original<typeof import("@/lib/api-client")>()
  return { ...actual, api: { ...actual.api, getFresh: vi.fn(), post: vi.fn() } }
})
const records = new Map<string, unknown>()
const ownerA = { businessId: "business-a", userId: "cashier-a" }
const ownerB = { businessId: "business-a", userId: "cashier-b" }
function authenticate(owner = ownerA) {
  verifyOfflineIdentity({ business: { id: owner.businessId }, user: { id: owner.userId } }, getIdentityGeneration())
  return requireOfflineIdentity()
}
const sale = (key = "sale-1"): QueuedSale => ({
  owner: ownerA, key, ref: "OFF-000001", storeId: "store-1", storeName: "Shop", soldAt: "2026-01-01T00:00:00Z",
  customer: null, lines: [], payments: [{ method: "CASH", amount: 10 }], totals: { subtotal: 10, tax: 0, discount: 0, total: 10 }, status: "pending", attempts: 0,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  clearOfflineIdentity(false)
  records.clear()
  vi.resetAllMocks()
  vi.mocked(idb.get).mockImplementation(async (store, key) => records.get(`${store}:${key}`) as never)
  vi.mocked(idb.set).mockImplementation(async (store, key, value) => { records.set(`${store}:${key}`, value); return key })
  vi.mocked(idb.delete).mockImplementation(async (store, key) => { records.delete(`${store}:${key}`); return undefined })
  vi.mocked(idb.getAll).mockImplementation(async (store) => [...records].filter(([key]) => key.startsWith(`${store}:`)).map(([, value]) => value) as never)
  vi.mocked(api.getFresh).mockResolvedValue({})
  vi.mocked(api.post).mockResolvedValue({ saleNumber: "SALE-1", total: 10 })
})

describe("offline identity isolation", () => {
  it("fails closed on cold start and ignores persisted legacy /api/me", async () => {
    records.set("apiCache:/api/me", { data: { user: { id: "old" } }, at: 1 })
    expect(await apiCache.get("/api/me")).toBeUndefined()
    await expect(offlineQueue.enqueue(sale())).rejects.toThrow("verified")
    expect(await offlineQueue.sync()).toMatchObject({ stopped: "unauthorized" })
    expect(api.post).not.toHaveBeenCalled()
  })
  it("isolates both user and business for caches and catalogs, retaining data on logout", async () => {
    authenticate()
    await apiCache.set("/api/me", { secret: "a" })
    await offlineCatalog.set("store-1", [])
    clearOfflineIdentity(false)
    expect(await apiCache.get("/api/me")).toBeUndefined()
    authenticate(ownerB)
    expect(await apiCache.get("/api/me")).toBeUndefined()
    expect(await offlineCatalog.get("store-1")).toBeUndefined()
    authenticate({ ...ownerA, businessId: "business-b" })
    expect(await apiCache.get("/api/me")).toBeUndefined()
    authenticate()
    expect((await apiCache.get("/api/me"))?.data).toEqual({ secret: "a" })
    expect(await offlineCatalog.get("store-1")).toBeDefined()
  })
  it("preserves old sales, quarantines ownerless records and shows only current ownership", async () => {
    authenticate()
    const { owner: _owner, ...legacy } = sale("legacy")
    records.set("saleQueue:legacy", legacy)
    await offlineQueue.enqueue(sale())
    authenticate(ownerB)
    await offlineQueue.load()
    expect(offlineQueue.getSnapshot().items).toEqual([])
    await offlineQueue.sync()
    expect(api.post).not.toHaveBeenCalled()
    authenticate()
    await offlineQueue.load()
    expect(offlineQueue.getSnapshot().items.map((item) => item.key)).toEqual(["sale-1"])
    expect(records.has("saleQueue:legacy")).toBe(true)
  })
  it("does not grant authority from a late verification after logout", () => {
    const generation = getIdentityGeneration()
    clearOfflineIdentity(false)
    expect(verifyOfflineIdentity({ business: { id: "b" }, user: { id: "u" } }, generation)).toBeNull()
    expect(getOfflineIdentity()).toBeNull()
  })
  it("rejects late checkout even if the same cashier signs in again", async () => {
    const previous = authenticate()
    clearOfflineIdentity(false)
    authenticate()
    await expect(offlineQueue.enqueue(sale(), previous)).rejects.toThrow("changed")
    expect(idb.set).not.toHaveBeenCalled()
  })
  it("does not return a cache read that completed after an identity switch", async () => {
    authenticate()
    const read = deferred<unknown>()
    vi.mocked(idb.get).mockReturnValueOnce(read.promise as never)
    const pending = apiCache.get("/api/me")
    authenticate(ownerB)
    read.resolve({ data: "secret", at: 1 })
    expect(await pending).toBeUndefined()
  })
  it("does not expose a prior owner's slow IDB queue load", async () => {
    authenticate()
    const read = deferred<QueuedSale[]>()
    vi.mocked(idb.getAll).mockReturnValueOnce(read.promise)
    const pending = offlineQueue.load()
    const rejected = expect(pending).rejects.toThrow("changed")
    await Promise.resolve()
    authenticate(ownerB)
    read.resolve([sale()])
    await rejected
    expect(offlineQueue.getSnapshot().items).toEqual([])
    expect(offlineQueue.getSnapshot().loaded).toBe(false)
  })
  it("reports load failure instead of succeeding with an empty queue, and can retry", async () => {
    authenticate()
    vi.mocked(idb.getAll).mockRejectedValueOnce(new Error("disk failure"))
    await expect(offlineQueue.load()).rejects.toThrow("disk failure")
    expect(offlineQueue.getSnapshot()).toMatchObject({ loaded: false, error: "disk failure" })
    await offlineQueue.load()
    expect(offlineQueue.getSnapshot()).toMatchObject({ loaded: true, error: null })
  })
  it("serializes enqueue behind a slow initial load without losing the sale", async () => {
    authenticate()
    const read = deferred<QueuedSale[]>()
    vi.mocked(idb.getAll).mockReturnValueOnce(read.promise)
    const load = offlineQueue.load()
    const enqueue = offlineQueue.enqueue(sale())
    read.resolve([])
    await Promise.all([load, enqueue])
    expect(offlineQueue.getSnapshot().items.map((item) => item.key)).toEqual(["sale-1"])
  })
  it("keeps pending sales when online verification cannot reach the server", async () => {
    authenticate()
    await offlineQueue.enqueue(sale())
    vi.mocked(api.getFresh).mockRejectedValueOnce({ code: "NETWORK" })
    expect(await offlineQueue.sync()).toMatchObject({ stopped: "offline" })
    expect(api.post).not.toHaveBeenCalled()
    expect(offlineQueue.getSnapshot().items[0].status).toBe("pending")
  })
  it("keeps the server snapshot stable", () => {
    expect(offlineQueue.getServerSnapshot()).toBe(offlineQueue.getServerSnapshot())
  })
  it("is single-flight even during initial IDB load", async () => {
    authenticate()
    records.set(`saleQueue:${scopedKey(ownerA, "sale-1")}`, sale())
    const read = deferred<QueuedSale[]>()
    vi.mocked(idb.getAll).mockReturnValueOnce(read.promise)
    const first = offlineQueue.sync()
    const second = offlineQueue.sync()
    expect(second).toBe(first)
    read.resolve([sale()])
    expect(await first).toMatchObject({ synced: [{ key: "sale-1" }] })
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith("/api/sales", expect.objectContaining({ offlineOwner: ownerA }))
  })
  it("never replays when fresh server verification discovers a different identity", async () => {
    authenticate()
    await offlineQueue.enqueue(sale())
    vi.mocked(api.getFresh).mockImplementationOnce(async () => { authenticate(ownerB); return {} as never })
    expect(await offlineQueue.sync()).toMatchObject({ stopped: "unauthorized" })
    expect(api.post).not.toHaveBeenCalled()
    expect(records.has(`saleQueue:${scopedKey(ownerA, "sale-1")}`)).toBe(true)
  })
  it("does not continue the batch or delete prior records when identity changes during POST", async () => {
    authenticate()
    await offlineQueue.enqueue(sale())
    await offlineQueue.enqueue(sale("sale-2"))
    vi.mocked(api.post).mockImplementationOnce(async () => { authenticate(ownerB); return { saleNumber: "SALE-1", total: 10 } as never })
    expect(await offlineQueue.sync()).toMatchObject({ stopped: "unauthorized" })
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(offlineQueue.getSnapshot().items).toEqual([])
    expect(records.has(`saleQueue:${scopedKey(ownerA, "sale-1")}`)).toBe(true)
  })
  it("retains pending status on a persistence failure after server success", async () => {
    authenticate()
    await offlineQueue.enqueue(sale())
    vi.mocked(idb.delete).mockRejectedValueOnce(new Error("write failed"))
    await expect(offlineQueue.sync()).rejects.toThrow("write failed")
    expect(offlineQueue.getSnapshot().items[0].status).toBe("pending")
    expect(offlineQueue.getSnapshot().error).toBe("write failed")
  })
})
