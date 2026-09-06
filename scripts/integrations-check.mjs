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
const r = await (await f("/api/integrations")).json()
console.log(JSON.stringify(r.data, null, 2))
const leak = JSON.stringify(r).match(/sk-[A-Za-z0-9]{10,}|postgresql:\/\/|redis:\/\/|password/i)
console.log(leak ? `FAIL secret-like content in response: ${leak[0]}` : "PASS no secrets in response")
const page = await (await f("/settings?tab=integrations")).text()
console.log(/Application error|__next_error__/.test(page) ? "FAIL settings page error" : "PASS settings page renders")
const cashier = new Map()
process.exit(leak ? 1 : 0)
