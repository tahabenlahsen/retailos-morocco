import { test, expect, type Page } from "@playwright/test"

async function login(page: Page, email: string, password = "Demo12345") {
  await page.goto("/auth/signin")
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/mot de passe|password/i).fill(password)
  await page.getByRole("button", { name: /se connecter|sign in/i }).click()
  await page.waitForURL(/\/(dashboard|pos)/)
}

async function waitForCatalog(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve) => {
    const req = indexedDB.open("retailos-pos")
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("catalog")) { db.close(); resolve(0); return }
      const transaction = db.transaction("catalog")
      const records = transaction.objectStore("catalog").getAllKeys()
      transaction.oncomplete = () => { db.close(); resolve(records.result.length) }
      transaction.onerror = () => { db.close(); resolve(0) }
    }
    req.onerror = () => resolve(0)
  })), { timeout: 15_000 }).toBeGreaterThan(0)
}

test.describe("offline POS", () => {
  test("a sale taken offline is queued with a provisional receipt, then synced when back online", async ({ page, context }) => {
    test.setTimeout(120_000)
    await login(page, "owner@demo.ma")
    await page.goto("/pos")
    const search = page.getByPlaceholder(/scanner|scan/i)
    await expect(search).toBeVisible()
    // Let the POS download the local catalogue (needed for offline scanning).
    await waitForCatalog(page)

    // --- go offline ---
    await context.setOffline(true)
    await expect(page.getByTestId("pos-offline-badge")).toBeVisible()

    // Scan a barcode: served from the local catalogue
    await search.fill("5449000000996")
    await search.press("Enter")
    await expect(page.getByText("Coca-Cola 33cl").first()).toBeVisible()

    // Pay cash → queued locally
    await page.getByRole("button", { name: /encaisser|charge/i }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: /valider la vente|complete sale/i }).click()
    await expect(page.getByTestId("receipt-offline")).toBeVisible()
    const ref = (await page.locator(".receipt-print").getByText(/^OFF-[A-Z0-9]{6}$/).first().textContent()) ?? ""
    expect(ref).toMatch(/^OFF-/)
    await expect(page.getByTestId("offline-queue-button")).toContainText("1")

    // The queue manager lists it as pending
    await page.getByRole("button", { name: /nouvelle vente|new sale/i }).click()
    await page.getByTestId("offline-queue-button").click()
    await expect(page.getByTestId("offline-queue-item")).toHaveCount(1)
    await expect(page.getByTestId("offline-queue-item")).toContainText(ref)
    await page.getByTestId("offline-queue-close").click()

    // --- back online: auto-sync ---
    const syncResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/sales" && r.request().method() === "POST" && r.ok())
    await context.setOffline(false)
    const response = await syncResponse
    const { data: synced } = await response.json()
    expect(synced.id).toBeTruthy()
    expect(synced.saleNumber).toMatch(/^S-\d{8}-\d{4}$/)
    await expect(page.getByTestId("offline-queue-button")).toHaveCount(0, { timeout: 20_000 })
    const replay = await page.request.post("/api/sales", { data: response.request().postDataJSON() })
    expect(replay.status()).toBe(200)
    expect((await replay.json()).data.id).toBe(synced.id)
    const wrongOwner = await page.request.get("/api/me", { headers: { "X-RetailOS-User-Id": "00000000-0000-4000-8000-000000000000" } })
    expect(wrongOwner.status()).toBe(401)

    // The synced sale is now a real sale in the history with the scanned product
    await page.goto("/sales")
    await page.getByPlaceholder(/vente|sale/i).fill(synced.saleNumber)
    const syncedRow = page.locator("tbody tr").filter({ hasText: synced.saleNumber })
    await expect(syncedRow).toHaveCount(1)
    await syncedRow.click()
    // First visit of /sales/[id] may trigger a dev-mode compile; allow extra time.
    await expect(page.getByText("Coca-Cola 33cl").first()).toBeVisible({ timeout: 30_000 })
  })

  test("keeps a rejected sale for its owner without exposing it to another account", async ({ page, context }) => {
    test.setTimeout(120_000)
    await login(page, "owner@demo.ma")
    await page.goto("/pos")
    await waitForCatalog(page)
    await context.setOffline(true)
    await expect(page.getByTestId("pos-offline-badge")).toBeVisible()
    const search = page.getByPlaceholder(/scanner|scan/i)
    await search.fill("5449000000996")
    await search.press("Enter")
    await page.getByRole("button", { name: /encaisser|charge/i }).click()
    await page.getByRole("dialog").getByRole("button", { name: /valider la vente|complete sale/i }).click()
    await expect(page.getByTestId("receipt-offline")).toBeVisible()
    const ref = await page.locator(".receipt-print").getByText(/^OFF-[A-Z0-9]{6}$/).textContent()
    await page.getByRole("button", { name: /nouvelle vente|new sale/i }).click()
    await page.route("**/api/sales", async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      await route.fulfill({ status: 409, json: { success: false, error: { code: "INSUFFICIENT_STOCK", message: "Test stock conflict" } } })
    })
    await context.setOffline(false)
    await page.getByTestId("offline-queue-button").click()
    await expect(page.getByTestId("offline-queue-item")).toContainText(/Refusée|Rejected/, { timeout: 20_000 })
    await expect(page.getByTestId("offline-queue-item")).toContainText(ref!)
    await page.getByTestId("offline-queue-close").click()
    await page.getByRole("button", { name: /mon profil|my profile/i }).click()
    await page.getByRole("menuitem", { name: /déconnexion|sign out|log out/i }).click()
    await page.waitForURL(/\/auth\/signin/)
    await login(page, "owner@boutique.ma")
    await page.goto("/pos")
    await waitForCatalog(page)
    await expect(page.getByTestId("offline-queue-button")).toHaveCount(0)
    await expect(page.getByText(ref!, { exact: true })).toHaveCount(0)
    await context.setOffline(true)
    await expect(page.getByTestId("pos-offline-badge")).toBeVisible()
    await page.getByPlaceholder(/scanner|scan/i).fill("5449000000996")
    await expect(page.getByRole("button").filter({ hasText: "Coca-Cola 33cl" })).toHaveCount(0)
    await context.setOffline(false)
    await page.getByRole("button", { name: /mon profil|my profile/i }).click()
    await page.getByRole("menuitem", { name: /déconnexion|sign out|log out/i }).click()
    await page.waitForURL(/\/auth\/signin/)
    await login(page, "owner@demo.ma")
    await page.goto("/pos")
    await page.getByTestId("offline-queue-button").click()
    await expect(page.getByTestId("offline-queue-item")).toContainText(ref!)
    await expect(page.getByTestId("offline-queue-item")).toContainText(/Refusée|Rejected/)
  })
})
