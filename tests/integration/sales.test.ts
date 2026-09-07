import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { salesService } from "@/services/sales.service"
import { registerService } from "@/services/register.service"
import { AppError } from "@/lib/errors"
import { createBusiness, createProduct, openRegister, type TestBusiness } from "../setup/factory"

let b: TestBusiness
beforeAll(async () => {
  b = await createBusiness("Sales")
  await openRegister(b, 500)
})

const key = () => `k-${Math.random().toString(36).slice(2)}`

describe("sales: atomic creation", () => {
  it("creates sale, items, payments, movements and register transaction in one go", async () => {
    const p = await createProduct(b, { sellingPrice: 10, purchasePrice: 6, stockQuantity: 20, taxRate: 0.2 })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 3, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 30 }], idempotencyKey: key() })
    expect(sale.total).toBe(30)
    expect(sale.subtotal).toBe(25)
    expect(sale.taxAmount).toBe(5)
    expect(sale.profit).toBe(7) // 25 HT − 3×6 cost
    expect(sale.items).toHaveLength(1)
    expect(sale.payments).toHaveLength(1)
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(after.stockQuantity).toBe(17)
    const mov = await prisma.inventoryMovement.findFirst({ where: { referenceId: sale.id, type: "SALE" } })
    expect(mov).toMatchObject({ quantity: -3, previousQuantity: 20, newQuantity: 17 })
    const tx = await prisma.cashRegisterTransaction.findFirst({ where: { businessId: b.businessId, reason: `Sale ${sale.saleNumber}` } })
    expect(tx?.amount).toBe(30)
    const audit = await prisma.auditLog.findFirst({ where: { entityId: sale.id, action: "SALE_CREATED" } })
    expect(audit).not.toBeNull()
  })

  it("supports split payments and merges duplicate lines", async () => {
    const p = await createProduct(b, { sellingPrice: 100, stockQuantity: 10 })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 1, discount: 0 }, { productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 120 }, { method: "CARD", amount: 80, reference: "TPE" }], idempotencyKey: key() })
    expect(sale.items).toHaveLength(1)
    expect(sale.items[0].quantity).toBe(2)
    expect(sale.payments.map((x) => x.method).sort()).toEqual(["CARD", "CASH"])
  })

  it("is idempotent on the same key", async () => {
    const p = await createProduct(b, { sellingPrice: 5, stockQuantity: 10 })
    const k = key()
    const input = { items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH" as const, amount: 5 }], idempotencyKey: k }
    const a = await salesService.create(b.ctx(), input)
    const d = await salesService.create(b.ctx(), input)
    expect(d.duplicate).toBe(true)
    expect(d.sale.id).toBe(a.sale.id)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(9)
  })

  it("returns the same sale for simultaneous retries of one checkout", async () => {
    const p = await createProduct(b, { sellingPrice: 5, stockQuantity: 10 })
    const input = { items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH" as const, amount: 5 }], idempotencyKey: key() }
    const results = await Promise.all([salesService.create(b.ctx(), input), salesService.create(b.ctx(), input)])
    expect(results[0].sale.id).toBe(results[1].sale.id)
    expect(results.filter((result) => result.duplicate)).toHaveLength(1)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(9)
  })

  it("binds offline replay and idempotent responses to their original user and store", async () => {
    const p = await createProduct(b, { sellingPrice: 5, stockQuantity: 10 })
    const input = { storeId: b.storeId, offlineOwner: { businessId: b.businessId, userId: b.ownerId }, items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CARD" as const, amount: 5 }], idempotencyKey: key() }
    await expect(salesService.create(b.ctx("CASHIER", b.cashierId), input)).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(await prisma.sale.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(0)
    const result = await salesService.create(b.ctx(), input)
    await expect(salesService.create(b.ctx("CASHIER", b.cashierId), { ...input, offlineOwner: undefined })).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(salesService.create(b.ctx(), { ...input, storeId: b.store2Id })).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect((await salesService.create(b.ctx(), input)).sale.id).toBe(result.sale.id)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(9)
  })

  it("rolls back everything when stock is insufficient (second line fails)", async () => {
    const ok = await createProduct(b, { sellingPrice: 10, stockQuantity: 10 })
    const scarce = await createProduct(b, { sellingPrice: 10, stockQuantity: 1 })
    const before = await prisma.sale.count({ where: { businessId: b.businessId } })
    await expect(
      salesService.create(b.ctx(), { items: [{ productId: ok.id, quantity: 2, discount: 0 }, { productId: scarce.id, quantity: 5, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 70 }], idempotencyKey: key() })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" })
    expect(await prisma.sale.count({ where: { businessId: b.businessId } })).toBe(before)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ok.id } })).stockQuantity).toBe(10) // untouched
    expect(await prisma.inventoryMovement.count({ where: { productId: ok.id, type: "SALE" } })).toBe(0)
  })

  it("rejects payment mismatch", async () => {
    const p = await createProduct(b, { sellingPrice: 10, stockQuantity: 10 })
    await expect(salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 9 }], idempotencyKey: key() })).rejects.toMatchObject({ code: "PAYMENT_MISMATCH" })
  })

  it("requires an open register for cash in that store", async () => {
    const p = await createProduct(b, { sellingPrice: 10, stockQuantity: 10, storeId: b.store2Id })
    await expect(salesService.create(b.ctx(), { storeId: b.store2Id, items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 10 }], idempotencyKey: key() })).rejects.toMatchObject({ code: "REGISTER_CLOSED" })
    // card works without register
    const { sale } = await salesService.create(b.ctx(), { storeId: b.store2Id, items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CARD", amount: 10 }], idempotencyKey: key() })
    expect(sale.cashRegisterId).toBeNull()
  })

  it("keeps offline cash sales on their original register and preserves the transaction time", async () => {
    const offline = await createBusiness("Offline register")
    const reg = await openRegister(offline, 0)
    const p = await createProduct(offline, { sellingPrice: 10 })
    const soldAt = new Date(Date.now() - 60_000)
    const input = { storeId: offline.storeId, registerId: reg.id, soldAt, items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH" as const, amount: 10 }], idempotencyKey: key() }
    const { sale } = await salesService.create(offline.ctx(), input)
    expect(sale.cashRegisterId).toBe(reg.id)
    expect(sale.createdAt).toEqual(soldAt)
    const transaction = await prisma.cashRegisterTransaction.findFirstOrThrow({ where: { cashRegisterId: reg.id, type: "SALE" } })
    expect(transaction.createdAt).toEqual(soldAt)
    await registerService.close(offline.ctx(), reg.id, { actualBalance: 10 })
    const next = await openRegister(offline, 0)
    await expect(salesService.create(offline.ctx(), { ...input, idempotencyKey: key() })).rejects.toMatchObject({ code: "REGISTER_CLOSED" })
    expect(await prisma.cashRegisterTransaction.count({ where: { cashRegisterId: next.id } })).toBe(0)
    expect((await salesService.create(offline.ctx(), input)).duplicate).toBe(true)
  })

  it("cashier cannot override price; owner can", async () => {
    const p = await createProduct(b, { sellingPrice: 10, stockQuantity: 10 })
    await expect(salesService.create(b.ctx("CASHIER", b.cashierId, [b.storeId]), { items: [{ productId: p.id, quantity: 1, unitPrice: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 1 }], idempotencyKey: key() })).rejects.toMatchObject({ code: "FORBIDDEN" })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 1, unitPrice: 8, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 8 }], idempotencyKey: key() })
    expect(sale.total).toBe(8)
  })

  it("order discount reduces total and updates customer stats", async () => {
    const p = await createProduct(b, { sellingPrice: 50, stockQuantity: 10 })
    const before = await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 2, discount: 0 }], discountAmount: 10, customerId: b.customerId, payments: [{ method: "CASH", amount: 90 }], idempotencyKey: key() })
    expect(sale.total).toBe(90)
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })
    expect(after.totalSpending).toBe(before.totalSpending + 90)
    expect(after.loyaltyPoints).toBe(before.loyaltyPoints + 9)
  })
})

describe("sales: refunds & cancellation", () => {
  it("partial refund restocks, records negative register tx, and flips status", async () => {
    const p = await createProduct(b, { sellingPrice: 20, stockQuantity: 10 })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 3, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 60 }], idempotencyKey: key() })
    const refund = await salesService.refund(b.ctx(), sale.id, { items: [{ saleItemId: sale.items[0].id, quantity: 1 }], reason: "damaged", paymentMethod: "CASH", restock: true })
    expect(refund.amount).toBe(20)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(8)
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("PARTIALLY_REFUNDED")
    const tx = await prisma.cashRegisterTransaction.findFirst({ where: { businessId: b.businessId, reason: `Refund ${refund.refundNumber}` } })
    expect(tx?.amount).toBe(-20)
    // refund the rest → REFUNDED
    await salesService.refund(b.ctx(), sale.id, { items: [{ saleItemId: sale.items[0].id, quantity: 2 }], reason: "rest", paymentMethod: "CASH", restock: false })
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("REFUNDED")
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(8) // not restocked
    // over-refund rejected
    await expect(salesService.refund(b.ctx(), sale.id, { items: [{ saleItemId: sale.items[0].id, quantity: 1 }], reason: "x", paymentMethod: "CASH", restock: true })).rejects.toBeInstanceOf(AppError)
  })

  it("two simultaneous refunds of the same line never exceed what was sold", async () => {
    const p = await createProduct(b, { sellingPrice: 10, stockQuantity: 10 })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 2, discount: 0 }], discountAmount: 0, payments: [{ method: "CARD", amount: 20 }], idempotencyKey: key() })
    const refund = () => salesService.refund(b.ctx(), sale.id, { items: [{ saleItemId: sale.items[0].id, quantity: 2 }], reason: "race", paymentMethod: "CARD", restock: true })
    const outcomes = await Promise.allSettled([refund(), refund()])
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1)
    expect(await prisma.refund.count({ where: { saleId: sale.id } })).toBe(1)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(10)
  })

  it("a repeated refund request (same refundId) is returned, not duplicated", async () => {
    const p = await createProduct(b, { sellingPrice: 10, stockQuantity: 10 })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 3, discount: 0 }], discountAmount: 0, payments: [{ method: "CARD", amount: 30 }], idempotencyKey: key() })
    const refundId = crypto.randomUUID()
    const input = { refundId, items: [{ saleItemId: sale.items[0].id, quantity: 1 }], reason: "dup", paymentMethod: "CARD" as const, restock: true }
    const [a, c] = await Promise.all([salesService.refund(b.ctx(), sale.id, input), salesService.refund(b.ctx(), sale.id, input)])
    expect(a.id).toBe(refundId)
    expect(c.id).toBe(refundId)
    expect(await prisma.refund.count({ where: { saleId: sale.id } })).toBe(1)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(8)
  })

  it("closing the register blocks concurrent cash movements from landing on the closed session", async () => {
    const b2 = await createBusiness("Close race")
    const reg = await openRegister(b2, 100)
    const p = await createProduct(b2, { sellingPrice: 10, stockQuantity: 50 })
    const sell = () => salesService.create(b2.ctx(), { items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 10 }], idempotencyKey: key() })
    await sell()
    const outcomes = await Promise.allSettled([registerService.close(b2.ctx(), reg.id, { actualBalance: 110 }), sell(), sell(), sell()])
    const closed = await prisma.cashRegister.findUniqueOrThrow({ where: { id: reg.id }, include: { transactions: true } })
    const cashOnRegister = closed.transactions.filter((t) => t.type === "SALE").reduce((a, t) => a + t.amount, 0)
    if (outcomes[0].status === "fulfilled") {
      expect(closed.status).toBe("CLOSED")
      expect(closed.expectedBalance).toBe(100 + cashOnRegister)
    } else {
      expect(["CONFLICT", "VALIDATION_ERROR"]).toContain((outcomes[0].reason as { code: string }).code)
    }
    const salesAfter = outcomes.slice(1).filter((o) => o.status === "fulfilled").length
    expect(cashOnRegister).toBe(10 * (1 + salesAfter))
  })

  it("cancel restores stock and reverses cash while register is open", async () => {
    const p = await createProduct(b, { sellingPrice: 10, stockQuantity: 10 })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId: p.id, quantity: 2, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 20 }], idempotencyKey: key() })
    const cancelled = await salesService.cancel(b.ctx(), sale.id, "customer changed mind")
    expect(cancelled.status).toBe("CANCELLED")
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(10)
    expect((await prisma.payment.findFirst({ where: { saleId: sale.id } }))?.status).toBe("REFUNDED")
  })
})

describe("cash register", () => {
  it("expected cash = opening + cash sales − refunds + deposits − withdrawals; discrepancy needs a reason", async () => {
    const b2 = await createBusiness("Reg")
    const reg = await registerService.open(b2.ctx(), { name: "R", openingBalance: 100 })
    const p = await createProduct(b2, { sellingPrice: 25, stockQuantity: 10 })
    await salesService.create(b2.ctx(), { items: [{ productId: p.id, quantity: 2, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 50 }], idempotencyKey: key() })
    await registerService.addTransaction(b2.ctx(), reg.id, { type: "DEPOSIT", amount: 30, reason: "change float" })
    await registerService.addTransaction(b2.ctx(), reg.id, { type: "WITHDRAWAL", amount: 20, reason: "supplier" })
    const { summary } = await registerService.computeExpected(reg.id)
    expect(summary.expected).toBe(160)
    await expect(registerService.addTransaction(b2.ctx(), reg.id, { type: "WITHDRAWAL", amount: 1000, reason: "too much" })).rejects.toMatchObject({ code: "INVALID_STATE" })
    await expect(registerService.close(b2.ctx(), reg.id, { actualBalance: 150 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    const closed = await registerService.close(b2.ctx(), reg.id, { actualBalance: 150, differenceReason: "change error" })
    expect(closed.difference).toBe(-10)
    expect(closed.status).toBe("CLOSED")
    await expect(registerService.open(b2.ctx(), { name: "R2", openingBalance: 0 })).resolves.toBeTruthy()
    await expect(registerService.open(b2.ctx(), { name: "R3", openingBalance: 0 })).rejects.toMatchObject({ code: "REGISTER_ALREADY_OPEN" })
  })
})
