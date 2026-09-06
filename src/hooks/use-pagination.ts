"use client"

import { useState } from "react"

/**
 * Page state that resets to 1 whenever `resetKey` changes (filters, search, store…).
 * Uses React's "adjust state during render" pattern instead of an effect, so there is
 * no extra render pass and no stale page shown with new filters.
 */
export function usePagination(resetKey: string) {
  const [page, setPage] = useState(1)
  const [key, setKey] = useState(resetKey)
  if (key !== resetKey) {
    setKey(resetKey)
    setPage(1)
  }
  return { page: key !== resetKey ? 1 : page, setPage }
}
