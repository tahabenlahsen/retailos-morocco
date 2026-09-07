import { test, expect, type Page } from "@playwright/test"

async function login(page: Page, email: string, password = "Demo12345") {
  await page.goto("/auth/signin")
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/mot de passe|password/i).fill(password)
  await page.getByRole("button", { name: /se connecter|sign in/i }).click()
  // Wait for the post-login redirect. The signin page uses router.replace("/") which the
  // proxy redirects to /dashboard or /pos. Wait for either URL with a generous timeout
  // to absorb first-compile latency in dev mode.
  await page.waitForURL(/\/(dashboard|pos)/, { timeout: 30_000 })
}

test.describe("authentication", () => {
  test("rejects wrong password and accepts the demo owner", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByLabel(/email/i).fill("owner@demo.ma")
    await page.getByLabel(/mot de passe|password/i).fill("wrong-password")
    await page.getByRole("button", { name: /se connecter|sign in/i }).click()
    await expect(page.getByRole("alert")).toBeVisible()
    await page.getByLabel(/mot de passe|password/i).fill("Demo12345")
    await page.getByRole("button", { name: /se connecter|sign in/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/tableau de bord/i)
  })

  test("protected routes redirect anonymous users", async ({ page }) => {
    await page.goto("/products")
    await page.waitForURL(/\/auth\/signin/)
  })
})

test.describe("POS", () => {
  test("owner completes a cash sale, sees the receipt, then the sale appears in history", async ({ page }) => {
    await login(page, "owner@demo.ma")
    await page.goto("/pos")
    // Barcode scan simulation: type EAN + Enter
    const search = page.getByPlaceholder(/scanner|scan/i)
    await search.fill("5449000000996")
    await search.press("Enter")
    await expect(page.getByText("Coca-Cola 33cl").first()).toBeVisible()
    // Pay
    await page.getByRole("button", { name: /encaisser|charge/i }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: /valider la vente|complete sale/i }).click()
    // Receipt
    await expect(page.getByText(/merci de votre visite|thank you/i)).toBeVisible()
    const saleNumber = (await page.locator(".receipt-print").getByText(/^S-\d{8}-\d{4}$/).first().textContent()) ?? ""
    expect(saleNumber).toMatch(/^S-/)
    await page.getByRole("button", { name: /nouvelle vente|new sale/i }).click()
    // History
    await page.goto("/sales")
    await expect(page.getByText(saleNumber)).toBeVisible()
  })

  test("cashier cannot access analytics but can open the POS", async ({ page }) => {
    await login(page, "cashier@demo.ma")
    await page.goto("/analytics")
    await expect(page.getByText(/non autorisée|not allowed|forbidden/i)).toBeVisible()
    await page.goto("/pos")
    await expect(page.getByPlaceholder(/scanner|scan/i)).toBeVisible()
  })
})

test.describe("localisation", () => {
  test("switching to Arabic sets RTL and persists across reload", async ({ page }) => {
    await login(page, "owner@demo.ma")
    await page.getByRole("button", { name: /langue|language/i }).click()
    await page.getByRole("menuitemcheckbox", { name: "العربية" }).click()
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
    await page.reload()
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("لوحة التحكم")
    // back to French
    await page.getByRole("button", { name: /اللغة/ }).click()
    await page.getByRole("menuitemcheckbox", { name: "Français" }).click()
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr")
  })
})

test.describe("tenant isolation (UI)", () => {
  test("another business sees none of the demo mini-market data", async ({ page }) => {
    await login(page, "owner@boutique.ma")
    await page.goto("/products")
    await expect(page.getByText("Coca-Cola 33cl")).toHaveCount(0)
    await expect(page.getByText("Robe été")).toBeVisible()
  })
})
