#!/usr/bin/env node
/**
 * PostgreSQL restore + verify script for RetailOS Morocco.
 *
 * Restores a gzipped/custom-format pg_dump into a TARGET database (never the live one
 * unless you explicitly pass --confirm-overwrite-live). After restore, runs a few
 * integrity checks so you can trust the backup before relying on it.
 *
 * Usage:
 *   node scripts/db-restore.mjs --file retailos-2026-09-08.sql.gz --target retailos_restore
 *   node scripts/db-restore.mjs --file my.sql.gz --target retailos_restore --create
 *
 * Flags:
 *   --file <path>        Backup file under ./backups/ (required)
 *   --target <name>      Target database name (required). Must differ from the live DB
 *                       unless --confirm-overwrite-live is also set.
 *   --create             Create the target database if it does not exist.
 *   --confirm-overwrite-live  Allow restoring into the DATABASE_URL database. Dangerous.
 *
 * Requirements:
 *   - pg_restore, psql, createdb on PATH (installed with PostgreSQL)
 *   - DATABASE_URL for connection info (host/user/password); only the database name is swapped
 */

import { spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { resolve, join } from "node:path"
import { exit } from "node:process"
import { readFileSync } from "node:fs"

// Load .env manually so this script works without dotenv as a dependency.
try {
  const envFile = resolve(process.cwd(), ".env")
  const text = readFileSync(envFile, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/i)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {
  // .env is optional if DATABASE_URL is already in the environment
}

const envUrl = process.env.DATABASE_URL
if (!envUrl) {
  console.error("✖ DATABASE_URL is not set.")
  exit(1)
}

function parsePgUrl(url) {
  try {
    const u = new URL(url)
    return {
      host: u.hostname,
      port: u.port || "5432",
      database: u.pathname.replace(/^\//, ""),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password || ""),
    }
  } catch {
    console.error("✖ Could not parse DATABASE_URL as a valid URL.")
    exit(1)
  }
}

const cfg = parsePgUrl(envUrl)
const args = process.argv.slice(2)

function flag(name) {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}

const file = flag("--file")
const target = flag("--target")
const doCreate = args.includes("--create")
const confirmOverwriteLive = args.includes("--confirm-overwrite-live")

if (!file || !target) {
  console.error("Usage: node scripts/db-restore.mjs --file <backup> --target <dbname> [--create] [--confirm-overwrite-live]")
  exit(1)
}

if (target === cfg.database && !confirmOverwriteLive) {
  console.error(`✖ Refusing to restore into the live database "${cfg.database}".`)
  console.error("  Pass --confirm-overwrite-live to override, or pick a different --target.")
  exit(1)
}

const backupPath = existsSync(file) ? file : join(process.cwd(), "backups", file)
if (!existsSync(backupPath)) {
  console.error(`✖ Backup file not found: ${backupPath}`)
  exit(1)
}

const env = { ...process.env, PGPASSWORD: cfg.password }
const psqlBase = ["-h", cfg.host, "-p", cfg.port, "-U", cfg.user]

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { env, stdio: opts.silent ? "pipe" : "inherit", encoding: "utf8" })
  if (r.status !== 0) {
    console.error(`✖ ${cmd} ${cmdArgs.join(" ")} failed (exit ${r.status})`)
    if (r.stderr) process.stderr.write(r.stderr)
    exit(r.status ?? 1)
  }
  return r
}

// Optionally create the target database.
if (doCreate) {
  console.log(`▶ Creating target database "${target}" if it does not exist…`)
  // Check existence first to avoid a hard error from createdb.
  const check = spawnSync("psql", [...psqlBase, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${target.replace(/'/g, "''")}'`], { env, stdio: "pipe", encoding: "utf8" })
  if (check.status !== 0) {
    console.error("✖ Could not connect to PostgreSQL to check target database existence.")
    if (check.stderr) process.stderr.write(check.stderr)
    exit(check.status ?? 1)
  }
  const exists = (check.stdout || "").trim() === "1"
  if (!exists) {
    run("createdb", [...psqlBase, target])
    console.log(`✓ Created database "${target}".`)
  } else {
    console.log(`• Database "${target}" already exists; skipping creation.`)
  }
}

console.log(`▶ Restoring ${backupPath} → database "${target}" on ${cfg.host}:${cfg.port}…`)
const size = statSync(backupPath).size
console.log(`  Backup size: ${(size / (1024 * 1024)).toFixed(2)} MB`)

// pg_restore with --clean --if-exists drops existing objects first so a re-restore is idempotent.
run("pg_restore", [...psqlBase, "-d", target, "--no-owner", "--no-privileges", "--clean", "--if-exists", backupPath])

console.log("▶ Verifying restored data…")
const checks = [
  { label: "Businesses", sql: "SELECT count(*) FROM businesses;" },
  { label: "Stores", sql: "SELECT count(*) FROM stores;" },
  { label: "Users", sql: "SELECT count(*) FROM users;" },
  { label: "Products", sql: "SELECT count(*) FROM products;" },
  { label: "Sales", sql: "SELECT count(*) FROM sales;" },
  { label: "Customers", sql: "SELECT count(*) FROM customers;" },
  { label: "Migrations applied", sql: "SELECT count(*) FROM _prisma_migrations;" },
]

let allOk = true
for (const c of checks) {
  const r = spawnSync("psql", [...psqlBase, "-d", target, "-tAc", c.sql], { env, stdio: "pipe", encoding: "utf8" })
  if (r.status !== 0) {
    console.error(`  ✖ ${c.label}: query failed — table may be missing`)
    allOk = false
  } else {
    const n = (r.stdout || "").trim()
    console.log(`  ✓ ${c.label}: ${n} row(s)`)
  }
}

if (!allOk) {
  console.error("✖ Verification found missing tables. The backup may be incomplete or from an older schema.")
  exit(1)
}

console.log("✓ Restore + verification complete.")
console.log(`  Target database: ${target}`)
console.log("  To use this database temporarily, set DATABASE_URL to:")
console.log(`  postgresql://${cfg.user}:***@${cfg.host}:${cfg.port}/${target}?schema=public`)
