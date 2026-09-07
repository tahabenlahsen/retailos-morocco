import { execSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"

/**
 * Prepares a fresh test database before the run.
 *  - Default: SQLite file `prisma/test.db` (schema provider must be `sqlite`).
 *  - With TEST_DATABASE_URL=postgresql://… : resets that PostgreSQL database (schema provider must be `postgresql`).
 * The provider in prisma/schema.prisma must match the URL; use `node scripts/set-db-provider.mjs <provider>`.
 */
export default function setup() {
  const pgUrl = process.env.TEST_DATABASE_URL
  const provider = readFileSync(path.resolve("prisma/schema.prisma"), "utf8").match(/provider = "(sqlite|postgresql)"/)?.[1]
  const url = pgUrl ?? "file:./test.db"
  const expected = pgUrl ? "postgresql" : "sqlite"
  if (provider !== expected) {
    throw new Error(`prisma/schema.prisma provider is "${provider}" but tests need "${expected}". Run: node scripts/set-db-provider.mjs ${expected} && npx prisma generate`)
  }
  if (process.env.REUSE_TEST_DATABASE === "1") {
    if (!pgUrl || !new URL(pgUrl).pathname.endsWith("_test")) throw new Error("Reusing a database requires TEST_DATABASE_URL pointing to a dedicated *_test PostgreSQL database")
    process.env.DATABASE_URL = url
    return
  }
  process.env.DATABASE_URL = url
  const dbPath = path.resolve("prisma/test.db")
  if (!pgUrl) for (const f of [dbPath, `${dbPath}-journal`]) if (existsSync(f)) rmSync(f)
  execSync("npx prisma db push --skip-generate --force-reset", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } })
  return () => {
    if (!pgUrl) for (const f of [dbPath, `${dbPath}-journal`]) if (existsSync(f)) rmSync(f)
  }
}
