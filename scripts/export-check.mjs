/** Verifies PDF/CSV exports: valid PDFs for every report + receipt, CSV with BOM, RBAC, isolation, Arabic font embedding. */
import { writeFileSync, mkdirSync } from "node:fs"
const BASE = process.argv[2] ?? "http://localhost:3000"
function session(locale) {
  const cookies = new Map()
  if (locale) cookies.set("retailos_locale", locale)
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
mkdirSync("tmp-exports", { recursive: true })

const owner = session("fr"); await login(owner, "owner@demo.ma")
const reports = ["pnl", "sales", "inventory", "customers", "top-products", "payments", "receivables"]
for (const r of reports) {
  const res = await owner(`/api/exports/${r}?preset=last30&format=pdf${r === "sales" ? "&groupBy=category" : ""}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const isPdf = buf.subarray(0, 5).toString() === "%PDF-" && buf.subarray(buf.length - 6).toString().includes("%%EOF")
  const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length
  check(`PDF ${r}`, res.status === 200 && res.headers.get("content-type") === "application/pdf" && isPdf && pages >= 1, `→ ${res.status} ${buf.length} bytes, ${pages} page(s), ${res.headers.get("content-disposition")}`)
  writeFileSync(`tmp-exports/${r}.pdf`, buf)
  const csv = await owner(`/api/exports/${r}?preset=last30&format=csv`)
  const raw = Buffer.from(await csv.arrayBuffer())
  const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf // fetch().text() strips the BOM, so inspect bytes
  const lines = raw.toString("utf8").split("\r\n").length
  check(`CSV ${r}`, csv.status === 200 && hasBom && lines >= 2 && csv.headers.get("content-type")?.startsWith("text/csv"), `→ ${lines} lines, BOM=${hasBom}`)
}

// Receipt PDF (latest sale) + Arabic locale variant embeds Amiri
const sales = (await (await owner("/api/sales?pageSize=1")).json()).data.items
const rec = await owner(`/api/sales/${sales[0].id}/receipt`)
const recBuf = Buffer.from(await rec.arrayBuffer())
check("receipt PDF inline", rec.status === 200 && recBuf.subarray(0, 5).toString() === "%PDF-" && rec.headers.get("content-disposition")?.startsWith("inline"), `→ ${recBuf.length} bytes`)
writeFileSync("tmp-exports/receipt.pdf", recBuf)
const ar = session("ar"); await login(ar, "owner@demo.ma")
const arPdf = Buffer.from(await (await ar("/api/exports/pnl?preset=last30")).arrayBuffer())
check("Arabic PDF embeds Amiri font", /Amiri/.test(arPdf.toString("latin1")), `→ ${arPdf.length} bytes`)
writeFileSync("tmp-exports/pnl-ar.pdf", arPdf)
const en = session("en"); await login(en, "owner@demo.ma")
const enCsv = await (await en("/api/exports/pnl?preset=last30&format=csv")).text()
check("English CSV is localised", /Gross revenue/.test(enCsv))

// RBAC: cashier has no analytics.view
const cashier = session("fr"); await login(cashier, "cashier@demo.ma")
check("cashier cannot export reports (403)", (await cashier("/api/exports/pnl?preset=last30")).status === 403)
check("unknown report → 404", (await owner("/api/exports/nope?preset=last30")).status === 404)
check("bad format → 400", (await owner("/api/exports/pnl?preset=last30&format=docx")).status === 400)
// Isolation: other tenant cannot fetch this sale's receipt
const other = session("fr"); await login(other, "owner@boutique.ma")
check("other business cannot fetch receipt (404)", (await other(`/api/sales/${sales[0].id}/receipt`)).status === 404)
console.log(fail ? `${fail} FAILED` : "ALL PASSED")
process.exit(fail ? 1 : 0)
