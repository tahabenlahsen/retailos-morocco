import bcrypt from "bcryptjs"
import crypto from "crypto"
import { prisma, icontains } from "@/lib/prisma"
import { AppError, conflict, forbidden, invalidState, notFound, validation } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { TenantContext } from "@/lib/api"
import { assignableRoles, ROLES, type RoleName } from "@/lib/permissions"
import { sendEmail, isEmailConfigured } from "@/lib/email"
import { SYSTEM_EXPENSE_CATEGORIES } from "./expense.service"
import type { z } from "zod"
import type { businessOnboardingSchema, createStoreSchema, createUserSchema, signUpSchema, updateBusinessSchema, updateStoreSchema, updateUserSchema } from "@/utils/validation"

const BCRYPT_ROUNDS = 12

/** Ensure the six system roles exist (idempotent). */
export async function ensureRoles() {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name, description: `System role: ${name}` } })
  }
  const roles = await prisma.role.findMany({ where: { name: { in: [...ROLES] } } })
  return new Map(roles.map((r) => [r.name as RoleName, r.id]))
}

const DEFAULT_CATEGORIES: Record<string, string[]> = {
  MINI_MARKET: ["Boissons", "Produits laitiers", "Boulangerie", "Snacks", "Entretien", "Hygiène", "Épicerie"],
  GROCERY: ["Fruits & Légumes", "Viande & Volaille", "Produits laitiers", "Boulangerie", "Conserves", "Boissons", "Épices"],
  CLOTHING: ["Homme", "Femme", "Enfant", "Accessoires", "Chaussures"],
  ELECTRONICS: ["Téléphones", "Informatique", "TV & Audio", "Accessoires", "Gaming", "Électroménager"],
  COSMETICS: ["Soins visage", "Maquillage", "Cheveux", "Parfums", "Hygiène"],
  RESTAURANT: ["Entrées", "Plats", "Desserts", "Boissons", "Accompagnements"],
  PHARMACY: ["Parapharmacie", "Hygiène", "Bébé", "Compléments", "Matériel"],
  OTHER: ["Général"],
}

export const businessService = {
  /**
   * Sign up: creates Business (not yet onboarded) + first OWNER user in one transaction.
   * Store, categories, etc. are created during onboarding.
   */
  async signUp(input: z.infer<typeof signUpSchema>, ip?: string) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } })
    if (existing) throw conflict("An account with this email already exists")
    const roles = await ensureRoles()
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
    return prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: { name: `${input.firstName} ${input.lastName}`, type: "OTHER", ownerName: `${input.firstName} ${input.lastName}`, phone: input.phone ?? "", email: input.email, city: "", status: "TRIAL", subscriptionPlan: "FREE", onboarded: false },
      })
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName, phone: input.phone, status: "ACTIVE", businessId: business.id, roleId: roles.get("OWNER")! },
      })
      await writeAuditLog({ businessId: business.id, userId: user.id, action: "SIGNUP", entityType: "User", entityId: user.id, ipAddress: ip }, tx)
      return { userId: user.id, businessId: business.id }
    })
  },

  async onboard(ctx: TenantContext, input: z.infer<typeof businessOnboardingSchema>) {
    if (ctx.role !== "OWNER") throw forbidden("Only the owner can complete onboarding")
    const business = await prisma.business.findUnique({ where: { id: ctx.businessId } })
    if (!business) throw notFound("Business")
    if (business.onboarded) throw invalidState("Onboarding already completed")
    return prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: ctx.businessId },
        data: { name: input.businessName, type: input.businessType, ownerName: input.ownerName, phone: input.phone, email: input.email, city: input.city, address: input.address, currency: input.currency, taxRate: input.taxRate, status: "ACTIVE", onboarded: true },
      })
      const store = await tx.store.create({ data: { name: input.storeName, city: input.city, address: input.address, phone: input.phone, businessId: ctx.businessId } })
      await tx.userStore.create({ data: { userId: ctx.userId, storeId: store.id, isDefault: true } })
      await tx.category.createMany({ data: (DEFAULT_CATEGORIES[input.businessType] ?? DEFAULT_CATEGORIES.OTHER).map((name) => ({ name, businessId: ctx.businessId })) })
      await tx.expenseCategory.createMany({ data: SYSTEM_EXPENSE_CATEGORIES.map((c) => ({ name: c.name, code: c.code, businessId: ctx.businessId })) })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "ONBOARDING_COMPLETED", entityType: "Business", entityId: ctx.businessId, metadata: { storeId: store.id, type: input.businessType }, ipAddress: ctx.ip }, tx)
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "STORE_CREATED", entityType: "Store", entityId: store.id, metadata: { name: store.name }, ipAddress: ctx.ip }, tx)
      return { storeId: store.id }
    })
  },

  async get(ctx: TenantContext) {
    const b = await prisma.business.findUnique({ where: { id: ctx.businessId }, include: { _count: { select: { stores: { where: { deletedAt: null } }, users: { where: { deletedAt: null } } } } } })
    if (!b) throw notFound("Business")
    return b
  },

  async update(ctx: TenantContext, input: z.infer<typeof updateBusinessSchema>) {
    const b = await prisma.business.update({ where: { id: ctx.businessId }, data: input })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "BUSINESS_UPDATED", entityType: "Business", entityId: ctx.businessId, metadata: { fields: Object.keys(input) }, ipAddress: ctx.ip })
    return b
  },

  // ---------- Stores ----------
  async listStores(ctx: TenantContext) {
    return prisma.store.findMany({ where: { businessId: ctx.businessId, deletedAt: null, id: { in: ctx.storeIds } }, orderBy: { createdAt: "asc" }, include: { _count: { select: { products: { where: { deletedAt: null } }, users: true } } } })
  },
  async createStore(ctx: TenantContext, input: z.infer<typeof createStoreSchema>) {
    return prisma.$transaction(async (tx) => {
      const store = await tx.store.create({ data: { ...input, businessId: ctx.businessId } })
      // Creator (owner/admin) gets access automatically
      await tx.userStore.create({ data: { userId: ctx.userId, storeId: store.id } })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "STORE_CREATED", entityType: "Store", entityId: store.id, metadata: { name: store.name }, ipAddress: ctx.ip }, tx)
      return store
    })
  },
  async updateStore(ctx: TenantContext, id: string, input: z.infer<typeof updateStoreSchema>) {
    const s = await prisma.store.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!s) throw notFound("Store")
    const updated = await prisma.store.update({ where: { id }, data: input })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "STORE_UPDATED", entityType: "Store", entityId: id, metadata: { fields: Object.keys(input) }, ipAddress: ctx.ip })
    return updated
  },
  async deleteStore(ctx: TenantContext, id: string) {
    const s = await prisma.store.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null } })
    if (!s) throw notFound("Store")
    const count = await prisma.store.count({ where: { businessId: ctx.businessId, deletedAt: null } })
    if (count <= 1) throw invalidState("A business must have at least one store")
    const openReg = await prisma.cashRegister.count({ where: { storeId: id, status: "OPEN" } })
    if (openReg) throw invalidState("Close all registers before deleting the store")
    const stock = await prisma.product.aggregate({ where: { storeId: id, deletedAt: null }, _sum: { stockQuantity: true } })
    if ((stock._sum.stockQuantity ?? 0) > 0) throw invalidState("Transfer or write off remaining stock before deleting the store")
    await prisma.$transaction(async (tx) => {
      await tx.store.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
      await tx.userStore.deleteMany({ where: { storeId: id } })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "STORE_DELETED", entityType: "Store", entityId: id, metadata: { name: s.name }, ipAddress: ctx.ip }, tx)
    })
  },

  // ---------- Users / employees ----------
  async listUsers(ctx: TenantContext) {
    const users = await prisma.user.findMany({ where: { businessId: ctx.businessId, deletedAt: null }, include: { role: { select: { name: true } }, stores: { include: { store: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "asc" } })
    return users.map(({ passwordHash: _p, ...u }) => ({ ...u, role: u.role.name, stores: u.stores.map((s) => s.store) }))
  },
  async createUser(ctx: TenantContext, input: z.infer<typeof createUserSchema>) {
    if (!assignableRoles(ctx.role).includes(input.role)) throw forbidden("You cannot assign this role")
    const existing = await prisma.user.findUnique({ where: { email: input.email } })
    if (existing) throw conflict("An account with this email already exists")
    const storesOk = await prisma.store.count({ where: { id: { in: input.storeIds }, businessId: ctx.businessId, deletedAt: null } })
    if (storesOk !== input.storeIds.length) throw validation("Invalid store selection")
    const roles = await ensureRoles()
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
    return prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName, phone: input.phone, status: "ACTIVE", businessId: ctx.businessId, roleId: roles.get(input.role)! } })
      await tx.userStore.createMany({ data: input.storeIds.map((storeId, i) => ({ userId: u.id, storeId, isDefault: i === 0 })) })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "USER_CREATED", entityType: "User", entityId: u.id, metadata: { email: u.email, role: input.role }, ipAddress: ctx.ip }, tx)
      const { passwordHash: _p, ...safe } = u
      return safe
    })
  },
  async updateUser(ctx: TenantContext, id: string, input: z.infer<typeof updateUserSchema>) {
    const target = await prisma.user.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null }, include: { role: true } })
    if (!target) throw notFound("User")
    if (target.role.name === "OWNER" && ctx.role !== "OWNER") throw forbidden("Only the owner can modify the owner account")
    if (input.role && !assignableRoles(ctx.role).includes(input.role)) throw forbidden("You cannot assign this role")
    if (target.role.name === "OWNER" && input.role && input.role !== "OWNER") {
      const owners = await prisma.user.count({ where: { businessId: ctx.businessId, deletedAt: null, role: { name: "OWNER" } } })
      if (owners <= 1) throw invalidState("The business must keep at least one owner")
    }
    if (input.storeIds) {
      const ok = await prisma.store.count({ where: { id: { in: input.storeIds }, businessId: ctx.businessId, deletedAt: null } })
      if (ok !== input.storeIds.length) throw validation("Invalid store selection")
    }
    if (id === ctx.userId && input.status && input.status !== "ACTIVE") throw invalidState("You cannot deactivate your own account")
    const roles = input.role ? await ensureRoles() : null
    return prisma.$transaction(async (tx) => {
      const { storeIds, role, password, ...rest } = input
      const u = await tx.user.update({ where: { id }, data: { ...rest, ...(role ? { roleId: roles!.get(role)! } : {}), ...(password ? { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) } : {}) } })
      if (storeIds) {
        await tx.userStore.deleteMany({ where: { userId: id } })
        await tx.userStore.createMany({ data: storeIds.map((storeId, i) => ({ userId: id, storeId, isDefault: i === 0 })) })
      }
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: role && role !== target.role.name ? "USER_ROLE_CHANGED" : "USER_UPDATED", entityType: "User", entityId: id, metadata: { fields: Object.keys(input).filter((k) => k !== "password"), ...(role ? { from: target.role.name, to: role } : {}) }, ipAddress: ctx.ip }, tx)
      const { passwordHash: _p, ...safe } = u
      return safe
    })
  },
  async deleteUser(ctx: TenantContext, id: string) {
    if (id === ctx.userId) throw invalidState("You cannot delete your own account")
    const target = await prisma.user.findFirst({ where: { id, businessId: ctx.businessId, deletedAt: null }, include: { role: true } })
    if (!target) throw notFound("User")
    if (target.role.name === "OWNER") throw forbidden("Owner accounts cannot be deleted")
    const openReg = await prisma.cashRegister.count({ where: { openedBy: id, status: "OPEN" } })
    if (openReg) throw invalidState("User has an open cash register")
    await prisma.$transaction(async (tx) => {
      // Free the email for reuse while preserving history
      await tx.user.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE", email: `deleted+${id}@${target.email.split("@")[1] ?? "local"}` } })
      await tx.userStore.deleteMany({ where: { userId: id } })
      await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "USER_DELETED", entityType: "User", entityId: id, metadata: { email: target.email }, ipAddress: ctx.ip }, tx)
    })
  },

  async changePassword(ctx: TenantContext, input: { currentPassword: string; newPassword: string }) {
    const u = await prisma.user.findUnique({ where: { id: ctx.userId } })
    if (!u) throw notFound("User")
    if (!(await bcrypt.compare(input.currentPassword, u.passwordHash))) throw new AppError("VALIDATION_ERROR", "Current password is incorrect")
    await prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS) } })
    await writeAuditLog({ businessId: ctx.businessId, userId: ctx.userId, action: "PASSWORD_RESET", entityType: "User", entityId: ctx.userId, ipAddress: ctx.ip })
  },

  // ---------- Password reset (public) ----------
  /**
   * Always resolves successfully to avoid account enumeration. The token is only
   * sent if the email transport is configured; in development the reset link is logged.
   */
  async requestPasswordReset(email: string, ip?: string): Promise<{ delivered: boolean }> {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, businessId: true, deletedAt: true, status: true } })
    if (!user || user.deletedAt || user.status === "SUSPENDED") return { delivered: isEmailConfigured() }
    const token = crypto.randomBytes(32).toString("base64url")
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
    await prisma.passwordResetToken.create({ data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } })
    await writeAuditLog({ businessId: user.businessId, userId: user.id, action: "PASSWORD_RESET_REQUESTED", entityType: "User", entityId: user.id, ipAddress: ip })
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/reset-password?token=${token}`
    const delivered = await sendEmail({ to: email, subject: "RetailOS Morocco – réinitialisation du mot de passe", text: `Pour réinitialiser votre mot de passe, ouvrez ce lien (valable 1 heure) :\n${url}\n\nSi vous n'avez pas demandé cette réinitialisation, ignorez cet email.` })
    return { delivered }
  },

  async resetPassword(token: string, newPassword: string, ip?: string) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } })
    if (!record || record.usedAt || record.expiresAt < new Date()) throw new AppError("VALIDATION_ERROR", "This reset link is invalid or has expired")
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) } })
      await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } })
      await writeAuditLog({ businessId: record.user.businessId, userId: record.userId, action: "PASSWORD_RESET", entityType: "User", entityId: record.userId, ipAddress: ip }, tx)
    })
  },

  async auditLogs(ctx: TenantContext, q: { page: number; pageSize: number; search?: string }) {
    const where = { businessId: ctx.businessId, ...(q.search ? { OR: [{ action: icontains(q.search) }, { entityType: icontains(q.search) }, { entityId: icontains(q.search) }] } : {}) }
    const [total, items] = await Promise.all([prisma.auditLog.count({ where }), prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize })])
    const userIds = [...new Set(items.map((i) => i.userId))]
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
    const map = new Map(users.map((u) => [u.id, u]))
    return { items: items.map((i) => ({ ...i, metadata: i.metadata ? JSON.parse(i.metadata) : null, user: map.get(i.userId) ?? null })), total, page: q.page, pageSize: q.pageSize }
  },
}
