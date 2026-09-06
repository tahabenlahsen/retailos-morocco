import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AppError, forbidden, notFound, validation } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"
import type { MovementType } from "@/utils/validation"
import { notificationService } from "./notification.service"

type Tx = Prisma.TransactionClient

export interface StockChangeInput {
  productId: string
  /** Signed delta: negative for outbound (sale, damage), positive for inbound. */
  delta: number
  type: MovementType
  reason?: string
  referenceId?: string
  referenceType?: string
}

/**
 * Applies a stock change inside a transaction and records the InventoryMovement.
 * This is THE ONLY function allowed to change `Product.stockQuantity`.
 *
 * Throws INSUFFICIENT_STOCK when the resulting quantity would be negative.
 */
export async function applyStockChange(tx: Tx, ctx: { businessId: string; userId: string }, input: StockChangeInput) {
  // Lock the row semantics: SQLite serializes writes; on Postgres, `UPDATE ... RETURNING` with the
  // conditional `stockQuantity >= -delta` guard below prevents overselling under concurrency.
  const product = await tx.product.findFirst({
    where: { id: input.productId, businessId: ctx.businessId, deletedAt: null },
    select: { id: true, name: true, stockQuantity: true, storeId: true, minimumStock: true },
  })
  if (!product) throw notFound("Product")

  const previous = product.stockQuantity
  const next = previous + input.delta
  if (next < 0) {
    throw new AppError("INSUFFICIENT_STOCK", `Insufficient stock for "${product.name}" (available: ${previous})`, {
      productId: product.id,
      available: previous,
      requested: -input.delta,
    })
  }

  // Guarded update: only apply if stock hasn't changed since we read it.
  const updated = await tx.product.updateMany({
    where: { id: product.id, stockQuantity: previous },
    data: { stockQuantity: next },
  })
  if (updated.count !== 1) {
    // Concurrent modification — surface as a retryable conflict.
    throw new AppError("CONFLICT", "Stock changed concurrently, please retry")
  }

  await tx.inventoryMovement.create({
    data: {
      productId: product.id,
      quantity: input.delta,
      previousQuantity: previous,
      newQuantity: next,
      type: input.type,
      reason: input.reason,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
      businessId: ctx.businessId,
      storeId: product.storeId,
      userId: ctx.userId,
    },
  })

  return { productId: product.id, name: product.name, previous, next, minimumStock: product.minimumStock, storeId: product.storeId }
}

export const inventoryService = {
  /**
   * Manual stock adjustment (count correction, damage, loss, customer return without sale).
   */
  async adjust(ctx: TenantContext, input: { productId: string; type: "ADJUSTMENT" | "DAMAGE" | "LOSS" | "RETURN"; quantity: number; reason: string }) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, businessId: ctx.businessId, deletedAt: null },
      select: { stockQuantity: true, storeId: true },
    })
    if (!product) throw notFound("Product")
    if (!ctx.storeIds.includes(product.storeId)) throw forbidden("You do not have access to this store")

    let delta: number
    if (input.type === "ADJUSTMENT") {
      if (input.quantity < 0) throw validation("New quantity cannot be negative")
      delta = input.quantity - product.stockQuantity
    } else if (input.type === "RETURN") {
      if (input.quantity <= 0) throw validation("Quantity must be positive")
      delta = input.quantity
    } else {
      if (input.quantity <= 0) throw validation("Quantity must be positive")
      delta = -input.quantity
    }
    if (delta === 0) throw validation("No change in stock quantity")

    const result = await prisma.$transaction(async (tx) => {
      const r = await applyStockChange(tx, ctx, { productId: input.productId, delta, type: input.type, reason: input.reason })
      await writeAuditLog(
        {
          businessId: ctx.businessId,
          userId: ctx.userId,
          action: "STOCK_ADJUSTED",
          entityType: "Product",
          entityId: input.productId,
          metadata: { type: input.type, previous: r.previous, next: r.next, reason: input.reason },
          ipAddress: ctx.ip,
        },
        tx
      )
      return r
    })
    await notificationService.checkStockLevel(ctx.businessId, result.productId)
    return result
  },

  /**
   * Transfer stock between two stores of the same business. Products are per-store,
   * so the destination product is matched by SKU (created if missing).
   */
  async transfer(ctx: TenantContext, input: { productId: string; fromStoreId: string; toStoreId: string; quantity: number; reason?: string }) {
    if (!ctx.storeIds.includes(input.fromStoreId) || !ctx.storeIds.includes(input.toStoreId)) {
      throw forbidden("You do not have access to one of the stores")
    }
    const [source, destStore] = await Promise.all([
      prisma.product.findFirst({ where: { id: input.productId, businessId: ctx.businessId, storeId: input.fromStoreId, deletedAt: null } }),
      prisma.store.findFirst({ where: { id: input.toStoreId, businessId: ctx.businessId, deletedAt: null } }),
    ])
    if (!source) throw notFound("Source product")
    if (!destStore) throw notFound("Destination store")

    const result = await prisma.$transaction(async (tx) => {
      let dest = await tx.product.findFirst({
        where: { businessId: ctx.businessId, storeId: input.toStoreId, sku: source.sku, deletedAt: null },
      })
      if (!dest) {
        dest = await tx.product.create({
          data: {
            name: source.name, sku: source.sku, barcode: source.barcode, description: source.description, image: source.image,
            purchasePrice: source.purchasePrice, costPrice: source.costPrice, sellingPrice: source.sellingPrice, taxRate: source.taxRate,
            minimumStock: source.minimumStock, maximumStock: source.maximumStock, unit: source.unit, isActive: source.isActive,
            businessId: source.businessId, categoryId: source.categoryId, brandId: source.brandId, supplierId: source.supplierId,
            storeId: input.toStoreId, stockQuantity: 0,
          },
        })
      }
      const reason = input.reason ?? `Transfer ${input.fromStoreId} -> ${input.toStoreId}`
      const out = await applyStockChange(tx, ctx, {
        productId: source.id,
        delta: -input.quantity,
        type: "TRANSFER",
        reason,
        referenceId: dest.id,
        referenceType: "Product",
      })
      const inn = await applyStockChange(tx, ctx, {
        productId: dest.id,
        delta: input.quantity,
        type: "TRANSFER",
        reason,
        referenceId: source.id,
        referenceType: "Product",
      })
      await writeAuditLog(
        {
          businessId: ctx.businessId,
          userId: ctx.userId,
          action: "STOCK_TRANSFERRED",
          entityType: "Product",
          entityId: source.id,
          metadata: { toProductId: dest.id, fromStoreId: input.fromStoreId, toStoreId: input.toStoreId, quantity: input.quantity },
          ipAddress: ctx.ip,
        },
        tx
      )
      return { out, in: inn }
    })
    await notificationService.checkStockLevel(ctx.businessId, source.id)
    return result
  },

  async listMovements(
    ctx: TenantContext,
    q: { storeId?: string; productId?: string; type?: MovementType; from?: Date; to?: Date; page: number; pageSize: number }
  ) {
    const storeIds = q.storeId ? [q.storeId] : ctx.storeIds
    if (q.storeId && !ctx.storeIds.includes(q.storeId)) throw forbidden("You do not have access to this store")
    const where: Prisma.InventoryMovementWhereInput = {
      businessId: ctx.businessId,
      storeId: { in: storeIds },
      productId: q.productId,
      type: q.type,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    }
    const [total, items] = await Promise.all([
      prisma.inventoryMovement.count({ where }),
      prisma.inventoryMovement.findMany({
        where,
        include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ])
    // Attach user names in one query
    const userIds = [...new Set(items.map((i) => i.userId).filter(Boolean))] as string[]
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : []
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))
    return {
      items: items.map((m) => ({ ...m, userName: m.userId ? userMap.get(m.userId) ?? null : null })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    }
  },

  /** Inventory valuation & low-stock summary for a set of stores. */
  async summary(ctx: TenantContext, storeId?: string) {
    const storeIds = storeId ? [storeId] : ctx.storeIds
    if (storeId && !ctx.storeIds.includes(storeId)) throw forbidden("You do not have access to this store")
    const products = await prisma.product.findMany({
      where: { businessId: ctx.businessId, storeId: { in: storeIds }, deletedAt: null, isActive: true },
      select: { id: true, name: true, sku: true, stockQuantity: true, minimumStock: true, purchasePrice: true, costPrice: true, sellingPrice: true, unit: true, storeId: true },
    })
    let costValue = 0
    let retailValue = 0
    const lowStock: typeof products = []
    const outOfStock: typeof products = []
    for (const p of products) {
      costValue += p.stockQuantity * (p.costPrice ?? p.purchasePrice)
      retailValue += p.stockQuantity * p.sellingPrice
      if (p.stockQuantity <= 0) outOfStock.push(p)
      else if (p.stockQuantity <= p.minimumStock) lowStock.push(p)
    }
    return {
      productCount: products.length,
      totalUnits: products.reduce((a, p) => a + p.stockQuantity, 0),
      costValue: Math.round(costValue * 100) / 100,
      retailValue: Math.round(retailValue * 100) / 100,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      lowStock: lowStock.sort((a, b) => a.stockQuantity - b.stockQuantity).slice(0, 50),
      outOfStock: outOfStock.slice(0, 50),
    }
  },
}
