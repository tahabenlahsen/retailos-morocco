/**
 * Pure, dependency-free logic for the offline sale queue (unit-tested; no IndexedDB here).
 */
import type { SalePaymentMethod } from "@/utils/validation"
import type { OfflineOwner } from "./identity"

export interface QueuedSaleLine {
  productId: string
  name: string
  sku: string
  unit: string
  quantity: number
  unitPrice: number
  discount: number
  total: number
}
export interface QueuedSalePayment {
  method: SalePaymentMethod
  amount: number
  reference?: string
}
export interface QueuedSale {
  /** Verified owner at checkout. Legacy ownerless records are quarantined, never auto-adopted. */
  owner: OfflineOwner
  /** Idempotency key: the server de-duplicates on it, so retries never create a second sale. */
  key: string
  /** Short human reference printed on the provisional receipt. */
  ref: string
  storeId: string
  registerId?: string
  storeName: string
  soldAt: string
  customer: { id: string; name: string } | null
  lines: QueuedSaleLine[]
  payments: QueuedSalePayment[]
  totals: { subtotal: number; tax: number; discount: number; total: number }
  notes?: string
  status: "pending" | "failed"
  attempts: number
  lastError?: { code: string; message: string }
}

/** Server payload for POST /api/sales built from a queued sale. */
export function toSalePayload(q: QueuedSale) {
  return {
    offlineOwner: { businessId: q.owner.businessId, userId: q.owner.userId },
    storeId: q.storeId,
    registerId: q.registerId,
    items: q.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount })),
    customerId: q.customer?.id ?? null,
    discountAmount: q.totals.discount,
    payments: q.payments,
    notes: q.notes || undefined,
    idempotencyKey: q.key,
    soldAt: q.soldAt,
  }
}

/** Provisional reference shown on offline receipts, e.g. "OFF-3F9A2C". */
export function provisionalRef(key: string): string {
  const compact = key.replace(/[^a-z0-9]/gi, "").toUpperCase()
  return `OFF-${compact.slice(-6).padStart(6, "0")}`
}

export type SyncDecision = { action: "stop"; reason: "offline" | "unauthorized" } | { action: "fail"; code: string; message: string }

/**
 * Decides what to do with a queued sale after a sync attempt threw `err`.
 *  - network errors → stop syncing (still offline), keep the sale pending
 *  - 401 → stop; the shell redirects to sign-in
 *  - any business/validation error → mark this sale failed and continue with the others
 */
export function decideAfterError(err: unknown): SyncDecision {
  const e = err as { code?: string; message?: string; status?: number } | undefined
  if (!e || typeof e !== "object") return { action: "fail", code: "INTERNAL_ERROR", message: String(err) }
  if (e.code === "NETWORK") return { action: "stop", reason: "offline" }
  if (e.code === "UNAUTHORIZED" || e.status === 401) return { action: "stop", reason: "unauthorized" }
  return { action: "fail", code: e.code ?? "INTERNAL_ERROR", message: e.message ?? "" }
}

/** Errors the cashier can fix locally and then retry (vs. ones that need a manager). */
export const RETRYABLE_CODES = new Set(["REGISTER_CLOSED", "INSUFFICIENT_STOCK", "RATE_LIMITED", "INTERNAL_ERROR", "CREDIT_LIMIT_EXCEEDED", "CREDIT_NOT_ALLOWED"])

/** Aggregates stock changes of queued sales: productId → units already sold offline. */
export function stockDeltas(queue: QueuedSale[], storeId: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const q of queue) {
    if (q.storeId !== storeId) continue
    for (const l of q.lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity)
  }
  return m
}

/** Applies offline stock deltas to cached products so the cashier does not oversell while offline. */
export function applyStockDeltas<T extends { id: string; stockQuantity: number }>(products: T[], deltas: Map<string, number>): T[] {
  if (!deltas.size) return products
  return products.map((p) => (deltas.has(p.id) ? { ...p, stockQuantity: p.stockQuantity - (deltas.get(p.id) ?? 0) } : p))
}

/** Local product lookup used when the network is unavailable (barcode/SKU exact first, then name). */
export function lookupOffline<T extends { name: string; sku: string; barcode: string | null }>(products: T[], term: string, limit = 24): { exact: boolean; items: T[] } {
  const q = term.trim().toLowerCase()
  if (!q) return { exact: false, items: products.slice(0, limit) }
  const exact = products.filter((p) => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q)
  if (exact.length) return { exact: true, items: exact }
  return { exact: false, items: products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q)).slice(0, limit) }
}
