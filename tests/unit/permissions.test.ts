import { describe, expect, it } from "vitest"
import { assignableRoles, getPermissions, hasPermission, PERMISSIONS, ROLES } from "@/lib/permissions"

describe("permissions", () => {
  it("owner has every permission", () => {
    expect(getPermissions("OWNER")).toHaveLength(PERMISSIONS.length)
  })
  it("cashier: can sell and use register, cannot delete products or change settings", () => {
    expect(hasPermission("CASHIER", "sale.create")).toBe(true)
    expect(hasPermission("CASHIER", "register.open")).toBe(true)
    expect(hasPermission("CASHIER", "product.delete")).toBe(false)
    expect(hasPermission("CASHIER", "business.update")).toBe(false)
    expect(hasPermission("CASHIER", "analytics.view")).toBe(false)
    expect(hasPermission("CASHIER", "product.update")).toBe(false) // no price override
  })
  it("manager: sales + inventory + reports, but not user management", () => {
    expect(hasPermission("MANAGER", "inventory.adjust")).toBe(true)
    expect(hasPermission("MANAGER", "analytics.view")).toBe(true)
    expect(hasPermission("MANAGER", "sale.refund")).toBe(true)
    expect(hasPermission("MANAGER", "user.create")).toBe(false)
    expect(hasPermission("MANAGER", "product.delete")).toBe(false)
  })
  it("admin lacks only owner-critical permissions", () => {
    expect(hasPermission("ADMIN", "business.update")).toBe(false)
    expect(hasPermission("ADMIN", "store.delete")).toBe(false)
    expect(hasPermission("ADMIN", "user.create")).toBe(true)
  })
  it("accountant is read-only except expenses", () => {
    expect(hasPermission("ACCOUNTANT", "expense.create")).toBe(true)
    expect(hasPermission("ACCOUNTANT", "sale.create")).toBe(false)
    expect(hasPermission("ACCOUNTANT", "audit.view")).toBe(true)
  })
  it("unknown roles have no permissions", () => {
    expect(getPermissions("HACKER")).toEqual([])
    expect(hasPermission("", "sale.view")).toBe(false)
  })
  it("assignable roles are hierarchical", () => {
    expect(assignableRoles("OWNER")).toEqual([...ROLES])
    expect(assignableRoles("ADMIN")).not.toContain("OWNER")
    expect(assignableRoles("MANAGER")).toEqual([])
  })
})
