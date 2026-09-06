import { withTenant, parseBody, ok } from "@/lib/api"
import { changePasswordSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"
import { prisma } from "@/lib/prisma"
import { getPermissions } from "@/lib/permissions"

/** Current user profile, permissions and accessible stores — used by the app shell. */
export const GET = withTenant(async (_req, ctx) => {
  const [user, business, stores] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, lastLoginAt: true } }),
    prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { id: true, name: true, type: true, currency: true, taxRate: true, logo: true, onboarded: true, subscriptionPlan: true } }),
    prisma.store.findMany({ where: { id: { in: ctx.storeIds }, deletedAt: null }, select: { id: true, name: true, city: true, isActive: true }, orderBy: { createdAt: "asc" } }),
  ])
  return ok({ user, business, stores, role: ctx.role, permissions: getPermissions(ctx.role) })
})

export const POST = withTenant(async (req, ctx) => {
  await businessService.changePassword(ctx, await parseBody(req, changePasswordSchema))
  return ok({ changed: true })
})
