import { prisma } from "./prisma"
import type { Prisma } from "@prisma/client"

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "SIGNUP"
  | "ONBOARDING_COMPLETED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_DELETED"
  | "PRODUCT_PRICE_CHANGED"
  | "PRODUCT_IMPORTED"
  | "PRODUCT_BULK_UPDATED"
  | "STOCK_ADJUSTED"
  | "STOCK_TRANSFERRED"
  | "SALE_CREATED"
  | "SALE_CANCELLED"
  | "SALE_REFUNDED"
  | "REGISTER_OPENED"
  | "REGISTER_CLOSED"
  | "REGISTER_TRANSACTION"
  | "PURCHASE_CREATED"
  | "PURCHASE_UPDATED"
  | "PURCHASE_RECEIVED"
  | "PURCHASE_CANCELLED"
  | "EXPENSE_CREATED"
  | "EXPENSE_UPDATED"
  | "EXPENSE_DELETED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_ROLE_CHANGED"
  | "USER_DELETED"
  | "STORE_CREATED"
  | "STORE_UPDATED"
  | "STORE_DELETED"
  | "BUSINESS_UPDATED"
  | "SUPPLIER_CREATED"
  | "SUPPLIER_UPDATED"
  | "SUPPLIER_DELETED"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "CUSTOMER_DELETED"
  | "CUSTOMER_PAYMENT"

export interface AuditEntry {
  businessId: string
  userId: string
  action: AuditAction
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

type Tx = Prisma.TransactionClient

/**
 * Writes an audit log entry. Pass `tx` to make the log part of an existing transaction.
 * Audit logging failures outside a transaction are swallowed (logged) so they never
 * break the primary business operation.
 */
export async function writeAuditLog(entry: AuditEntry, tx?: Tx) {
  const data = {
    businessId: entry.businessId,
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  }
  if (tx) return tx.auditLog.create({ data })
  try {
    return await prisma.auditLog.create({ data })
  } catch (err) {
    console.error("[audit] failed to write audit log", err)
    return null
  }
}
