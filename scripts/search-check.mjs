/** Checks that text search is case-insensitive on the active database provider. */
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
await f("/api/auth/callback/credentials", { method: "POST", body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "owner@demo.ma", password: "Demo12345", json: "true" }), headers: { "content-type": "application/x-www-form-urlencoded" } })
let fail = 0
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); if (!ok) fail++ }
for (const [path, label] of [["/api/products?search=coca", "products search lower-case"], ["/api/products?search=COCA", "products search upper-case"], ["/api/products/lookup?q=coca", "POS lookup lower-case"], ["/api/customers?search=ahmed", "customers search"], ["/api/suppliers?search=DANONE", "suppliers search upper-case"]]) {
  const r = await (await f(path)).json()
  const items = r.data?.items ?? []
  check(label, items.length > 0, `→ ${items.length} result(s)`)
}
console.log(fail ? `${fail} FAILED` : "ALL PASSED")
process.exit(fail ? 1 : 0)
