"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { NAV } from "./nav-config"
import { useMe } from "@/hooks/use-me"
import { StoreProvider } from "@/components/providers/store-provider"
import { TooltipProvider } from "@/components/ui/misc"
import { cn } from "@/utils/cn"
import { OfflineBanner } from "./offline-banner"
import { PwaRegister } from "@/components/providers/pwa-register"
import { SessionExpiredRedirect } from "@/components/providers/session-expired-redirect"

function MobileNav() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { me } = useMe()
  const items = NAV.filter((n) => n.mobile && (!n.permission || me?.permissions.includes(n.permission))).slice(0, 5)
  if (!items.length) return null
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 flex border-t bg-background/95 backdrop-blur lg:hidden no-print pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link key={item.key} href={item.href} className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
            <item.icon className="h-5 w-5" />
            <span className="truncate max-w-full px-1">{t(`nav.${item.key}`)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

const FULL_BLEED_ROUTES = ["/pos"]

/** Authenticated application chrome. POS renders full-bleed (no padding, no bottom nav). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const fullBleed = FULL_BLEED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))
  return (
    <StoreProvider>
      <TooltipProvider delayDuration={300}>
        <div className="flex min-h-[100dvh]">
          <div className="hidden lg:block sticky top-0 h-[100dvh] no-print"><Sidebar /></div>
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <OfflineBanner />
            <main className={cn("flex-1", fullBleed ? "" : "p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8")}>{children}</main>
          </div>
        </div>
        {!fullBleed ? <MobileNav /> : null}
        <PwaRegister />
        <SessionExpiredRedirect />
      </TooltipProvider>
    </StoreProvider>
  )
}
