"use client"

import { Suspense, useMemo, useState } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { usePagination } from "@/hooks/use-pagination"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Search, Upload, Download, Tags, Pencil, Trash2, MoreHorizontal, AlertTriangle, DollarSign, Boxes } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { DataTable, type Column } from "@/components/shared/data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Money } from "@/components/shared/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge, Checkbox } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ProductForm, type ProductRow } from "@/components/products/product-form"
import { BulkPriceDialog, BulkStockDialog, ImportDialog } from "@/components/products/bulk-dialogs"
import { TaxonomyDialog } from "@/components/products/taxonomy-dialog"
import { useMe } from "@/hooks/use-me"
import { useStore } from "@/components/providers/store-provider"
import { useCrud } from "@/hooks/use-crud"
import { api, type Paginated } from "@/lib/api-client"
import { useLocale } from "@/components/providers/locale-provider"

const ALL = "__all__"

function ProductsInner() {
  const { t } = useTranslation()
  const params = useSearchParams()
  const { can } = useMe()
  const { storeId, effectiveStoreId, stores } = useStore()
  const { formatNumber } = useLocale()
  const [search, setSearch] = useState("")
  const [categoryId, setCategoryId] = useState<string>(ALL)
  const [lowStock, setLowStock] = useState(params.get("lowStock") === "true")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const debounced = useDebounce(search.trim(), 250)
  const filterKey = `${storeId ?? "all"}:${debounced}:${categoryId}:${lowStock}`
  const { page, setPage } = usePagination(filterKey)
  const [selKey, setSelKey] = useState(filterKey)
  if (selKey !== filterKey) { setSelKey(filterKey); setSelected(new Set()) }
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [del, setDel] = useState<ProductRow | null>(null)
  const [bulkPrice, setBulkPrice] = useState(false)
  const [bulkStock, setBulkStock] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [taxOpen, setTaxOpen] = useState(false)

  const queryParams = { storeId: storeId ?? undefined, search: debounced || undefined, categoryId: categoryId === ALL ? undefined : categoryId, lowStock: lowStock ? "true" : undefined, page, pageSize: 25 }
  const q = useQuery({ queryKey: ["products", queryParams], queryFn: () => api.get<Paginated<ProductRow>>("/api/products", queryParams), placeholderData: (p) => p })
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/categories") })
  const crud = useCrud<Record<string, unknown>>("/api/products", [["products"], ["pos-products"], ["inventory"]])

  const selectedRows = useMemo(() => q.data?.items.filter((p) => selected.has(p.id)) ?? [], [q.data, selected])
  const formStoreId = editing?.storeId ?? storeId ?? effectiveStoreId ?? ""

  const columns: Column<ProductRow>[] = [
    { key: "name", header: t("common.name"), cell: (p) => (
      <div className="flex items-center gap-3 min-w-0">
        {p.image ? <img src={p.image} alt="" className="h-9 w-9 rounded object-cover shrink-0" /> : <div className="h-9 w-9 rounded bg-muted shrink-0" />}
        <div className="min-w-0"><p className="font-medium truncate">{p.name}{!p.isActive ? <Badge variant="muted" className="ms-2">{t("common.inactive")}</Badge> : null}</p><p className="text-xs text-muted-foreground font-mono truncate">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</p></div>
      </div>
    ) },
    { key: "category", header: t("products.category"), cell: (p) => <span className="text-muted-foreground">{p.category.name}</span>, hideOnMobile: true },
    ...(stores.length > 1 && !storeId ? [{ key: "store", header: t("common.store"), cell: (p: ProductRow) => <span className="text-muted-foreground">{p.store.name}</span>, hideOnMobile: true } as Column<ProductRow>] : []),
    { key: "purchase", header: t("products.purchasePrice"), cell: (p) => <Money value={p.purchasePrice} />, align: "end", hideOnMobile: true },
    { key: "selling", header: t("products.sellingPrice"), cell: (p) => <Money value={p.sellingPrice} className="font-medium" />, align: "end" },
    { key: "margin", header: t("products.margin"), cell: (p) => { const ht = p.sellingPrice / (1 + p.taxRate); const m = ht > 0 ? ((ht - (p.costPrice ?? p.purchasePrice)) / ht) * 100 : 0; return <span className={m < 10 ? "text-destructive" : m < 20 ? "text-amber-600" : "text-success"}>{formatNumber(m, { maximumFractionDigits: 0 })}%</span> }, align: "end", hideOnMobile: true },
    { key: "stock", header: t("products.stock"), cell: (p) => <Badge variant={p.stockQuantity <= 0 ? "destructive" : p.stockQuantity <= p.minimumStock ? "warning" : "success"}>{p.stockQuantity <= p.minimumStock ? <AlertTriangle className="h-3 w-3 me-1" /> : null}{p.stockQuantity} {p.unit}</Badge>, align: "center" },
    { key: "actions", header: "", cell: (p) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t("common.actions")}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {can("product.update") ? <DropdownMenuItem onClick={() => { setEditing(p); setFormOpen(true) }}><Pencil />{t("common.edit")}</DropdownMenuItem> : null}
          {can("product.delete") ? <DropdownMenuItem destructive onClick={() => setDel(p)}><Trash2 />{t("common.delete")}</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ), align: "end", className: "w-12" },
  ]

  return (
    <>
      <PageHeader
        title={t("products.title")}
        description={q.data ? t("products.productsCount", { count: q.data.total }) : undefined}
        actions={
          <>
            {can("category.manage") ? <Button variant="outline" onClick={() => setTaxOpen(true)}><Tags className="h-4 w-4" /><span className="hidden sm:inline">{t("products.categories")}</span></Button> : null}
            {can("product.import") ? <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!formStoreId}><Upload className="h-4 w-4" /><span className="hidden sm:inline">{t("common.import")}</span></Button> : null}
            <Button variant="outline" asChild><a href={`/api/products/export${formStoreId ? `?storeId=${formStoreId}` : ""}`} download><Download className="h-4 w-4" /><span className="hidden sm:inline">{t("common.export")}</span></a></Button>
            {can("product.create") ? <Button onClick={() => { setEditing(null); setFormOpen(true) }} disabled={!formStoreId}><Plus className="h-4 w-4" />{t("products.add")}</Button> : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("common.all")} — {t("products.category")}</SelectItem>{categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><Checkbox checked={lowStock} onCheckedChange={(v) => setLowStock(!!v)} />{t("products.lowStockOnly")}</label>
        {selected.size > 0 && can("product.bulkUpdate") ? (
          <div className="ms-auto flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm">
            <span>{t("products.selected", { count: selected.size })}</span>
            <Button size="sm" variant="outline" onClick={() => setBulkPrice(true)}><DollarSign className="h-4 w-4" />{t("products.bulkPrice")}</Button>
            <Button size="sm" variant="outline" onClick={() => setBulkStock(true)}><Boxes className="h-4 w-4" />{t("products.bulkStock")}</Button>
          </div>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(p) => p.id}
        loading={q.isLoading}
        emptyTitle={t("products.noProducts")}
        emptyDescription={t("products.noProductsHint")}
        emptyAction={can("product.create") ? <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" />{t("products.add")}</Button> : undefined}
        onRowClick={can("product.update") ? (p) => { setEditing(p); setFormOpen(true) } : undefined}
        selectable={can("product.bulkUpdate") ? { selected, onToggle: (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }), onToggleAll: (ids) => setSelected((s) => (ids.every((id) => s.has(id)) ? new Set() : new Set(ids))) } : undefined}
        pagination={q.data ? { page, pageSize: q.data.pageSize, total: q.data.total, onPageChange: setPage } : undefined}
      />

      <ProductForm open={formOpen} onOpenChange={setFormOpen} product={editing} storeId={formStoreId} submitting={crud.create.isPending || crud.update.isPending}
        onSubmit={async (v) => {
          if (editing) { const { stockQuantity: _s, ...body } = v; await crud.update.mutateAsync({ id: editing.id, body }) }
          else await crud.create.mutateAsync({ ...v, storeId: formStoreId })
          setFormOpen(false)
        }} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} description={t("products.deleteConfirm")} loading={crud.remove.isPending} onConfirm={() => del && crud.remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
      <BulkPriceDialog open={bulkPrice} onOpenChange={setBulkPrice} productIds={[...selected]} onDone={() => { setSelected(new Set()); void crud.invalidate() }} />
      <BulkStockDialog open={bulkStock} onOpenChange={setBulkStock} products={selectedRows} onDone={() => { setSelected(new Set()); void crud.invalidate() }} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} storeId={formStoreId} />
      <TaxonomyDialog open={taxOpen} onOpenChange={setTaxOpen} />
    </>
  )
}

export default function ProductsPage() {
  return <RequirePermission permission="product.view"><Suspense><ProductsInner /></Suspense></RequirePermission>
}
