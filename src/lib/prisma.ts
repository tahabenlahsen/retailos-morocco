import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "error", "warn"] : ["error", "warn"],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/** True when the active datasource is PostgreSQL (derived from DATABASE_URL). */
export const isPostgres = /^postgres(ql)?:/i.test(process.env.DATABASE_URL ?? "")

/**
 * Case-insensitive "contains" filter that works on both providers:
 * SQLite's LIKE is already case-insensitive for ASCII; PostgreSQL needs `mode: "insensitive"`
 * (which SQLite's Prisma connector rejects), hence the runtime switch.
 */
export function icontains(term: string): { contains: string; mode?: "insensitive" } {
  return isPostgres ? { contains: term, mode: "insensitive" } : { contains: term }
}
