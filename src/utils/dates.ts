import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  differenceInCalendarDays,
} from "date-fns"

export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom"

export interface DateRange {
  from: Date
  to: Date
}

export function resolveDateRange(preset: DatePreset, from?: Date, to?: Date, now = new Date()): DateRange {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) }
    case "yesterday": {
      const y = subDays(now, 1)
      return { from: startOfDay(y), to: endOfDay(y) }
    }
    case "last7":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) }
    case "last30":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) }
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfDay(now) }
    case "lastMonth": {
      const lm = subMonths(now, 1)
      return { from: startOfMonth(lm), to: endOfMonth(lm) }
    }
    case "custom":
      if (!from || !to) throw new Error("Custom range requires from and to")
      return { from: startOfDay(from), to: endOfDay(to) }
  }
}

/** Range of equal length immediately preceding the given range (for trend comparison). */
export function previousRange(range: DateRange): DateRange {
  const days = differenceInCalendarDays(range.to, range.from) + 1
  return { from: startOfDay(subDays(range.from, days)), to: endOfDay(subDays(range.from, 1)) }
}

export function daysInRange(range: DateRange): number {
  return Math.max(1, differenceInCalendarDays(range.to, range.from) + 1)
}

/** YYYY-MM-DD in local time — used as bucket key for daily aggregation. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
