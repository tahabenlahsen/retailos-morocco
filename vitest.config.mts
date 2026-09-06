import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/global.ts"],
    setupFiles: ["tests/setup/env.ts"],
    // Integration tests share one SQLite file: run files sequentially to avoid write locks.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
