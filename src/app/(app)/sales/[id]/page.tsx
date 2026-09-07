"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ArrowLeft, Printer, RotateCcw, Ban, FileDown } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { downloadFile } from "@/components/shared/export-menu"
import { RequirePermission } from "@/components/shared/require-permission"
import { Money } from "@/components/shared/money"
import { FormField } from "@/components/shared/form-field"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge, Checkbox, Skeleton } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Receipt, printReceipt, type ReceiptSale } from "@/components/pos/receipt"
import { useMe } from "@/hooks/use-me"
import { useLocale } from "@/components/providers/locale-provider"
import { useApiError } from "@/hooks/use-api-error"
import { api } from "@/lib/api-client"
import { PAYMENT_METHODS, SALE_PAYMENT_METHODS, type SalePaymentMethod } from "@/utils/validation"
import { round2 } from "@/utils/money"

type Sale = Omit<ReceiptSale, "refunds"> & { refunds: { id: string; refundNumber: string; amount: number; reason: string | null; items: string; createdAt: string; paymentMethod: string }[]; profit: number | null; notes: string | null }

export default function SaleDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { can } = useMe()
  const { formatDateTime } = useLocale()
  const { showError } = useApiError()
  const qc = useQueryClient()
  const [refundOpen, setRefundOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [reason, setReason] = useState("")
  const [method, setMethod] = useState<SalePaymentMethod>("CASH")
  const [restock, setRestock] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)

  const q = useQuery({ queryKey: ["sale", id], queryFn: () => api.get<Sale>(`/api/sales/${id}`) })
  const sale = q.data
  // Credit still owed on this sale: refunds may cancel that debt instead of returning cash.
  const openCredit = round2((sale?.payments ?? []).filter((p) => p.method === "CREDIT").reduce((a, p) => a + (p.amount - (p.settledAmount ?? 0)), 0))
  const refundMethods: readonly SalePaymentMethod[] = openCredit > 0 ? SALE_PAYMENT_METHODS : PAYMENT_METHODS

  // Remaining refundable quantity per line
  const refunded = new Map<string, number>()
  for (const r of sale?.refunds ?? []) for (const it of JSON.parse(r.items) as { saleItemId: string; quantity: number }[]) refunded.set(it.saleItemId, (refunded.get(it.saleItemId) ?? 0) + it.quantity)
  const openRefund = () => {
    if (!sale) return
    setQty(Object.fromEntries(sale.items.map((i) => [i.id, 0])))
    setRefundOpen(true)
  }

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["sale", id] }); void qc.invalidateQueries({ queryKey: ["sales"] }); void qc.invalidateQueries({ queryKey: ["products"] }); void qc.invalidateQueries({ queryKey: ["register"] }) }
  const refund = useMutation({
    mutationFn: () => api.post(`/api/sales/${id}/refund`, { items: Object.entries(qty).filter(([, v]) => v > 0).map(([saleItemId, quantity]) => ({ saleItemId, quantity })), reason, paymentMethod: method, restock }),
    onSuccess: () => { invalidate(); setRefundOpen(false); setReason(""); toast.success(t("sales.refunded")) },
    onError: showError,
  })
  const cancel = useMutation({ mutationFn: () => api.post(`/api/sales/${id}/cancel`, { reason }), onSuccess: () => { invalidate(); setCancelOpen(false); setReason(""); toast.success(t("sales.cancelled")) }, onError: showError })

  const refundTotal = sale ? round2(sale.items.reduce((a, it) => a + (qty[it.id] ?? 0) * (it.total / it.quantity), 0) * (sale.items.reduce((a, i) => a + i.total, 0) > 0 ? sale.total / sale.items.reduce((a, i) => a + i.total, 0) : 1)) : 0
  const canRefund = sale && (sale.status === "COMPLETED" || sale.status === "PARTIALLY_REFUNDED") && can("sale.refund")
  const canCancel = sale && sale.status === "COMPLETED" && !sale.refunds.length && can("sale.cancel")

  return (
    <RequirePermission permission="sale.view">
      <PageHeader
        title={sale ? sale.saleNumber : t("sales.title")}
        description={sale ? `${formatDateTime(sale.createdAt)} · ${sale.store.name}${sale.cashierName ? ` · ${sale.cashierName}` : ""}` : undefined}
        actions={<>
          <Button variant="ghost" asChild><Link href="/sales"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("common.back")}</Link></Button>
          <Button variant="outline" onClick={printReceipt}><Printer className="h-4 w-4" />{t("common.print")}</Button>
          <Button variant="outline" loading={pdfBusy} onClick={() => { setPdfBusy(true); downloadFile(`/api/sales/${id}/receipt?download=1`, `${sale?.saleNumber ?? "receipt"}.pdf`).catch(showError).finally(() => setPdfBusy(false)) }}><FileDown className="h-4 w-4" />PDF</Button>
          {canRefund ? <Button variant="outline" onClick={openRefund}><RotateCcw className="h-4 w-4" />{t("sales.refund")}</Button> : null}
          {canCancel ? <Button variant="destructive" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" />{t("sales.cancel")}</Button> : null}
        </>}
      />
      {q.isLoading ? <Skeleton className="h-96" /> : sale ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4 no-print">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">{t("sales.items")} <Badge variant={sale.status === "COMPLETED" ? "success" : sale.status === "CANCELLED" ? "destructive" : "warning"}>{t(`sales.status.${sale.status}`)}</Badge></CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground"><tr><th className="text-start py-1">{t("inventory.product")}</th><th className="text-end">{t("common.quantity")}</th><th className="text-end hidden sm:table-cell">{t("pos.unitPrice")}</th><th className="text-end hidden sm:table-cell">{t("common.discount")}</th><th className="text-end">{t("common.total")}</th></tr></thead>
                  <tbody className="divide-y">{sale.items.map((it) => <tr key={it.id}><td className="py-2"><p className="font-medium">{it.product.name}</p><p className="text-xs text-muted-foreground font-mono">{it.product.sku}</p></td><td className="text-end tabular-nums">{it.quantity}{refunded.get(it.id) ? <span className="text-xs text-muted-foreground"> (−{refunded.get(it.id)})</span> : null}</td><td className="text-end hidden sm:table-cell"><Money value={it.unitPrice} /></td><td className="text-end hidden sm:table-cell">{it.discount ? <Money value={-it.discount} /> : "—"}</td><td className="text-end font-medium"><Money value={it.total} /></td></tr>)}</tbody>
                </table>
                <div className="mt-4 ms-auto max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>{t("common.subtotal")}</span><Money value={sale.subtotal} /></div>
                  <div className="flex justify-between text-muted-foreground"><span>{t("common.tax")}</span><Money value={sale.taxAmount} /></div>
                  {sale.discountAmount ? <div className="flex justify-between text-muted-foreground"><span>{t("common.discount")}</span><Money value={-sale.discountAmount} /></div> : null}
                  <div className="flex justify-between font-semibold text-base border-t pt-1"><span>{t("common.total")}</span><Money value={sale.total} /></div>
                  {can("analytics.view") && sale.profit != null ? <div className="flex justify-between text-success"><span>{t("dashboard.profit")}</span><Money value={sale.profit} /></div> : null}
                </div>
              </CardContent>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card><CardHeader><CardTitle className="flex items-center gap-2">{t("sales.payment")}{sale.paymentStatus && sale.paymentStatus !== "PAID" ? <Badge variant={sale.paymentStatus === "REFUNDED" ? "muted" : "warning"}>{t(`sales.paymentStatus.${sale.paymentStatus}`)}</Badge> : null}</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
                {sale.payments.map((p, i) => <div key={i} className="flex justify-between"><span>{t(`pos.methods.${p.method}`)}{p.reference ? <span className="text-muted-foreground text-xs"> · {p.reference}</span> : null}{p.method === "CREDIT" && (p.settledAmount ?? 0) > 0 ? <span className="text-muted-foreground text-xs"> · {t("customers.settled")} <Money value={p.settledAmount ?? 0} /></span> : null}</span><Money value={p.amount} /></div>)}
                {openCredit > 0 ? <div className="flex justify-between border-t pt-1 font-medium text-amber-700 dark:text-amber-300"><span>{t("pos.creditDue")}</span><Money value={openCredit} /></div> : null}
              </CardContent></Card>
              <Card><CardHeader><CardTitle>{t("sales.refunds")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{sale.refunds.length ? sale.refunds.map((r) => <div key={r.id} className="flex justify-between gap-2"><div><p className="font-mono">{r.refundNumber}</p><p className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)} · {t(`pos.methods.${r.paymentMethod}`)}{r.reason ? ` · ${r.reason}` : ""}</p></div><Money value={-r.amount} className="text-destructive font-medium" /></div>) : <p className="text-muted-foreground">—</p>}</CardContent></Card>
            </div>
            {sale.notes ? <Card><CardContent className="p-4 text-sm whitespace-pre-wrap">{sale.notes}</CardContent></Card> : null}
          </div>
          <div><Receipt sale={sale} /></div>
        </div>
      ) : null}

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("sales.refundTitle")}</DialogTitle></DialogHeader>
          {sale ? (
            <div className="space-y-3">
              <div className="divide-y rounded-md border">
                {sale.items.map((it) => { const remaining = it.quantity - (refunded.get(it.id) ?? 0); return (
                  <div key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1"><p className="font-medium truncate">{it.product.name}</p><p className="text-xs text-muted-foreground">{remaining} / {it.quantity} · <Money value={it.total / it.quantity} /></p></div>
                    <Input type="number" min={0} max={remaining} step={1} className="w-20 text-end" value={qty[it.id] ?? 0} disabled={remaining <= 0} onChange={(e) => setQty((q) => ({ ...q, [it.id]: Math.min(remaining, Math.max(0, Number(e.target.value) || 0)) }))} />
                  </div>
                ) })}
              </div>
              <div className="flex justify-between text-sm font-semibold"><span>{t("sales.refundAmount")}</span><Money value={refundTotal} /></div>
              <FormField label={t("sales.refundMethod")} hint={openCredit > 0 ? t("sales.refundCreditHint", { amount: openCredit.toFixed(2) }) : undefined}>{(id) => <Select value={method} onValueChange={(v) => setMethod(v as SalePaymentMethod)}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{refundMethods.map((m) => <SelectItem key={m} value={m}>{t(`pos.methods.${m}`)}</SelectItem>)}</SelectContent></Select>}</FormField>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={restock} onCheckedChange={(v) => setRestock(!!v)} />{t("sales.restock")}</label>
              <FormField label={t("common.reason")} required>{(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
            </div>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setRefundOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => refund.mutate()} disabled={refundTotal <= 0 || reason.trim().length < 2} loading={refund.isPending}>{t("sales.refund")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("sales.cancel")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("sales.cancelHint")}</p>
          <FormField label={t("sales.cancelReason")} required>{(id) => <Textarea id={id} autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
          <DialogFooter><Button variant="outline" onClick={() => setCancelOpen(false)}>{t("common.back")}</Button><Button variant="destructive" onClick={() => cancel.mutate()} disabled={reason.trim().length < 2} loading={cancel.isPending}>{t("sales.cancel")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  )
}
