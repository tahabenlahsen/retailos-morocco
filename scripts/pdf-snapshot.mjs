/**
 * Renders local PDFs to PNG for visual inspection using Edge/Chrome's built-in PDF viewer
 * (headless=new keeps the viewer enabled; classic headless just downloads PDFs).
 * Usage: node scripts/pdf-snapshot.mjs tmp-exports/pnl.pdf [more.pdf…]
 */
import { chromium } from "@playwright/test"
import { resolve } from "node:path"
const files = process.argv.slice(2)
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--headless=new"] })
for (const file of files) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
  await page.goto("file:///" + resolve(file).replace(/\\/g, "/"), { waitUntil: "load" })
  await page.waitForTimeout(2500)
  const out = file.replace(/\.pdf$/, ".png")
  await page.screenshot({ path: out })
  console.log("wrote", out)
  await page.close()
}
await browser.close()
