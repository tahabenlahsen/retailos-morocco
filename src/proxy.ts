import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/pos",
  "/products",
  "/inventory",
  "/barcode-labels",
  "/sales",
  "/purchases",
  "/suppliers",
  "/customers",
  "/expenses",
  "/analytics",
  "/ai",
  "/employees",
  "/stores",
  "/settings",
  "/cash-register",
  "/notifications",
  "/store-planner",
]

const AUTH_PAGES = ["/auth/signin", "/auth/signup", "/auth/forgot-password", "/auth/reset-password"]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  const isAuth = !!token
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p))
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
  const isOnboarding = pathname.startsWith("/auth/onboarding")

  if (isAuthPage && isAuth) {
    return NextResponse.redirect(new URL(token.onboarded ? "/dashboard" : "/auth/onboarding", req.url))
  }

  if ((isProtected || isOnboarding) && !isAuth) {
    const url = new URL("/auth/signin", req.url)
    url.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(url)
  }

  if (isProtected && isAuth && !token.onboarded) {
    return NextResponse.redirect(new URL("/auth/onboarding", req.url))
  }

  if (isOnboarding && isAuth && token.onboarded) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  if (pathname === "/" ) {
    return NextResponse.redirect(new URL(isAuth ? "/dashboard" : "/auth/signin", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)"],
}
