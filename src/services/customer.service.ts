import type { Prisma } from "@prisma/client"
import { prisma, icontains } from "@/lib/prisma"
import { AppError, conflict, forbidden, notFound, validation } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"
import { resolveStoreId } from "@/lib/api"
import { hasPermission } from "@/lib/permissions"
import { round2 } from "@/utils/money"
import type { PaymentMethod } from "@/utils/validation"
import { settleCustomerCredit } from "./sales.service"
import { lockOpenRegister } from "./register-lock"

export const customerService = {
  async list(ctx: TenantContext, q: { search?: string; page: number; pageSize: number }) {
    const where: Prisma.CustomerWhereInput = {
      businessId: ctx.businessId,
      deletedAt: null,
      OR: q.search ? [{ name: icontains(q.search) }, { phone: icontains(q.search) }, { email: icontains(q.search) }] : undefined,
    }
    const [total, items] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, orderBy: { name: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { _count: { select: { sales: true } } } }),
    ])
    return { items, total, page: q.page, pageSize: q.pageSize }
  },

  async getById(ctx: TenantContext, id: string) {
    const c = await prisma.customer.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      include: {
        sales: {
          where: { storeId: { in: ctx.storeIds } },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, saleNumber: true, total: true, status: true, paymentStatus: true, createdAt: true, _count: { select: { items: true } }, payments: { select: { method: true, amount: true, settledAmount: true, status: true } } },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    })
    if (!c) throw notFound("Customer")
    const completed = c.sales.filter((s) => s.status !== "CANCELLED")
    const stats = {
      orderCount: completed.length,
      averageOrder: completed.length ? Math.round((completed.reduce((a, s) => a + s.total, 0) / completed.length) * 100) / 100 : 0,
      lastPurchaseAt: completed[0]?.createdAt ?? null,
      creditAvailable: c.creditLimit == null ? null : round2(Math.max(0, c.creditLimit - c.outstandingBalance)),
    }
    return { ...c, stats }
  },

  async create(ctx: TenantContext, input: Prisma.CustomerUncheckedCreateInput) {
    if (input.creditLimit != null && !hasPermission(ctx.role, "customer.creditLimit")) throw forbidden("You are not allowed to set credit limits")
    if (input.phone) {
      const dup = await prisma.customer.findFirst({ where: { businessId: ctx.businessId, phone: input.phone, deletedAt: null } })
      if (dup) throw conflict("A customer with this phone number already exists")
    }
    const c = await prisma.customer.create({ data: { ...input, businessId: ctx.businessId } })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: c.id, metadata: { name: c.name, creditLimit: c.creditLimit ?? undefined }, ipAddress: ctx.ip })
    return c
  },

  async update(ctx: TenantContext, id: string, input: Prisma.CustomerUncheckedUpdateInput) {
    const c = await prisma.customer.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!c) throw notFound("Customer")
    if ("creditLimit" in input && input.creditLimit !== undefined && input.creditLimit !== c.creditLimit && !hasPermission(ctx.role, "customer.creditLimit")) {
      throw forbidden("You are not allowed to change credit limits")
    }
    if (typeof input.phone === "string" && input.phone) {
      const dup = await prisma.customer.findFirst({ where: { businessId: ctx.businessId, phone: input.phone, deletedAt: null, NOT: { id } } })
      if (dup) throw conflict("A customer with this phone number already exists")
    }
    const updated = await prisma.customer.update({ where: { id }, data: input })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: id, metadata: { fields: Object.keys(input) }, ipAddress: ctx.ip })
    return updated
  },

  async remove(ctx: TenantContext, id: string) {
    const c = await prisma.customer.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!c) throw notFound("Customer")
    if (c.outstandingBalance > 0.009) throw conflict("Customer has an outstanding balance")
    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "CUSTOMER_DELETED", entityType: "Customer", entityId: id, metadata: { name: c.name }, ipAddress: ctx.ip })
  },

  /** Quick search for the POS customer picker. */
  async search(ctx: TenantContext, term: string) {
    return prisma.customer.findMany({
      where: { businessId: ctx.businessId, deletedAt: null, isActive: true, OR: [{ name: icontains(term) }, { phone: icontains(term) }] },
      take: 10,
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, loyaltyPoints: true, outstandingBalance: true, creditLimit: true },
    })
  },

  /**
   * Records a repayment of the customer's outstanding balance. Atomically:
   * creates the CustomerPayment, settles open CREDIT sale payments FIFO, decrements the
   * balance, and (for cash) posts a CUSTOMER_PAYMENT transaction to the open register.
   *
   * Concurrency/idempotency:
   * - When `paymentId` is supplied, a repeated request returns the original payment row
   *   instead of creating a second one. A second request with the same id but a different
   *   amount is rejected as a conflict.
   * - The outstanding-balance check runs *inside* the transaction against a freshly locked
   *   customer row, so two simultaneous repayments cannot both succeed against the same
   *   balance and cannot drive it below zero.
   */
  async recordPayment(ctx: TenantContext, customerId: string, input: { amount: number; method: PaymentMethod; reference?: string; notes?: string; storeId?: string; paymentId?: string }) {
    const storeId = resolveStoreId(ctx, input.storeId)
    const c = await prisma.customer.findFirst({ where: { id: customerId, businessId: ctx.businessId, deletedAt: null } })
    if (!c) throw notFound("Customer")

    // Idempotency fast-path: a previous request with this paymentId already committed.
    if (input.paymentId) {
      const existing = await prisma.customerPayment.findUnique({ where: { idempotencyKey: input.paymentId } })
      if (existing) {
        if (Math.abs(existing.amount - input.amount) > 0.009) throw conflict("A different payment with this idempotency key already exists")
        return { payment: existing, outstandingBalance: round2(c.outstandingBalance), settled: existing.amount }
      }
    }

    return prisma.$transaction(async (tx) => {
      // Lock the customer row by updating it in place; concurrent repayments block here.
      const locked = await tx.customer.updateMany({ where: { id: customerId, businessId: ctx.businessId, deletedAt: null }, data: { updatedAt: new Date() } })
      if (locked.count !== 1) throw notFound("Customer")
      const fresh = await tx.customer.findUniqueOrThrow({ where: { id: customerId } })
      if (fresh.outstandingBalance <= 0.009) throw new AppError("NO_OUTSTANDING_BALANCE", "This customer has no outstanding balance")
      if (input.amount > fresh.outstandingBalance + 0.009) throw validation(`Amount exceeds the outstanding balance (${fresh.outstandingBalance.toFixed(2)})`)

      // Re-check idempotency inside the transaction to close the race window.
      if (input.paymentId) {
        const raced = await tx.customerPayment.findUnique({ where: { idempotencyKey: input.paymentId } })
        if (raced) {
          if (Math.abs(raced.amount - input.amount) > 0.009) throw conflict("A different payment with this idempotency key already exists")
          return { payment: raced, outstandingBalance: round2(fresh.outstandingBalance), settled: raced.amount }
        }
      }

      // For cash, serialise against the open register so a concurrent close cannot land first.
      let registerId: string | null = null
      if (input.method === "CASH") {
        const reg = await lockOpenRegister(tx, { businessId: ctx.businessId, storeId })
        registerId = reg.id
      }

      const payment = await tx.customerPayment.create({
        data: { id: input.paymentId, idempotencyKey: input.paymentId, amount: input.amount, method: input.method, reference: input.reference, notes: input.notes, customerId, businessId: ctx.businessId, storeId, userId: ctx.userId },
      })
      const settled = await settleCustomerCredit(tx, ctx.businessId, customerId, input.amount)
      // Guarded decrement: only applies if the balance still covers the amount.
      const decremented = await tx.customer.updateMany({ where: { id: customerId, outstandingBalance: { gte: input.amount - 0.009 } }, data: { outstandingBalance: { decrement: input.amount } } })
      if (decremented.count !== 1) throw conflict("Customer balance changed concurrently; please retry")
      const updated = await tx.customer.findUniqueOrThrow({ where: { id: customerId } })
      if (registerId) {
        await tx.cashRegisterTransaction.create({
          data: { type: "CUSTOMER_PAYMENT", amount: input.amount, reason: `Customer payment: ${c.name}`, cashRegisterId: registerId, businessId: ctx.businessId, storeId, userId: ctx.userId },
        })
      }
      await writeAuditLog(
        { businessId: ctx.businessId, userId: ctx.userId, action: "CUSTOMER_PAYMENT", entityType: "Customer", entityId: customerId, metadata: { amount: input.amount, method: input.method, settled, balanceAfter: updated.outstandingBalance }, ipAddress: ctx.ip },
        tx
      )
      return { payment, outstandingBalance: round2(updated.outstandingBalance), settled }
    })
  },

  /** Receivables overview: who owes what (for the customers list header and reports). */
  async receivables(ctx: TenantContext) {
    const debtors = await prisma.customer.findMany({
      where: { businessId: ctx.businessId, deletedAt: null, outstandingBalance: { gt: 0.009 } },
      orderBy: { outstandingBalance: "desc" },
      select: { id: true, name: true, phone: true, outstandingBalance: true, creditLimit: true },
    })
    return { total: round2(debtors.reduce((a, d) => a + d.outstandingBalance, 0)), count: debtors.length, debtors }
  },
}
