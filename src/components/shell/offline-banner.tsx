"use client"

import { useTranslation } from "react-i18next"
import { WifiOff, CloudOff } from "lucide-react"
import { useOfflineQueue, useOnline } from "@/hooks/use-offline"

/** Shows connectivity loss and, on any page, the number of offline sales still waiting to sync. */
export function OfflineBanner() {
  const { t } = useTranslation()
  const online = useOnline()
  const { pending, failed } = useOfflineQueue()
  if (online && !pending.length && !failed.length) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-warning/20 px-4 py-2 text-sm text-amber-900 dark:text-amber-200" role="status">
      {!online ? <span className="flex items-center gap-2"><WifiOff className="h-4 w-4" />{t("pwa.offline")}</span> : null}
      {pending.length || failed.length ? <span className="flex items-center gap-2"><CloudOff className="h-4 w-4" />{t("offline.pendingBanner", { count: pending.length + failed.length })}</span> : null}
    </div>
  )
}
