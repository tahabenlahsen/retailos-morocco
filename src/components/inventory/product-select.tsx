"use client"

import { useState } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"
import type { ProductRow } from "@/components/products/product-form"
import { cn } from "@/utils/cn"

/** Searchable product picker (by name/SKU/barcode) scoped to a store. */
export function ProductSelect({ storeId, value, onChange, className }: { storeId: string | undefined; value: ProductRow | null; onChange: (p: ProductRow | null) => void; className?: string }) {
  const { t } = useTranslation()
  const [term, setTerm] = useState("")
  const [open, setOpen] = useState(false)
  const debounced = useDebounce(term.trim(), 200)
  const q = useQuery({ queryKey: ["product-select", storeId, debounced], queryFn: () => api.get<{ items: ProductRow[] }>("/api/products/lookup", { q: debounced, storeId }), enabled: open && debounced.length >= 1 })

  if (value) {
    return (
      <div className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm", className)}>
        <div className="min-w-0"><p className="font-medium truncate">{value.name}</p><p className="text-xs text-muted-foreground">{value.sku} · {t("products.stock")}: {value.stockQuantity} {value.unit}</p></div>
        <button type="button" className="text-xs text-primary hover:underline cursor-pointer" onClick={() => onChange(null)}>{t("common.change")}</button>
      </div>
    )
  }
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="ps-9" placeholder={t("pos.scanOrSearch")} value={term} onChange={(e) => setTerm(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} autoComplete="off" />
      {open && debounced && q.data ? (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto scrollbar-thin rounded-md border bg-popover shadow-md">
          {q.data.items.length ? q.data.items.map((p) => (
            <button key={p.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-accent cursor-pointer" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(p); setTerm("") }}>
              <span className="truncate">{p.name} <span className="text-muted-foreground text-xs">{p.sku}</span></span>
              <span className="text-xs text-muted-foreground shrink-0">{p.stockQuantity} {p.unit}</span>
            </button>
          )) : <p className="p-3 text-sm text-muted-foreground">{t("common.noResults")}</p>}
        </div>
      ) : null}
    </div>
  )
}
