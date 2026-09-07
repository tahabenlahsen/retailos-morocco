"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Download, FileText, Table2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ApiError } from "@/lib/api-client"
import { useApiError } from "@/hooks/use-api-error"

/**
 * Downloads an authenticated file (PDF/CSV) via fetch so API errors surface as toasts
 * instead of a broken navigation, then saves it with the server-provided filename.
 */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await fetch(url, { credentials: "same-origin" })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null
    throw new ApiError((body?.error?.code as ApiError["code"]) ?? "INTERNAL_ERROR", body?.error?.message ?? res.statusText, res.status, body?.error?.details)
  }
  const blob = await res.blob()
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

interface Props {
  /** Report id for /api/exports/{report} */
  report: string
  /** Query params (preset/from/to/storeId/groupBy) */
  params: Record<string, string | undefined>
  size?: "sm" | "default"
}

export function ExportMenu({ report, params, size = "sm" }: Props) {
  const { t } = useTranslation()
  const { showError } = useApiError()
  const [busy, setBusy] = useState(false)
  const run = async (format: "pdf" | "csv") => {
    setBusy(true)
    try {
      const qs = new URLSearchParams(Object.fromEntries(Object.entries({ ...params, format }).filter(([, v]) => v != null) as [string, string][]))
      await downloadFile(`/api/exports/${report}?${qs}`, `${report}.${format}`)
      toast.success(t("common.download"))
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} loading={busy}><Download className="h-4 w-4" />{busy ? t("analytics.exporting") : t("analytics.export")}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void run("pdf")}><FileText className="h-4 w-4 me-2" />{t("analytics.exportPdf")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void run("csv")}><Table2 className="h-4 w-4 me-2" />{t("analytics.exportCsv")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
