"use client"

import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DatePreset } from "@/utils/dates"
import { cn } from "@/utils/cn"

export interface DateFilter {
  preset: DatePreset
  from?: string // yyyy-mm-dd
  to?: string
}

const PRESETS: DatePreset[] = ["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth", "custom"]

export function DateRangePicker({ value, onChange, className }: { value: DateFilter; onChange: (v: DateFilter) => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {PRESETS.map((p) => (
          <Button key={p} size="sm" variant={value.preset === p ? "default" : "ghost"} className="h-8" onClick={() => onChange({ ...value, preset: p })}>
            {t(`common.${p}`)}
          </Button>
        ))}
      </div>
      {value.preset === "custom" ? (
        <div className="flex items-center gap-2">
          <Input type="date" className="h-8 w-[150px]" value={value.from ?? ""} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label={t("common.from")} />
          <span className="text-muted-foreground text-sm">→</span>
          <Input type="date" className="h-8 w-[150px]" value={value.to ?? ""} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label={t("common.to")} />
        </div>
      ) : null}
    </div>
  )
}

/** Converts a DateFilter to API query params. */
export function dateFilterParams(v: DateFilter) {
  if (v.preset === "custom") {
    if (!v.from || !v.to) return null
    return { preset: "custom", from: new Date(v.from).toISOString(), to: new Date(v.to + "T23:59:59").toISOString() }
  }
  return { preset: v.preset }
}
