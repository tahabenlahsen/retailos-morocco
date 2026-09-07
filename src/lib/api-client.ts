/**
 * Browser-side API client. All responses follow `{ success, data | error }`.
 * Throws `ApiError` with the server error code so UI can show localised messages.
 */
import type { ErrorCode } from "./errors"
import { clearOfflineIdentity, getIdentityGeneration, getOfflineIdentity, isCurrentIdentity, verifyOfflineIdentity } from "./offline/identity"

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

/**
 * Offline read-through: GETs on whitelisted endpoints are cached in IndexedDB after success and
 * served from that cache when the network fails (POS keeps working during internet cuts).
 * Loaded lazily so the module stays usable on the server.
 */
type OfflineCache = typeof import("./offline/cache")
let offlineCache: Promise<OfflineCache> | null = null
function getOfflineCache(): Promise<OfflineCache> | null {
  if (typeof window === "undefined") return null
  offlineCache ??= import("./offline/cache")
  return offlineCache
}

async function request<T>(method: string, url: string, body?: unknown, init?: RequestInit): Promise<T> {
  let res: Response
  const generation = getIdentityGeneration()
  let owner = getOfflineIdentity()
  const browser = typeof window !== "undefined"
  const cache = method === "GET" && init?.cache !== "no-store" ? getOfflineCache() : null
  const sessionChanged = () => new ApiError("UNAUTHORIZED", "Session changed; please verify your session", 401)
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(body instanceof FormData ? {} : { "Content-Type": "application/json", Accept: "application/json" }),
        // withTenant validates these against the cookie session before returning sensitive data.
        // /api/me is exempt: its uncached response establishes/discovers the actual identity.
        ...(browser && owner && !(method === "GET" && url === "/api/me") ? { "X-RetailOS-Business-Id": owner.businessId, "X-RetailOS-User-Id": owner.userId } : {}),
      },
      body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
      ...init,
    })
  } catch {
    if (browser && getIdentityGeneration() !== generation) throw sessionChanged()
    if (cache && isCurrentIdentity(owner)) {
      const c = await cache
      if (c.isCacheable(url)) {
        const hit = await c.apiCache.get<T>(url, owner)
        if (hit) {
          window.dispatchEvent(new CustomEvent(c.SERVED_FROM_CACHE_EVENT, { detail: { url, at: hit.at } }))
          return hit.data
        }
      }
    }
    throw new ApiError("NETWORK", "Network error", 0)
  }
  if (browser && getIdentityGeneration() !== generation) throw sessionChanged()
  if (res.status === 401 && browser) {
    clearOfflineIdentity()
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
  }
  const isJson = res.headers.get("content-type")?.includes("application/json")
  if (!isJson) {
    if (!res.ok) throw new ApiError(res.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR", res.statusText, res.status)
    const text = await res.text()
    if (browser && getIdentityGeneration() !== generation) throw sessionChanged()
    if (browser && method === "GET" && url === "/api/me") {
      clearOfflineIdentity()
      throw sessionChanged()
    }
    return text as unknown as T
  }
  const json = (await res.json()) as Envelope<T>
  if (!res.ok || !json.success) {
    const err = json.error ?? { code: "INTERNAL_ERROR" as ErrorCode, message: "Unknown error" }
    if (err.code === "UNAUTHORIZED" && browser && res.status !== 401) clearOfflineIdentity()
    throw new ApiError(err.code, err.message, res.status, err.details)
  }
  if (browser && getIdentityGeneration() !== generation) throw sessionChanged()
  if (browser && method === "GET" && url === "/api/me") {
    owner = verifyOfflineIdentity(json.data, generation)
    if (!owner) throw sessionChanged()
  }
  // Capture the request's owner, not the identity at completion of a lazy import/IDB write.
  if (cache && owner) void cache.then((c) => (c.isCacheable(url) ? c.apiCache.set(url, json.data, owner) : undefined)).catch(() => undefined)
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
  /** Never falls back to IndexedDB. Used to verify current server authority before replay. */
  getFresh: <T>(url: string) => request<T>("GET", url, undefined, { cache: "no-store" }),
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
