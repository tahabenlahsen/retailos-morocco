import { describe, it, expect } from "vitest"
import { applyStockDeltas, decideAfterError, lookupOffline, provisionalRef, stockDeltas, toSalePayload, type QueuedSale } from "@/lib/offline/queue-logic"
import { ApiError } from "@/lib/api-client"

const sale = (over: Partial<QueuedSale> = {}): QueuedSale => ({
  owner: { businessId: "b1", userId: "u1" },
  key: "3f9a2c1e-0000-4000-8000-00000000abcd",
  ref: "OFF-0ABCD0",
  storeId: "s1",
  storeName: "Store",
  soldAt: "2026-09-07T10:00:00.000Z",
  customer: null,
  lines: [{ productId: "p1", name: "Coca", sku: "C1", unit: "pièce", quantity: 2, unitPrice: 6.5, discount: 0, total: 13 }],
  payments: [{ method: "CASH", amount: 13 }],
  totals: { subtotal: 10.83, tax: 2.17, discount: 0, total: 13 },
  status: "pending",
  attempts: 0,
  ...over,
})

describe("offline sale queue logic", () => {
  it("builds the server payload with the same idempotency key and the original sale time", () => {
    const p = toSalePayload(sale({ notes: "" }))
    expect(p).toMatchObject({ storeId: "s1", idempotencyKey: "3f9a2c1e-0000-4000-8000-00000000abcd", soldAt: "2026-09-07T10:00:00.000Z", discountAmount: 0, customerId: null })
    expect(p.items).toEqual([{ productId: "p1", quantity: 2, unitPrice: 6.5, discount: 0 }])
    expect(p.notes).toBeUndefined()
    expect(p.offlineOwner).toEqual({ businessId: "b1", userId: "u1" })
  })

  it("derives a stable 6-char provisional reference from the key", () => {
    expect(provisionalRef("3f9a2c1e-0000-4000-8000-00000000abcd")).toBe("OFF-00ABCD")
    expect(provisionalRef("x")).toBe("OFF-00000X")
  })

  it("stops on network errors, stops on 401, fails on business errors", () => {
    expect(decideAfterError(new ApiError("NETWORK", "Network error", 0))).toEqual({ action: "stop", reason: "offline" })
    expect(decideAfterError(new ApiError("UNAUTHORIZED", "expired", 401))).toEqual({ action: "stop", reason: "unauthorized" })
    expect(decideAfterError(new ApiError("INSUFFICIENT_STOCK", "Only 1 left", 409))).toEqual({ action: "fail", code: "INSUFFICIENT_STOCK", message: "Only 1 left" })
    expect(decideAfterError(new ApiError("REGISTER_CLOSED", "Open a register", 409)).action).toBe("fail")
    expect(decideAfterError("boom")).toMatchObject({ action: "fail", code: "INTERNAL_ERROR" })
  })

  it("aggregates stock deltas per store and applies them to cached products", () => {
    const queue = [sale(), sale({ key: "k2", lines: [{ productId: "p1", name: "Coca", sku: "C1", unit: "pièce", quantity: 3, unitPrice: 6.5, discount: 0, total: 19.5 }] }), sale({ key: "k3", storeId: "other" })]
    const deltas = stockDeltas(queue, "s1")
    expect(deltas.get("p1")).toBe(5)
    const products = applyStockDeltas([{ id: "p1", stockQuantity: 20 }, { id: "p2", stockQuantity: 4 }], deltas)
    expect(products).toEqual([{ id: "p1", stockQuantity: 15 }, { id: "p2", stockQuantity: 4 }])
    expect(applyStockDeltas([{ id: "p1", stockQuantity: 20 }], new Map())).toEqual([{ id: "p1", stockQuantity: 20 }])
  })

  it("looks up products locally: exact barcode/SKU first, then name contains", () => {
    const catalog = [
      { name: "Coca-Cola 1.5L", sku: "COCA15", barcode: "5449000000996" },
      { name: "Coca-Cola 33cl", sku: "COCA33", barcode: "5449000000123" },
      { name: "Sidi Ali 1.5L", sku: "SIDI15", barcode: null },
    ]
    expect(lookupOffline(catalog, "5449000000996")).toEqual({ exact: true, items: [catalog[0]] })
    expect(lookupOffline(catalog, "coca33")).toEqual({ exact: true, items: [catalog[1]] })
    expect(lookupOffline(catalog, "coca").items).toHaveLength(2)
    expect(lookupOffline(catalog, "1.5l").items.map((p) => p.sku)).toEqual(["COCA15", "SIDI15"])
    expect(lookupOffline(catalog, "").items).toHaveLength(3)
    expect(lookupOffline(catalog, "zzz").items).toHaveLength(0)
  })
})
