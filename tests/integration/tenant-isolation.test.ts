/**
 * CRITICAL: Business A must never be able to read or mutate Business B's data,
 * even when it knows the exact IDs. Every service is exercised with a foreign context.
 */
import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { salesService } from "@/services/sales.service"
import { productService } from "@/services/product.service"
import { inventoryService } from "@/services/inventory.service"
import { purchaseService } from "@/services/purchase.service"
import { customerService } from "@/services/customer.service"
import { expenseService } from "@/services/expense.service"
import { registerService } from "@/services/register.service"
import { analyticsService } from "@/services/analytics.service"
import { businessService } from "@/services/business.service"
import { notificationService } from "@/services/notification.service"
import { resolveDateRange } from "@/utils/dates"
import { createBusiness, createProduct, openRegister, type TestBusiness } from "../setup/factory"

let A: TestBusiness
let B: TestBusiness
let productA: Awaited<ReturnType<typeof createProduct>>
let saleA: { id: string; items: { id: string }[] }
let poA: { id: string; items: { id: string }[] }
let expenseA: { id: string }
let registerA: { id: string }

beforeAll(async () => {
  A = await createBusiness("Alpha")
  B = await createBusiness("Beta")
  registerA = await openRegister(A, 100)
  productA = await createProduct(A, { sellingPrice: 10, stockQuantity: 50 })
  const s = await salesService.create(A.ctx(), { items: [{ productId: productA.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 10 }], idempotencyKey: `iso-${Date.now()}` })
  saleA = s.sale
  poA = await purchaseService.create(A.ctx(), { supplierId: A.supplierId, items: [{ productId: productA.id, quantity: 5, unitPrice: 6, taxRate: 0.2 }], status: "ORDERED" })
  expenseA = await expenseService.create(A.ctx(), { amount: 100, categoryId: A.expenseCategoryId, paymentMethod: "CASH" })
})

const notFoundOrForbidden = { code: expect.stringMatching(/NOT_FOUND|FORBIDDEN|VALIDATION_ERROR/) }

describe("tenant isolation: reads", () => {
  it("product", async () => {
    await expect(productService.getById(B.ctx(), productA.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    const list = await productService.list(B.ctx(), { page: 1, pageSize: 100, sortBy: "name", sortDir: "asc" })
    expect(list.items.find((p) => p.id === productA.id)).toBeUndefined()
    await expect(productService.list(B.ctx(), { storeId: A.storeId, page: 1, pageSize: 10, sortBy: "name", sortDir: "asc" })).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(productService.lookup(B.ctx(), A.storeId, productA.barcode!)).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
  it("sale", async () => {
    await expect(salesService.getById(B.ctx(), saleA.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    const list = await salesService.list(B.ctx(), { page: 1, pageSize: 100 })
    expect(list.total).toBe(0)
  })
  it("purchase order & supplier", async () => {
    await expect(purchaseService.getById(B.ctx(), poA.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(purchaseService.getSupplier(B.ctx(), A.supplierId)).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
  it("customer, expense, register", async () => {
    await expect(customerService.getById(B.ctx(), A.customerId)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(expenseService.getById(B.ctx(), expenseA.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(registerService.getById(B.ctx(), registerA.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
  it("analytics scoped to own stores", async () => {
    const range = resolveDateRange("today")
    const dashB = await analyticsService.dashboard(B.ctx(), range)
    expect(dashB.kpis.revenue.value).toBe(0)
    expect(dashB.kpis.transactions.value).toBe(0)
    await expect(analyticsService.dashboard(B.ctx(), range, A.storeId)).rejects.toMatchObject({ code: "FORBIDDEN" })
    const dashA = await analyticsService.dashboard(A.ctx(), range)
    expect(dashA.kpis.transactions.value).toBeGreaterThan(0)
  })
  it("inventory movements & summary", async () => {
    const mov = await inventoryService.listMovements(B.ctx(), { page: 1, pageSize: 100 })
    expect(mov.items.find((m) => m.productId === productA.id)).toBeUndefined()
    await expect(inventoryService.summary(B.ctx(), A.storeId)).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
  it("audit logs and notifications", async () => {
    const logs = await businessService.auditLogs(B.ctx(), { page: 1, pageSize: 200 })
    expect(logs.items.every((l) => l.businessId === B.businessId)).toBe(true)
    await notificationService.notify({ businessId: A.businessId, type: "SYSTEM", title: "A only", message: "secret" })
    const n = await notificationService.list(B.ctx(), { page: 1, pageSize: 50 })
    expect(n.items.find((x) => x.title === "A only")).toBeUndefined()
  })
})

describe("tenant isolation: writes", () => {
  it("cannot sell, refund or cancel foreign data", async () => {
    await expect(salesService.create(B.ctx(), { storeId: A.storeId, items: [{ productId: productA.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CASH", amount: 10 }], idempotencyKey: `iso-x-${Date.now()}` })).rejects.toMatchObject({ code: "FORBIDDEN" })
    // foreign product id in own store → validation (product not in store)
    await expect(salesService.create(B.ctx(), { items: [{ productId: productA.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CARD", amount: 10 }], idempotencyKey: `iso-y-${Date.now()}` })).rejects.toMatchObject(notFoundOrForbidden)
    await expect(salesService.refund(B.ctx(), saleA.id, { items: [{ saleItemId: saleA.items[0].id, quantity: 1 }], reason: "hack", paymentMethod: "CASH", restock: true })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(salesService.cancel(B.ctx(), saleA.id, "hack")).rejects.toMatchObject({ code: "NOT_FOUND" })
    // idempotency key of A cannot be replayed by B
    const keyA = (await prisma.sale.findUniqueOrThrow({ where: { id: saleA.id } })).idempotencyKey!
    await expect(salesService.create(B.ctx(), { items: [], discountAmount: 0, payments: [], idempotencyKey: keyA } as never)).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
  it("cannot modify, delete or adjust foreign products", async () => {
    await expect(productService.update(B.ctx(), productA.id, { sellingPrice: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(productService.remove(B.ctx(), productA.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(inventoryService.adjust(B.ctx(), { productId: productA.id, type: "ADJUSTMENT", quantity: 0, reason: "hack" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(productService.bulkPrice(B.ctx(), { productIds: [productA.id], mode: "SET", field: "sellingPrice", value: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(productService.create(B.ctx(), { name: "x", sku: "x-1", purchasePrice: 1, sellingPrice: 2, taxRate: 0.2, stockQuantity: 0, minimumStock: 0, unit: "u", categoryId: A.categoryId })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productA.id } })).sellingPrice).toBe(10)
  })
  it("cannot receive/cancel foreign purchase orders or pay foreign suppliers", async () => {
    await expect(purchaseService.receive(B.ctx(), poA.id, { items: [{ purchaseOrderItemId: poA.items[0].id, receivedQuantity: 1 }], updatePurchasePrice: false })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(purchaseService.update(B.ctx(), poA.id, { status: "CANCELLED" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(purchaseService.create(B.ctx(), { supplierId: A.supplierId, items: [{ productId: productA.id, quantity: 1, unitPrice: 1, taxRate: 0.2 }], status: "DRAFT" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(purchaseService.paySupplier(B.ctx(), A.supplierId, { amount: 1, method: "CARD" })).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
  it("cannot touch foreign customers, expenses, registers, users or stores", async () => {
    await expect(customerService.update(B.ctx(), A.customerId, { name: "hack" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(expenseService.remove(B.ctx(), expenseA.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(expenseService.create(B.ctx(), { amount: 5, categoryId: A.expenseCategoryId, paymentMethod: "CARD" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(registerService.close(B.ctx(), registerA.id, { actualBalance: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(registerService.addTransaction(B.ctx(), registerA.id, { type: "WITHDRAWAL", amount: 50, reason: "hack" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(businessService.updateUser(B.ctx(), A.cashierId, { role: "OWNER" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(businessService.deleteUser(B.ctx(), A.cashierId)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(businessService.updateStore(B.ctx(), A.storeId, { name: "hack" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(businessService.createUser(B.ctx(), { email: `x-${Date.now()}@t.ma`, password: "Test12345", firstName: "X", lastName: "Y", role: "CASHIER", storeIds: [A.storeId] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(inventoryService.transfer(B.ctx(), { productId: productA.id, fromStoreId: A.storeId, toStoreId: B.storeId, quantity: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})

describe("store-level access within a business", () => {
  it("cashier assigned to store A cannot operate on store B", async () => {
    const cashierCtx = A.ctx("CASHIER", A.cashierId, [A.storeId])
    const pB = await createProduct(A, { storeId: A.store2Id, stockQuantity: 5 })
    await expect(productService.list(cashierCtx, { storeId: A.store2Id, page: 1, pageSize: 10, sortBy: "name", sortDir: "asc" })).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(productService.getById(cashierCtx, pB.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(salesService.create(cashierCtx, { storeId: A.store2Id, items: [{ productId: pB.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ method: "CARD", amount: 15 }], idempotencyKey: `st-${Date.now()}` })).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
  it("cashier only sees their own sales in history", async () => {
    const list = await salesService.list(A.ctx("CASHIER", A.cashierId, [A.storeId]), { page: 1, pageSize: 100 })
    expect(list.items.every((s) => s.userId === A.cashierId)).toBe(true)
  })
})
