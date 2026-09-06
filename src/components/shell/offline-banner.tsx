"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { WifiOff } from "lucide-react"

export function OfflineBanner() {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])
  if (!offline) return null
  return (
    <div className="flex items-center gap-2 bg-warning/20 px-4 py-2 text-sm text-amber-900 dark:text-amber-200" role="status">
      <WifiOff className="h-4 w-4" />
      {t("pwa.offline")}
    </div>
  )
}
