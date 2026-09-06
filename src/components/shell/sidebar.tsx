"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Store } from "lucide-react"
import { NAV } from "./nav-config"
import { useMe } from "@/hooks/use-me"
import { cn } from "@/utils/cn"
import { Skeleton } from "@/components/ui/misc"

export function Sidebar({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { me, isLoading } = useMe()
  const items = NAV.filter((n) => !n.permission || me?.permissions.includes(n.permission))

  return (
    <aside className={cn("flex h-full w-64 flex-col border-e bg-sidebar", className)}>
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Store className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{me?.business.name ?? t("app.name")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("app.name")}</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-0.5">
        {isLoading && !me
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
          : items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon className="h-4.5 w-4.5 shrink-0" />
                  <span className="truncate">{t(`nav.${item.key}`)}</span>
                </Link>
              )
            })}
      </nav>
      <div className="border-t p-3 text-xs text-muted-foreground">
        <p className="truncate">{me ? `${me.user.firstName} ${me.user.lastName}` : ""}</p>
        <p className="truncate">{me ? t(`employees.roles.${me.role}`) : ""}</p>
      </div>
    </aside>
  )
}
