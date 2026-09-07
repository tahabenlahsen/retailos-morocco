"use client"

import { idb, idbAvailable } from "./db"
import { getOfflineIdentity, isCurrentIdentity, scopedKey, type OfflineIdentity } from "./identity"
import type { PosProduct } from "@/components/pos/cart-store"

// Exact endpoint boundaries: never cache authentication endpoints or arbitrary prefix matches.
const CACHEABLE = [/^\/api\/me$/, /^\/api\/(stores|categories|customers|products|business)(\/|\?|$)/, /^\/api\/register(\?|$)/, /^\/api\/pos\/held-carts(\?|$)/]
export function isCacheable(url: string): boolean { return CACHEABLE.some((re) => re.test(url)) }
interface CachedEntry<T = unknown> { data: T; at: number }

export const apiCache = {
  async get<T>(url: string, owner: OfflineIdentity | null = getOfflineIdentity()): Promise<CachedEntry<T> | undefined> {
    if (!idbAvailable() || !isCurrentIdentity(owner)) return undefined
    const hit = await idb.get<CachedEntry<T>>("apiCache", scopedKey(owner, url))
    return isCurrentIdentity(owner) ? hit : undefined
  },
  async set<T>(url: string, data: T, owner: OfflineIdentity | null = getOfflineIdentity()) {
    if (!idbAvailable() || !isCurrentIdentity(owner)) return
    await idb.set("apiCache", scopedKey(owner, url), { data, at: Date.now() } satisfies CachedEntry<T>)
  },
  /** Clear only this verified identity's read cache; pending sales are never removed on logout. */
  async clear() {
    const owner = getOfflineIdentity()
    if (!idbAvailable() || !owner) return
    const prefix = scopedKey(owner, "").slice(0, -3)
    const keys = await idb.keys("apiCache")
    for (const key of keys) {
      if (!isCurrentIdentity(owner)) return
      if (typeof key === "string" && key.startsWith(prefix)) await idb.delete("apiCache", key)
    }
  },
}
export const SERVED_FROM_CACHE_EVENT = "retailos:served-from-cache"
export interface CatalogSnapshot { storeId: string; at: number; products: PosProduct[] }
export const offlineCatalog = {
  async get(storeId: string, owner: OfflineIdentity | null = getOfflineIdentity()): Promise<CatalogSnapshot | undefined> {
    if (!idbAvailable() || !isCurrentIdentity(owner)) return undefined
    const hit = await idb.get<CatalogSnapshot>("catalog", scopedKey(owner, storeId))
    return isCurrentIdentity(owner) ? hit : undefined
  },
  async set(storeId: string, products: PosProduct[], owner: OfflineIdentity | null = getOfflineIdentity()) {
    if (!idbAvailable() || !isCurrentIdentity(owner)) return
    await idb.set("catalog", scopedKey(owner, storeId), { storeId, at: Date.now(), products } satisfies CatalogSnapshot)
  },
}
