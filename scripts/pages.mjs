/** Fetch every app page as an authenticated owner and check for 200 + no error markers. */
const BASE = process.argv[2] ?? "http://localhost:3000"
const cookies = new Map()
async function f(path, init = {}) {
  const headers = new Headers(init.headers ?? {})
  if (cookies.size) headers.set("cookie", [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "))
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" })
  for (const sc of res.headers.getSetCookie?.() ?? []) { const [pair] = sc.split(";"); const [k, v] = pair.split("="); cookies.set(k.trim(), v) }
  return res
}
const csrf = await (await f("/api/auth/csrf")).json()
await f("/api/auth/callback/credentials", { method: "POST", body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: process.argv[3] ?? "owner@demo.ma", password: "Demo12345", json: "true" }), headers: { "content-type": "application/x-www-form-urlencoded" } })

const sale = await (await f("/api/sales?pageSize=1")).json()
const po = await (await f("/api/purchases?pageSize=1")).json()
const sup = await (await f("/api/suppliers?pageSize=1")).json()
const cust = await (await f("/api/customers?pageSize=1")).json()

const pages = ["/", "/dashboard", "/pos", "/cash-register", "/sales", `/sales/${sale.data?.items?.[0]?.id}`, "/products", "/inventory", "/inventory?tab=reorder", "/purchases", "/purchases/new", `/purchases/${po.data?.items?.[0]?.id}`, "/suppliers", `/suppliers/${sup.data?.items?.[0]?.id}`, "/customers", `/customers/${cust.data?.items?.[0]?.id}`, "/expenses", "/analytics", "/ai", "/store-planner", "/notifications", "/employees", "/stores", "/settings", "/settings?tab=audit", "/auth/signin", "/does-not-exist"]
let fail = 0
for (const p of pages) {
  const res = await f(p)
  const html = await res.text()
  const status = res.status
  const loc = res.headers.get("location")
  const bad = /Application error|Unhandled Runtime Error|__next_error__|createContext only works/i.test(html)
  const ok = p === "/does-not-exist" ? status === 404 : p === "/" ? status === 307 || status === 200 : p === "/auth/signin" ? status === 307 : status === 200 && !bad
  if (!ok) fail++
  console.log(`${ok ? "PASS" : "FAIL"}  ${status}${loc ? ` -> ${loc}` : ""}  ${p}${bad ? "  (error markup)" : ""}`)
}
console.log(fail ? `${fail} FAILED` : "ALL PAGES OK")
process.exit(fail ? 1 : 0)
