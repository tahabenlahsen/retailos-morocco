"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import { assertCurrentIdentity, getOfflineIdentity, subscribeOfflineIdentity } from "@/lib/offline/identity"
import { offlineQueue, startQueueAutoSync } from "@/lib/offline/queue"
import { offlineCatalog } from "@/lib/offline/cache"
import { stockDeltas } from "@/lib/offline/queue-logic"
import type { PosProduct } from "@/components/pos/cart-store"

const onlineStore = {
  subscribe(cb: () => void) {
    window.addEventListener("online", cb)
    window.addEventListener("offline", cb)
    return () => {
      window.removeEventListener("online", cb)
      window.removeEventListener("offline", cb)
    }
  },
  get: () => navigator.onLine,
  server: () => true,
}

/** Browser connectivity (navigator.onLine). Note: "online" only means a network link exists. */
export function useOnline() {
  return useSyncExternalStore(onlineStore.subscribe, onlineStore.get, onlineStore.server)
}

/** Offline sale queue state + actions. Starts the background auto-sync once. */
export function useOfflineQueue() {
  useEffect(() => startQueueAutoSync(), [])
  const s = useSyncExternalStore(offlineQueue.subscribe, offlineQueue.getSnapshot, offlineQueue.getServerSnapshot)
  const pending = s.items.filter((i) => i.status === "pending")
  const failed = s.items.filter((i) => i.status === "failed")
  const sync = useCallback(() => offlineQueue.sync(), [])
  const retry = useCallback((key: string) => offlineQueue.retry(key), [])
  const discard = useCallback((key: string) => offlineQueue.discard(key), [])
  return { items: s.items, pending, failed, syncing: s.syncing, loaded: s.loaded, error: s.error, lastSync: s.lastSync, sync, retry, discard }
}

/**
 * Keeps a local copy of the store's product catalogue for offline scanning.
 * Refreshed on mount and every 10 minutes while online; served from IndexedDB otherwise.
 */
export function useOfflineCatalog(storeId: string | undefined) {
  const online = useOnline()
  const owner = useSyncExternalStore(subscribeOfflineIdentity, getOfflineIdentity, () => null)
  const q = useQuery({
    queryKey: ["pos-catalog", owner?.businessId, owner?.userId, owner?.generation, storeId],
    enabled: !!storeId && !!owner,
    staleTime: 10 * 60_000,
    refetchInterval: online ? 10 * 60_000 : false,
    queryFn: async (): Promise<PosProduct[]> => {
      assertCurrentIdentity(owner)
      try {
        const r = await api.get<{ items: PosProduct[] }>("/api/products/catalog", { storeId })
        assertCurrentIdentity(owner)
        // Cache persistence is best-effort; read/queue failures are not disguised as empty data.
        void offlineCatalog.set(storeId!, r.items, owner).catch(() => undefined)
        return r.items
      } catch (err) {
        assertCurrentIdentity(owner)
        // Authorization/validation/server failures must never fall back to stale sensitive data.
        if (!(err instanceof ApiError) || err.code !== "NETWORK") throw err
        const snap = await offlineCatalog.get(storeId!, owner)
        assertCurrentIdentity(owner)
        if (snap) return snap.products
        throw err
      }
    },
  })
  return q
}

/** Cached products minus units already sold in queued offline sales (prevents overselling offline). */
export function useOfflineStockDeltas(storeId: string | undefined) {
  const { items } = useOfflineQueue()
  return storeId ? stockDeltas(items, storeId) : new Map<string, number>()
}
