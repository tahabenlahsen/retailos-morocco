import type { Prisma } from "@prisma/client"
import { prisma, icontains } from "@/lib/prisma"
import { AppError, conflict, forbidden, invalidState, notFound, validation } from "@/lib/errors"
import { lockOpenRegister } from "./register-lock"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"
import { resolveStoreId } from "@/lib/api"
import { nextRefundNumber, nextSaleNumber, withUniqueRetry } from "@/lib/sequence"
import { computeLine, round2, sum } from "@/utils/money"
import { hasPermission } from "@/lib/permissions"
import { applyStockChange } from "./inventory.service"
import { notificationService } from "./notification.service"
import type { SalePaymentMethod } from "@/utils/validation"

export interface SaleItemInput {
  productId: string
  quantity: number
  unitPrice?: number
  discount: number
}
export interface PaymentInput {
  amount: number
  method: SalePaymentMethod
  reference?: string
}
export interface CreateSaleInput {
  storeId?: string
  items: SaleItemInput[]
  customerId?: string | null
  discountAmount: number
  payments: PaymentInput[]
  notes?: string
  idempotencyKey: string
  offlineOwner?: { businessId: string; userId: string }
  registerId?: string
  /** Actual time of sale for offline-synced tickets (validated to the last 7 days by the schema). */
  soldAt?: Date
}

type Tx = Prisma.TransactionClient

/**
 * Applies `amount` of repayment to a customer's open CREDIT sale payments, oldest first.
 * Marks payments PAID once fully settled and flips the sale's paymentStatus accordingly.
 * Returns the amount actually allocated (≤ amount).
 */
export async function settleCustomerCredit(tx: Tx, businessId: string, customerId: string, amount: number, preferSaleId?: string): Promise<number> {
  const open = await tx.payment.findMany({
    where: { businessId, method: "CREDIT", status: "PENDING", sale: { customerId, status: { not: "CANCELLED" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true, settledAmount: true, saleId: true },
  })
  // A refund-to-credit cancels the debt of that particular sale first, then the oldest.
  if (preferSaleId) open.sort((a, b) => Number(b.saleId === preferSaleId) - Number(a.saleId === preferSaleId))
  let remaining = amount
  const touchedSales = new Set<string>()
  for (const p of open) {
    if (remaining <= 0.009) break
    const due = round2(p.amount - p.settledAmount)
    const apply = Math.min(due, remaining)
    const settled = round2(p.settledAmount + apply)
    // Guarded write: another transaction that settled this line first makes the count 0.
    const changed = await tx.payment.updateMany({ where: { id: p.id, settledAmount: p.settledAmount, status: "PENDING" }, data: { settledAmount: settled, status: settled >= p.amount - 0.009 ? "PAID" : "PENDING" } })
    if (changed.count !== 1) throw conflict("This credit line was modified by another operation; please retry")
    remaining = round2(remaining - apply)
    touchedSales.add(p.saleId)
  }
  for (const saleId of touchedSales) {
    const stillOpen = await tx.payment.count({ where: { saleId, status: "PENDING" } })
    await tx.sale.update({ where: { id: saleId }, data: { paymentStatus: stillOpen ? "PARTIALLY_PAID" : "PAID" } })
  }
  return round2(amount - remaining)
}

const saleInclude = {
  items: { include: { product: { select: { id: true, name: true, sku: true, unit: true, barcode: true } } } },
  payments: true,
  refunds: true,
  customer: { select: { id: true, name: true, phone: true } },
  store: { select: { id: true, name: true, address: true, phone: true } },
} satisfies Prisma.SaleInclude

export const salesService = {
  /**
   * Creates a sale atomically:
   *  1. validate products + stock  2. create sale  3. create items
   *  4. create payments  5. inventory movements + stock update
   *  6. register transaction  7. customer stats  8. audit log
   * Any failure rolls the whole thing back.
   */
  async create(ctx: TenantContext, input: CreateSaleInput) {
    if (input.offlineOwner && (input.offlineOwner.businessId !== ctx.businessId || input.offlineOwner.userId !== ctx.userId)) {
      throw new AppError("UNAUTHORIZED", "This sale belongs to another session")
    }
    const storeId = resolveStoreId(ctx, input.storeId)

    // Idempotency: return the existing sale for a repeated key.
    const existing = await prisma.sale.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: saleInclude })
    if (existing) {
      if (existing.businessId !== ctx.businessId || existing.storeId !== storeId || !ctx.storeIds.includes(existing.storeId) || existing.userId !== ctx.userId) throw forbidden()
      return { sale: existing, duplicate: true }
    }

    // Merge duplicate lines for the same product
    const merged = new Map<string, SaleItemInput>()
    for (const it of input.items) {
      const cur = merged.get(it.productId)
      if (cur) {
        cur.quantity += it.quantity
        cur.discount = round2(cur.discount + it.discount)
        if (it.unitPrice != null) cur.unitPrice = it.unitPrice
      } else merged.set(it.productId, { ...it })
    }
    const lines = [...merged.values()]

    const products = await prisma.product.findMany({
      where: { id: { in: lines.map((l) => l.productId) }, businessId: ctx.businessId, storeId, deletedAt: null, isActive: true },
    })
    if (products.length !== lines.length) throw validation("One or more products are unavailable in this store")
    const byId = new Map(products.map((p) => [p.id, p]))

    const canOverridePrice = hasPermission(ctx.role, "product.update")

    // Compute line totals
    const computed = lines.map((l) => {
      const p = byId.get(l.productId)!
      if (l.unitPrice != null && l.unitPrice !== p.sellingPrice && !canOverridePrice) {
        throw forbidden("You are not allowed to override prices")
      }
      const unitPrice = l.unitPrice ?? p.sellingPrice
      if (l.discount > unitPrice * l.quantity) throw validation(`Discount exceeds line total for ${p.name}`)
      const t = computeLine(l.quantity, unitPrice, l.discount, p.taxRate)
      const cost = round2((p.costPrice ?? p.purchasePrice) * l.quantity)
      return { product: p, quantity: l.quantity, unitPrice, discount: l.discount, taxRate: p.taxRate, ...t, profit: round2(t.subtotal - cost) }
    })

    const linesTotal = sum(computed.map((c) => c.total))
    if (input.discountAmount > linesTotal) throw validation("Order discount exceeds the total")
    const total = round2(linesTotal - input.discountAmount)
    // Distribute order-level discount proportionally to compute tax-exclusive subtotal
    const discountRatio = linesTotal > 0 ? total / linesTotal : 1
    const subtotal = round2(sum(computed.map((c) => c.subtotal)) * discountRatio)
    const taxAmount = round2(total - subtotal)
    const profit = round2(sum(computed.map((c) => c.profit)) - round2(input.discountAmount / (1 + (computed[0]?.taxRate ?? 0))))

    const paid = sum(input.payments.map((p) => p.amount))
    if (Math.abs(paid - total) > 0.009) {
      throw new AppError("PAYMENT_MISMATCH", `Payments (${paid.toFixed(2)}) do not match total (${total.toFixed(2)})`, { paid, total })
    }

    // Cash sales require an open register for this store
    const cashAmount = sum(input.payments.filter((p) => p.method === "CASH").map((p) => p.amount))
    const creditAmount = sum(input.payments.filter((p) => p.method === "CREDIT").map((p) => p.amount))
    if (input.soldAt && cashAmount > 0 && !input.registerId) throw invalidState("Offline cash sales must identify their original register")
    const register = await prisma.cashRegister.findFirst({ where: { id: input.registerId, businessId: ctx.businessId, storeId, status: "OPEN" } })
    if (cashAmount > 0 && !register) throw new AppError("REGISTER_CLOSED", "Open a cash register before accepting cash payments")

    if (creditAmount > 0 && !input.customerId) throw validation("A customer is required for credit sales")
    if (creditAmount > 0 && !hasPermission(ctx.role, "sale.credit")) throw forbidden("You are not allowed to sell on credit")
    if (input.customerId) {
      const c = await prisma.customer.findFirst({ where: { id: input.customerId, businessId: ctx.businessId, deletedAt: null } })
      if (!c) throw notFound("Customer")
      if (creditAmount > 0) {
        if (!c.isActive) throw invalidState("Customer account is inactive")
        if (c.creditLimit == null) throw new AppError("CREDIT_NOT_ALLOWED", "This customer has no credit limit; set one on the customer profile first", { customerId: c.id })
        const after = round2(c.outstandingBalance + creditAmount)
        if (after > c.creditLimit + 0.009) {
          throw new AppError("CREDIT_LIMIT_EXCEEDED", `Credit limit exceeded: balance ${c.outstandingBalance.toFixed(2)} + ${creditAmount.toFixed(2)} > limit ${c.creditLimit.toFixed(2)}`, {
            outstandingBalance: c.outstandingBalance,
            creditLimit: c.creditLimit,
            requested: creditAmount,
            available: round2(c.creditLimit - c.outstandingBalance),
          })
        }
      }
    }

    let duplicate = false
    const sale = await withUniqueRetry(() =>
      prisma.$transaction(async (tx) => {
        const repeated = await tx.sale.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: saleInclude })
        if (repeated) {
          if (repeated.businessId !== ctx.businessId || repeated.storeId !== storeId || repeated.userId !== ctx.userId) throw forbidden()
          duplicate = true
          return repeated
        }
        if (cashAmount > 0 && register) await lockOpenRegister(tx, { id: register.id, businessId: ctx.businessId, storeId })
        const saleNumber = await nextSaleNumber(tx, ctx.businessId)
        const created = await tx.sale.create({
          data: {
            saleNumber,
            idempotencyKey: input.idempotencyKey,
            subtotal,
            taxAmount,
            discountAmount: input.discountAmount,
            total,
            profit,
            status: "COMPLETED",
            paymentStatus: creditAmount > 0 ? (creditAmount >= total - 0.009 ? "PENDING" : "PARTIALLY_PAID") : "PAID",
            notes: input.notes,
            createdAt: input.soldAt ?? undefined,
            businessId: ctx.businessId,
            storeId,
            customerId: input.customerId ?? null,
            userId: ctx.userId,
            cashRegisterId: register?.id ?? null,
            items: {
              create: computed.map((c) => ({
                productId: c.product.id,
                quantity: c.quantity,
                unitPrice: c.unitPrice,
                taxRate: c.taxRate,
                discount: c.discount,
                subtotal: c.subtotal,
                taxAmount: c.taxAmount,
                total: c.total,
                profit: c.profit,
              })),
            },
            payments: {
              create: input.payments.map((p) => ({
                amount: p.amount,
                method: p.method,
                reference: p.reference,
                status: p.method === "CREDIT" ? "PENDING" : "PAID",
                createdAt: input.soldAt ?? undefined,
                businessId: ctx.businessId,
                storeId,
                userId: ctx.userId,
              })),
            },
          },
        })

        for (const c of computed) {
          await applyStockChange(tx, ctx, {
            productId: c.product.id,
            delta: -c.quantity,
            type: "SALE",
            reason: `Sale ${saleNumber}`,
            referenceId: created.id,
            referenceType: "Sale",
          })
        }

        if (register && cashAmount > 0) {
          await tx.cashRegisterTransaction.create({
            data: { type: "SALE", amount: cashAmount, reason: `Sale ${saleNumber}`, cashRegisterId: register.id, businessId: ctx.businessId, storeId, userId: ctx.userId, createdAt: input.soldAt },
          })
        }

        if (input.customerId) {
          await tx.customer.update({
            where: { id: input.customerId },
            data: { totalSpending: { increment: total }, loyaltyPoints: { increment: Math.floor(total / 10) }, outstandingBalance: creditAmount > 0 ? { increment: creditAmount } : undefined },
          })
          if (creditAmount > 0) {
            // Re-check the limit inside the transaction to prevent two concurrent credit sales overshooting it.
            const fresh = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, select: { outstandingBalance: true, creditLimit: true } })
            if (fresh.creditLimit != null && fresh.outstandingBalance > fresh.creditLimit + 0.009) throw new AppError("CREDIT_LIMIT_EXCEEDED", "Credit limit exceeded", { outstandingBalance: fresh.outstandingBalance, creditLimit: fresh.creditLimit })
          }
        }

        await writeAuditLog(
          { businessId: ctx.businessId, userId: ctx.userId, action: "SALE_CREATED", entityType: "Sale", entityId: created.id, metadata: { saleNumber, total, items: computed.length, credit: creditAmount || undefined, soldAt: input.soldAt?.toISOString() }, ipAddress: ctx.ip },
          tx
        )
        return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: saleInclude })
      })
    )

    // Post-commit side effects (non-critical)
    void Promise.all(computed.map((c) => notificationService.checkStockLevel(ctx.businessId, c.product.id))).catch(() => {})
    return { sale, duplicate }
  },

  async getById(ctx: TenantContext, id: string) {
    const sale = await prisma.sale.findFirst({ where: { id, businessId: ctx.businessId, storeId: { in: ctx.storeIds } }, include: saleInclude })
    if (!sale) throw notFound("Sale")
    const cashier = await prisma.user.findUnique({ where: { id: sale.userId }, select: { firstName: true, lastName: true } })
    return { ...sale, cashierName: cashier ? `${cashier.firstName} ${cashier.lastName}` : null }
  },

  async list(ctx: TenantContext, q: { storeId?: string; from?: Date; to?: Date; status?: string; customerId?: string; search?: string; page: number; pageSize: number }) {
    if (q.storeId && !ctx.storeIds.includes(q.storeId)) throw forbidden("You do not have access to this store")
    const where: Prisma.SaleWhereInput = {
      businessId: ctx.businessId,
      storeId: q.storeId ? q.storeId : { in: ctx.storeIds },
      status: q.status,
      customerId: q.customerId,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
      saleNumber: q.search ? icontains(q.search) : undefined,
    }
    // Cashiers only see their own sales unless they can view all registers
    if (!hasPermission(ctx.role, "register.viewAll")) where.userId = ctx.userId
    const [total, items] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include: { payments: { select: { method: true, amount: true } }, customer: { select: { name: true } }, _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ])
    return { items, total, page: q.page, pageSize: q.pageSize }
  },

  /**
   * Full or partial refund. Creates a Refund, restocks items (unless damaged),
   * records negative register transaction for cash refunds, updates sale status.
   */
  async refund(ctx: TenantContext, saleId: string, input: { items: { saleItemId: string; quantity: number }[]; reason: string; paymentMethod: SalePaymentMethod; restock: boolean; refundId?: string }) {
    const sale = await prisma.sale.findFirst({ where: { id: saleId, businessId: ctx.businessId, storeId: { in: ctx.storeIds } }, include: { items: true, refunds: true, payments: true, customer: { select: { id: true, outstandingBalance: true } } } })
    if (!sale) throw notFound("Sale")

    // Idempotency fast-path: a previous request with this refundId already committed.
    if (input.refundId) {
      const existing = await prisma.refund.findUnique({ where: { idempotencyKey: input.refundId } })
      if (existing) return existing
    }

    if (sale.status === "CANCELLED") throw invalidState("Cannot refund a cancelled sale")
    if (sale.status === "REFUNDED") throw invalidState("Sale is already fully refunded")
    if (input.paymentMethod === "CREDIT" && !sale.customer) throw validation("Refund to credit requires a customer on the sale")

    // Quantities already refunded per sale item
    const refunded = new Map<string, number>()
    for (const r of sale.refunds) {
      const items = JSON.parse(r.items) as { saleItemId: string; quantity: number }[]
      for (const it of items) refunded.set(it.saleItemId, (refunded.get(it.saleItemId) ?? 0) + it.quantity)
    }

    const itemMap = new Map(sale.items.map((i) => [i.id, i]))
    const refundLines = input.items.map((ri) => {
      const si = itemMap.get(ri.saleItemId)
      if (!si) throw validation("Invalid sale item")
      const remaining = si.quantity - (refunded.get(si.id) ?? 0)
      if (ri.quantity > remaining) throw validation(`Cannot refund ${ri.quantity}; only ${remaining} remaining for this item`)
      const perUnit = si.total / si.quantity
      const amount = round2(perUnit * ri.quantity)
      return { saleItemId: si.id, productId: si.productId, quantity: ri.quantity, amount }
    })
    // Apply the order-level discount proportionally to the refund
    const linesTotal = sum(sale.items.map((i) => i.total))
    const ratio = linesTotal > 0 ? sale.total / linesTotal : 1
    const refundAmount = round2(sum(refundLines.map((l) => l.amount)) * ratio)

    const register = input.paymentMethod === "CASH" ? await prisma.cashRegister.findFirst({ where: { businessId: ctx.businessId, storeId: sale.storeId, status: "OPEN" } }) : null
    if (input.paymentMethod === "CASH" && !register) throw new AppError("REGISTER_CLOSED", "Open a cash register to issue cash refunds")
    // A refund "to credit" can only cancel debt that actually exists on this sale.
    const openCredit = round2(sum(sale.payments.filter((p) => p.method === "CREDIT").map((p) => p.amount - p.settledAmount)))
    if (input.paymentMethod === "CREDIT" && refundAmount > openCredit + 0.009) {
      throw new AppError("REFUND_EXCEEDS_CREDIT", `Only ${openCredit.toFixed(2)} of this sale is still owed on credit; refund the rest in cash or another method`, { openCredit, refundAmount })
    }

    const fullyRefunded = sale.items.every((si) => {
      const already = refunded.get(si.id) ?? 0
      const now = refundLines.find((l) => l.saleItemId === si.id)?.quantity ?? 0
      return already + now >= si.quantity
    })

    const result = await withUniqueRetry(() =>
      prisma.$transaction(async (tx) => {
        // Lock the sale row so two concurrent refunds serialise here.
        const locked = await tx.sale.updateMany({ where: { id: sale.id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] } }, data: { updatedAt: new Date() } })
        if (locked.count !== 1) throw conflict("This sale was modified by another operation; please retry")
        // Re-check idempotency inside the transaction.
        if (input.refundId) {
          const raced = await tx.refund.findUnique({ where: { idempotencyKey: input.refundId } })
          if (raced) return raced
        }
        // Re-read refunds inside the lock to recompute remaining quantities.
        const freshRefunds = await tx.refund.findMany({ where: { saleId: sale.id } })
        const refundedNow = new Map<string, number>()
        for (const r of freshRefunds) {
          const items = JSON.parse(r.items) as { saleItemId: string; quantity: number }[]
          for (const it of items) refundedNow.set(it.saleItemId, (refundedNow.get(it.saleItemId) ?? 0) + it.quantity)
        }
        for (const ri of refundLines) {
          const si = itemMap.get(ri.saleItemId)!
          const remaining = si.quantity - (refundedNow.get(si.id) ?? 0)
          if (ri.quantity > remaining) throw conflict(`Cannot refund ${ri.quantity}; only ${remaining} remaining for this item (concurrent refund detected)`)
        }
        const refundNumber = await nextRefundNumber(tx, ctx.businessId)
        const refund = await tx.refund.create({
          data: {
            id: input.refundId,
            idempotencyKey: input.refundId,
            refundNumber,
            amount: refundAmount,
            reason: input.reason,
            items: JSON.stringify(refundLines),
            paymentMethod: input.paymentMethod,
            status: "COMPLETED",
            refundedAt: new Date(),
            saleId: sale.id,
            businessId: ctx.businessId,
            storeId: sale.storeId,
            userId: ctx.userId,
          },
        })
        if (input.restock) {
          for (const l of refundLines) {
            await applyStockChange(tx, ctx, { productId: l.productId, delta: l.quantity, type: "RETURN", reason: `Refund ${refundNumber}`, referenceId: refund.id, referenceType: "Refund" })
          }
        } else {
          // Record damaged/lost movement with zero stock change for traceability? No: we simply don't restock.
        }
        if (register) {
          // Serialise against the register so a concurrent close cannot land first.
          await lockOpenRegister(tx, { id: register.id, businessId: ctx.businessId, storeId: sale.storeId })
          await tx.cashRegisterTransaction.create({
            data: { type: "REFUND", amount: -refundAmount, reason: `Refund ${refundNumber}`, cashRegisterId: register.id, businessId: ctx.businessId, storeId: sale.storeId, userId: ctx.userId },
          })
        }
        if (input.paymentMethod === "CREDIT" && sale.customerId) {
          // Cancel the customer's debt instead of handing money back: settle this sale's credit lines first.
          const settled = await settleCustomerCredit(tx, ctx.businessId, sale.customerId, refundAmount, sale.id)
          const decremented = await tx.customer.updateMany({ where: { id: sale.customerId, outstandingBalance: { gte: settled - 0.009 } }, data: { outstandingBalance: { decrement: settled } } })
          if (decremented.count !== 1) throw conflict("Customer balance changed concurrently; please retry")
        }
        const stillOwed = await tx.payment.count({ where: { saleId: sale.id, status: "PENDING" } })
        await tx.sale.update({ where: { id: sale.id }, data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED", paymentStatus: fullyRefunded ? "REFUNDED" : stillOwed ? sale.paymentStatus : "PAID" } })
        if (sale.customerId) {
          await tx.customer.update({ where: { id: sale.customerId }, data: { totalSpending: { decrement: refundAmount } } })
        }
        await writeAuditLog(
          { businessId: ctx.businessId, userId: ctx.userId, action: "SALE_REFUNDED", entityType: "Sale", entityId: sale.id, metadata: { refundNumber, amount: refundAmount, reason: input.reason, restock: input.restock }, ipAddress: ctx.ip },
          tx
        )
        return refund
      })
    )
    return result
  },

  /** Cancel a completed sale created today (before register close). Restocks and reverses payments. */
  async cancel(ctx: TenantContext, saleId: string, reason: string) {
    const sale = await prisma.sale.findFirst({ where: { id: saleId, businessId: ctx.businessId, storeId: { in: ctx.storeIds } }, include: { items: true, payments: true, refunds: true } })
    if (!sale) throw notFound("Sale")
    if (sale.status !== "COMPLETED") throw invalidState("Only completed sales without refunds can be cancelled")
    if (sale.refunds.length) throw invalidState("Sale has refunds; use refund instead")
    if (sale.cashRegisterId) {
      const reg = await prisma.cashRegister.findUnique({ where: { id: sale.cashRegisterId } })
      if (reg?.status !== "OPEN") throw invalidState("The register for this sale is closed; issue a refund instead")
    }
    const cash = sum(sale.payments.filter((p) => p.method === "CASH").map((p) => p.amount))
    const creditLines = sale.payments.filter((p) => p.method === "CREDIT")
    if (creditLines.some((p) => p.settledAmount > 0.009)) throw invalidState("Part of this credit sale has already been repaid; issue a refund instead")
    const credit = sum(creditLines.map((p) => p.amount))
    await prisma.$transaction(async (tx) => {
      // Lock the sale row; a concurrent refund or repayment will conflict here.
      const locked = await tx.sale.updateMany({ where: { id: sale.id, status: "COMPLETED" }, data: { updatedAt: new Date() } })
      if (locked.count !== 1) throw conflict("This sale was modified by another operation; please retry")
      // Re-check credit lines inside the lock: a repayment may have settled one concurrently.
      const freshCredit = await tx.payment.findMany({ where: { saleId: sale.id, method: "CREDIT" } })
      if (freshCredit.some((p) => p.settledAmount > 0.009)) throw conflict("Part of this credit sale was repaid concurrently; issue a refund instead")
      for (const it of sale.items) {
        await applyStockChange(tx, ctx, { productId: it.productId, delta: it.quantity, type: "RETURN", reason: `Cancelled ${sale.saleNumber}`, referenceId: sale.id, referenceType: "Sale" })
      }
      if (cash > 0 && sale.cashRegisterId) {
        await lockOpenRegister(tx, { id: sale.cashRegisterId, businessId: ctx.businessId, storeId: sale.storeId })
        await tx.cashRegisterTransaction.create({ data: { type: "REFUND", amount: -cash, reason: `Cancelled ${sale.saleNumber}`, cashRegisterId: sale.cashRegisterId, businessId: ctx.businessId, storeId: sale.storeId, userId: ctx.userId } })
      }
      await tx.payment.updateMany({ where: { saleId: sale.id }, data: { status: "REFUNDED" } })
      await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED", paymentStatus: "REFUNDED", notes: [sale.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n") } })
      if (sale.customerId) {
        const decremented = await tx.customer.updateMany({ where: { id: sale.customerId, outstandingBalance: { gte: credit - 0.009 } }, data: { totalSpending: { decrement: sale.total }, outstandingBalance: credit > 0 ? { decrement: credit } : undefined } })
        if (decremented.count !== 1) throw conflict("Customer balance changed concurrently; please retry")
      }
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "SALE_CANCELLED", entityType: "Sale", entityId: sale.id, metadata: { reason, total: sale.total }, ipAddress: ctx.ip }, tx)
    })
    return this.getById(ctx, saleId)
  },

  // ---------- Held carts ----------
  async holdCart(ctx: TenantContext, input: { storeId?: string; label?: string; customerId?: string | null; items: SaleItemInput[] }) {
    const storeId = resolveStoreId(ctx, input.storeId)
    return prisma.heldCart.create({ data: { label: input.label, customerId: input.customerId ?? null, items: JSON.stringify(input.items), businessId: ctx.businessId, storeId, userId: ctx.userId } })
  },
  async listHeldCarts(ctx: TenantContext, storeId?: string) {
    const sid = resolveStoreId(ctx, storeId)
    const carts = await prisma.heldCart.findMany({ where: { businessId: ctx.businessId, storeId: sid }, orderBy: { createdAt: "desc" } })
    return carts.map((c) => ({ ...c, items: JSON.parse(c.items) as SaleItemInput[] }))
  },
  async deleteHeldCart(ctx: TenantContext, id: string) {
    const cart = await prisma.heldCart.findFirst({ where: { id, businessId: ctx.businessId, storeId: { in: ctx.storeIds } } })
    if (!cart) throw notFound("Held cart")
    await prisma.heldCart.delete({ where: { id } })
  },
}
