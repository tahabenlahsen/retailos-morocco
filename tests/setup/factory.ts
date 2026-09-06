import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import type { TenantContext } from "@/lib/api"
import { ensureRoles } from "@/services/business.service"
import { SYSTEM_EXPENSE_CATEGORIES } from "@/services/expense.service"

let counter = 0
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export interface TestBusiness {
  businessId: string
  storeId: string
  store2Id: string
  ownerId: string
  cashierId: string
  categoryId: string
  supplierId: string
  customerId: string
  expenseCategoryId: string
  ctx: (role?: string, userId?: string, storeIds?: string[]) => TenantContext
}

/** Creates a fully-formed business with 2 stores, an owner, a cashier, a category, a supplier and a customer. */
export async function createBusiness(name = "Test Biz"): Promise<TestBusiness> {
  const roles = await ensureRoles()
  const tag = uid()
  const hash = await bcrypt.hash("Test12345", 4)
  const business = await prisma.business.create({ data: { name: `${name} ${tag}`, type: "MINI_MARKET", ownerName: "Owner", phone: "+212600000000", email: `owner-${tag}@test.ma`, city: "Casablanca", status: "ACTIVE", onboarded: true } })
  const store = await prisma.store.create({ data: { name: "Store A", city: "Casablanca", businessId: business.id } })
  const store2 = await prisma.store.create({ data: { name: "Store B", city: "Rabat", businessId: business.id } })
  const owner = await prisma.user.create({ data: { email: `owner-${tag}@test.ma`, passwordHash: hash, firstName: "Own", lastName: "Er", businessId: business.id, roleId: roles.get("OWNER")! } })
  const cashier = await prisma.user.create({ data: { email: `cashier-${tag}@test.ma`, passwordHash: hash, firstName: "Cash", lastName: "Ier", businessId: business.id, roleId: roles.get("CASHIER")! } })
  await prisma.userStore.createMany({ data: [{ userId: owner.id, storeId: store.id, isDefault: true }, { userId: owner.id, storeId: store2.id }, { userId: cashier.id, storeId: store.id, isDefault: true }] })
  const category = await prisma.category.create({ data: { name: "General", businessId: business.id } })
  const supplier = await prisma.supplier.create({ data: { name: `Supplier ${tag}`, businessId: business.id } })
  const customer = await prisma.customer.create({ data: { name: "Client Test", phone: `+2126${tag.slice(-8)}`, businessId: business.id } })
  const expCat = await prisma.expenseCategory.create({ data: { name: SYSTEM_EXPENSE_CATEGORIES[0].name, code: SYSTEM_EXPENSE_CATEGORIES[0].code, businessId: business.id } })

  const ctx = (role = "OWNER", userId = owner.id, storeIds = [store.id, store2.id]): TenantContext => ({ userId, businessId: business.id, role, storeIds, ip: "127.0.0.1" })
  return { businessId: business.id, storeId: store.id, store2Id: store2.id, ownerId: owner.id, cashierId: cashier.id, categoryId: category.id, supplierId: supplier.id, customerId: customer.id, expenseCategoryId: expCat.id, ctx }
}

export async function createProduct(b: TestBusiness, overrides: Partial<{ name: string; sku: string; barcode: string; purchasePrice: number; sellingPrice: number; stockQuantity: number; minimumStock: number; taxRate: number; storeId: string }> = {}) {
  const tag = uid()
  return prisma.product.create({
    data: {
      name: overrides.name ?? `Product ${tag}`,
      sku: overrides.sku ?? `SKU-${tag}`,
      barcode: overrides.barcode ?? `BC${tag}`,
      purchasePrice: overrides.purchasePrice ?? 10,
      costPrice: overrides.purchasePrice ?? 10,
      sellingPrice: overrides.sellingPrice ?? 15,
      taxRate: overrides.taxRate ?? 0.2,
      stockQuantity: overrides.stockQuantity ?? 100,
      minimumStock: overrides.minimumStock ?? 5,
      businessId: b.businessId,
      storeId: overrides.storeId ?? b.storeId,
      categoryId: b.categoryId,
      supplierId: b.supplierId,
    },
  })
}

export async function openRegister(b: TestBusiness, openingBalance = 500, storeId = b.storeId) {
  return prisma.cashRegister.create({ data: { name: "R1", openingBalance, status: "OPEN", openedBy: b.ownerId, businessId: b.businessId, storeId } })
}
