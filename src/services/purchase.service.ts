import type { Prisma } from "@prisma/client"
import { prisma, icontains } from "@/lib/prisma"
import { conflict, forbidden, invalidState, notFound, validation } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"
import { resolveStoreId } from "@/lib/api"
import { nextPurchaseNumber, withUniqueRetry } from "@/lib/sequence"
import { round2, sum } from "@/utils/money"
import { applyStockChange } from "./inventory.service"
import { notificationService } from "./notification.service"
import type { PaymentMethod } from "@/utils/validation"

interface ItemInput {
  productId: string
  quantity: number
  unitPrice: number
  taxRate: number
}

const poInclude = {
  supplier: { select: { id: true, name: true, phone: true, email: true } },
  store: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, unit: true, stockQuantity: true } } } },
} satisfies Prisma.PurchaseOrderInclude

function computeItems(items: ItemInput[]) {
  const lines = items.map((i) => {
    // Purchase prices are tax-exclusive (HT) as on supplier invoices
    const subtotal = round2(i.quantity * i.unitPrice)
    const taxAmount = round2(subtotal * i.taxRate)
    return { ...i, subtotal, taxAmount, total: round2(subtotal + taxAmount) }
  })
  return { lines, subtotal: sum(lines.map((l) => l.subtotal)), taxAmount: sum(lines.map((l) => l.taxAmount)), total: sum(lines.map((l) => l.total)) }
}

export const purchaseService = {
  async list(ctx: TenantContext, q: { storeId?: string; supplierId?: string; status?: string; page: number; pageSize: number }) {
    if (q.storeId && !ctx.storeIds.includes(q.storeId)) throw forbidden("You do not have access to this store")
    const where: Prisma.PurchaseOrderWhereInput = { businessId: ctx.businessId, storeId: q.storeId ?? { in: ctx.storeIds }, supplierId: q.supplierId, status: q.status, deletedAt: null }
    const [total, items] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({ where, include: { supplier: { select: { name: true } }, store: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ])
    return { items, total, page: q.page, pageSize: q.pageSize }
  },

  async getById(ctx: TenantContext, id: string) {
    const po = await prisma.purchaseOrder.findFirst({ where: { id, businessId: ctx.businessId, storeId: { in: ctx.storeIds }, deletedAt: null }, include: poInclude })
    if (!po) throw notFound("Purchase order")
    return po
  },

  async create(ctx: TenantContext, input: { storeId?: string; supplierId: string; items: ItemInput[]; expectedDelivery?: Date | null; notes?: string; status: "DRAFT" | "ORDERED" }) {
    const storeId = resolveStoreId(ctx, input.storeId)
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, businessId: ctx.businessId, deletedAt: null } })
    if (!supplier) throw notFound("Supplier")
    const productIds = [...new Set(input.items.map((i) => i.productId))]
    const products = await prisma.product.count({ where: { id: { in: productIds }, businessId: ctx.businessId, storeId, deletedAt: null } })
    if (products !== productIds.length) throw validation("One or more products do not belong to this store")
    const totals = computeItems(input.items)
    return withUniqueRetry(() =>
      prisma.$transaction(async (tx) => {
        const orderNumber = await nextPurchaseNumber(tx, ctx.businessId)
        const po = await tx.purchaseOrder.create({
          data: {
            orderNumber,
            supplierId: input.supplierId,
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            total: totals.total,
            status: input.status,
            expectedDelivery: input.expectedDelivery ?? null,
            notes: input.notes,
            businessId: ctx.businessId,
            storeId,
            userId: ctx.userId,
            items: { create: totals.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, subtotal: l.subtotal, taxAmount: l.taxAmount, total: l.total })) },
          },
          include: poInclude,
        })
        await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "PURCHASE_CREATED", entityType: "PurchaseOrder", entityId: po.id, metadata: { orderNumber, total: totals.total, supplier: supplier.name }, ipAddress: ctx.ip }, tx)
        return po
      })
    )
  },

  async update(ctx: TenantContext, id: string, input: { supplierId?: string; items?: ItemInput[]; expectedDelivery?: Date | null; notes?: string; status?: "DRAFT" | "ORDERED" | "CANCELLED" }) {
    const po = await this.getById(ctx, id)
    if (po.status === "RECEIVED" || po.status === "CANCELLED") throw invalidState(`Cannot modify a ${po.status.toLowerCase()} order`)
    if (input.items && po.status === "PARTIALLY_RECEIVED") throw invalidState("Cannot change items after partial receipt")
    if (input.status === "CANCELLED" && po.status === "PARTIALLY_RECEIVED") throw invalidState("Cannot cancel a partially received order")
    if (input.status === "DRAFT" && po.status !== "DRAFT") throw invalidState("Cannot revert an ordered PO to draft")
    if (input.supplierId) {
      const s = await prisma.supplier.findFirst({ where: { id: input.supplierId, businessId: ctx.businessId, deletedAt: null } })
      if (!s) throw notFound("Supplier")
    }
    return prisma.$transaction(async (tx) => {
      let totals: ReturnType<typeof computeItems> | undefined
      if (input.items) {
        const productIds = [...new Set(input.items.map((i) => i.productId))]
        const count = await tx.product.count({ where: { id: { in: productIds }, businessId: ctx.businessId, storeId: po.storeId, deletedAt: null } })
        if (count !== productIds.length) throw validation("One or more products do not belong to this store")
        totals = computeItems(input.items)
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } })
        await tx.purchaseOrderItem.createMany({ data: totals.lines.map((l) => ({ purchaseOrderId: id, productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, subtotal: l.subtotal, taxAmount: l.taxAmount, total: l.total })) })
      }
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { supplierId: input.supplierId, expectedDelivery: input.expectedDelivery, notes: input.notes, status: input.status, ...(totals ? { subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total } : {}) },
        include: poInclude,
      })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: input.status === "CANCELLED" ? "PURCHASE_CANCELLED" : "PURCHASE_UPDATED", entityType: "PurchaseOrder", entityId: id, metadata: { fields: Object.keys(input) }, ipAddress: ctx.ip }, tx)
      return updated
    })
  },

  /**
   * Receive goods (fully or partially). For each received line: stock in, update
   * weighted-average cost, optionally update purchase price. Supplier balance
   * increases by the value received (paid separately via supplier payments).
   */
  async receive(ctx: TenantContext, id: string, input: { items: { purchaseOrderItemId: string; receivedQuantity: number }[]; updatePurchasePrice: boolean }) {
    const po = await this.getById(ctx, id)
    if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") throw invalidState("Only ordered purchase orders can be received")
    const itemMap = new Map(po.items.map((i) => [i.id, i]))
    for (const r of input.items) {
      const it = itemMap.get(r.purchaseOrderItemId)
      if (!it) throw validation("Invalid purchase order item")
      if (it.receivedQuantity + r.receivedQuantity > it.quantity) throw validation(`Received quantity exceeds ordered quantity for ${it.product.name}`)
    }
    const result = await prisma.$transaction(async (tx) => {
      let receivedValue = 0
      for (const r of input.items) {
        const it = itemMap.get(r.purchaseOrderItemId)!
        const product = await tx.product.findUniqueOrThrow({ where: { id: it.productId } })
        // Weighted average cost (HT)
        const currentQty = product.stockQuantity
        const currentCost = product.costPrice ?? product.purchasePrice
        const newCost = currentQty + r.receivedQuantity > 0 ? round2((currentQty * currentCost + r.receivedQuantity * it.unitPrice) / (currentQty + r.receivedQuantity)) : it.unitPrice
        await applyStockChange(tx, ctx, { productId: it.productId, delta: r.receivedQuantity, type: "PURCHASE", reason: `PO ${po.orderNumber}`, referenceId: po.id, referenceType: "PurchaseOrder" })
        await tx.product.update({ where: { id: it.productId }, data: { costPrice: newCost, ...(input.updatePurchasePrice ? { purchasePrice: it.unitPrice } : {}), supplierId: product.supplierId ?? po.supplierId } })
        await tx.purchaseOrderItem.update({ where: { id: it.id }, data: { receivedQuantity: { increment: r.receivedQuantity } } })
        receivedValue += round2(r.receivedQuantity * it.unitPrice * (1 + it.taxRate))
      }
      const refreshed = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } })
      const complete = refreshed.every((i) => i.receivedQuantity >= i.quantity)
      const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED", deliveredAt: complete ? new Date() : undefined }, include: poInclude })
      await tx.supplier.update({ where: { id: po.supplierId }, data: { currentBalance: { increment: round2(receivedValue) } } })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "PURCHASE_RECEIVED", entityType: "PurchaseOrder", entityId: id, metadata: { orderNumber: po.orderNumber, complete, receivedValue: round2(receivedValue) }, ipAddress: ctx.ip }, tx)
      return updated
    })
    if (result.status === "RECEIVED") await notificationService.purchaseReceived(ctx.businessId, { id: po.id, orderNumber: po.orderNumber, supplierName: po.supplier.name })
    return result
  },

  // ---------- Suppliers ----------
  async listSuppliers(ctx: TenantContext, q: { search?: string; page: number; pageSize: number }) {
    const where: Prisma.SupplierWhereInput = { businessId: ctx.businessId, deletedAt: null, OR: q.search ? [{ name: icontains(q.search) }, { phone: icontains(q.search) }, { email: icontains(q.search) }] : undefined }
    const [total, items] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({ where, orderBy: { name: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { _count: { select: { purchaseOrders: { where: { deletedAt: null } }, products: { where: { deletedAt: null } } } } } }),
    ])
    return { items, total, page: q.page, pageSize: q.pageSize }
  },

  async getSupplier(ctx: TenantContext, id: string) {
    const s = await prisma.supplier.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      include: {
        products: { where: { deletedAt: null, storeId: { in: ctx.storeIds } }, select: { id: true, name: true, sku: true, stockQuantity: true, minimumStock: true, purchasePrice: true } },
        purchaseOrders: { where: { deletedAt: null, storeId: { in: ctx.storeIds } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, orderNumber: true, status: true, total: true, createdAt: true, expectedDelivery: true, deliveredAt: true } },
      },
    })
    if (!s) throw notFound("Supplier")
    // Performance metrics
    const orders = s.purchaseOrders
    const received = orders.filter((o) => o.status === "RECEIVED" && o.deliveredAt)
    const deliveryDays = received.map((o) => (o.deliveredAt!.getTime() - o.createdAt.getTime()) / 86_400_000)
    const onTime = received.filter((o) => !o.expectedDelivery || o.deliveredAt! <= o.expectedDelivery).length
    const performance = {
      orderCount: orders.length,
      totalPurchases: sum(orders.filter((o) => o.status !== "CANCELLED").map((o) => o.total)),
      averageDeliveryDays: deliveryDays.length ? round2(deliveryDays.reduce((a, b) => a + b, 0) / deliveryDays.length) : null,
      onTimeRate: received.length ? round2((onTime / received.length) * 100) : null,
      cancelledCount: orders.filter((o) => o.status === "CANCELLED").length,
    }
    return { ...s, performance }
  },

  async createSupplier(ctx: TenantContext, input: Prisma.SupplierUncheckedCreateInput) {
    const dup = await prisma.supplier.findFirst({ where: { businessId: ctx.businessId, name: input.name, deletedAt: null } })
    if (dup) throw conflict("A supplier with this name already exists")
    const s = await prisma.supplier.create({ data: { ...input, businessId: ctx.businessId } })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "SUPPLIER_CREATED", entityType: "Supplier", entityId: s.id, metadata: { name: s.name }, ipAddress: ctx.ip })
    return s
  },

  async updateSupplier(ctx: TenantContext, id: string, input: Prisma.SupplierUncheckedUpdateInput) {
    const s = await prisma.supplier.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!s) throw notFound("Supplier")
    const updated = await prisma.supplier.update({ where: { id }, data: input })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "SUPPLIER_UPDATED", entityType: "Supplier", entityId: id, metadata: { fields: Object.keys(input) }, ipAddress: ctx.ip })
    return updated
  },

  async deleteSupplier(ctx: TenantContext, id: string) {
    const s = await prisma.supplier.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!s) throw notFound("Supplier")
    const openPOs = await prisma.purchaseOrder.count({ where: { supplierId: id, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } } })
    if (openPOs) throw conflict("Supplier has open purchase orders")
    await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "SUPPLIER_DELETED", entityType: "Supplier", entityId: id, metadata: { name: s.name }, ipAddress: ctx.ip })
  },

  /** Record a payment to a supplier (reduces outstanding balance). Cash payments hit the open register. */
  async paySupplier(ctx: TenantContext, id: string, input: { amount: number; method: PaymentMethod; reference?: string; notes?: string; storeId?: string }) {
    const s = await prisma.supplier.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!s) throw notFound("Supplier")
    if (input.amount > s.currentBalance + 0.009) throw validation(`Payment exceeds outstanding balance (${s.currentBalance.toFixed(2)})`)
    const storeId = resolveStoreId(ctx, input.storeId)
    const register = input.method === "CASH" ? await prisma.cashRegister.findFirst({ where: { businessId: ctx.businessId, storeId, status: "OPEN" } }) : null
    if (input.method === "CASH" && !register) throw invalidState("Open a cash register to pay suppliers in cash")
    return prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({ where: { id }, data: { currentBalance: { decrement: input.amount } } })
      if (register) {
        await tx.cashRegisterTransaction.create({ data: { type: "WITHDRAWAL", amount: -input.amount, reason: `Supplier payment: ${s.name}${input.reference ? ` (${input.reference})` : ""}`, cashRegisterId: register.id, businessId: ctx.businessId, storeId, userId: ctx.userId } })
      }
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "SUPPLIER_UPDATED", entityType: "Supplier", entityId: id, metadata: { payment: input.amount, method: input.method, reference: input.reference }, ipAddress: ctx.ip }, tx)
      return updated
    })
  },
}
