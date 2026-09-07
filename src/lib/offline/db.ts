/**
 * Minimal IndexedDB wrapper (no dependency) for the POS offline layer.
 * Stores:
 *  - apiCache   : successful GET responses (key = identity + URL)
 *  - catalog    : full product catalogue (key = identity + storeId)
 *  - saleQueue  : pending sales (key = identity + idempotencyKey); legacy entries are retained
 *  - stockDelta : local stock adjustments from queued sales (key = `${storeId}:${productId}`)
 */
const DB_NAME = "retailos-pos"
const DB_VERSION = 1
export const STORES = ["apiCache", "catalog", "saleQueue", "stockDelta"] as const
export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

export function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined"
}

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s)
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error("IndexedDB blocked"))
  })
  // A transient failure must be retryable instead of poisoning all future operations.
  dbPromise = dbPromise.catch((error) => { dbPromise = null; throw error })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        t.oncomplete = () => resolve((req as IDBRequest<T> | undefined)?.result as T)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"))
      })
  )
}

export const idb = {
  get: <T>(store: StoreName, key: string) => tx<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
  set: <T>(store: StoreName, key: string, value: T) => tx<IDBValidKey>(store, "readwrite", (s) => s.put(value, key)),
  delete: (store: StoreName, key: string) => tx<undefined>(store, "readwrite", (s) => s.delete(key)),
  clear: (store: StoreName) => tx<undefined>(store, "readwrite", (s) => s.clear()),
  getAll: <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  keys: (store: StoreName) => tx<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()),
}
