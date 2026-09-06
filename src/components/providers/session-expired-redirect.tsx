"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { SESSION_EXPIRED_EVENT } from "@/lib/api-client"

/** Redirects to the sign-in page (preserving the return URL) when any API call returns 401. */
export function SessionExpiredRedirect() {
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const handler = () => router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`)
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [router, pathname])
  return null
}
