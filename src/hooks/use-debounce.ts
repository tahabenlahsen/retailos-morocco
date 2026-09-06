"use client"

import { useEffect, useState } from "react"

/**
 * Debounces a value. `onSettle` runs (asynchronously, inside the timer) whenever the
 * debounced value changes — used to reset pagination without a cascading effect.
 */
export function useDebounce<T>(value: T, delay = 250, onSettle?: (v: T) => void): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const h = setTimeout(() => {
      setDebounced((prev) => {
        if (prev !== value) onSettle?.(value)
        return value
      })
    }, delay)
    return () => clearTimeout(h)
    // `onSettle` is intentionally excluded: callers pass inline lambdas and the latest one is
    // always used because the effect re-runs whenever `value` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay])
  return debounced
}
