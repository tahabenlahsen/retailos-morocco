"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ArrowLeft, PackageCheck, Send, Ban, Pencil } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Money } from "@/components/shared/money"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge, Checkbox, Skeleton } from "@/components/ui/misc"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PoForm, type PoFormValue } from "@/components/purchases/po-form"
import { poStatusVariant } from "@/components/purchases/po-status"
import { useMe } from "@/hooks/use-me"
import { useLocale } from "@/components/providers/locale-provider"
import { useApiError } from "@/hooks/use-api-error"
import { api } from "@/lib/api-client"

interface Po { id: string; orderNumber: string; status: string; subtotal: number; taxAmount: number; total: number; notes: string | null; createdAt: string; expectedDelivery: string | null; deliveredAt: string | null; storeId: string; supplierId: string; supplier: { id: string; name: string; phone: string | null; email: string | null }; store: { id: string; name: string }; items: { id: string; productId: string; quantity: number; receivedQuantity: number; unitPrice: number; taxRate: number; total: number; product: { id: string; name: string; sku: string; unit: string; stockQuantity: number } }[] }

export default function PurchaseDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { can } = useMe()
  const { formatDate, formatDateTime } = useLocale()
  const { showError } = useApiError()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<PoFormValue>({ supplierId: "", items: [], expectedDelivery: "", notes: "" })
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [recv, setRecv] = useState<Record<string, number>>({})
  const [updatePrice, setUpdatePrice] = useState(true)
  const [cancelOpen, setCancelOpen] = useState(false)

  const q = useQuery({ queryKey: ["purchase", id], queryFn: () => api.get<Po>(`/api/purchases/${id}`) })
  const po = q.data
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["purchase", id] }); void qc.invalidateQueries({ queryKey: ["purchases"] }); void qc.invalidateQueries({ queryKey: ["products"] }); void qc.invalidateQueries({ queryKey: ["inventory"] }); void qc.invalidateQueries({ queryKey: ["suppliers"] }) }

  const startEditing = () => {
    if (!po) return
    setForm({ supplierId: po.supplierId, items: po.items.map((i) => ({ productId: i.productId, name: i.product.name, sku: i.product.sku, unit: i.product.unit, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate })), expectedDelivery: po.expectedDelivery ? po.expectedDelivery.slice(0, 10) : "", notes: po.notes ?? "" })
    setEditing(true)
  }
  const openReceive = () => {
    if (!po) return
    setRecv(Object.fromEntries(po.items.map((i) => [i.id, i.quantity - i.receivedQuantity])))
    setReceiveOpen(true)
  }

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/purchases/${id}`, body),
    onSuccess: () => { invalidate(); setEditing(false); setCancelOpen(false); toast.success(t("common.saved")) },
    onError: showError,
  })
  const receive = useMutation({
    mutationFn: () => api.post(`/api/purchases/${id}`, { items: Object.entries(recv).filter(([, v]) => v > 0).map(([purchaseOrderItemId, receivedQuantity]) => ({ purchaseOrderItemId, receivedQuantity })), updatePurchasePrice: updatePrice }),
    onSuccess: () => { invalidate(); setReceiveOpen(false); toast.success(t("purchases.receivedOk")) },
    onError: showError,
  })

  const saveEdit = () => update.mutate({ supplierId: form.supplierId, items: po?.status === "PARTIALLY_RECEIVED" ? undefined : form.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate })), expectedDelivery: form.expectedDelivery ? new Date(form.expectedDelivery) : null, notes: form.notes || undefined })
  const editable = po && (po.status === "DRAFT" || po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") && can("purchase.update")
  const receivable = po && (po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") && can("purchase.receive")

  return (
    <RequirePermission permission="purchase.view">
      <PageHeader title={po?.orderNumber ?? t("purchases.title")} description={po ? `${po.supplier.name} · ${po.store.name} · ${formatDateTime(po.createdAt)}` : undefined} actions={<>
        <Button variant="ghost" asChild><Link href="/purchases"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("common.back")}</Link></Button>
        {editable && !editing ? <Button variant="outline" onClick={startEditing}><Pencil className="h-4 w-4" />{t("common.edit")}</Button> : null}
        {po?.status === "DRAFT" && can("purchase.update") ? <Button onClick={() => update.mutate({ status: "ORDERED" })} loading={update.isPending}><Send className="h-4 w-4" />{t("purchases.markOrdered")}</Button> : null}
        {receivable ? <Button onClick={openReceive}><PackageCheck className="h-4 w-4" />{t("purchases.receive")}</Button> : null}
        {po && (po.status === "DRAFT" || po.status === "ORDERED") && can("purchase.cancel") ? <Button variant="destructive" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" />{t("purchases.cancelOrder")}</Button> : null}
      </>} />

      {q.isLoading || !po ? <Skeleton className="h-96" /> : editing ? (
        <Card><CardContent className="p-5 space-y-4">
          <PoForm storeId={po.storeId} value={form} onChange={setForm} lockItems={po.status === "PARTIALLY_RECEIVED"} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(false)}>{t("common.cancel")}</Button><Button onClick={saveEdit} disabled={!form.supplierId || !form.items.length} loading={update.isPending}>{t("common.save")}</Button></div>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="flex items-center gap-2">{t("sales.items")}<Badge variant={poStatusVariant(po.status)}>{t(`purchases.status.${po.status}`)}</Badge></CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground"><tr><th className="text-start py-1">{t("inventory.product")}</th><th className="text-end">{t("purchases.ordered")}</th><th className="text-end">{t("purchases.received")}</th><th className="text-end hidden sm:table-cell">{t("purchases.unitPriceHT")}</th><th className="text-end">{t("common.total")}</th></tr></thead>
                <tbody className="divide-y">{po.items.map((it) => <tr key={it.id}><td className="py-2"><p className="font-medium">{it.product.name}</p><p className="text-xs text-muted-foreground font-mono">{it.product.sku}</p></td><td className="text-end tabular-nums">{it.quantity}</td><td className="text-end tabular-nums"><span className={it.receivedQuantity >= it.quantity ? "text-success font-medium" : it.receivedQuantity > 0 ? "text-amber-600" : ""}>{it.receivedQuantity}</span></td><td className="text-end hidden sm:table-cell"><Money value={it.unitPrice} /></td><td className="text-end font-medium"><Money value={it.total} /></td></tr>)}</tbody>
              </table>
              <div className="mt-4 ms-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>{t("common.subtotal")}</span><Money value={po.subtotal} /></div>
                <div className="flex justify-between text-muted-foreground"><span>{t("common.tax")}</span><Money value={po.taxAmount} /></div>
                <div className="flex justify-between font-semibold text-base border-t pt-1"><span>{t("common.total")}</span><Money value={po.total} /></div>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card><CardHeader><CardTitle>{t("purchases.supplier")}</CardTitle></CardHeader><CardContent className="text-sm space-y-1"><Link href={`/suppliers/${po.supplier.id}`} className="font-medium text-primary hover:underline">{po.supplier.name}</Link>{po.supplier.phone ? <p dir="ltr">{po.supplier.phone}</p> : null}{po.supplier.email ? <p>{po.supplier.email}</p> : null}</CardContent></Card>
            <Card><CardContent className="p-5 text-sm space-y-2"><div className="flex justify-between"><span className="text-muted-foreground">{t("purchases.expected")}</span><span>{po.expectedDelivery ? formatDate(po.expectedDelivery) : "—"}</span></div><div className="flex justify-between"><span className="text-muted-foreground">{t("purchases.delivered")}</span><span>{po.deliveredAt ? formatDate(po.deliveredAt) : "—"}</span></div>{po.notes ? <p className="pt-2 border-t whitespace-pre-wrap">{po.notes}</p> : null}</CardContent></Card>
          </div>
        </div>
      )}

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("purchases.receiveTitle")}</DialogTitle><DialogDescription>{po?.orderNumber} · {po?.supplier.name}</DialogDescription></DialogHeader>
          <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => po && setRecv(Object.fromEntries(po.items.map((i) => [i.id, i.quantity - i.receivedQuantity])))}>{t("purchases.receiveAll")}</Button></div>
          <div className="divide-y rounded-md border max-h-80 overflow-y-auto scrollbar-thin">
            {po?.items.map((it) => { const remaining = it.quantity - it.receivedQuantity; return (
              <div key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><p className="font-medium truncate">{it.product.name}</p><p className="text-xs text-muted-foreground">{t("purchases.receiving")}: {remaining} / {it.quantity} {it.product.unit}</p></div>
                <Input type="number" min={0} max={remaining} step={1} className="w-24 text-end" value={recv[it.id] ?? 0} disabled={remaining <= 0} onChange={(e) => setRecv((r) => ({ ...r, [it.id]: Math.min(remaining, Math.max(0, Number(e.target.value) || 0)) }))} />
              </div>
            ) })}
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={updatePrice} onCheckedChange={(v) => setUpdatePrice(!!v)} />{t("purchases.updatePrice")}</label>
          <DialogFooter><Button variant="outline" onClick={() => setReceiveOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => receive.mutate()} disabled={!Object.values(recv).some((v) => v > 0)} loading={receive.isPending}><PackageCheck className="h-4 w-4" />{t("purchases.receive")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={t("purchases.cancelOrder")} confirmLabel={t("purchases.cancelOrder")} loading={update.isPending} onConfirm={() => update.mutate({ status: "CANCELLED" })} />
    </RequirePermission>
  )
}
