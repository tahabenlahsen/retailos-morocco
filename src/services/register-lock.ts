import type { Prisma } from "@prisma/client"
import { AppError } from "@/lib/errors"

type Tx = Prisma.TransactionClient

/**
 * Serialises every cash movement against the register row inside the caller's transaction.
 * The UPDATE takes a row lock (PostgreSQL) / write lock (SQLite), so a concurrent close and a
 * concurrent sale/refund/repayment cannot both proceed on a register that is no longer OPEN.
 * Returns the register when it is still open, throws REGISTER_CLOSED otherwise.
 */
export async function lockOpenRegister(tx: Tx, where: { id?: string; businessId: string; storeId: string }) {
  const locked = await tx.cashRegister.updateMany({ where: { ...where, status: "OPEN" }, data: { status: "OPEN" } })
  if (locked.count !== 1) throw new AppError("REGISTER_CLOSED", "The cash register is closed; open one before moving cash")
  return tx.cashRegister.findFirstOrThrow({ where: { ...where, status: "OPEN" } })
}
