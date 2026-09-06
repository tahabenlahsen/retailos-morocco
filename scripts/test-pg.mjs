/**
 * Runs the Vitest suite against PostgreSQL using a dedicated `<db>_test` database derived
 * from DATABASE_URL (or TEST_DATABASE_URL if set). Requires the schema provider = postgresql.
 *
 *   npm run test:pg
 */
import { spawnSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"

let url = process.env.TEST_DATABASE_URL
if (!url) {
  let base = process.env.DATABASE_URL
  if (!base && existsSync(".env")) base = readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)?.[1]
  if (!base || !/^postgres(ql)?:/i.test(base)) {
    console.error("DATABASE_URL must be a postgresql:// URL (or set TEST_DATABASE_URL)")
    process.exit(1)
  }
  url = base.replace(/\/([^/?]+)(\?|$)/, (_m, db, q) => `/${db}_test${q}`)
}
console.log(`Running tests against ${url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@")}`)
const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vitest", "run", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: url }, shell: process.platform === "win32" })
process.exit(r.status ?? 1)
