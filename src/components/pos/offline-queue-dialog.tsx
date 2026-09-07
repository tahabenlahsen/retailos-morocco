"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CloudOff, RefreshCw, Trash2, CheckCircle2, AlertTriangle, Clock } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/misc"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Money } from "@/components/shared/money"
import { useLocale } from "@/components/providers/locale-provider"
import { useOfflineQueue, useOnline } from "@/hooks/use-offline"
import { RETRYABLE_CODES, type QueuedSale } from "@/lib/offline/queue-logic"
import { cn } from "@/utils/cn"

/** Header button showing pending/failed offline sales; opens the queue manager. */
export function OfflineQueueButton() {
  const { t } = useTranslation()
  const { pending, failed, syncing, error } = useOfflineQueue()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  if (!pending.length && !failed.length && !error && online) return null
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className={cn(failed.length ? "border-destructive/60 text-destructive" : pending.length ? "border-amber-500/60 text-amber-700 dark:text-amber-300" : "")} data-testid="offline-queue-button">
        {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudOff className="h-4 w-4" />}
        {error ? t("common.unknownError") : t("offline.queued", { count: pending.length })}
        {failed.length ? <Badge variant="destructive" className="ms-1">{failed.length}</Badge> : null}
      </Button>
      <OfflineQueueDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function OfflineQueueDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const { formatDateTime } = useLocale()
  const { items, syncing, loaded, error, sync, retry, discard } = useOfflineQueue()
  const online = useOnline()
  const [toDiscard, setToDiscard] = useState<QueuedSale | null>(null)

  const runSync = async (key?: string) => {
    try {
      const r = key ? await retry(key) : await sync()
      if (!r) return
      if (r.failed.length) toast.error(t("offline.failedCount", { count: r.failed.length }))
      if (r.stopped === "offline") toast.error(t("errors.NETWORK"))
      if (r.stopped === "unauthorized") toast.error(t("errors.UNAUTHORIZED"))
    } catch {
      toast.error(t("common.unknownError"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t("offline.title")}</DialogTitle>
          <DialogDescription>{t("offline.description")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin divide-y rounded-md border">
          {error ? <p role="alert" className="p-3 text-sm text-destructive">{t("common.unknownError")} · {error}</p> : null}
          {!loaded && !error ? <p className="p-3 text-sm">{t("common.loading")}</p> : null}
          {loaded && !error && items.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("offline.empty")}</p> : null}
          {items.map((q) => (
            <div key={q.key} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-start sm:justify-between" data-testid="offline-queue-item">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {q.status === "failed" ? <AlertTriangle className="h-4 w-4 text-destructive shrink-0" /> : <Clock className="h-4 w-4 text-amber-600 shrink-0" />}
                  <span className="font-mono font-medium">{q.ref}</span>
                  <Money value={q.totals.total} className="font-semibold" />
                  <Badge variant={q.status === "failed" ? "destructive" : "warning"}>{t(`offline.status.${q.status}`)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(q.soldAt)} · {q.storeName} · {t("pos.items", { count: q.lines.reduce((a, l) => a + l.quantity, 0) })} · {q.payments.map((p) => t(`pos.methods.${p.method}`)).join(", ")}
                  {q.customer ? ` · ${q.customer.name}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">{q.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}</p>
                {q.lastError ? <p className="mt-1 text-xs text-destructive">{t(`errors.${q.lastError.code}`, { defaultValue: q.lastError.code })}{q.lastError.message ? ` — ${q.lastError.message}` : ""}{RETRYABLE_CODES.has(q.lastError.code) ? ` · ${t("offline.fixThenRetry")}` : ""}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {q.status === "failed" ? <Button size="sm" variant="outline" disabled={!online || syncing} onClick={() => void runSync(q.key)}><RefreshCw className="h-4 w-4" />{t("offline.retry")}</Button> : null}
                {q.status === "failed" && q.lastError?.code !== "INTERNAL_ERROR" ? <Button size="sm" variant="ghost" disabled={syncing} onClick={() => setToDiscard(q)} aria-label={t("offline.discard")}><Trash2 className="h-4 w-4 text-destructive" /></Button> : null}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{online ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <CloudOff className="h-3.5 w-3.5" />}{online ? t("offline.online") : t("offline.offline")}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="offline-queue-close">{t("common.close")}</Button>
            <Button onClick={() => void runSync()} disabled={!online || syncing || !items.some((i) => i.status === "pending")} loading={syncing}><RefreshCw className="h-4 w-4" />{t("offline.syncNow")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog open={!!toDiscard} onOpenChange={(o) => !o && setToDiscard(null)} title={t("offline.discardTitle")} description={t("offline.discardText", { ref: toDiscard?.ref ?? "" })} loading={syncing} onConfirm={async () => { if (!toDiscard || syncing) return; try { await discard(toDiscard.key); setToDiscard(null) } catch { toast.error(t("common.unknownError")) } }} />
    </Dialog>
  )
}
