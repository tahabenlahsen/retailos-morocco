/**
 * API smoke test against a running dev server with seeded data.
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3000"

class Client {
  cookies = new Map()
  async fetch(path, init = {}) {
    const headers = new Headers(init.headers ?? {})
    if (this.cookies.size) headers.set("cookie", [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "))
    const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" })
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";")
      const [k, v] = pair.split("=")
      this.cookies.set(k.trim(), v)
    }
    return res
  }
  async json(path, init) {
    const res = await this.fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } })
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }
    return { status: res.status, body }
  }
  async login(email, password) {
    const csrf = await this.json("/api/auth/csrf")
    const form = new URLSearchParams({ csrfToken: csrf.body.csrfToken, email, password, json: "true" })
    const res = await this.fetch("/api/auth/callback/credentials", { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } })
    const session = await this.json("/api/auth/session")
    return { status: res.status, user: session.body?.user }
  }
}

let failures = 0
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`)
  if (!cond) failures++
}

const owner = new Client()
const login = await owner.login("owner@demo.ma", "Demo12345")
check("owner login", login.user?.email === "owner@demo.ma", JSON.stringify(login.user?.roleName))

const me = await owner.json("/api/me")
check("GET /api/me", me.status === 200 && me.body.data.permissions.length > 10, `${me.body.data?.stores?.length} stores`)
const storeId = me.body.data.stores[0].id

const products = await owner.json(`/api/products?storeId=${storeId}&pageSize=50&sortBy=stockQuantity&sortDir=desc`)
check("GET /api/products", products.status === 200 && products.body.data.items.length > 0, `total=${products.body.data?.total}`)
const product = products.body.data.items.find((p) => p.stockQuantity > 5 && p.barcode)

const lookup = await owner.json(`/api/products/lookup?q=${product.barcode}&storeId=${storeId}`)
check("barcode lookup exact", lookup.body.data?.exact === true && lookup.body.data.items[0].id === product.id)

const dash = await owner.json("/api/analytics/dashboard?preset=last30")
check("GET dashboard", dash.status === 200 && typeof dash.body.data.kpis.revenue.value === "number", `revenue=${dash.body.data?.kpis?.revenue?.value}`)

const pnl = await owner.json("/api/analytics/pnl?preset=thisMonth")
check("P&L math: net = gross - expenses", pnl.status === 200 && Math.abs(pnl.body.data.grossProfit - pnl.body.data.totalExpenses - pnl.body.data.netProfit) < 0.01)

// Register
const reg = await owner.json(`/api/register?storeId=${storeId}`)
check("register open (seed)", reg.status === 200 && reg.body.data?.status === "OPEN")

// Sale with split payment + idempotency
const key = `smoke-${Date.now()}`
const salePayload = { storeId, items: [{ productId: product.id, quantity: 2, discount: 0 }], discountAmount: 0, payments: [], idempotencyKey: key }
const expectedTotal = Math.round(product.sellingPrice * 2 * 100) / 100
salePayload.payments = [{ method: "CASH", amount: Math.round(expectedTotal * 0.5 * 100) / 100 }, { method: "CARD", amount: Math.round((expectedTotal - Math.round(expectedTotal * 0.5 * 100) / 100) * 100) / 100, reference: "TPE-001" }]
const sale = await owner.json("/api/sales", { method: "POST", body: JSON.stringify(salePayload) })
check("POST /api/sales (split payment)", sale.status === 201 && sale.body.data.total === expectedTotal, `status=${sale.status} ${JSON.stringify(sale.body.error ?? "")}`)
const dup = await owner.json("/api/sales", { method: "POST", body: JSON.stringify(salePayload) })
check("idempotent duplicate returns same sale", dup.status === 200 && dup.body.data.id === sale.body.data.id)
const after = await owner.json(`/api/products/${product.id}`)
check("stock decremented by 2", after.body.data.stockQuantity === product.stockQuantity - 2, `${product.stockQuantity} -> ${after.body.data.stockQuantity}`)

// Payment mismatch rejected
const bad = await owner.json("/api/sales", { method: "POST", body: JSON.stringify({ ...salePayload, idempotencyKey: key + "-bad", payments: [{ method: "CASH", amount: 1 }] }) })
check("payment mismatch rejected", bad.status === 400 && bad.body.error.code === "PAYMENT_MISMATCH")

// Insufficient stock rejected, and stock unchanged (atomicity)
const huge = await owner.json("/api/sales", { method: "POST", body: JSON.stringify({ ...salePayload, idempotencyKey: key + "-huge", items: [{ productId: product.id, quantity: 100000, discount: 0 }], payments: [{ method: "CASH", amount: Math.round(product.sellingPrice * 100000 * 100) / 100 }] }) })
check("insufficient stock rejected", huge.status === 409 && huge.body.error.code === "INSUFFICIENT_STOCK")
const after2 = await owner.json(`/api/products/${product.id}`)
check("stock unchanged after failed sale", after2.body.data.stockQuantity === after.body.data.stockQuantity)

// Partial refund
const saleItem = sale.body.data.items[0]
const refund = await owner.json(`/api/sales/${sale.body.data.id}/refund`, { method: "POST", body: JSON.stringify({ items: [{ saleItemId: saleItem.id, quantity: 1 }], reason: "smoke test", paymentMethod: "CASH", restock: true }) })
check("partial refund", refund.status === 201 && Math.abs(refund.body.data.amount - product.sellingPrice) < 0.01, JSON.stringify(refund.body.error ?? refund.body.data?.amount))
const after3 = await owner.json(`/api/products/${product.id}`)
check("refund restocked 1", after3.body.data.stockQuantity === after.body.data.stockQuantity + 1)
const saleAfter = await owner.json(`/api/sales/${sale.body.data.id}`)
check("sale status PARTIALLY_REFUNDED", saleAfter.body.data.status === "PARTIALLY_REFUNDED")

// Movements recorded
const mov = await owner.json(`/api/inventory/movements?productId=${product.id}&pageSize=10`)
const hasReturn = mov.body.data.items.some((m) => m.type === "RETURN")
const hasSale = mov.body.data.items.some((m) => m.type === "SALE")
check("inventory movements recorded", hasReturn && hasSale, `types=${mov.body.data.items.map((m) => m.type).join(",")}`)

// AI
const ai = await owner.json("/api/ai", { method: "POST", body: JSON.stringify({ question: "Quel produit se vend le plus ce mois ?", locale: "fr" }) })
check("AI intent TOP_PRODUCTS", ai.status === 200 && ai.body.data.intent === "TOP_PRODUCTS" && ai.body.data.answer.length > 10)
const ai2 = await owner.json("/api/ai", { method: "POST", body: JSON.stringify({ question: "شنو خاصني نشري من supplier؟", locale: "ar" }) })
check("AI intent REORDER (darija)", ai2.body.data?.intent === "REORDER")

// Planner
const plan = await owner.json("/api/planner", { method: "POST", body: JSON.stringify({ budget: 150000, businessType: "MINI_MARKET", city: "Casablanca", storeSizeM2: 40, expectedDailyCustomers: 120, employees: 1 }) })
check("planner", plan.status === 200 && plan.body.data.projection.breakEvenCustomersPerDay > 0)

// ---------- Tenant isolation ----------
const other = new Client()
await other.login("owner@boutique.ma", "Demo12345")
const cross1 = await other.json(`/api/products/${product.id}`)
check("ISOLATION: other business cannot read product", cross1.status === 404)
const cross2 = await other.json(`/api/sales/${sale.body.data.id}`)
check("ISOLATION: other business cannot read sale", cross2.status === 404)
const cross3 = await other.json(`/api/products?storeId=${storeId}`)
check("ISOLATION: other business cannot list store products", cross3.status === 403)
const cross4 = await other.json("/api/sales", { method: "POST", body: JSON.stringify({ ...salePayload, idempotencyKey: key + "-cross" }) })
check("ISOLATION: other business cannot sell from foreign store", cross4.status === 403 || cross4.status === 400)
const cross5 = await other.json(`/api/sales/${sale.body.data.id}/refund`, { method: "POST", body: JSON.stringify({ items: [{ saleItemId: saleItem.id, quantity: 1 }], reason: "cross-tenant attempt", paymentMethod: "CASH", restock: true }) })
check("ISOLATION: other business cannot refund foreign sale", cross5.status === 404)
const otherDash = await other.json("/api/analytics/dashboard?preset=last30")
check("ISOLATION: dashboards differ", otherDash.body.data.kpis.revenue.value !== dash.body.data.kpis.revenue.value)

// ---------- RBAC ----------
const cashier = new Client()
await cashier.login("cashier@demo.ma", "Demo12345")
const c1 = await cashier.json(`/api/products/${product.id}`, { method: "DELETE" })
check("RBAC: cashier cannot delete product", c1.status === 403)
const c2 = await cashier.json("/api/business", { method: "PATCH", body: JSON.stringify({ name: "hack" }) })
check("RBAC: cashier cannot update business", c2.status === 403)
const c3 = await cashier.json("/api/analytics/pnl?preset=today")
check("RBAC: cashier cannot view P&L", c3.status === 403)
const c4 = await cashier.json("/api/sales", { method: "POST", body: JSON.stringify({ ...salePayload, idempotencyKey: key + "-cashier", items: [{ productId: product.id, quantity: 1, unitPrice: 0.01, discount: 0 }], payments: [{ method: "CASH", amount: 0.01 }] }) })
check("RBAC: cashier cannot override price", c4.status === 403)
const c5 = await cashier.json("/api/sales", { method: "POST", body: JSON.stringify({ ...salePayload, idempotencyKey: key + "-cashier2", items: [{ productId: product.id, quantity: 1, discount: 0 }], payments: [{ method: "CASH", amount: product.sellingPrice }] }) })
check("RBAC: cashier can sell", c5.status === 201)

// Unauthenticated
const anon = new Client()
const a1 = await anon.json("/api/products")
check("anon rejected", a1.status === 401)

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`)
process.exit(failures ? 1 : 0)
