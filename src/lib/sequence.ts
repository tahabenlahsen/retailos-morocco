import type { Prisma } from "@prisma/client"

type Tx = Prisma.TransactionClient

/**
 * Generates human-readable document numbers scoped per business, e.g. `S-20260906-0042`.
 * Must be called inside the same transaction that creates the document so the
 * `@@unique([businessId, number])` constraint guarantees no duplicates under
 * concurrency (the transaction is retried on P2002 by the caller).
 */
function datePart(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
}

export async function nextSaleNumber(tx: Tx, businessId: string): Promise<string> {
  const prefix = `S-${datePart()}-`
  const count = await tx.sale.count({ where: { businessId, saleNumber: { startsWith: prefix } } })
  return `${prefix}${String(count + 1).padStart(4, "0")}`
}

export async function nextRefundNumber(tx: Tx, businessId: string): Promise<string> {
  const prefix = `R-${datePart()}-`
  const count = await tx.refund.count({ where: { businessId, refundNumber: { startsWith: prefix } } })
  return `${prefix}${String(count + 1).padStart(4, "0")}`
}

export async function nextPurchaseNumber(tx: Tx, businessId: string): Promise<string> {
  const prefix = `PO-${datePart()}-`
  const count = await tx.purchaseOrder.count({ where: { businessId, orderNumber: { startsWith: prefix } } })
  return `${prefix}${String(count + 1).padStart(4, "0")}`
}

/** Retries `fn` when a unique-constraint race happens on document numbers. */
export async function withUniqueRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const code = (err as { code?: string })?.code
      if (code !== "P2002") throw err
    }
  }
  throw lastErr
}
