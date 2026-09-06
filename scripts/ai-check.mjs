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
for (const [q, locale] of [["Quel produit se vend le plus ce mois ?", "fr"], ["شنو خاصني نشري من supplier؟", "ar"]]) {
  const t0 = Date.now()
  const r = await (await f("/api/ai", { method: "POST", body: JSON.stringify({ question: q, locale }), headers: { "content-type": "application/json" } })).json()
  console.log(`\n[${locale}] ${q}\n  intent=${r.data?.intent} source=${r.data?.source} (${Date.now() - t0}ms)\n  ${String(r.data?.answer).slice(0, 400).replace(/\n/g, "\n  ")}`)
}
