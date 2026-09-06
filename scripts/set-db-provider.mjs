/**
 * Switch the Prisma datasource provider between `sqlite` (zero-setup local dev)
 * and `postgresql` (production). The schema is otherwise provider-neutral.
 *
 *   node scripts/set-db-provider.mjs postgresql
 *   node scripts/set-db-provider.mjs sqlite
 *   node scripts/set-db-provider.mjs            # infer from DATABASE_URL in the environment / .env
 *
 * Re-run `npx prisma generate` afterwards (npm run db:generate).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"

function inferFromEnv() {
  let url = process.env.DATABASE_URL
  if (!url && existsSync(".env")) {
    const m = readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)
    url = m?.[1]
  }
  if (!url) return null
  return /^postgres(ql)?:/i.test(url) ? "postgresql" : /^file:/i.test(url) ? "sqlite" : null
}

const target = process.argv[2] ?? inferFromEnv()
if (!["sqlite", "postgresql"].includes(target)) {
  console.error("usage: node scripts/set-db-provider.mjs <sqlite|postgresql>  (or set DATABASE_URL)")
  process.exit(1)
}
const path = "prisma/schema.prisma"
const schema = readFileSync(path, "utf8")
const current = schema.match(/provider = "(sqlite|postgresql)"/)?.[1]
if (current === target) {
  console.log(`prisma/schema.prisma provider already ${target}`)
} else {
  writeFileSync(path, schema.replace(/provider = "(sqlite|postgresql)"/, `provider = "${target}"`))
  console.log(`prisma/schema.prisma provider set to ${target} (was ${current})`)
}
