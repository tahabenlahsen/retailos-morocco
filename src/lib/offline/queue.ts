"use client"

import { api, ApiError } from "@/lib/api-client"
import { idb, idbAvailable } from "./db"
import { decideAfterError, toSalePayload, type QueuedSale } from "./queue-logic"
import { assertCurrentIdentity, getOfflineIdentity, isCurrentIdentity, requireOfflineIdentity, sameOwner, scopedKey, subscribeOfflineIdentity, type OfflineIdentity } from "./identity"

export interface SyncResult {
  synced: { key: string; saleNumber: string; total: number }[]
  failed: { key: string; code: string; message: string }[]
  stopped?: "offline" | "unauthorized"
}
interface QueueState {
  items: QueuedSale[]
  loaded: boolean
  syncing: boolean
  lastSync: SyncResult | null
  error: string | null
}
// useSyncExternalStore requires a referentially stable server snapshot.
const SERVER_STATE: QueueState = { items: [], loaded: false, syncing: false, lastSync: null, error: null }
let state: QueueState = SERVER_STATE
const listeners = new Set<() => void>()
function setState(patch: Partial<QueueState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}
function reportError(error: unknown, owner: OfflineIdentity | null) {
  if (isCurrentIdentity(owner)) setState({ error: error instanceof Error ? error.message : String(error) })
}
// Serialize IDB loads/mutations so a slow initial load cannot overwrite an enqueue/delete.
let localFlight: Promise<unknown> = Promise.resolve()
function local<T>(operation: () => Promise<T>): Promise<T> {
  const next = localFlight.then(operation)
  localFlight = next.catch(() => undefined)
  return next
}
let syncFlight: Promise<SyncResult> | null = null
const sorted = (items: QueuedSale[]) => items.sort((a, b) => a.soldAt.localeCompare(b.soldAt))
async function loadOwner(owner: OfflineIdentity) {
  return local(async () => {
    assertCurrentIdentity(owner)
    if (state.loaded) return
    try {
      if (!idbAvailable()) throw new Error("IndexedDB is unavailable; offline sales cannot be loaded")
      const all = await idb.getAll<QueuedSale>("saleQueue")
      assertCurrentIdentity(owner)
      // Ownerless legacy entries remain on disk for manual recovery. Never infer their owner.
      setState({ items: sorted(all.filter((sale) => sameOwner(sale.owner, owner))), loaded: true, error: null })
    } catch (error) {
      reportError(error, owner)
      throw error
    }
  })
}
function backgroundLoad() {
  const owner = getOfflineIdentity()
  if (owner) void loadOwner(owner).catch((error) => reportError(error, owner))
}
subscribeOfflineIdentity(() => {
  state = { ...SERVER_STATE }
  listeners.forEach((listener) => listener())
  if (listeners.size) backgroundLoad()
})

export const offlineQueue = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    if (!state.loaded) backgroundLoad()
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => state,
  getServerSnapshot: () => SERVER_STATE,
  load() { return loadOwner(requireOfflineIdentity()) },
  async enqueue(sale: QueuedSale, expectedIdentity: OfflineIdentity = requireOfflineIdentity()) {
    const owner = expectedIdentity
    assertCurrentIdentity(owner)
    if (!sameOwner(sale.owner, owner)) throw new Error("Queued sale belongs to another identity")
    await loadOwner(owner) // A load failure is not an empty queue or permission to proceed.
    await local(async () => {
      assertCurrentIdentity(owner)
      const record = { ...sale, owner: { businessId: owner.businessId, userId: owner.userId } }
      await idb.set("saleQueue", scopedKey(owner, sale.key), record)
      // A committed old-owner sale stays persisted if logout happened during the transaction.
      assertCurrentIdentity(owner)
      setState({ items: sorted([...state.items.filter((item) => item.key !== sale.key), record]), error: null })
    })
  },
  async discard(key: string) {
    const owner = requireOfflineIdentity()
    if (syncFlight) throw new Error("Wait for synchronization before discarding a sale")
    await loadOwner(owner)
    await local(async () => {
      assertCurrentIdentity(owner)
      if (syncFlight) throw new Error("Wait for synchronization before discarding a sale")
      const item = state.items.find((sale) => sale.key === key)
      if (!item) return
      if (item.status !== "failed" || item.lastError?.code === "INTERNAL_ERROR") throw new Error("Reconcile this sale with the server before discarding it")
      await idb.delete("saleQueue", scopedKey(owner, key))
      assertCurrentIdentity(owner)
      setState({ items: state.items.filter((item) => item.key !== key) })
    })
  },
  async retry(key: string) {
    const owner = requireOfflineIdentity()
    if (syncFlight) return syncFlight
    await loadOwner(owner)
    await local(async () => {
      assertCurrentIdentity(owner)
      if (syncFlight) throw new Error("Wait for synchronization before retrying a sale")
      const item = state.items.find((sale) => sale.key === key)
      if (!item) return
      const updated: QueuedSale = { ...item, status: "pending", lastError: undefined }
      await idb.set("saleQueue", scopedKey(owner, key), updated)
      assertCurrentIdentity(owner)
      setState({ items: state.items.map((sale) => sale.key === key ? updated : sale) })
    })
    assertCurrentIdentity(owner)
    return offlineQueue.sync()
  },
  /** Every caller receives the same promise, including while the initial IDB load is pending. */
  sync(): Promise<SyncResult> {
    if (syncFlight) return syncFlight
    const owner = getOfflineIdentity()
    if (!owner) return Promise.resolve({ synced: [], failed: [], stopped: "unauthorized" })
    // Defer the body one microtask so the flight is installed before any observable work.
    syncFlight = Promise.resolve().then(() => syncOwner(owner)).finally(() => { syncFlight = null })
    return syncFlight
  },
}

async function syncOwner(owner: OfflineIdentity): Promise<SyncResult> {
  const result: SyncResult = { synced: [], failed: [] }
  if (!isCurrentIdentity(owner)) return { ...result, stopped: "unauthorized" }
  setState({ syncing: true, error: null })
  try {
    await loadOwner(owner)
    const pending = state.items.filter((sale) => sale.status === "pending")
    for (const queued of pending) {
      if (!isCurrentIdentity(owner)) { result.stopped = "unauthorized"; break }
      let sale: { saleNumber: string; total: number }
      try {
        // Never trust navigator.onLine or cached /api/me to authorize replay.
        await api.getFresh("/api/me")
        if (!isCurrentIdentity(owner)) { result.stopped = "unauthorized"; break }
        // Server must compare offlineOwner with its authenticated tenant/user atomically.
        sale = await api.post<{ saleNumber: string; total: number }>("/api/sales", toSalePayload(queued))
      } catch (error) {
        if (!isCurrentIdentity(owner)) { result.stopped = "unauthorized"; break }
        const decision = decideAfterError(error)
        if (decision.action === "stop") { result.stopped = decision.reason; break }
        const failed: QueuedSale = { ...queued, status: "failed", attempts: queued.attempts + 1, lastError: { code: decision.code, message: error instanceof ApiError ? error.message : decision.message } }
        await local(async () => {
          assertCurrentIdentity(owner)
          await idb.set("saleQueue", scopedKey(owner, queued.key), failed)
          assertCurrentIdentity(owner)
          setState({ items: state.items.map((item) => item.key === queued.key ? failed : item) })
        })
        result.failed.push({ key: queued.key, ...failed.lastError! })
        continue
      }
      // Persistence failures after server success must propagate, not mark the sale failed.
      // Retain the key for an idempotent retry if identity changed during the response.
      if (!isCurrentIdentity(owner)) { result.stopped = "unauthorized"; break }
      await local(async () => {
        assertCurrentIdentity(owner)
        await idb.delete("saleQueue", scopedKey(owner, queued.key))
        assertCurrentIdentity(owner)
        setState({ items: state.items.filter((item) => item.key !== queued.key) })
      })
      result.synced.push({ key: queued.key, saleNumber: sale.saleNumber, total: sale.total })
    }
  } catch (error) {
    if (!isCurrentIdentity(owner)) result.stopped = "unauthorized"
    else { reportError(error, owner); throw error }
  } finally {
    if (isCurrentIdentity(owner)) setState({ syncing: false, lastSync: result })
  }
  if (isCurrentIdentity(owner) && result.synced.length && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(QUEUE_SYNCED_EVENT, { detail: result }))
  return result
}
export const QUEUE_SYNCED_EVENT = "retailos:queue-synced"

/** Reference-counted triggers: no orphan intervals/listeners under Strict Mode or remounts. */
let users = 0
let stopTriggers: (() => void) | undefined
export function startQueueAutoSync(): () => void {
  if (typeof window === "undefined") return () => undefined
  if (users++ === 0) {
    const sync = () => {
      const owner = getOfflineIdentity()
      if (owner && navigator.onLine) void offlineQueue.sync().catch((error) => reportError(error, owner))
    }
    window.addEventListener("online", sync)
    const timer = setInterval(sync, 30_000)
    const unsubscribe = subscribeOfflineIdentity(sync)
    stopTriggers = () => { window.removeEventListener("online", sync); clearInterval(timer); unsubscribe() }
    sync()
  }
  return () => { if (--users === 0) { stopTriggers?.(); stopTriggers = undefined } }
}
