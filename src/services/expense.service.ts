import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { conflict, forbidden, invalidState, notFound } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"
import { resolveStoreId } from "@/lib/api"
import { notificationService } from "./notification.service"
import type { PaymentMethod } from "@/utils/validation"

/** System expense categories seeded for every business (code -> default FR name). */
export const SYSTEM_EXPENSE_CATEGORIES: { code: string; name: string }[] = [
  { code: "RENT", name: "Loyer" },
  { code: "ELECTRICITY", name: "Électricité" },
  { code: "INTERNET", name: "Internet" },
  { code: "SALARIES", name: "Salaires" },
  { code: "TRANSPORT", name: "Transport" },
  { code: "MARKETING", name: "Marketing" },
  { code: "MAINTENANCE", name: "Maintenance" },
  { code: "SUPPLIES", name: "Fournitures" },
  { code: "OTHER", name: "Autre" },
]

interface ExpenseInput {
  storeId?: string
  amount: number
  categoryId: string
  description?: string
  date?: Date
  paymentMethod: PaymentMethod
  notes?: string
}

const include = { category: { select: { id: true, name: true, code: true } }, store: { select: { id: true, name: true } } } satisfies Prisma.ExpenseInclude

export const expenseService = {
  async list(ctx: TenantContext, q: { storeId?: string; categoryId?: string; from?: Date; to?: Date; page: number; pageSize: number }) {
    if (q.storeId && !ctx.storeIds.includes(q.storeId)) throw forbidden("You do not have access to this store")
    const where: Prisma.ExpenseWhereInput = {
      businessId: ctx.businessId,
      storeId: q.storeId ?? { in: ctx.storeIds },
      categoryId: q.categoryId,
      deletedAt: null,
      date: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    }
    const [total, items, agg] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({ where, include, orderBy: { date: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ])
    return { items, total, sum: agg._sum.amount ?? 0, page: q.page, pageSize: q.pageSize }
  },

  async getById(ctx: TenantContext, id: string) {
    const e = await prisma.expense.findFirst({ where: { id, businessId: ctx.businessId, storeId: { in: ctx.storeIds }, deletedAt: null }, include })
    if (!e) throw notFound("Expense")
    return e
  },

  async create(ctx: TenantContext, input: ExpenseInput) {
    const storeId = resolveStoreId(ctx, input.storeId)
    const cat = await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, businessId: ctx.businessId, deletedAt: null } })
    if (!cat) throw notFound("Expense category")
    const register = input.paymentMethod === "CASH" ? await prisma.cashRegister.findFirst({ where: { businessId: ctx.businessId, storeId, status: "OPEN" } }) : null
    if (input.paymentMethod === "CASH" && !register) throw invalidState("Open a cash register to record cash expenses")
    const e = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: { amount: input.amount, categoryId: input.categoryId, description: input.description, date: input.date ?? new Date(), paymentMethod: input.paymentMethod, notes: input.notes, businessId: ctx.businessId, storeId, userId: ctx.userId },
        include,
      })
      if (register) {
        await tx.cashRegisterTransaction.create({ data: { type: "WITHDRAWAL", amount: -input.amount, reason: `Expense: ${cat.name}${input.description ? ` - ${input.description}` : ""}`, cashRegisterId: register.id, businessId: ctx.businessId, storeId, userId: ctx.userId } })
      }
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "EXPENSE_CREATED", entityType: "Expense", entityId: created.id, metadata: { amount: input.amount, category: cat.name }, ipAddress: ctx.ip }, tx)
      return created
    })
    await notificationService.checkLargeExpense(ctx.businessId, { id: e.id, amount: e.amount, description: e.description })
    return e
  },

  /** Editing an expense does not touch the register (cash movement already happened); amount edits are audited. */
  async update(ctx: TenantContext, id: string, input: Partial<ExpenseInput>) {
    const e = await this.getById(ctx, id)
    if (input.categoryId) {
      const cat = await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, businessId: ctx.businessId, deletedAt: null } })
      if (!cat) throw notFound("Expense category")
    }
    if (input.paymentMethod && input.paymentMethod !== e.paymentMethod && (input.paymentMethod === "CASH" || e.paymentMethod === "CASH")) {
      throw invalidState("Changing between cash and non-cash payment is not allowed; delete and re-create the expense")
    }
    const { storeId: _s, ...data } = input
    const updated = await prisma.expense.update({ where: { id }, data, include })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "EXPENSE_UPDATED", entityType: "Expense", entityId: id, metadata: { from: e.amount, to: updated.amount, fields: Object.keys(input) }, ipAddress: ctx.ip })
    return updated
  },

  async remove(ctx: TenantContext, id: string) {
    const e = await this.getById(ctx, id)
    await prisma.$transaction(async (tx) => {
      await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } })
      if (e.paymentMethod === "CASH") {
        const register = await tx.cashRegister.findFirst({ where: { businessId: ctx.businessId, storeId: e.storeId, status: "OPEN" } })
        if (register) {
          await tx.cashRegisterTransaction.create({ data: { type: "DEPOSIT", amount: e.amount, reason: `Reversal of deleted expense: ${e.category.name}`, cashRegisterId: register.id, businessId: ctx.businessId, storeId: e.storeId, userId: ctx.userId } })
        }
      }
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "EXPENSE_DELETED", entityType: "Expense", entityId: id, metadata: { amount: e.amount, category: e.category.name }, ipAddress: ctx.ip }, tx)
    })
  },

  async listCategories(ctx: TenantContext) {
    return prisma.expenseCategory.findMany({ where: { businessId: ctx.businessId, deletedAt: null }, orderBy: { name: "asc" } })
  },

  async createCategory(ctx: TenantContext, input: { name: string; description?: string }) {
    const dup = await prisma.expenseCategory.findFirst({ where: { businessId: ctx.businessId, name: input.name, deletedAt: null } })
    if (dup) throw conflict("An expense category with this name already exists")
    return prisma.expenseCategory.create({ data: { ...input, businessId: ctx.businessId } })
  },

  async deleteCategory(ctx: TenantContext, id: string) {
    const c = await prisma.expenseCategory.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!c) throw notFound("Expense category")
    if (c.code) throw conflict("System categories cannot be deleted")
    const used = await prisma.expense.count({ where: { categoryId: id, deletedAt: null } })
    if (used) throw conflict("Category is used by existing expenses")
    return prisma.expenseCategory.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
  },
}
