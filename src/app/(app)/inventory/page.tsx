"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Boxes, ArrowLeftRight, SlidersHorizontal, Lightbulb, History, AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { DataTable, type Column } from "@/components/shared/data-table"
import { Money } from "@/components/shared/money"
import { FormField } from "@/components/shared/form-field"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ProductSelect } from "@/components/inventory/product-select"
import type { ProductRow } from "@/components/products/product-form"
import { useMe } from "@/hooks/use-me"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { useApiError } from "@/hooks/use-api-error"
import { api, type Paginated } from "@/lib/api-client"
import { MOVEMENT_TYPES } from "@/utils/validation"

interface Movement { id: string; type: string; quantity: number; previousQuantity: number; newQuantity: number; reason: string | null; createdAt: string; userName: string | null; product: { id: string; name: string; sku: string; unit: string } }
interface Summary { productCount: number; totalUnits: number; costValue: number; retailValue: number; lowStockCount: number; outOfStockCount: number; lowStock: { id: string; name: string; sku: string; stockQuantity: number; minimumStock: number; unit: string }[]; outOfStock: { id: string; name: string; sku: string; stockQuantity: number; minimumStock: number; unit: string }[] }
interface Reorder { lookbackDays: number; coverDays: number; disclaimer: string; items: { product: { id: string; name: string; sku: string; unit: string; store: { name: string }; supplier: { id: string; name: string } | null }; stock: number; minimumStock: number; soldInPeriod: number; avgDailySales: number; estimatedDaysRemaining: number | null; suggestedOrderQty: number; estimatedCost: number; urgency: "OUT" | "CRITICAL" | "LOW" | "OK" }[] }

const ALL = "__all__"

function InventoryInner() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const { can } = useMe()
  const { storeId, effectiveStoreId, stores } = useStore()
  const { formatDateTime, formatNumber } = useLocale()
  const { showError } = useApiError()
  const qc = useQueryClient()
  const [tab, setTab] = useState(params.get("tab") ?? "summary")
  const [page, setPage] = useState(1)
  const [type, setType] = useState(ALL)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [product, setProduct] = useState<ProductRow | null>(null)
  const [adjType, setAdjType] = useState<"ADJUSTMENT" | "DAMAGE" | "LOSS" | "RETURN">("ADJUSTMENT")
  const [qty, setQty] = useState("")
  const [reason, setReason] = useState("")
  const [toStore, setToStore] = useState("")
  const [coverDays, setCoverDays] = useState(14)

  const sid = storeId ?? undefined
  const summary = useQuery({ queryKey: ["inventory", "summary", sid], queryFn: () => api.get<Summary>("/api/inventory/summary", { storeId: sid }) })
  const movements = useQuery({ queryKey: ["inventory", "movements", sid, type, page], queryFn: () => api.get<Paginated<Movement>>("/api/inventory/movements", { storeId: sid, type: type === ALL ? undefined : type, page, pageSize: 50 }), enabled: tab === "movements", placeholderData: (p) => p })
  const reorder = useQuery({ queryKey: ["inventory", "reorder", sid, coverDays], queryFn: () => api.get<Reorder>("/api/inventory/reorder", { storeId: sid, coverDays }), enabled: tab === "reorder" })

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["inventory"] }); void qc.invalidateQueries({ queryKey: ["products"] }); void qc.invalidateQueries({ queryKey: ["pos-products"] }) }
  const adjust = useMutation({ mutationFn: () => api.post("/api/inventory/adjust", { productId: product!.id, type: adjType, quantity: Number(qty), reason }), onSuccess: () => { invalidate(); setAdjustOpen(false); setProduct(null); setQty(""); setReason(""); toast.success(t("inventory.adjusted")) }, onError: showError })
  const transfer = useMutation({ mutationFn: () => api.post("/api/inventory/transfer", { productId: product!.id, fromStoreId: product!.storeId, toStoreId: toStore, quantity: Number(qty), reason: reason || undefined }), onSuccess: () => { invalidate(); setTransferOpen(false); setProduct(null); setQty(""); setReason(""); toast.success(t("inventory.transferred")) }, onError: showError })

  const movCols: Column<Movement>[] = [
    { key: "date", header: t("common.date"), cell: (m) => <span className="text-xs whitespace-nowrap">{formatDateTime(m.createdAt)}</span> },
    { key: "product", header: t("inventory.product"), cell: (m) => <div className="min-w-0"><p className="font-medium truncate">{m.product.name}</p><p className="text-xs text-muted-foreground font-mono">{m.product.sku}</p></div> },
    { key: "type", header: t("inventory.type"), cell: (m) => <Badge variant={m.quantity > 0 ? "success" : m.type === "SALE" ? "secondary" : "destructive"}>{t(`inventory.types.${m.type}`)}</Badge> },
    { key: "prev", header: t("inventory.previous"), cell: (m) => m.previousQuantity, align: "end", hideOnMobile: true },
    { key: "delta", header: t("inventory.change"), cell: (m) => <span className={`font-semibold tabular-nums ${m.quantity > 0 ? "text-success" : "text-destructive"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</span>, align: "end" },
    { key: "new", header: t("inventory.newQty"), cell: (m) => <span className="font-medium">{m.newQuantity}</span>, align: "end" },
    { key: "reason", header: t("common.reason"), cell: (m) => <span className="text-muted-foreground text-xs">{m.reason ?? "—"}</span>, hideOnMobile: true },
    { key: "user", header: t("inventory.user"), cell: (m) => <span className="text-xs text-muted-foreground">{m.userName ?? "—"}</span>, hideOnMobile: true },
  ]

  const urgencyVariant = { OUT: "destructive", CRITICAL: "destructive", LOW: "warning", OK: "muted" } as const
  const reorderCols: Column<Reorder["items"][number]>[] = [
    { key: "product", header: t("inventory.product"), cell: (r) => <div className="min-w-0"><p className="font-medium truncate">{r.product.name}</p><p className="text-xs text-muted-foreground">{r.product.sku}{r.product.supplier ? ` · ${r.product.supplier.name}` : ""}{!storeId && stores.length > 1 ? ` · ${r.product.store.name}` : ""}</p></div> },
    { key: "urgency", header: t("common.status"), cell: (r) => <Badge variant={urgencyVariant[r.urgency]}>{t(`inventory.urgency.${r.urgency}`)}</Badge> },
    { key: "stock", header: t("products.stock"), cell: (r) => <span className="tabular-nums">{r.stock} <span className="text-muted-foreground">/ {r.minimumStock}</span></span>, align: "end" },
    { key: "avg", header: t("inventory.avgDaily"), cell: (r) => formatNumber(r.avgDailySales, { maximumFractionDigits: 1 }), align: "end", hideOnMobile: true },
    { key: "days", header: t("inventory.daysLeft"), cell: (r) => r.estimatedDaysRemaining == null ? "—" : `≈ ${formatNumber(r.estimatedDaysRemaining, { maximumFractionDigits: 1 })}`, align: "end" },
    { key: "suggest", header: t("inventory.suggested"), cell: (r) => <span className="font-semibold tabular-nums">{r.suggestedOrderQty} {r.product.unit}</span>, align: "end" },
    { key: "cost", header: t("inventory.estCost"), cell: (r) => <Money value={r.estimatedCost} />, align: "end", hideOnMobile: true },
  ]

  const s = summary.data

  return (
    <>
      <PageHeader title={t("inventory.title")} actions={<>
        {can("inventory.adjust") ? <Button variant="outline" onClick={() => { setProduct(null); setAdjustOpen(true) }}><SlidersHorizontal className="h-4 w-4" />{t("inventory.adjust")}</Button> : null}
        {can("inventory.transfer") && stores.length > 1 ? <Button variant="outline" onClick={() => { setProduct(null); setTransferOpen(true) }}><ArrowLeftRight className="h-4 w-4" />{t("inventory.transfer")}</Button> : null}
      </>} />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { label: t("inventory.totalUnits"), value: s ? formatNumber(s.totalUnits) : null, icon: Boxes },
          { label: t("inventory.costValue"), value: s ? <Money value={s.costValue} /> : null, icon: Boxes },
          { label: t("inventory.retailValue"), value: s ? <Money value={s.retailValue} /> : null, icon: Boxes },
          { label: `${t("dashboard.lowStock")} / ${t("dashboard.outOfStock")}`, value: s ? <><span className="text-amber-600">{s.lowStockCount}</span> / <span className="text-destructive">{s.outOfStockCount}</span></> : null, icon: AlertTriangle },
        ].map((k) => <Card key={k.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.label}</p>{k.value == null ? <Skeleton className="h-7 w-24 mt-1" /> : <p className="text-xl font-bold mt-1 tabular-nums">{k.value}</p>}</CardContent></Card>)}
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); router.replace(`/inventory?tab=${v}`) }}>
        <TabsList><TabsTrigger value="summary"><AlertTriangle className="h-4 w-4 me-1.5" />{t("dashboard.lowStock")}</TabsTrigger><TabsTrigger value="movements"><History className="h-4 w-4 me-1.5" />{t("inventory.movements")}</TabsTrigger><TabsTrigger value="reorder"><Lightbulb className="h-4 w-4 me-1.5" />{t("inventory.reorder")}</TabsTrigger></TabsList>
        <TabsContent value="summary">
          <DataTable columns={[
            { key: "name", header: t("inventory.product"), cell: (p) => <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground font-mono">{p.sku}</p></div> },
            { key: "stock", header: t("products.stock"), cell: (p) => <Badge variant={p.stockQuantity <= 0 ? "destructive" : "warning"}>{p.stockQuantity} {p.unit}</Badge>, align: "center" },
            { key: "min", header: t("products.minStock"), cell: (p) => p.minimumStock, align: "end" },
            { key: "act", header: "", cell: (p) => <Button size="sm" variant="ghost" asChild><Link href="/inventory?tab=reorder" onClick={() => setTab("reorder")}>{t("inventory.reorder")}</Link></Button>, align: "end" },
          ] as Column<Summary["lowStock"][number]>[]} rows={s ? [...s.outOfStock, ...s.lowStock] : undefined} rowKey={(p) => p.id} loading={summary.isLoading} emptyTitle={t("dashboard.noLowStock")} />
        </TabsContent>
        <TabsContent value="movements">
          <div className="mb-3 flex items-center gap-2"><Select value={type} onValueChange={(v) => { setType(v); setPage(1) }}><SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("common.all")}</SelectItem>{MOVEMENT_TYPES.map((m) => <SelectItem key={m} value={m}>{t(`inventory.types.${m}`)}</SelectItem>)}</SelectContent></Select></div>
          <DataTable columns={movCols} rows={movements.data?.items} rowKey={(m) => m.id} loading={movements.isLoading} emptyTitle={t("inventory.noMovements")} dense pagination={movements.data ? { page, pageSize: movements.data.pageSize, total: movements.data.total, onPageChange: setPage } : undefined} />
        </TabsContent>
        <TabsContent value="reorder">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <p className="text-muted-foreground flex-1 min-w-[240px]"><Lightbulb className="inline h-4 w-4 me-1" />{t("inventory.reorderHint", { days: reorder.data?.lookbackDays ?? 30 })}</p>
            <label className="flex items-center gap-2">{t("inventory.daysLeft")}: <Input type="number" min={1} max={90} className="h-8 w-20" value={coverDays} onChange={(e) => setCoverDays(Number(e.target.value) || 14)} /></label>
            {can("purchase.create") && reorder.data?.items.length ? <Button size="sm" asChild><Link href={`/purchases/new?from=reorder${sid ? `&storeId=${sid}` : ""}`}>{t("inventory.createPo")}</Link></Button> : null}
          </div>
          <DataTable columns={reorderCols} rows={reorder.data?.items} rowKey={(r) => r.product.id} loading={reorder.isLoading} emptyTitle={t("dashboard.noLowStock")} dense />
        </TabsContent>
      </Tabs>

      {/* Adjust */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("inventory.adjust")}</DialogTitle></DialogHeader>
          <FormField label={t("inventory.product")} required>{() => <ProductSelect storeId={storeId ?? effectiveStoreId} value={product} onChange={setProduct} />}</FormField>
          <FormField label={t("inventory.adjustType")}>{(id) => <Select value={adjType} onValueChange={(v) => setAdjType(v as typeof adjType)}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{(["ADJUSTMENT", "RETURN", "DAMAGE", "LOSS"] as const).map((k) => <SelectItem key={k} value={k}>{t(`inventory.types.${k}`)}</SelectItem>)}</SelectContent></Select>}</FormField>
          <FormField label={adjType === "ADJUSTMENT" ? t("inventory.newQuantity") : t("inventory.qty")} required>{(id) => <Input id={id} type="number" min={0} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />}</FormField>
          <FormField label={t("common.reason")} required>{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
          <DialogFooter><Button variant="outline" onClick={() => setAdjustOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => adjust.mutate()} disabled={!product || qty === "" || reason.trim().length < 2} loading={adjust.isPending}>{t("common.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("inventory.transfer")}</DialogTitle><DialogDescription>{t("inventory.fromStore")}: {stores.find((s) => s.id === (product?.storeId ?? storeId ?? effectiveStoreId))?.name}</DialogDescription></DialogHeader>
          <FormField label={t("inventory.product")} required>{() => <ProductSelect storeId={storeId ?? effectiveStoreId} value={product} onChange={setProduct} />}</FormField>
          <FormField label={t("inventory.toStore")} required>{(id) => <Select value={toStore} onValueChange={setToStore}><SelectTrigger id={id}><SelectValue placeholder={t("common.select")} /></SelectTrigger><SelectContent>{stores.filter((s) => s.id !== (product?.storeId ?? storeId ?? effectiveStoreId)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>}</FormField>
          <FormField label={t("inventory.qty")} required>{(id) => <Input id={id} type="number" min={1} max={product?.stockQuantity} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />}</FormField>
          <FormField label={`${t("common.reason")} (${t("common.optional")})`}>{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
          <DialogFooter><Button variant="outline" onClick={() => setTransferOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => transfer.mutate()} disabled={!product || !toStore || !(Number(qty) > 0)} loading={transfer.isPending}>{t("inventory.transfer")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function InventoryPage() {
  return <RequirePermission permission="inventory.view"><Suspense><InventoryInner /></Suspense></RequirePermission>
}
