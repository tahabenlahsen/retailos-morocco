"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ArrowLeft, Pencil, Trash2, Banknote, Plus } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { EntityDialog, type FieldDef } from "@/components/shared/entity-dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Money } from "@/components/shared/money"
import { FormField } from "@/components/shared/form-field"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge, Skeleton } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { poStatusVariant } from "@/components/purchases/po-status"
import { useMe } from "@/hooks/use-me"
import { useCrud } from "@/hooks/use-crud"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { useApiError } from "@/hooks/use-api-error"
import { api } from "@/lib/api-client"
import { updateSupplierSchema, PAYMENT_METHODS, type PaymentMethod } from "@/utils/validation"
import type { z } from "zod"

interface Supplier { id: string; name: string; phone: string | null; email: string | null; address: string | null; taxNumber: string | null; creditLimit: number | null; currentBalance: number; isActive: boolean; notes: string | null; products: { id: string; name: string; sku: string; stockQuantity: number; minimumStock: number; purchasePrice: number }[]; purchaseOrders: { id: string; orderNumber: string; status: string; total: number; createdAt: string }[]; performance: { orderCount: number; totalPurchases: number; averageDeliveryDays: number | null; onTimeRate: number | null; cancelledCount: number } }
type In = z.input<typeof updateSupplierSchema>

export default function SupplierDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { can } = useMe()
  const { storeId, effectiveStoreId } = useStore()
  const { formatDate, formatNumber } = useLocale()
  const { showError } = useApiError()
  const qc = useQueryClient()
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const [pay, setPay] = useState(false)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER")
  const [reference, setReference] = useState("")

  const q = useQuery({ queryKey: ["supplier", id], queryFn: () => api.get<Supplier>(`/api/suppliers/${id}`) })
  const s = q.data
  const crud = useCrud<never, In>("/api/suppliers", [["suppliers"], ["supplier", id]])
  const payment = useMutation({ mutationFn: () => api.post(`/api/suppliers/${id}`, { amount: Number(amount), method, reference: reference || undefined, storeId: storeId ?? effectiveStoreId }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["supplier", id] }); void qc.invalidateQueries({ queryKey: ["suppliers"] }); void qc.invalidateQueries({ queryKey: ["register"] }); setPay(false); setAmount(""); toast.success(t("suppliers.paid")) }, onError: showError })

  const fields: FieldDef<In>[] = useMemo(() => [
    { name: "name", label: t("common.name"), required: true, colSpan: 2 },
    { name: "phone", label: t("common.phone"), type: "tel" },
    { name: "email", label: t("common.email"), type: "email" },
    { name: "taxNumber", label: t("suppliers.taxNumber") },
    { name: "creditLimit", label: t("suppliers.creditLimit"), type: "number", step: "0.01", min: 0 },
    { name: "address", label: t("common.address"), colSpan: 2 },
    { name: "notes", label: t("common.notes"), type: "textarea" },
    { name: "isActive", label: t("common.active"), type: "switch" },
  ], [t])
  const defaults = useMemo<In>(() => ({ name: s?.name ?? "", phone: s?.phone ?? "", email: s?.email ?? "", taxNumber: s?.taxNumber ?? "", creditLimit: s?.creditLimit ?? undefined, address: s?.address ?? "", notes: s?.notes ?? "", isActive: s?.isActive ?? true }), [s])

  return (
    <RequirePermission permission="supplier.view">
      <PageHeader title={s?.name ?? t("suppliers.title")} description={s ? [s.phone, s.email, s.taxNumber ? `ICE ${s.taxNumber}` : null].filter(Boolean).join(" · ") : undefined} actions={<>
        <Button variant="ghost" asChild><Link href="/suppliers"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("common.back")}</Link></Button>
        {can("purchase.create") && s && s.currentBalance > 0.009 ? <Button variant="outline" onClick={() => { setAmount(String(s.currentBalance)); setPay(true) }}><Banknote className="h-4 w-4" />{t("suppliers.pay")}</Button> : null}
        {can("purchase.create") ? <Button variant="outline" asChild><Link href="/purchases/new"><Plus className="h-4 w-4" />{t("purchases.create")}</Link></Button> : null}
        {can("supplier.manage") ? <><Button variant="outline" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />{t("common.edit")}</Button><Button variant="destructive" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /></Button></> : null}
      </>} />
      {q.isLoading || !s ? <Skeleton className="h-96" /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card><CardHeader><CardTitle>{t("suppliers.performance")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("suppliers.balance")}</span><Money value={s.currentBalance} className={s.currentBalance > 0.009 ? "text-destructive font-semibold" : "font-semibold"} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("suppliers.orderCount")}</span><span>{s.performance.orderCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("suppliers.totalPurchases")}</span><Money value={s.performance.totalPurchases} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("suppliers.avgDelivery")}</span><span>{s.performance.averageDeliveryDays != null ? formatNumber(s.performance.averageDeliveryDays, { maximumFractionDigits: 1 }) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("suppliers.onTime")}</span><span>{s.performance.onTimeRate != null ? `${formatNumber(s.performance.onTimeRate)}%` : "—"}</span></div>
            {s.address ? <p className="pt-2 border-t text-muted-foreground">{s.address}</p> : null}
            {s.notes ? <p className="text-muted-foreground whitespace-pre-wrap">{s.notes}</p> : null}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>{t("suppliers.products")} ({s.products.length})</CardTitle></CardHeader><CardContent className="divide-y text-sm max-h-96 overflow-y-auto scrollbar-thin">{s.products.map((p) => <div key={p.id} className="flex items-center justify-between py-2 gap-2"><div className="min-w-0"><p className="font-medium truncate">{p.name}</p><p className="text-xs text-muted-foreground font-mono">{p.sku}</p></div><Badge variant={p.stockQuantity <= p.minimumStock ? "warning" : "muted"}>{p.stockQuantity}</Badge></div>)}{!s.products.length ? <p className="py-4 text-center text-muted-foreground">{t("common.none")}</p> : null}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t("suppliers.history")}</CardTitle></CardHeader><CardContent className="divide-y text-sm max-h-96 overflow-y-auto scrollbar-thin">{s.purchaseOrders.map((po) => <Link key={po.id} href={`/purchases/${po.id}`} className="flex items-center justify-between py-2 gap-2 hover:text-primary"><div><p className="font-mono font-medium">{po.orderNumber}</p><p className="text-xs text-muted-foreground">{formatDate(po.createdAt)}</p></div><div className="text-end"><Money value={po.total} className="font-medium" /><Badge variant={poStatusVariant(po.status)} className="ms-2">{t(`purchases.status.${po.status}`)}</Badge></div></Link>)}{!s.purchaseOrders.length ? <p className="py-4 text-center text-muted-foreground">{t("purchases.noOrders")}</p> : null}</CardContent></Card>
        </div>
      )}
      <EntityDialog open={edit} onOpenChange={setEdit} title={t("suppliers.edit")} schema={updateSupplierSchema} fields={fields} defaultValues={defaults} submitting={crud.update.isPending} onSubmit={async (v) => { await crud.update.mutateAsync({ id, body: v }); setEdit(false) }} />
      <ConfirmDialog open={del} onOpenChange={setDel} loading={crud.remove.isPending} onConfirm={() => crud.remove.mutate(id, { onSuccess: () => router.push("/suppliers") })} />
      <Dialog open={pay} onOpenChange={setPay}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("suppliers.pay")}</DialogTitle></DialogHeader>
          <FormField label={t("common.amount")} required hint={s ? `${t("suppliers.balance")}: ${s.currentBalance.toFixed(2)}` : undefined}>{(fid) => <Input id={fid} type="number" step="0.01" min={0.01} max={s?.currentBalance} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />}</FormField>
          <FormField label={t("pos.paymentMethod")}>{(fid) => <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}><SelectTrigger id={fid}><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{t(`pos.methods.${m}`)}</SelectItem>)}</SelectContent></Select>}</FormField>
          <FormField label={t("pos.reference")}>{(fid) => <Input id={fid} value={reference} onChange={(e) => setReference(e.target.value)} />}</FormField>
          <DialogFooter><Button variant="outline" onClick={() => setPay(false)}>{t("common.cancel")}</Button><Button onClick={() => payment.mutate()} disabled={!(Number(amount) > 0)} loading={payment.isPending}>{t("common.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  )
}
