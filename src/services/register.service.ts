import { prisma } from "@/lib/prisma"
import { AppError, forbidden, invalidState, notFound } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"
import { resolveStoreId } from "@/lib/api"
import { hasPermission } from "@/lib/permissions"
import { round2, sum } from "@/utils/money"
import { notificationService } from "./notification.service"

export const registerService = {
  async getOpen(ctx: TenantContext, storeId?: string) {
    const sid = resolveStoreId(ctx, storeId)
    const reg = await prisma.cashRegister.findFirst({ where: { businessId: ctx.businessId, storeId: sid, status: "OPEN" }, include: { transactions: { orderBy: { createdAt: "desc" } } } })
    if (!reg) return null
    return { ...reg, ...(await this.computeExpected(reg.id)) }
  },

  async open(ctx: TenantContext, input: { storeId?: string; name: string; openingBalance: number }) {
    const storeId = resolveStoreId(ctx, input.storeId)
    const existing = await prisma.cashRegister.findFirst({ where: { businessId: ctx.businessId, storeId, status: "OPEN" } })
    if (existing) throw new AppError("REGISTER_ALREADY_OPEN", "A register is already open for this store")
    return prisma.$transaction(async (tx) => {
      const reg = await tx.cashRegister.create({
        data: { name: input.name, openingBalance: input.openingBalance, status: "OPEN", openedBy: ctx.userId, businessId: ctx.businessId, storeId },
      })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "REGISTER_OPENED", entityType: "CashRegister", entityId: reg.id, metadata: { openingBalance: input.openingBalance }, ipAddress: ctx.ip }, tx)
      return reg
    })
  },

  /** Expected cash = opening + cash sales - cash refunds + deposits - withdrawals. */
  async computeExpected(registerId: string) {
    const reg = await prisma.cashRegister.findUnique({ where: { id: registerId }, include: { transactions: true } })
    if (!reg) throw notFound("Cash register")
    const by = (type: string) => sum(reg.transactions.filter((t) => t.type === type).map((t) => t.amount))
    const sales = by("SALE")
    const refunds = by("REFUND") // stored negative
    const deposits = by("DEPOSIT")
    const withdrawals = by("WITHDRAWAL") // stored negative
    const customerPayments = by("CUSTOMER_PAYMENT") // cash repayments of credit balances
    const expected = round2(reg.openingBalance + sales + refunds + deposits + withdrawals + customerPayments)
    const saleCount = await prisma.sale.count({ where: { cashRegisterId: registerId, status: { not: "CANCELLED" } } })
    return { summary: { openingBalance: reg.openingBalance, cashSales: sales, cashRefunds: refunds, deposits, withdrawals, customerPayments, expected, saleCount } }
  },

  async addTransaction(ctx: TenantContext, registerId: string, input: { type: "WITHDRAWAL" | "DEPOSIT"; amount: number; reason: string }) {
    const reg = await prisma.cashRegister.findFirst({ where: { id: registerId, businessId: ctx.businessId, storeId: { in: ctx.storeIds } } })
    if (!reg) throw notFound("Cash register")
    if (reg.status !== "OPEN") throw invalidState("Register is closed")
    const signed = input.type === "WITHDRAWAL" ? -input.amount : input.amount
    if (input.type === "WITHDRAWAL") {
      const { summary } = await this.computeExpected(reg.id)
      if (summary.expected + signed < 0) throw invalidState("Withdrawal exceeds cash in register")
    }
    return prisma.$transaction(async (tx) => {
      const t = await tx.cashRegisterTransaction.create({ data: { type: input.type, amount: signed, reason: input.reason, cashRegisterId: reg.id, businessId: ctx.businessId, storeId: reg.storeId, userId: ctx.userId } })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "REGISTER_TRANSACTION", entityType: "CashRegister", entityId: reg.id, metadata: { type: input.type, amount: input.amount, reason: input.reason }, ipAddress: ctx.ip }, tx)
      return t
    })
  },

  async close(ctx: TenantContext, registerId: string, input: { actualBalance: number; differenceReason?: string }) {
    const reg = await prisma.cashRegister.findFirst({ where: { id: registerId, businessId: ctx.businessId, storeId: { in: ctx.storeIds } } })
    if (!reg) throw notFound("Cash register")
    if (reg.status !== "OPEN") throw invalidState("Register is already closed")
    if (reg.openedBy !== ctx.userId && !hasPermission(ctx.role, "register.viewAll")) throw forbidden("Only the cashier who opened this register or a manager can close it")
    const { summary } = await this.computeExpected(reg.id)
    const difference = round2(input.actualBalance - summary.expected)
    if (Math.abs(difference) >= 0.01 && !input.differenceReason?.trim()) {
      throw new AppError("VALIDATION_ERROR", "A reason is required when the counted cash differs from the expected amount", { expected: summary.expected, difference })
    }
    const closed = await prisma.$transaction(async (tx) => {
      const c = await tx.cashRegister.update({
        where: { id: reg.id },
        data: { status: "CLOSED", closedAt: new Date(), closedBy: ctx.userId, expectedBalance: summary.expected, actualBalance: input.actualBalance, closingBalance: input.actualBalance, difference, differenceReason: input.differenceReason },
      })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "REGISTER_CLOSED", entityType: "CashRegister", entityId: reg.id, metadata: { expected: summary.expected, actual: input.actualBalance, difference, reason: input.differenceReason }, ipAddress: ctx.ip }, tx)
      return c
    })
    await notificationService.registerDiscrepancy(ctx.businessId, { id: reg.id, name: reg.name, difference, reason: input.differenceReason })
    return { ...closed, summary }
  },

  async history(ctx: TenantContext, q: { storeId?: string; page: number; pageSize: number }) {
    if (q.storeId && !ctx.storeIds.includes(q.storeId)) throw forbidden("You do not have access to this store")
    const where = {
      businessId: ctx.businessId,
      storeId: q.storeId ?? { in: ctx.storeIds },
      ...(hasPermission(ctx.role, "register.viewAll") ? {} : { openedBy: ctx.userId }),
    }
    const [total, items] = await Promise.all([
      prisma.cashRegister.count({ where }),
      prisma.cashRegister.findMany({ where, orderBy: { openedAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { store: { select: { name: true } } } }),
    ])
    const userIds = [...new Set(items.flatMap((r) => [r.openedBy, r.closedBy]).filter(Boolean))] as string[]
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))
    return { items: items.map((r) => ({ ...r, openedByName: names.get(r.openedBy) ?? null, closedByName: r.closedBy ? names.get(r.closedBy) ?? null : null })), total, page: q.page, pageSize: q.pageSize }
  },

  async getById(ctx: TenantContext, id: string) {
    const reg = await prisma.cashRegister.findFirst({ where: { id, businessId: ctx.businessId, storeId: { in: ctx.storeIds } }, include: { transactions: { orderBy: { createdAt: "desc" } }, store: { select: { name: true } } } })
    if (!reg) throw notFound("Cash register")
    if (reg.openedBy !== ctx.userId && !hasPermission(ctx.role, "register.viewAll")) throw forbidden()
    return { ...reg, ...(await this.computeExpected(reg.id)) }
  },
}
