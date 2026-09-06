import { NextResponse, type NextRequest } from "next/server"
import { ZodError, type ZodType } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "./auth"
import { prisma } from "./prisma"
import { AppError, unauthorized, forbidden, validation } from "./errors"
import { hasPermission, type Permission } from "./permissions"
import { checkRateLimit, getClientIp } from "./rate-limit"

/**
 * Tenant context attached to every authenticated request.
 * All services MUST scope queries by `businessId` (and `storeId` where relevant).
 */
export interface TenantContext {
  userId: string
  businessId: string
  role: string
  /** Store IDs the user is allowed to access. OWNER/ADMIN get all active stores. */
  storeIds: string[]
  ip: string
  userAgent?: string
}

async function loadStoreIds(userId: string, businessId: string, role: string): Promise<string[]> {
  if (role === "OWNER" || role === "ADMIN") {
    const stores = await prisma.store.findMany({
      where: { businessId, deletedAt: null },
      select: { id: true },
    })
    return stores.map((s) => s.id)
  }
  const links = await prisma.userStore.findMany({
    where: { userId, store: { businessId, deletedAt: null } },
    select: { storeId: true },
  })
  return links.map((l) => l.storeId)
}

export async function getTenantContext(req: Request): Promise<TenantContext> {
  const session = await auth()
  if (!session?.user?.id) throw unauthorized()
  const { id: userId, businessId, roleName } = session.user
  const storeIds = await loadStoreIds(userId, businessId, roleName)
  return {
    userId,
    businessId,
    role: roleName,
    storeIds,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get("user-agent") ?? undefined,
  }
}

/** Resolve the store for a request: explicit `storeId` param, else user's first store. */
export function resolveStoreId(ctx: TenantContext, requested?: string | null): string {
  if (requested) {
    if (!ctx.storeIds.includes(requested)) throw forbidden("You do not have access to this store")
    return requested
  }
  const first = ctx.storeIds[0]
  if (!first) throw forbidden("No store assigned to your account")
  return first
}

export function requirePermission(ctx: TenantContext, permission: Permission) {
  if (!hasPermission(ctx.role, permission)) throw forbidden()
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    throw validation("Invalid JSON body")
  }
  const result = schema.safeParse(json)
  if (!result.success) throw validation("Validation failed", flattenZod(result.error))
  return result.data
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((v, k) => (obj[k] = v))
  const result = schema.safeParse(obj)
  if (!result.success) throw validation("Invalid query parameters", flattenZod(result.error))
  return result.data
}

function flattenZod(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function created<T>(data: T) {
  return ok(data, 201)
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status }
    )
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Validation failed", details: flattenZod(err) } },
      { status: 400 }
    )
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json(
        { success: false, error: { code: "CONFLICT", message: "A record with the same unique value already exists" } },
        { status: 409 }
      )
    }
    if (err.code === "P2025") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Record not found" } },
        { status: 404 }
      )
    }
  }
  console.error("[api] unhandled error", err)
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 }
  )
}

type Handler<P> = (req: NextRequest, ctx: TenantContext, params: P) => Promise<Response>

interface RouteOptions {
  permission?: Permission
  /** Requests per minute per user. */
  rateLimit?: number
}

/**
 * Wraps an API route handler with authentication, tenant context, permission
 * checking, rate limiting and uniform error handling.
 */
export function withTenant<P = Record<string, string>>(handler: Handler<P>, options: RouteOptions = {}) {
  return async (req: NextRequest, routeCtx?: { params: Promise<P> | P }) => {
    try {
      const ctx = await getTenantContext(req)
      if (options.permission) requirePermission(ctx, options.permission)
      if (options.rateLimit && !(await checkRateLimit(`api:${ctx.userId}:${req.nextUrl.pathname}`, options.rateLimit, 60_000))) {
        throw new AppError("RATE_LIMITED", "Too many requests. Please slow down.")
      }
      const params = (routeCtx?.params ? await routeCtx.params : {}) as P
      return await handler(req, ctx, params)
    } catch (err) {
      return errorResponse(err)
    }
  }
}

/** For public (unauthenticated) routes: only error mapping + optional IP rate limit. */
export function withPublic(
  handler: (req: NextRequest) => Promise<Response>,
  options: { rateLimit?: number; windowMs?: number } = {}
) {
  return async (req: NextRequest) => {
    try {
      if (options.rateLimit) {
        const ip = getClientIp(req.headers)
        if (!(await checkRateLimit(`public:${ip}:${req.nextUrl.pathname}`, options.rateLimit, options.windowMs ?? 60_000))) {
          throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.")
        }
      }
      return await handler(req)
    } catch (err) {
      return errorResponse(err)
    }
  }
}
