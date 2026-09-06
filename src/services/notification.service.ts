import { prisma } from "@/lib/prisma"
import { forbidden } from "@/lib/errors"
import type { TenantContext } from "@/lib/api"
import { sendEmail, isEmailConfigured } from "@/lib/email"

export type NotificationType =
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "LARGE_EXPENSE"
  | "SALES_DECREASE"
  | "REGISTER_DISCREPANCY"
  | "PURCHASE_RECEIVED"
  | "SYSTEM"

interface NotifyInput {
  businessId: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, unknown>
  /** Explicit recipients; defaults to OWNER/ADMIN/MANAGER users of the business. */
  userIds?: string[]
  /** Only send if no identical (type + dedupeKey) unread notification exists. */
  dedupeKey?: string
  email?: boolean
}

const MANAGEMENT_ROLES = ["OWNER", "ADMIN", "MANAGER"]
const LARGE_EXPENSE_THRESHOLD = 5000 // MAD — documented default; per-business configuration is a future improvement.

async function recipients(businessId: string, explicit?: string[]) {
  if (explicit?.length) return prisma.user.findMany({ where: { id: { in: explicit }, businessId, deletedAt: null }, select: { id: true, email: true } })
  return prisma.user.findMany({
    where: { businessId, deletedAt: null, status: "ACTIVE", role: { name: { in: MANAGEMENT_ROLES } } },
    select: { id: true, email: true },
  })
}

export const notificationService = {
  async notify(input: NotifyInput) {
    const users = await recipients(input.businessId, input.userIds)
    if (!users.length) return []

    const data = JSON.stringify({ ...(input.data ?? {}), dedupeKey: input.dedupeKey })
    const created = []
    for (const u of users) {
      if (input.dedupeKey) {
        const existing = await prisma.notification.findFirst({
          where: { businessId: input.businessId, userId: u.id, type: input.type, isRead: false, data: { contains: `"dedupeKey":"${input.dedupeKey}"` } },
          select: { id: true },
        })
        if (existing) continue
      }
      created.push(
        await prisma.notification.create({
          data: { businessId: input.businessId, userId: u.id, type: input.type, title: input.title, message: input.message, data },
        })
      )
    }
    if (input.email && isEmailConfigured() && created.length) {
      // Fire and forget; email failures must not break the primary operation.
      void Promise.all(users.map((u) => sendEmail({ to: u.email, subject: input.title, text: input.message }))).catch((e) =>
        console.error("[notify] email failed", e)
      )
    }
    return created
  },

  /** Evaluate a product's stock level and emit LOW_STOCK / OUT_OF_STOCK if needed. */
  async checkStockLevel(businessId: string, productId: string) {
    const p = await prisma.product.findFirst({
      where: { id: productId, businessId, deletedAt: null, isActive: true },
      select: { id: true, name: true, stockQuantity: true, minimumStock: true, store: { select: { name: true } } },
    })
    if (!p) return
    if (p.stockQuantity <= 0) {
      await this.notify({
        businessId,
        type: "OUT_OF_STOCK",
        title: `Out of stock: ${p.name}`,
        message: `${p.name} is out of stock at ${p.store.name}.`,
        data: { productId: p.id },
        dedupeKey: `oos:${p.id}`,
      })
    } else if (p.stockQuantity <= p.minimumStock) {
      await this.notify({
        businessId,
        type: "LOW_STOCK",
        title: `Low stock: ${p.name}`,
        message: `${p.name} has ${p.stockQuantity} left (minimum ${p.minimumStock}) at ${p.store.name}.`,
        data: { productId: p.id, stock: p.stockQuantity, minimum: p.minimumStock },
        dedupeKey: `low:${p.id}`,
      })
    }
  },

  async checkLargeExpense(businessId: string, expense: { id: string; amount: number; description?: string | null }) {
    if (expense.amount < LARGE_EXPENSE_THRESHOLD) return
    await this.notify({
      businessId,
      type: "LARGE_EXPENSE",
      title: `Large expense recorded`,
      message: `An expense of ${expense.amount.toFixed(2)} MAD was recorded${expense.description ? `: ${expense.description}` : "."}`,
      data: { expenseId: expense.id, amount: expense.amount },
    })
  },

  async registerDiscrepancy(businessId: string, reg: { id: string; name: string; difference: number; reason?: string | null }) {
    if (Math.abs(reg.difference) < 0.01) return
    await this.notify({
      businessId,
      type: "REGISTER_DISCREPANCY",
      title: `Register discrepancy: ${reg.name}`,
      message: `Register closed with a difference of ${reg.difference.toFixed(2)} MAD${reg.reason ? ` (${reg.reason})` : ""}.`,
      data: { cashRegisterId: reg.id, difference: reg.difference },
    })
  },

  async purchaseReceived(businessId: string, po: { id: string; orderNumber: string; supplierName: string }) {
    await this.notify({
      businessId,
      type: "PURCHASE_RECEIVED",
      title: `Purchase order ${po.orderNumber} received`,
      message: `Goods from ${po.supplierName} were received and stock has been updated.`,
      data: { purchaseOrderId: po.id },
    })
  },

  /**
   * Compare yesterday's revenue with the trailing 7-day average; notify on >30% drop.
   * Intended to be triggered by the daily cron endpoint.
   */
  async checkSalesDecrease(businessId: string) {
    const now = new Date()
    const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8)
    const [y, w] = await Promise.all([
      prisma.sale.aggregate({ _sum: { total: true }, where: { businessId, status: "COMPLETED", createdAt: { gte: startYesterday, lt: startToday } } }),
      prisma.sale.aggregate({ _sum: { total: true }, where: { businessId, status: "COMPLETED", createdAt: { gte: startWeek, lt: startYesterday } } }),
    ])
    const yesterday = y._sum.total ?? 0
    const avg = (w._sum.total ?? 0) / 7
    if (avg > 0 && yesterday < avg * 0.7) {
      await this.notify({
        businessId,
        type: "SALES_DECREASE",
        title: "Unusual sales decrease",
        message: `Yesterday's sales (${yesterday.toFixed(2)} MAD) were ${Math.round((1 - yesterday / avg) * 100)}% below the 7-day average (${avg.toFixed(2)} MAD).`,
        data: { yesterday, average: avg },
        dedupeKey: `sales-drop:${startYesterday.toISOString().slice(0, 10)}`,
      })
    }
  },

  async list(ctx: TenantContext, q: { unreadOnly?: boolean; page: number; pageSize: number }) {
    const where = { businessId: ctx.businessId, userId: ctx.userId, isRead: q.unreadOnly ? false : undefined }
    const [total, unread, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { businessId: ctx.businessId, userId: ctx.userId, isRead: false } }),
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ])
    return { items: items.map((n) => ({ ...n, data: n.data ? JSON.parse(n.data) : null })), total, unread, page: q.page, pageSize: q.pageSize }
  },

  async markRead(ctx: TenantContext, id: string) {
    const n = await prisma.notification.findFirst({ where: { id, businessId: ctx.businessId, userId: ctx.userId } })
    if (!n) throw forbidden()
    return prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } })
  },

  async markAllRead(ctx: TenantContext) {
    return prisma.notification.updateMany({ where: { businessId: ctx.businessId, userId: ctx.userId, isRead: false }, data: { isRead: true, readAt: new Date() } })
  },
}
