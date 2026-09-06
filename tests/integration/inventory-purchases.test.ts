import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { productService } from "@/services/product.service"
import { inventoryService } from "@/services/inventory.service"
import { purchaseService } from "@/services/purchase.service"
import { expenseService } from "@/services/expense.service"
import { analyticsService } from "@/services/analytics.service"
import { businessService } from "@/services/business.service"
import { resolveDateRange } from "@/utils/dates"
import { createBusiness, createProduct, openRegister, type TestBusiness } from "../setup/factory"

let b: TestBusiness
beforeAll(async () => {
  b = await createBusiness("Inv")
  await openRegister(b, 1000)
})

describe("products", () => {
  it("enforces barcode and SKU uniqueness per store (not globally)", async () => {
    const base = { name: "Coke", purchasePrice: 4, sellingPrice: 6, taxRate: 0.2, stockQuantity: 10, minimumStock: 2, unit: "u", categoryId: b.categoryId }
    const p1 = await productService.create(b.ctx(), { ...base, sku: "COKE-1", barcode: "111111111" })
    expect(p1.stockQuantity).toBe(10)
    expect(await prisma.inventoryMovement.count({ where: { productId: p1.id, type: "ADJUSTMENT" } })).toBe(1) // initial stock is a movement
    await expect(productService.create(b.ctx(), { ...base, sku: "COKE-2", barcode: "111111111" })).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(productService.create(b.ctx(), { ...base, sku: "COKE-1", barcode: "222222222" })).rejects.toMatchObject({ code: "CONFLICT" })
    // same barcode allowed in another store of the business
    await expect(productService.create(b.ctx(), { ...base, sku: "COKE-1", barcode: "111111111", storeId: b.store2Id })).resolves.toBeTruthy()
    // and in another business
    const other = await createBusiness("Other")
    await expect(productService.create(other.ctx(), { ...base, categoryId: other.categoryId, sku: "COKE-1", barcode: "111111111" })).resolves.toBeTruthy()
  })

  it("price change is audited and bulk price update works", async () => {
    const p = await createProduct(b, { sellingPrice: 10 })
    await productService.update(b.ctx(), p.id, { sellingPrice: 12 })
    expect(await prisma.auditLog.findFirst({ where: { entityId: p.id, action: "PRODUCT_PRICE_CHANGED" } })).not.toBeNull()
    await productService.bulkPrice(b.ctx(), { productIds: [p.id], mode: "PERCENT", field: "sellingPrice", value: 50 })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).sellingPrice).toBe(18)
    await productService.bulkPrice(b.ctx(), { productIds: [p.id], mode: "AMOUNT", field: "sellingPrice", value: -3 })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).sellingPrice).toBe(15)
  })

  it("soft-deletes products and hides them from lists", async () => {
    const p = await createProduct(b)
    await productService.remove(b.ctx(), p.id)
    await expect(productService.getById(b.ctx(), p.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).deletedAt).not.toBeNull()
  })

  it("CSV import creates and updates with per-row validation", async () => {
    const csv = ["name,sku,barcode,category,brand,purchasePrice,sellingPrice,taxRate,stockQuantity,minimumStock,unit", "Lait,LAIT-1,300000000001,Frais,Centrale,7,9,0.2,30,10,pièce", "Bad,,,,,x,9,0.2,1,1,u", "Pain,PAIN-1,,Boulangerie,,1.5,2.5,0.2,20,5,pièce"].join("\n")
    const r = await productService.importCsv(b.ctx(), undefined, csv)
    expect(r.created).toBe(2)
    expect(r.errors).toHaveLength(1)
    const r2 = await productService.importCsv(b.ctx(), undefined, csv.replace("7,9,0.2,30", "7,10,0.2,25"))
    expect(r2.updated).toBe(2)
    const lait = await prisma.product.findFirst({ where: { sku: "LAIT-1", storeId: b.storeId } })
    expect(lait?.sellingPrice).toBe(10)
    expect(lait?.stockQuantity).toBe(25)
    const exported = await productService.exportCsv(b.ctx())
    expect(exported).toContain("LAIT-1")
  })
})

describe("inventory", () => {
  it("adjustment / damage / loss / return create movements with correct deltas", async () => {
    const p = await createProduct(b, { stockQuantity: 50 })
    await inventoryService.adjust(b.ctx(), { productId: p.id, type: "ADJUSTMENT", quantity: 45, reason: "count" })
    await inventoryService.adjust(b.ctx(), { productId: p.id, type: "DAMAGE", quantity: 5, reason: "broken" })
    await inventoryService.adjust(b.ctx(), { productId: p.id, type: "RETURN", quantity: 2, reason: "customer" })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQuantity).toBe(42)
    const movements = await prisma.inventoryMovement.findMany({ where: { productId: p.id }, orderBy: { createdAt: "asc" } })
    expect(movements.map((m) => m.quantity)).toEqual([-5, -5, 2])
    expect(movements.map((m) => m.newQuantity)).toEqual([45, 40, 42])
    await expect(inventoryService.adjust(b.ctx(), { productId: p.id, type: "LOSS", quantity: 1000, reason: "x" })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" })
  })

  it("transfer moves stock between stores and creates the destination product by SKU", async () => {
    const p = await createProduct(b, { sku: "TRF-1", stockQuantity: 20 })
    const r = await inventoryService.transfer(b.ctx(), { productId: p.id, fromStoreId: b.storeId, toStoreId: b.store2Id, quantity: 8 })
    expect(r.out.next).toBe(12)
    expect(r.in.next).toBe(8)
    const dest = await prisma.product.findFirst({ where: { sku: "TRF-1", storeId: b.store2Id } })
    expect(dest?.stockQuantity).toBe(8)
    await expect(inventoryService.transfer(b.ctx(), { productId: p.id, fromStoreId: b.storeId, toStoreId: b.store2Id, quantity: 100 })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" })
  })

  it("low-stock notifications are emitted and de-duplicated", async () => {
    const p = await createProduct(b, { stockQuantity: 10, minimumStock: 8 })
    await inventoryService.adjust(b.ctx(), { productId: p.id, type: "LOSS", quantity: 3, reason: "x" })
    await inventoryService.adjust(b.ctx(), { productId: p.id, type: "LOSS", quantity: 1, reason: "y" })
    const n = await prisma.notification.findMany({ where: { businessId: b.businessId, type: "LOW_STOCK", data: { contains: p.id } } })
    expect(n.length).toBe(1) // one per recipient (only owner is management here), not one per adjustment
  })
})

describe("purchases", () => {
  it("full lifecycle: draft → ordered → partially received → received, with weighted cost and supplier balance", async () => {
    const p = await createProduct(b, { purchasePrice: 10, stockQuantity: 10 })
    const po = await purchaseService.create(b.ctx(), { supplierId: b.supplierId, items: [{ productId: p.id, quantity: 10, unitPrice: 12, taxRate: 0.2 }], status: "DRAFT" })
    expect(po.total).toBe(144)
    await expect(purchaseService.receive(b.ctx(), po.id, { items: [{ purchaseOrderItemId: po.items[0].id, receivedQuantity: 5 }], updatePurchasePrice: true })).rejects.toMatchObject({ code: "INVALID_STATE" })
    await purchaseService.update(b.ctx(), po.id, { status: "ORDERED" })
    const partial = await purchaseService.receive(b.ctx(), po.id, { items: [{ purchaseOrderItemId: po.items[0].id, receivedQuantity: 4 }], updatePurchasePrice: true })
    expect(partial.status).toBe("PARTIALLY_RECEIVED")
    let prod = await prisma.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(prod.stockQuantity).toBe(14)
    expect(prod.costPrice).toBe(10.57) // (10×10 + 4×12) / 14
    expect(prod.purchasePrice).toBe(12)
    await expect(purchaseService.receive(b.ctx(), po.id, { items: [{ purchaseOrderItemId: po.items[0].id, receivedQuantity: 7 }], updatePurchasePrice: false })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    const full = await purchaseService.receive(b.ctx(), po.id, { items: [{ purchaseOrderItemId: po.items[0].id, receivedQuantity: 6 }], updatePurchasePrice: false })
    expect(full.status).toBe("RECEIVED")
    expect(full.deliveredAt).not.toBeNull()
    prod = await prisma.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(prod.stockQuantity).toBe(20)
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: b.supplierId } })
    expect(supplier.currentBalance).toBe(144)
    await purchaseService.paySupplier(b.ctx(), b.supplierId, { amount: 100, method: "BANK_TRANSFER" })
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: b.supplierId } })).currentBalance).toBe(44)
    await expect(purchaseService.paySupplier(b.ctx(), b.supplierId, { amount: 100, method: "BANK_TRANSFER" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    expect(await prisma.notification.count({ where: { businessId: b.businessId, type: "PURCHASE_RECEIVED" } })).toBeGreaterThan(0)
  })

  it("cannot cancel a partially received order or delete a supplier with open orders", async () => {
    const p = await createProduct(b)
    const po = await purchaseService.create(b.ctx(), { supplierId: b.supplierId, items: [{ productId: p.id, quantity: 2, unitPrice: 1, taxRate: 0 }], status: "ORDERED" })
    await expect(purchaseService.deleteSupplier(b.ctx(), b.supplierId)).rejects.toMatchObject({ code: "CONFLICT" })
    await purchaseService.receive(b.ctx(), po.id, { items: [{ purchaseOrderItemId: po.items[0].id, receivedQuantity: 1 }], updatePurchasePrice: false })
    await expect(purchaseService.update(b.ctx(), po.id, { status: "CANCELLED" })).rejects.toMatchObject({ code: "INVALID_STATE" })
  })
})

describe("expenses & analytics", () => {
  it("cash expense debits the register; large expense notifies; P&L math holds", async () => {
    const e = await expenseService.create(b.ctx(), { amount: 6000, categoryId: b.expenseCategoryId, paymentMethod: "CASH", description: "Loyer" })
    const reg = await prisma.cashRegister.findFirstOrThrow({ where: { businessId: b.businessId, storeId: b.storeId, status: "OPEN" } })
    const tx = await prisma.cashRegisterTransaction.findFirst({ where: { cashRegisterId: reg.id, amount: -6000 } })
    expect(tx).not.toBeNull()
    expect(await prisma.notification.count({ where: { businessId: b.businessId, type: "LARGE_EXPENSE" } })).toBeGreaterThan(0)
    const pnl = await analyticsService.profitAndLoss(b.ctx(), resolveDateRange("today"))
    expect(pnl.netProfit).toBe(Math.round((pnl.grossProfit - pnl.totalExpenses) * 100) / 100)
    expect(pnl.totalExpenses).toBeGreaterThanOrEqual(6000)
    await expenseService.remove(b.ctx(), e.id)
    const reversal = await prisma.cashRegisterTransaction.findFirst({ where: { cashRegisterId: reg.id, amount: 6000, type: "DEPOSIT" } })
    expect(reversal).not.toBeNull()
  })

  it("reorder recommendations flag out-of-stock and low products", async () => {
    await createProduct(b, { stockQuantity: 0, minimumStock: 5 })
    const r = await analyticsService.reorderRecommendations(b.ctx())
    expect(r.items.some((i) => i.urgency === "OUT")).toBe(true)
    expect(r.disclaimer).toBeTruthy()
  })
})

describe("users & roles", () => {
  it("admin cannot create an owner; business keeps at least one owner; self-deactivation blocked", async () => {
    const adminCtx = b.ctx("ADMIN")
    await expect(businessService.createUser(adminCtx, { email: `own-${Date.now()}@t.ma`, password: "Test12345", firstName: "A", lastName: "B", role: "OWNER", storeIds: [b.storeId] })).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(businessService.updateUser(b.ctx(), b.ownerId, { role: "CASHIER" })).rejects.toMatchObject({ code: "INVALID_STATE" })
    await expect(businessService.updateUser(b.ctx(), b.ownerId, { status: "INACTIVE" })).rejects.toMatchObject({ code: "INVALID_STATE" })
    await expect(businessService.deleteUser(b.ctx(), b.ownerId)).rejects.toMatchObject({ code: "INVALID_STATE" })
    const u = await businessService.createUser(b.ctx(), { email: `emp-${Date.now()}@t.ma`, password: "Test12345", firstName: "E", lastName: "M", role: "MANAGER", storeIds: [b.storeId] })
    expect((u as { passwordHash?: string }).passwordHash).toBeUndefined() // never leaks hashes
    await businessService.updateUser(b.ctx(), u.id, { role: "CASHIER" })
    expect(await prisma.auditLog.findFirst({ where: { entityId: u.id, action: "USER_ROLE_CHANGED" } })).not.toBeNull()
    await businessService.deleteUser(b.ctx(), u.id)
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect(deleted.deletedAt).not.toBeNull()
    expect(deleted.email).toContain("deleted+")
  })
})
