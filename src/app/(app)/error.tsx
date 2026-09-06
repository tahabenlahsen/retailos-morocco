"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    console.error("[app-error]", error.digest ?? error.message)
  }, [error])
  return (
    <EmptyState
      icon={AlertTriangle}
      title={t("common.unknownError")}
      description={error.digest ? `Ref: ${error.digest}` : undefined}
      action={<Button onClick={reset}><RefreshCw className="h-4 w-4" />{t("common.refresh")}</Button>}
      className="py-24"
    />
  )
}
