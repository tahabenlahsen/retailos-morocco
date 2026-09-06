"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Bell, CheckCheck } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Badge, Skeleton } from "@/components/ui/misc"
import { Checkbox } from "@/components/ui/misc"
import { useLocale } from "@/components/providers/locale-provider"
import { api, type Paginated } from "@/lib/api-client"
import { cn } from "@/utils/cn"

interface Notif { id: string; type: string; title: string; message: string; isRead: boolean; createdAt: string }

export default function NotificationsPage() {
  const { t } = useTranslation()
  const { formatDateTime } = useLocale()
  const qc = useQueryClient()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ["notifications", "page", unreadOnly, page], queryFn: () => api.get<Paginated<Notif> & { unread: number }>("/api/notifications", { unreadOnly: unreadOnly ? "true" : undefined, page, pageSize: 30 }) })
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["notifications"] })
  const markAll = useMutation({ mutationFn: () => api.post("/api/notifications"), onSuccess: invalidate })
  const markOne = useMutation({ mutationFn: (id: string) => api.post(`/api/notifications/${id}`), onSuccess: invalidate })
  const variant = (type: string) => (type === "OUT_OF_STOCK" || type === "REGISTER_DISCREPANCY" ? "destructive" : type === "LOW_STOCK" || type === "SALES_DECREASE" || type === "LARGE_EXPENSE" ? "warning" : "secondary") as "destructive" | "warning" | "secondary"

  return (
    <RequirePermission permission="notification.view">
      <PageHeader title={t("notifications.title")} description={q.data ? t("notifications.unread", { count: q.data.unread }) : undefined} actions={<>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={unreadOnly} onCheckedChange={(v) => { setUnreadOnly(!!v); setPage(1) }} />{t("notifications.unread", { count: q.data?.unread ?? 0 })}</label>
        <Button variant="outline" onClick={() => markAll.mutate()} disabled={!q.data?.unread} loading={markAll.isPending}><CheckCheck className="h-4 w-4" />{t("notifications.markAllRead")}</Button>
      </>} />
      <div className="rounded-xl border bg-card divide-y">
        {q.isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="p-4"><Skeleton className="h-4 w-1/3 mb-2" /><Skeleton className="h-3 w-2/3" /></div>) : q.data?.items.length ? q.data.items.map((n) => (
          <button key={n.id} onClick={() => !n.isRead && markOne.mutate(n.id)} className={cn("w-full text-start p-4 hover:bg-accent/40 transition-colors", n.isRead ? "opacity-60" : "")}>
            <div className="flex items-center justify-between gap-3 mb-1"><div className="flex items-center gap-2"><Badge variant={variant(n.type)}>{t(`notifications.types.${n.type}`)}</Badge>{!n.isRead ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}</div><span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span></div>
            <p className="font-medium text-sm">{n.title}</p>
            <p className="text-sm text-muted-foreground">{n.message}</p>
          </button>
        )) : <EmptyState icon={Bell} title={t("notifications.empty")} />}
      </div>
      {q.data && q.data.total > q.data.pageSize ? <div className="mt-3 flex justify-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.previous")}</Button><Button variant="outline" size="sm" disabled={page * q.data.pageSize >= q.data.total} onClick={() => setPage(page + 1)}>{t("common.next")}</Button></div> : null}
    </RequirePermission>
  )
}
