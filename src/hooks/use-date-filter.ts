"use client"

import { useMemo, useState } from "react"
import type { DateFilter } from "@/components/shared/date-range-picker"
import { dateFilterParams } from "@/components/shared/date-range-picker"

export function useDateFilter(initial: DateFilter["preset"] = "today") {
  const [filter, setFilter] = useState<DateFilter>({ preset: initial })
  const params = useMemo(() => dateFilterParams(filter), [filter])
  return { filter, setFilter, params, ready: params !== null }
}
