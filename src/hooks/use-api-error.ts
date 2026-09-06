"use client"

import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ApiError } from "@/lib/api-client"

/** Maps ApiError codes to localised messages; server messages are used for specific business errors. */
export function useApiError() {
  const { t } = useTranslation()
  const messageFor = useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError) {
        // Business-rule errors carry a precise server message worth surfacing.
        if (["INSUFFICIENT_STOCK", "PAYMENT_MISMATCH", "INVALID_STATE", "CONFLICT", "REGISTER_CLOSED", "REGISTER_ALREADY_OPEN", "FORBIDDEN"].includes(err.code)) {
          return err.message || t(`errors.${err.code}`)
        }
        if (err.code === "VALIDATION_ERROR" && Array.isArray(err.details) && err.details.length) {
          const d = err.details as { path: string; message: string }[]
          return `${t("errors.VALIDATION_ERROR")}: ${d.map((x) => (x.path ? `${x.path} — ${x.message}` : x.message)).join("; ")}`
        }
        return t(`errors.${err.code}`, { defaultValue: t("common.unknownError") })
      }
      return t("common.unknownError")
    },
    [t]
  )
  const showError = useCallback((err: unknown) => toast.error(messageFor(err)), [messageFor])
  return { messageFor, showError }
}
