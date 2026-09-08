import type { LucideIcon } from "lucide-react"
import { LayoutDashboard, ShoppingCart, Package, Boxes, Receipt, Truck, Factory, Users, Wallet, BarChart3, Sparkles, UserCog, Store, Settings, Banknote, Compass, QrCode } from "lucide-react"
import type { Permission } from "@/lib/permissions"

export interface NavItem {
  key: string
  href: string
  icon: LucideIcon
  permission?: Permission
  /** Show in bottom mobile bar */
  mobile?: boolean
}

export const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "analytics.view", mobile: true },
  { key: "pos", href: "/pos", icon: ShoppingCart, permission: "sale.create", mobile: true },
  { key: "register", href: "/cash-register", icon: Banknote, permission: "register.open" },
  { key: "sales", href: "/sales", icon: Receipt, permission: "sale.view", mobile: true },
  { key: "products", href: "/products", icon: Package, permission: "product.view", mobile: true },
  { key: "inventory", href: "/inventory", icon: Boxes, permission: "inventory.view" },
  { key: "barcode-labels", href: "/barcode-labels", icon: QrCode, permission: "product.view" },
  { key: "purchases", href: "/purchases", icon: Truck, permission: "purchase.view" },
  { key: "suppliers", href: "/suppliers", icon: Factory, permission: "supplier.view" },
  { key: "customers", href: "/customers", icon: Users, permission: "customer.view" },
  { key: "expenses", href: "/expenses", icon: Wallet, permission: "expense.view" },
  { key: "analytics", href: "/analytics", icon: BarChart3, permission: "analytics.view" },
  { key: "ai", href: "/ai", icon: Sparkles, permission: "ai.use" },
  { key: "planner", href: "/store-planner", icon: Compass, permission: "business.view" },
  { key: "employees", href: "/employees", icon: UserCog, permission: "user.view" },
  { key: "stores", href: "/stores", icon: Store, permission: "store.view" },
  { key: "settings", href: "/settings", icon: Settings, permission: "business.view" },
]

/** First route a user can access — used as post-login landing. */
export function landingFor(permissions: Permission[]): string {
  return NAV.find((n) => !n.permission || permissions.includes(n.permission))?.href ?? "/settings"
}
