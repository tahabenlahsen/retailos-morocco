/**
 * Role-based permission matrix.
 *
 * Roles are system-defined and permissions are versioned with the code so that
 * authorization behaviour is deterministic and testable.
 */

export const ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "INVENTORY_MANAGER",
  "ACCOUNTANT",
] as const

export type RoleName = (typeof ROLES)[number]

export const PERMISSIONS = [
  // Business / settings
  "business.view",
  "business.update",
  "store.view",
  "store.create",
  "store.update",
  "store.delete",
  "user.view",
  "user.create",
  "user.update",
  "user.delete",
  // Products
  "product.view",
  "product.create",
  "product.update",
  "product.delete",
  "product.import",
  "product.bulkUpdate",
  "category.manage",
  // Inventory
  "inventory.view",
  "inventory.adjust",
  "inventory.transfer",
  // Sales / POS
  "sale.view",
  "sale.create",
  "sale.refund",
  "sale.cancel",
  "register.open",
  "register.close",
  "register.transaction",
  "register.viewAll",
  // Purchases / suppliers
  "purchase.view",
  "purchase.create",
  "purchase.update",
  "purchase.receive",
  "purchase.cancel",
  "supplier.view",
  "supplier.manage",
  // Customers
  "customer.view",
  "customer.manage",
  // Expenses
  "expense.view",
  "expense.create",
  "expense.update",
  "expense.delete",
  // Reports / analytics / AI
  "analytics.view",
  "ai.use",
  "audit.view",
  "notification.view",
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ALL: Permission[] = [...PERMISSIONS]

const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => !["business.update", "store.delete"].includes(p)),
  MANAGER: [
    "business.view",
    "store.view",
    "user.view",
    "product.view",
    "product.create",
    "product.update",
    "product.import",
    "product.bulkUpdate",
    "category.manage",
    "inventory.view",
    "inventory.adjust",
    "inventory.transfer",
    "sale.view",
    "sale.create",
    "sale.refund",
    "sale.cancel",
    "register.open",
    "register.close",
    "register.transaction",
    "register.viewAll",
    "purchase.view",
    "purchase.create",
    "purchase.update",
    "purchase.receive",
    "supplier.view",
    "supplier.manage",
    "customer.view",
    "customer.manage",
    "expense.view",
    "expense.create",
    "analytics.view",
    "ai.use",
    "notification.view",
  ],
  CASHIER: [
    "business.view",
    "store.view",
    "product.view",
    "sale.view",
    "sale.create",
    "register.open",
    "register.close",
    "register.transaction",
    "customer.view",
    "customer.manage",
    "notification.view",
  ],
  INVENTORY_MANAGER: [
    "business.view",
    "store.view",
    "product.view",
    "product.create",
    "product.update",
    "product.import",
    "product.bulkUpdate",
    "category.manage",
    "inventory.view",
    "inventory.adjust",
    "inventory.transfer",
    "purchase.view",
    "purchase.create",
    "purchase.update",
    "purchase.receive",
    "supplier.view",
    "supplier.manage",
    "notification.view",
  ],
  ACCOUNTANT: [
    "business.view",
    "store.view",
    "product.view",
    "sale.view",
    "register.viewAll",
    "purchase.view",
    "supplier.view",
    "customer.view",
    "expense.view",
    "expense.create",
    "expense.update",
    "analytics.view",
    "ai.use",
    "audit.view",
    "notification.view",
  ],
}

export function isRole(value: string): value is RoleName {
  return (ROLES as readonly string[]).includes(value)
}

export function getPermissions(role: string): Permission[] {
  return isRole(role) ? ROLE_PERMISSIONS[role] : []
}

export function hasPermission(role: string, permission: Permission): boolean {
  return getPermissions(role).includes(permission)
}

/** Roles a given role is allowed to assign to other users. */
export function assignableRoles(role: string): RoleName[] {
  if (role === "OWNER") return [...ROLES]
  if (role === "ADMIN") return ROLES.filter((r) => r !== "OWNER")
  return []
}
