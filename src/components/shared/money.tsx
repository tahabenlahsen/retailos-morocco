"use client"

import { useLocale } from "@/components/providers/locale-provider"
import { cn } from "@/utils/cn"

export function Money({ value, className, signed, currency }: { value: number; className?: string; signed?: boolean; currency?: string }) {
  const { formatMoney } = useLocale()
  const s = formatMoney(Math.abs(value), currency)
  const prefix = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : ""
  return (
    <span className={cn("tabular-nums whitespace-nowrap", signed && value > 0 && "text-success", signed && value < 0 && "text-destructive", className)} dir="ltr">
      {prefix}
      {s}
    </span>
  )
}

export function Pct({ value, className }: { value: number | null | undefined; className?: string }) {
  const { formatNumber } = useLocale()
  if (value == null) return <span className={cn("text-muted-foreground", className)}>—</span>
  return (
    <span className={cn("tabular-nums", value > 0 && "text-success", value < 0 && "text-destructive", className)} dir="ltr">
      {value > 0 ? "+" : ""}
      {formatNumber(value, { maximumFractionDigits: 1 })}%
    </span>
  )
}
