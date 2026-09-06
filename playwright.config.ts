import { defineConfig, devices } from "@playwright/test"

/**
 * E2E tests run against the dev server with the seeded demo database.
 * `npm run db:reset` before `npm run test:e2e` for a deterministic dataset.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "fr-MA",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Tablet POS layout, on Chromium so the suite needs a single browser download.
    { name: "tablet", use: { ...devices["Galaxy Tab S4"], browserName: "chromium" } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev -p 3000", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 120_000 },
})
