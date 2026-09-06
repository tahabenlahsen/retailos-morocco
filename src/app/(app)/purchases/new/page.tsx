"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PoForm, type PoFormValue } from "@/components/purchases/po-form"
import { useStore } from "@/components/providers/store-provider"
import { useApiError } from "@/hooks/use-api-error"
import { api } from "@/lib/api-client"

interface ReorderItem { product: { id: string; name: string; sku: string; unit: string; supplier: { id: string } | null }; suggestedOrderQty: number }
interface ProductLite { id: string; purchasePrice: number; taxRate: number }

function NewPoInner() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const { storeId, effectiveStoreId, stores, setStoreId } = useStore()
  const { showError } = useApiError()
  const sid = params.get("storeId") ?? storeId ?? effectiveStoreId
  const [value, setValue] = useState<PoFormValue>({ supplierId: "", items: [], expectedDelivery: "", notes: "" })

  // Prefill from reorder recommendations
  const fromReorder = params.get("from") === "reorder"
  const reorder = useQuery({ queryKey: ["inventory", "reorder", sid, 14], queryFn: () => api.get<{ items: ReorderItem[] }>("/api/inventory/reorder", { storeId: sid }), enabled: fromReorder && !!sid })
  useEffect(() => {
    if (!reorder.data || value.items.length) return
    const items = reorder.data.items.filter((r) => r.suggestedOrderQty > 0)
    if (!items.length) return
    void Promise.all(items.map((r) => api.get<ProductLite>(`/api/products/${r.product.id}`))).then((products) => {
      const bySupplier = items.reduce<Record<string, number>>((acc, r) => { const k = r.product.supplier?.id ?? ""; acc[k] = (acc[k] ?? 0) + 1; return acc }, {})
      const topSupplier = Object.entries(bySupplier).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
      setValue((v) => ({ ...v, supplierId: topSupplier, items: items.map((r, i) => ({ productId: r.product.id, name: r.product.name, sku: r.product.sku, unit: r.product.unit, quantity: r.suggestedOrderQty, unitPrice: products[i].purchasePrice, taxRate: products[i].taxRate })) }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reorder.data])

  const create = useMutation({
    mutationFn: (status: "DRAFT" | "ORDERED") => api.post<{ id: string }>("/api/purchases", { storeId: sid, supplierId: value.supplierId, items: value.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate })), expectedDelivery: value.expectedDelivery ? new Date(value.expectedDelivery) : null, notes: value.notes || undefined, status }),
    onSuccess: (po) => { toast.success(t("common.saved")); router.push(`/purchases/${po.id}`) },
    onError: showError,
  })
  const valid = value.supplierId && value.items.length > 0

  return (
    <>
      <PageHeader title={t("purchases.create")} actions={<Button variant="ghost" asChild><Link href="/purchases"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("common.back")}</Link></Button>} />
      {stores.length > 1 ? <div className="mb-4 max-w-xs"><Select value={sid ?? ""} onValueChange={(v) => { setStoreId(v); setValue((x) => ({ ...x, items: [] })) }}><SelectTrigger><SelectValue placeholder={t("common.store")} /></SelectTrigger><SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div> : null}
      <Card><CardContent className="p-5">{sid ? <PoForm storeId={sid} value={value} onChange={setValue} /> : null}</CardContent></Card>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => create.mutate("DRAFT")} disabled={!valid} loading={create.isPending}>{t("purchases.saveDraft")}</Button>
        <Button onClick={() => create.mutate("ORDERED")} disabled={!valid} loading={create.isPending}>{t("purchases.markOrdered")}</Button>
      </div>
    </>
  )
}

export default function NewPurchasePage() {
  return <RequirePermission permission="purchase.create"><Suspense><NewPoInner /></Suspense></RequirePermission>
}
