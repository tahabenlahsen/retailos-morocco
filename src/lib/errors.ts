/**
 * Application error types. Services throw these; the API layer maps them to
 * HTTP responses with user-safe messages. Raw database errors are never exposed.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "REGISTER_CLOSED"
  | "REGISTER_ALREADY_OPEN"
  | "PAYMENT_MISMATCH"
  | "CREDIT_NOT_ALLOWED"
  | "CREDIT_LIMIT_EXCEEDED"
  | "REFUND_EXCEEDS_CREDIT"
  | "NO_OUTSTANDING_BALANCE"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  REGISTER_CLOSED: 409,
  REGISTER_ALREADY_OPEN: 409,
  PAYMENT_MISMATCH: 400,
  CREDIT_NOT_ALLOWED: 409,
  CREDIT_LIMIT_EXCEEDED: 409,
  REFUND_EXCEEDS_CREDIT: 409,
  NO_OUTSTANDING_BALANCE: 409,
  INVALID_STATE: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.status = STATUS[code]
    this.details = details
  }
}

export const notFound = (entity: string) => new AppError("NOT_FOUND", `${entity} not found`)
export const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError("FORBIDDEN", message)
export const unauthorized = () => new AppError("UNAUTHORIZED", "Authentication required")
export const conflict = (message: string) => new AppError("CONFLICT", message)
export const validation = (message: string, details?: unknown) =>
  new AppError("VALIDATION_ERROR", message, details)
export const invalidState = (message: string) => new AppError("INVALID_STATE", message)
