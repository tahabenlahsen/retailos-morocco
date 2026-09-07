"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ArrowLeft, Pencil, Trash2, HandCoins } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { EntityDialog, type FieldDef } from "@/components/shared/entity-dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FormField } from "@/components/shared/form-field"
import { Money } from "@/components/shared/money"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge, Skeleton } from "@/components/ui/misc"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMe } from "@/hooks/use-me"
import { useCrud } from "@/hooks/use-crud"
import { useApiError } from "@/hooks/use-api-error"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { api } from "@/lib/api-client"
import { updateCustomerSchema, PAYMENT_METHODS, type PaymentMethod } from "@/utils/validation"
import { round2 } from "@/utils/money"
import type { z } from "zod"

interface CustomerPayment { id: string; amount: number; method: string; reference: string | null; notes: string | null; createdAt: string }
interface Customer {
  id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null
  loyaltyPoints: number; totalSpending: number; outstandingBalance: number; creditLimit: number | null; isActive: boolean; createdAt: string
  sales: { id: string; saleNumber: string; total: number; status: string; paymentStatus: string; createdAt: string; _count: { items: number }; payments: { method: string; amount: number; settledAmount: number; status: string }[] }[]
  payments: CustomerPayment[]
  stats: { orderCount: number; averageOrder: number; lastPurchaseAt: string | null; creditAvailable: number | null }
}
type In = z.input<typeof updateCustomerSchema>

export default function CustomerDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { can } = useMe()
  const { formatDateTime, formatDate } = useLocale()
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const q = useQuery({ queryKey: ["customer", id], queryFn: () => api.get<Customer>(`/api/customers/${id}`) })
  const c = q.data
  const crud = useCrud<never, In>("/api/customers", [["customers"], ["customer", id]])
  const canLimit = can("customer.creditLimit")

  const fields: FieldDef<In>[] = useMemo(() => [
    { name: "name", label: t("common.name"), required: true, colSpan: 2 },
    { name: "phone", label: t("common.phone"), type: "tel" },
    { name: "email", label: t("common.email"), type: "email" },
    { name: "address", label: t("common.address"), colSpan: 2 },
    ...(canLimit ? [{ name: "creditLimit", label: t("customers.creditLimit"), type: "number", step: "0.01", min: 0, hint: t("customers.creditLimitHint") } as FieldDef<In>] : []),
    { name: "notes", label: t("common.notes"), type: "textarea" },
    { name: "isActive", label: t("common.active"), type: "switch" },
  ], [t, canLimit])
  const defaults = useMemo<In>(() => ({ name: c?.name ?? "", phone: c?.phone ?? "", email: c?.email ?? "", address: c?.address ?? "", creditLimit: c?.creditLimit ?? undefined, notes: c?.notes ?? "", isActive: c?.isActive ?? true }), [c])

  const owes = (c?.outstandingBalance ?? 0) > 0.009

  return (
    <RequirePermission permission="customer.view">
      <PageHeader title={c?.name ?? t("customers.title")} description={c ? [c.phone, c.email, c.address].filter(Boolean).join(" · ") : undefined} actions={<>
        <Button variant="ghost" asChild><Link href="/customers"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t("common.back")}</Link></Button>
        {owes && can("customer.payment") ? <Button onClick={() => setPayOpen(true)}><HandCoins className="h-4 w-4" />{t("customers.recordPayment")}</Button> : null}
        {can("customer.manage") ? <><Button variant="outline" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />{t("common.edit")}</Button><Button variant="destructive" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /></Button></> : null}
      </>} />
      {q.isLoading || !c ? <Skeleton className="h-96" /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <Card><CardHeader><CardTitle>{t("common.details")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("customers.totalSpending")}</span><Money value={c.totalSpending} className="font-semibold" /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("customers.orders")}</span><span>{c.stats.orderCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("customers.avgOrder")}</span><Money value={c.stats.averageOrder} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("customers.loyalty")}</span><span>{c.loyaltyPoints}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("customers.lastPurchase")}</span><span>{c.stats.lastPurchaseAt ? formatDate(c.stats.lastPurchaseAt) : "—"}</span></div>
              {c.notes ? <p className="pt-2 border-t text-muted-foreground whitespace-pre-wrap">{c.notes}</p> : null}
            </CardContent></Card>
            <Card className={owes ? "border-amber-500/50" : undefined}><CardHeader><CardTitle>{t("customers.credit")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("customers.balance")}</span><Money value={c.outstandingBalance} className={owes ? "font-bold text-amber-700 dark:text-amber-300" : "font-semibold"} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("customers.creditLimit")}</span>{c.creditLimit == null ? <span className="text-muted-foreground">{t("customers.noCredit")}</span> : <Money value={c.creditLimit} />}</div>
              {c.stats.creditAvailable != null ? <div className="flex justify-between"><span className="text-muted-foreground">{t("customers.creditAvailable")}</span><Money value={c.stats.creditAvailable} className="font-semibold text-success" /></div> : null}
              {c.payments.length ? (
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t("customers.paymentHistory")}</p>
                  <div className="max-h-48 overflow-y-auto scrollbar-thin divide-y">
                    {c.payments.map((p) => <div key={p.id} className="flex justify-between py-1.5 gap-2"><span className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)} · {t(`pos.methods.${p.method}`)}{p.reference ? ` (${p.reference})` : ""}</span><Money value={p.amount} className="text-success font-medium" /></div>)}
                  </div>
                </div>
              ) : null}
            </CardContent></Card>
          </div>
          <Card className="lg:col-span-2"><CardHeader><CardTitle>{t("customers.history")}</CardTitle></CardHeader><CardContent className="divide-y text-sm max-h-[560px] overflow-y-auto scrollbar-thin">
            {c.sales.map((s) => {
              const credit = s.payments.filter((p) => p.method === "CREDIT")
              const due = round2(credit.reduce((a, p) => a + (p.amount - p.settledAmount), 0))
              return (
                <Link key={s.id} href={`/sales/${s.id}`} className="flex items-center justify-between py-2 gap-3 hover:text-primary">
                  <div><p className="font-mono font-medium">{s.saleNumber}</p><p className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)} · {t("pos.items", { count: s._count.items })} · {[...new Set(s.payments.map((p) => t(`pos.methods.${p.method}`)))].join(", ")}</p></div>
                  <div className="text-end">
                    <Money value={s.total} className="font-medium" />
                    {s.status !== "COMPLETED" ? <Badge variant={s.status === "CANCELLED" ? "destructive" : "warning"} className="ms-2">{t(`sales.status.${s.status}`)}</Badge> : null}
                    {due > 0 && s.status !== "CANCELLED" ? <p className="text-xs text-amber-700 dark:text-amber-300">{t("customers.owes")} <Money value={due} /></p> : null}
                  </div>
                </Link>
              )
            })}
            {!c.sales.length ? <p className="py-6 text-center text-muted-foreground">{t("sales.noSales")}</p> : null}
          </CardContent></Card>
        </div>
      )}
      <EntityDialog open={edit} onOpenChange={setEdit} title={t("customers.edit")} schema={updateCustomerSchema} fields={fields} defaultValues={defaults} submitting={crud.update.isPending} onSubmit={async (v) => { await crud.update.mutateAsync({ id, body: canLimit ? { ...v, creditLimit: v.creditLimit ?? null } : v }); setEdit(false) }} />
      <ConfirmDialog open={del} onOpenChange={setDel} loading={crud.remove.isPending} onConfirm={() => crud.remove.mutate(id, { onSuccess: () => router.push("/customers") })} />
      {c ? <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} customer={c} /> : null}
    </RequirePermission>
  )
}

function RecordPaymentDialog({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (o: boolean) => void; customer: Customer }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <RecordPaymentForm onOpenChange={onOpenChange} customer={customer} /> : null}</Dialog>
}

function RecordPaymentForm({ onOpenChange, customer }: { onOpenChange: (o: boolean) => void; customer: Customer }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { showError } = useApiError()
  const { effectiveStoreId } = useStore()
  const [amount, setAmount] = useState(String(customer.outstandingBalance))
  const [method, setMethod] = useState<PaymentMethod>("CASH")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const value = Number(amount)
  const valid = value > 0 && value <= customer.outstandingBalance + 0.005
  const m = useMutation({
    mutationFn: () => api.post<{ outstandingBalance: number }>(`/api/customers/${customer.id}/payments`, { amount: round2(value), method, reference: reference.trim() || undefined, notes: notes.trim() || undefined, storeId: effectiveStoreId ?? undefined }),
    onSuccess: (r) => {
      toast.success(t("customers.paymentRecorded", { balance: r.outstandingBalance.toFixed(2) }))
      void qc.invalidateQueries({ queryKey: ["customer", customer.id] })
      void qc.invalidateQueries({ queryKey: ["customers"] })
      void qc.invalidateQueries({ queryKey: ["register"] })
      onOpenChange(false)
    },
    onError: showError,
  })
  return (
    <DialogContent size="sm">
      <DialogHeader><DialogTitle>{t("customers.recordPayment")}</DialogTitle><DialogDescription>{customer.name} · {t("customers.balance")}: <Money value={customer.outstandingBalance} className="font-semibold text-foreground" /></DialogDescription></DialogHeader>
      <div className="space-y-3">
        <FormField label={t("common.amount")} required>{(fid) => <div className="flex gap-2"><Input id={fid} type="number" step="0.01" min={0} max={customer.outstandingBalance} value={amount} onChange={(e) => setAmount(e.target.value)} className="text-end tabular-nums" autoFocus /><Button variant="outline" onClick={() => setAmount(String(customer.outstandingBalance))}>{t("pos.exact")}</Button></div>}</FormField>
        <FormField label={t("pos.paymentMethod")}>{(fid) => <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}><SelectTrigger id={fid}><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((pm) => <SelectItem key={pm} value={pm}>{t(`pos.methods.${pm}`)}</SelectItem>)}</SelectContent></Select>}</FormField>
        {method === "CASH" ? <p className="text-xs text-muted-foreground">{t("customers.cashPaymentHint")}</p> : <FormField label={t("pos.reference")}>{(fid) => <Input id={fid} value={reference} onChange={(e) => setReference(e.target.value)} />}</FormField>}
        <FormField label={t("common.notes")}>{(fid) => <Textarea id={fid} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</FormField>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
        <Button onClick={() => m.mutate()} disabled={!valid} loading={m.isPending}>{t("customers.recordPayment")}</Button>
      </DialogFooter>
    </DialogContent>
  )
}
