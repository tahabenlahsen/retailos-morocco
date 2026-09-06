"use client"

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react"
import { useMe } from "@/hooks/use-me"

/**
 * Active store selection (persisted in localStorage). `null` = all accessible stores
 * for aggregate views; POS/register always operate on a specific store.
 *
 * Implemented as a tiny external store consumed through useSyncExternalStore so the
 * value is read synchronously on the client without a post-mount effect (server snapshot = null).
 */
interface StoreContextValue {
  storeId: string | null
  setStoreId: (id: string | null) => void
  /** Store id to use for operations that require a concrete store. */
  effectiveStoreId: string | undefined
  stores: { id: string; name: string; city: string; isActive: boolean }[]
}

const KEY = "retailos.storeId"
const listeners = new Set<() => void>()
function read(): string | null {
  try {
    const v = localStorage.getItem(KEY)
    return v && v !== "all" ? v : null
  } catch {
    return null
  }
}
function write(id: string | null) {
  try {
    localStorage.setItem(KEY, id ?? "all")
  } catch {}
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  window.addEventListener("storage", l)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", l)
  }
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { me } = useMe()
  const saved = useSyncExternalStore(subscribe, read, () => null)
  // Ignore a persisted store the user no longer has access to
  const storeId = saved && me && !me.stores.some((s) => s.id === saved) ? null : saved
  const setStoreId = useCallback((id: string | null) => write(id), [])
  const value = useMemo<StoreContextValue>(
    () => ({ storeId, setStoreId, effectiveStoreId: storeId ?? me?.stores[0]?.id, stores: me?.stores ?? [] }),
    [storeId, setStoreId, me]
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}
