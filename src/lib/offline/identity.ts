/**
 * Offline authority is memory-only and established by a successful, uncached /api/me response.
 * A running authenticated tab can continue through a network outage; a cold/offline tab cannot
 * recover authority from persisted data. Changing identity invalidates every outstanding operation.
 */
export interface OfflineOwner { businessId: string; userId: string }
export interface OfflineIdentity extends OfflineOwner { generation: number }
let generation = 0
let identity: OfflineIdentity | null = null
const listeners = new Set<() => void>()
export const IDENTITY_INVALIDATED_KEY = "retailos:identity-invalidated"

export function sameOwner(a: OfflineOwner | null | undefined, b: OfflineOwner | null | undefined): boolean {
  return !!a && !!b && a.businessId === b.businessId && a.userId === b.userId
}
export function scopedKey(owner: OfflineOwner, key: string): string {
  return JSON.stringify(["identity-v1", owner.businessId, owner.userId, key])
}
export function getOfflineIdentity(): OfflineIdentity | null { return identity }
export function getIdentityGeneration(): number { return generation }
export function isCurrentIdentity(value: OfflineIdentity | null): value is OfflineIdentity {
  return !!value && identity === value
}
export function requireOfflineIdentity(): OfflineIdentity {
  if (!identity) throw new Error("Offline access requires a verified session")
  return identity
}
export function assertCurrentIdentity(value: OfflineIdentity | null): asserts value is OfflineIdentity {
  if (!isCurrentIdentity(value)) throw new Error("Offline session changed or is not verified")
}
export function subscribeOfflineIdentity(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
/** Only call with the authenticated server's /api/me result, never cached data or local storage. */
export function verifyOfflineIdentity(data: unknown, requestGeneration: number): OfflineIdentity | null {
  if (requestGeneration !== generation) return null
  const me = data as { business?: { id?: unknown }; user?: { id?: unknown } } | null
  if (typeof me?.business?.id !== "string" || !me.business.id || typeof me?.user?.id !== "string" || !me.user.id) {
    clearOfflineIdentity()
    return null
  }
  const owner = { businessId: me.business.id, userId: me.user.id }
  if (!sameOwner(identity, owner)) {
    // Initial verification does not invalidate parallel bootstrap /api/me requests.
    // Logout already advances the generation; an actual owner switch advances it here.
    if (identity) ++generation
    identity = Object.freeze({ ...owner, generation })
    listeners.forEach((listener) => listener())
  }
  return identity
}
export function clearOfflineIdentity(broadcast = true): void {
  ++generation // Also fences a verification already in flight while signed out.
  identity = null
  listeners.forEach((listener) => listener())
  if (broadcast && typeof window !== "undefined") {
    try { localStorage.setItem(IDENTITY_INVALIDATED_KEY, `${Date.now()}:${generation}:${Math.random()}`) } catch { /* Storage may be disabled. */ }
  }
}
