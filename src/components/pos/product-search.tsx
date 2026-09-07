"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ScanBarcode, Package, Search } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge, Skeleton } from "@/components/ui/misc"
import { Money } from "@/components/shared/money"
import { EmptyState } from "@/components/shared/empty-state"
import { api, ApiError } from "@/lib/api-client"
import { useOfflineCatalog, useOfflineStockDeltas, useOnline } from "@/hooks/use-offline"
import { applyStockDeltas, lookupOffline } from "@/lib/offline/queue-logic"
import type { PosProduct } from "./cart-store"
import { cn } from "@/utils/cn"

interface Props {
  storeId: string
  onAdd: (p: PosProduct) => void
}

/**
 * Barcode scanners act as keyboards and end with Enter. We debounce typing for
 * search suggestions, and on Enter we do an exact lookup and add immediately when unique.
 */
export function ProductSearch({ storeId, onAdd }: Props) {
  const { t } = useTranslation()
  const [term, setTerm] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounced = useDebounce(term.trim(), 180)

  // Global shortcut: "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Local catalogue (IndexedDB) makes scanning work during internet cuts; stock is adjusted for sales queued offline.
  const catalog = useOfflineCatalog(storeId)
  const deltas = useOfflineStockDeltas(storeId)
  const online = useOnline()
  const localProducts = useMemo(() => applyStockDeltas(catalog.data ?? [], deltas), [catalog.data, deltas])
  const localLookup = useCallback(
    (q: string) => {
      const filtered = !q && category ? localProducts.filter((p) => p.category?.id === category) : localProducts
      return lookupOffline(filtered, q, q ? 24 : 60)
    },
    [localProducts, category]
  )
  const isNetworkError = (err: unknown) => err instanceof ApiError && err.code === "NETWORK"

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () =>
      api.get<{ id: string; name: string; _count: { products: number } }[]>("/api/categories").catch((err) => {
        if (!isNetworkError(err)) throw err
        // Derive categories from the local catalogue
        const m = new Map<string, { id: string; name: string; _count: { products: number } }>()
        for (const p of localProducts) if (p.category) m.set(p.category.id, { ...p.category, _count: { products: (m.get(p.category.id)?._count.products ?? 0) + 1 } })
        return [...m.values()]
      }),
  })
  const products = useQuery({
    queryKey: ["pos-products", storeId, debounced, category, online],
    queryFn: async () => {
      if (!online && localProducts.length) return localLookup(debounced).items
      try {
        return debounced
          ? await api.get<{ exact: boolean; items: PosProduct[] }>("/api/products/lookup", { q: debounced, storeId }).then((r) => r.items)
          : await api.get<{ items: PosProduct[] }>("/api/products", { storeId, categoryId: category ?? undefined, isActive: "true", pageSize: 60, sortBy: "name" }).then((r) => r.items)
      } catch (err) {
        if (isNetworkError(err) && localProducts.length) return localLookup(debounced).items
        throw err
      }
    },
    placeholderData: (prev) => prev,
  })

  const visibleProducts = !online && catalog.data ? localLookup(debounced).items : products.data ? applyStockDeltas(products.data, deltas) : undefined

  const onEnter = async () => {
    const q = term.trim()
    if (!q) return
    try {
      let r: { exact: boolean; items: PosProduct[] }
      if (!online && localProducts.length) r = localLookup(q)
      else {
        try {
          r = await api.get<{ exact: boolean; items: PosProduct[] }>("/api/products/lookup", { q, storeId })
          r.items = applyStockDeltas(r.items, deltas)
        } catch (err) {
          if (!isNetworkError(err) || !localProducts.length) throw err
          r = localLookup(q)
        }
      }
      if (r.exact || r.items.length === 1) {
        onAdd(r.items[0])
        setTerm("")
      } else if (r.items.length === 0) {
        toast.error(t("pos.productNotFound", { term: q }))
      }
    } catch (err) {
      toast.error(isNetworkError(err) ? t("errors.NETWORK") : t("common.unknownError"))
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <ScanBarcode className="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void onEnter()
            }
          }}
          placeholder={t("pos.scanOrSearch")}
          className="h-12 ps-11 text-base"
          inputMode="search"
          autoComplete="off"
        />
        {term ? <Button variant="ghost" size="sm" className="absolute end-1 top-1/2 -translate-y-1/2" onClick={() => setTerm("")}>{t("common.close")}</Button> : <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
      </div>

      {!debounced ? (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
          <Button size="sm" variant={category === null ? "default" : "outline"} className="shrink-0 h-8" onClick={() => setCategory(null)}>{t("pos.allCategories")}</Button>
          {categories.data?.filter((c) => c._count.products > 0).map((c) => (
            <Button key={c.id} size="sm" variant={category === c.id ? "default" : "outline"} className="shrink-0 h-8" onClick={() => setCategory(c.id)}>{c.name}</Button>
          ))}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1">
        {products.isLoading && !products.data ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : visibleProducts?.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {visibleProducts.map((p) => {
              const out = p.stockQuantity <= 0
              return (
                <button
                  key={p.id}
                  onClick={() => onAdd(p)}
                  className={cn("group relative flex flex-col justify-between rounded-lg border bg-card p-3 text-start transition-all hover:border-primary hover:shadow-sm active:scale-[0.98] cursor-pointer min-h-[7rem]", out && "opacity-60")}
                >
                  {p.image ? <img src={p.image} alt="" className="absolute inset-x-0 top-0 h-12 w-full object-cover rounded-t-lg opacity-30 group-hover:opacity-40" /> : null}
                  <div className="relative">
                    <p className="text-sm font-medium leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.sku}</p>
                  </div>
                  <div className="relative flex items-end justify-between gap-1 mt-2">
                    <Money value={p.sellingPrice} className="font-semibold text-sm" />
                    <Badge variant={out ? "destructive" : p.stockQuantity <= 5 ? "warning" : "muted"} className="text-[10px] px-1.5">{p.stockQuantity}</Badge>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={Package} title={debounced ? t("pos.productNotFound", { term: debounced }) : t("products.noProducts")} />
        )}
      </div>
    </div>
  )
}
