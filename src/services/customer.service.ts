import type { Prisma } from "@prisma/client"
import { prisma, icontains } from "@/lib/prisma"
import { conflict, notFound } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"

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
          select: { id: true, saleNumber: true, total: true, status: true, createdAt: true, _count: { select: { items: true } }, payments: { select: { method: true, amount: true } } },
        },
      },
    })
    if (!c) throw notFound("Customer")
    const completed = c.sales.filter((s) => s.status !== "CANCELLED")
    const stats = {
      orderCount: completed.length,
      averageOrder: completed.length ? Math.round((completed.reduce((a, s) => a + s.total, 0) / completed.length) * 100) / 100 : 0,
      lastPurchaseAt: completed[0]?.createdAt ?? null,
    }
    return { ...c, stats }
  },

  async create(ctx: TenantContext, input: Prisma.CustomerUncheckedCreateInput) {
    if (input.phone) {
      const dup = await prisma.customer.findFirst({ where: { businessId: ctx.businessId, phone: input.phone, deletedAt: null } })
      if (dup) throw conflict("A customer with this phone number already exists")
    }
    const c = await prisma.customer.create({ data: { ...input, businessId: ctx.businessId } })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: c.id, metadata: { name: c.name }, ipAddress: ctx.ip })
    return c
  },

  async update(ctx: TenantContext, id: string, input: Prisma.CustomerUncheckedUpdateInput) {
    const c = await prisma.customer.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!c) throw notFound("Customer")
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
      select: { id: true, name: true, phone: true, loyaltyPoints: true },
    })
  },
}
