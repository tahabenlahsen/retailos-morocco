"use client"

import type { LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/misc"
import { Money, Pct } from "@/components/shared/money"
import { useLocale } from "@/components/providers/locale-provider"
import { cn } from "@/utils/cn"

interface Props {
  title: string
  value: number | undefined
  change?: number | null
  icon: LucideIcon
  money?: boolean
  loading?: boolean
  tone?: "default" | "success" | "warning" | "destructive"
  /** For expenses: an increase is bad */
  invert?: boolean
  href?: string
}

export function KpiCard({ title, value, change, icon: Icon, money = true, loading, tone = "default", invert }: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocale()
  const toneClass = { default: "bg-primary/10 text-primary", success: "bg-success/15 text-success", warning: "bg-warning/25 text-amber-700 dark:text-amber-300", destructive: "bg-destructive/10 text-destructive" }[tone]
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            {loading || value === undefined ? <Skeleton className="h-8 w-28 mt-2" /> : <p className="text-2xl font-bold mt-1 tabular-nums">{money ? <Money value={value} /> : formatNumber(value)}</p>}
            {change !== undefined && !loading ? (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Pct value={change == null ? null : invert ? -change : change} className={cn(change != null && invert && change !== 0 && (change > 0 ? "!text-destructive" : "!text-success"))} />
                <span>{t("common.vsPrevious")}</span>
              </p>
            ) : null}
          </div>
          <div className={cn("rounded-lg p-2.5 shrink-0", toneClass)}><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  )
}
