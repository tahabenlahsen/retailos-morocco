/**
 * Browser-side API client. All responses follow `{ success, data | error }`.
 * Throws `ApiError` with the server error code so UI can show localised messages.
 */
import type { ErrorCode } from "./errors"

export class ApiError extends Error {
  code: ErrorCode | "NETWORK"
  status: number
  details?: unknown
  constructor(code: ErrorCode | "NETWORK", message: string, status: number, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = status
    this.details = details
  }
}

interface Envelope<T> {
  success: boolean
  data?: T
  error?: { code: ErrorCode; message: string; details?: unknown }
}

async function request<T>(method: string, url: string, body?: unknown, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json", Accept: "application/json" },
      body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
      ...init,
    })
  } catch {
    throw new ApiError("NETWORK", "Network error", 0)
  }
  const isJson = res.headers.get("content-type")?.includes("application/json")
  if (!isJson) {
    if (!res.ok) throw new ApiError(res.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR", res.statusText, res.status)
    return (await res.text()) as unknown as T
  }
  const json = (await res.json()) as Envelope<T>
  if (!res.ok || !json.success) {
    const err = json.error ?? { code: "INTERNAL_ERROR" as ErrorCode, message: "Unknown error" }
    // Session expired: let the app shell redirect via the Next router (see SessionExpiredRedirect).
    if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
    throw new ApiError(err.code, err.message, res.status, err.details)
  }
  return json.data as T
}

export const SESSION_EXPIRED_EVENT = "retailos:session-expired"

function qs(params?: Record<string, unknown>) {
  if (!params) return ""
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue
    sp.set(k, v instanceof Date ? v.toISOString() : String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) => request<T>("GET", `${url}${qs(params)}`),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  delete: <T>(url: string) => request<T>("DELETE", url),
  upload: <T>(url: string, form: FormData) => request<T>("POST", url, form),
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
