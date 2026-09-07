"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { Bell, Menu, Store, Languages, Sun, Moon, Monitor, LogOut, User, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, Badge } from "@/components/ui/misc"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMe } from "@/hooks/use-me"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n"
import { api } from "@/lib/api-client"
import { clearOfflineIdentity } from "@/lib/offline/identity"
import { Sidebar } from "./sidebar"
import { EmptyState } from "@/components/shared/empty-state"

interface NotificationItem { id: string; type: string; title: string; message: string; isRead: boolean; createdAt: string }

export function Topbar() {
  const { t } = useTranslation()
  const router = useRouter()
  const { me } = useMe()
  const { storeId, setStoreId, stores } = useStore()
  const { locale, setLocale, formatRelative } = useLocale()
  const { theme, setTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const qc = useQueryClient()

  const notif = useQuery({
    queryKey: ["notifications", "top"],
    queryFn: () => api.get<{ items: NotificationItem[]; unread: number }>("/api/notifications", { pageSize: 8 }),
    refetchInterval: 60_000,
    enabled: !!me,
  })
  const markAll = useMutation({ mutationFn: () => api.post("/api/notifications"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) })
  const markOne = useMutation({ mutationFn: (id: string) => api.post(`/api/notifications/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) })

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/95 backdrop-blur px-3 sm:px-4 no-print">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Menu"><Menu /></Button>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="p-0 w-72 max-w-[85vw] h-[100dvh] max-h-none rounded-none left-0 top-0 translate-x-0 translate-y-0 rtl:left-auto rtl:right-0 data-[state=open]:slide-in-from-left" size="sm">
          <Sidebar onNavigate={() => setMenuOpen(false)} className="w-full border-0" />
        </DialogContent>
      </Dialog>

      {stores.length > 1 ? (
        <div className="flex items-center gap-2 min-w-0">
          <Store className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Select value={storeId ?? "all"} onValueChange={(v) => setStoreId(v === "all" ? null : v)}>
            <SelectTrigger className="h-9 w-[160px] sm:w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allStores")}</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : stores[0] ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0"><Store className="h-4 w-4" /><span className="truncate">{stores[0].name}</span></div>
      ) : null}

      <div className="ms-auto flex items-center gap-1">
        {/* Language */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t("common.language")}><Languages /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
            {LOCALES.map((l) => <DropdownMenuCheckboxItem key={l} checked={locale === l} onCheckedChange={() => setLocale(l)}>{LOCALE_LABELS[l]}</DropdownMenuCheckboxItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("common.theme")}</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={theme === "light"} onCheckedChange={() => setTheme("light")}><Sun className="h-4 w-4 me-2" />{t("common.light")}</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={theme === "dark"} onCheckedChange={() => setTheme("dark")}><Moon className="h-4 w-4 me-2" />{t("common.dark")}</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={theme === "system"} onCheckedChange={() => setTheme("system")}><Monitor className="h-4 w-4 me-2" />{t("common.system")}</DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={t("nav.notifications")}>
              <Bell />
              {notif.data?.unread ? <span className="absolute -top-0.5 -end-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{notif.data.unread > 99 ? "99+" : notif.data.unread}</span> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[360px] max-w-[92vw] p-0">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-semibold">{t("nav.notifications")}</span>
              {notif.data?.unread ? <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}><CheckCheck className="h-4 w-4" />{t("notifications.markAllRead")}</Button> : null}
            </div>
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
              {notif.data?.items.length ? notif.data.items.map((n) => (
                <button key={n.id} className={`w-full text-start px-3 py-2.5 border-b last:border-0 hover:bg-accent/50 transition-colors ${n.isRead ? "opacity-60" : ""}`} onClick={() => !n.isRead && markOne.mutate(n.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={n.type === "OUT_OF_STOCK" || n.type === "REGISTER_DISCREPANCY" ? "destructive" : n.type === "LOW_STOCK" || n.type === "SALES_DECREASE" ? "warning" : "secondary"}>{t(`notifications.types.${n.type}`)}</Badge>
                    <span className="text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium mt-1">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                </button>
              )) : <EmptyState icon={Bell} title={t("notifications.empty")} className="py-8" />}
            </div>
            <div className="border-t p-2"><Button asChild variant="ghost" className="w-full" size="sm"><Link href="/notifications">{t("common.viewAll")}</Link></Button></div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="ms-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer" aria-label={t("nav.profile")}><Avatar name={me ? `${me.user.firstName} ${me.user.lastName}` : "?"} /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium text-foreground">{me?.user.firstName} {me?.user.lastName}</p>
              <p className="text-xs truncate">{me?.user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings?tab=profile")}><User />{t("nav.profile")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={() => { clearOfflineIdentity(); void signOut({ callbackUrl: "/auth/signin" }) }}><LogOut />{t("nav.logout")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
