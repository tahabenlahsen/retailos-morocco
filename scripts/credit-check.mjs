/** End-to-end API check of credit ("crédit") sales: sell on account, repay, register impact. */
const BASE = process.argv[2] ?? "http://localhost:3000"
function session() {
  const cookies = new Map()
  return async function f(path, init = {}) {
    const headers = new Headers(init.headers ?? {})
    if (init.body && typeof init.body === "string") headers.set("content-type", "application/json")
    if (cookies.size) headers.set("cookie", [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "))
    const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" })
    for (const sc of res.headers.getSetCookie?.() ?? []) { const [pair] = sc.split(";"); const [k, v] = pair.split("="); cookies.set(k.trim(), v) }
    return res
  }
}
async function login(f, email) {
  const csrf = await (await f("/api/auth/csrf")).json()
  await f("/api/auth/callback/credentials", { method: "POST", body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password: "Demo12345", json: "true" }), headers: { "content-type": "application/x-www-form-urlencoded" } })
}
let fail = 0
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); if (!ok) fail++ }
const j = async (r) => ({ status: r.status, ...(await r.json()) })

const owner = session(); await login(owner, "owner@demo.ma")
const cashier = session(); await login(cashier, "cashier@demo.ma")

const me = (await j(await owner("/api/me"))).data
const storeId = me.stores[0].id
const customers = (await j(await owner("/api/customers?search=Ahmed"))).data.items
const ahmed = customers[0]
check("seeded credit customer exists with a limit and a balance", ahmed && ahmed.creditLimit === 500 && ahmed.outstandingBalance > 0, `→ limit=${ahmed?.creditLimit} balance=${ahmed?.outstandingBalance}`)
const startBalance = ahmed.outstandingBalance

// Register must be open for cash parts; ensure one is open
let reg = (await j(await owner(`/api/register?storeId=${storeId}`))).data
if (!reg) reg = (await j(await owner("/api/register", { method: "POST", body: JSON.stringify({ storeId, openingBalance: 300 }) }))).data
const expectedBefore = (await j(await owner(`/api/register/${reg.id}`))).data.summary.expected

const products = (await j(await owner(`/api/products?storeId=${storeId}&pageSize=100`))).data.items
// Pick the product whose stock value is largest so that an over-limit quantity is possible
const p = products.filter((x) => x.stockQuantity > 5).sort((a, b) => b.sellingPrice * b.stockQuantity - a.sellingPrice * a.stockQuantity)[0]
const price = p.sellingPrice
const r2 = (n) => Math.round(n * 100) / 100

// 1. cashier sells 1 unit on credit
const s1 = await j(await cashier("/api/sales", { method: "POST", body: JSON.stringify({ storeId, items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, customerId: ahmed.id, payments: [{ amount: price, method: "CREDIT" }], idempotencyKey: `credit-${Date.now()}` }) }))
check("cashier can sell on credit", s1.status === 201 && s1.data.paymentStatus === "PENDING", `→ ${s1.status} ${s1.data?.saleNumber ?? s1.error?.code}`)

// 2. credit without customer is rejected
const s2 = await j(await cashier("/api/sales", { method: "POST", body: JSON.stringify({ storeId, items: [{ productId: p.id, quantity: 1, discount: 0 }], discountAmount: 0, payments: [{ amount: price, method: "CREDIT" }], idempotencyKey: `credit-nocust-${Date.now()}` }) }))
check("credit without customer rejected (400)", s2.status === 400, `→ ${s2.status} ${s2.error?.code}`)

// 3. over the limit is rejected with available amount (basket across products until it exceeds the available credit)
const available = ahmed.creditLimit - (startBalance + price)
const basket = []
let basketTotal = 0
for (const x of products.filter((x) => x.stockQuantity > 2 && x.id !== p.id)) {
  const qty = x.stockQuantity - 2
  basket.push({ productId: x.id, quantity: qty, discount: 0 })
  basketTotal = r2(basketTotal + qty * x.sellingPrice)
  if (basketTotal > available + 1) break
}
check("basket exceeds the available credit", basketTotal > available, `→ basket=${basketTotal} available=${r2(available)}`)
const s3 = await j(await cashier("/api/sales", { method: "POST", body: JSON.stringify({ storeId, items: basket, discountAmount: 0, customerId: ahmed.id, payments: [{ amount: basketTotal, method: "CREDIT" }], idempotencyKey: `credit-over-${Date.now()}` }) }))
check("over-limit credit rejected with CREDIT_LIMIT_EXCEEDED", s3.status === 409 && s3.error?.code === "CREDIT_LIMIT_EXCEEDED" && typeof s3.error?.details?.available === "number", `→ ${s3.status} ${s3.error?.code} available=${s3.error?.details?.available}`)

// 4. balance reflects the sale
const after = (await j(await owner(`/api/customers/${ahmed.id}`))).data
check("customer balance increased by the credit amount", Math.abs(after.outstandingBalance - (startBalance + price)) < 0.01, `→ ${after.outstandingBalance}`)
check("receivables endpoint lists the debtor", (await j(await owner("/api/customers/receivables"))).data.debtors.some((d) => d.id === ahmed.id))

// 5. cashier cannot change the credit limit, owner can
const lim1 = await j(await cashier(`/api/customers/${ahmed.id}`, { method: "PATCH", body: JSON.stringify({ creditLimit: 99999 }) }))
check("cashier cannot change credit limit (403)", lim1.status === 403, `→ ${lim1.status}`)
const lim2 = await j(await owner(`/api/customers/${ahmed.id}`, { method: "PATCH", body: JSON.stringify({ creditLimit: 500 }) }))
check("owner can set credit limit", lim2.status === 200 && lim2.data.creditLimit === 500)

// 6. cash repayment → balance down, register up
const pay = await j(await cashier(`/api/customers/${ahmed.id}/payments`, { method: "POST", body: JSON.stringify({ amount: price, method: "CASH", storeId }) }))
check("cash repayment recorded", pay.status === 201 && Math.abs(pay.data.outstandingBalance - startBalance) < 0.01, `→ ${pay.status} balance=${pay.data?.outstandingBalance}`)
const expectedAfter = (await j(await owner(`/api/register/${reg.id}`))).data.summary
check("register expected cash increased by the repayment", Math.abs(expectedAfter.expected - (expectedBefore + price)) < 0.01 && expectedAfter.customerPayments >= price, `→ ${expectedBefore} → ${expectedAfter.expected}`)

// 7. over-repayment rejected
const over = await j(await cashier(`/api/customers/${ahmed.id}/payments`, { method: "POST", body: JSON.stringify({ amount: 100000, method: "BANK_TRANSFER" }) }))
check("repayment above balance rejected (400)", over.status === 400, `→ ${over.status}`)

// 8. other tenant cannot touch this customer
const other = session(); await login(other, "owner@boutique.ma")
const iso = await j(await other(`/api/customers/${ahmed.id}/payments`, { method: "POST", body: JSON.stringify({ amount: 1, method: "BANK_TRANSFER" }) }))
check("other business cannot record payments for this customer (404)", iso.status === 404, `→ ${iso.status}`)

// 9. pages render
for (const path of [`/customers/${ahmed.id}`, `/sales/${s1.data.id}`, "/customers"]) {
  const html = await (await owner(path)).text()
  check(`page ${path} renders`, !/Application error|__next_error__/.test(html))
}
console.log(fail ? `${fail} FAILED` : "ALL PASSED")
process.exit(fail ? 1 : 0)
