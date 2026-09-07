import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: process.env.UNIT_ONLY === "1" ? ["tests/unit/**/*.test.ts"] : ["tests/**/*.test.ts"],
    globalSetup: process.env.UNIT_ONLY === "1" ? [] : ["tests/setup/global.ts"],
    setupFiles: ["tests/setup/env.ts"],
    // Integration tests share one SQLite file: run files sequentially to avoid write locks.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
