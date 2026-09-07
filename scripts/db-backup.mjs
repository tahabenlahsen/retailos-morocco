#!/usr/bin/env node
/**
 * Non-destructive PostgreSQL backup script for RetailOS Morocco.
 *
 * Creates a timestamped, gzipped dump of the configured database in ./backups/.
 * Never touches, resets, or overwrites the source database.
 *
 * Usage:
 *   node scripts/db-backup.mjs                # backs up the DATABASE_URL database
 *   node scripts/db-backup.mjs --out custom   # ./backups/custom.sql.gz
 *
 * Requirements:
 *   - `pg_dump` on PATH (installed with PostgreSQL)
 *   - DATABASE_URL pointing at the database you want to back up
 *
 * The script parses DATABASE_URL itself (no external deps) so it works in any env.
 */

import { spawnSync } from "node:child_process"
import { mkdirSync, existsSync, statSync } from "node:fs"
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
  console.error("✖ DATABASE_URL is not set. Put it in .env or pass it inline.")
  exit(1)
}

// Only back up PostgreSQL — SQLite uses file copies, not pg_dump.
if (!/^postgres(ql)?:/i.test(envUrl)) {
  console.error("✖ DATABASE_URL is not PostgreSQL. For SQLite, copy the .db file manually.")
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
const backupDir = resolve(process.cwd(), "backups")
mkdirSync(backupDir, { recursive: true })

// Allow a custom name via --out; otherwise timestamp it.
const outArgIdx = process.argv.indexOf("--out")
const customName = outArgIdx !== -1 ? process.argv[outArgIdx + 1] : null
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const baseName = customName || `retailos-${stamp}`
const outFile = join(backupDir, baseName.endsWith(".sql.gz") ? baseName : `${baseName}.sql.gz`)

// Guard against overwriting an existing file.
if (existsSync(outFile) && statSync(outFile).size > 0) {
  console.error(`✖ Refusing to overwrite existing backup: ${outFile}`)
  console.error("  Pick a different --out name or move/delete the existing file first.")
  exit(1)
}

console.log(`▶ Backing up database "${cfg.database}" on ${cfg.host}:${cfg.port} →`)
console.log(`  ${outFile}`)

// pg_dump env vars (PGPASSWORD so the password never appears on the command line).
const env = {
  ...process.env,
  PGPASSWORD: cfg.password,
}

const args = [
  "-h", cfg.host,
  "-p", cfg.port,
  "-U", cfg.user,
  "-d", cfg.database,
  "--no-owner",
  "--no-privileges",
  "--format=custom", // pg_dump custom format, pipe through gzip below
]

// Use pg_dump | gzip for a portable, compressed SQL dump.
// On Windows, gzip may not be present; fall back to pg_dump -Fc (custom compressed format).
const dump = spawnSync("pg_dump", ["-h", cfg.host, "-p", cfg.port, "-U", cfg.user, "-d", cfg.database, "--no-owner", "--no-privileges", "-Fc", "-f", outFile], { env, stdio: "inherit" })

if (dump.status !== 0) {
  console.error("✖ pg_dump failed. Make sure PostgreSQL client tools (pg_dump) are installed and on PATH.")
  exit(dump.status ?? 1)
}

const size = statSync(outFile).size
const sizeMb = (size / (1024 * 1024)).toFixed(2)
console.log(`✓ Backup complete: ${outFile} (${sizeMb} MB)`)
console.log("  Restore with: node scripts/db-restore.mjs --file " + baseName + (customName && !customName.endsWith(".sql.gz") ? ".sql.gz" : ""))
