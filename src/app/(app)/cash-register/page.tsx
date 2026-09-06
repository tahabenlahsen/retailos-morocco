"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Banknote, ArrowDownToLine, ArrowUpFromLine, Lock, Unlock, History } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormField } from "@/components/shared/form-field"
import { Money } from "@/components/shared/money"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { useApiError } from "@/hooks/use-api-error"
import { useMe } from "@/hooks/use-me"
import { api, type Paginated } from "@/lib/api-client"
import { round2 } from "@/utils/money"

interface Tx { id: string; type: string; amount: number; reason: string | null; createdAt: string }
interface Summary { openingBalance: number; cashSales: number; cashRefunds: number; deposits: number; withdrawals: number; expected: number; saleCount: number }
interface Register { id: string; name: string; openingBalance: number; status: string; openedAt: string; closedAt: string | null; openedBy: string; expectedBalance: number | null; actualBalance: number | null; difference: number | null; differenceReason: string | null; transactions: Tx[]; summary: Summary }
interface HistoryRow { id: string; name: string; status: string; openedAt: string; closedAt: string | null; openingBalance: number; expectedBalance: number | null; actualBalance: number | null; difference: number | null; differenceReason: string | null; openedByName: string | null; closedByName: string | null; store: { name: string } }

export default function CashRegisterPage() {
  const { t } = useTranslation()
  const { storeId, effectiveStoreId, stores } = useStore()
  const { can } = useMe()
  const { formatDateTime } = useLocale()
  const { showError } = useApiError()
  const qc = useQueryClient()
  const sid = storeId ?? effectiveStoreId
  const [openDlg, setOpenDlg] = useState(false)
  const [closeDlg, setCloseDlg] = useState(false)
  const [txDlg, setTxDlg] = useState<"DEPOSIT" | "WITHDRAWAL" | null>(null)
  const [name, setName] = useState("Caisse 1")
  const [opening, setOpening] = useState("")
  const [actual, setActual] = useState("")
  const [reason, setReason] = useState("")
  const [txAmount, setTxAmount] = useState("")
  const [txReason, setTxReason] = useState("")
  const [histPage, setHistPage] = useState(1)

  const reg = useQuery({ queryKey: ["register", "open", sid], queryFn: () => api.get<Register | null>("/api/register", { storeId: sid }), enabled: !!sid })
  const hist = useQuery({ queryKey: ["register", "history", sid, histPage], queryFn: () => api.get<Paginated<HistoryRow>>("/api/register", { storeId: storeId ?? undefined, history: "true", page: histPage, pageSize: 20 }) })
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["register"] }) }

  const open = useMutation({ mutationFn: () => api.post("/api/register", { storeId: sid, name: name.trim(), openingBalance: Number(opening) || 0 }), onSuccess: () => { invalidate(); setOpenDlg(false); toast.success(t("register.opened")) }, onError: showError })
  const close = useMutation({ mutationFn: () => api.post(`/api/register/${reg.data!.id}`, { actualBalance: Number(actual), differenceReason: reason.trim() || undefined }), onSuccess: () => { invalidate(); setCloseDlg(false); setActual(""); setReason(""); toast.success(t("register.closed")) }, onError: showError })
  const tx = useMutation({ mutationFn: () => api.put(`/api/register/${reg.data!.id}`, { type: txDlg, amount: Number(txAmount), reason: txReason.trim() }), onSuccess: () => { invalidate(); setTxDlg(null); setTxAmount(""); setTxReason("") }, onError: showError })

  const r = reg.data
  const diff = r && actual !== "" ? round2(Number(actual) - r.summary.expected) : null

  const histCols: Column<HistoryRow>[] = [
    { key: "name", header: t("register.registerName"), cell: (x) => <div><p className="font-medium">{x.name}</p>{stores.length > 1 ? <p className="text-xs text-muted-foreground">{x.store.name}</p> : null}</div> },
    { key: "status", header: t("common.status"), cell: (x) => <Badge variant={x.status === "OPEN" ? "success" : "muted"}>{t(`register.status.${x.status}`)}</Badge> },
    { key: "opened", header: t("register.openedAt"), cell: (x) => <div className="text-xs"><p>{formatDateTime(x.openedAt)}</p><p className="text-muted-foreground">{x.openedByName}</p></div>, hideOnMobile: true },
    { key: "closed", header: t("register.closedAt"), cell: (x) => x.closedAt ? <div className="text-xs"><p>{formatDateTime(x.closedAt)}</p><p className="text-muted-foreground">{x.closedByName}</p></div> : "—", hideOnMobile: true },
    { key: "expected", header: t("register.expected"), cell: (x) => x.expectedBalance != null ? <Money value={x.expectedBalance} /> : "—", align: "end" },
    { key: "actual", header: t("register.actual"), cell: (x) => x.actualBalance != null ? <Money value={x.actualBalance} /> : "—", align: "end", hideOnMobile: true },
    { key: "diff", header: t("register.difference"), cell: (x) => x.difference != null ? <div className="text-end"><Money value={x.difference} signed />{x.differenceReason ? <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{x.differenceReason}</p> : null}</div> : "—", align: "end" },
  ]

  return (
    <RequirePermission permission="register.open">
      <PageHeader title={t("register.title")} description={stores.find((s) => s.id === sid)?.name} actions={r ? <Button variant="destructive" onClick={() => setCloseDlg(true)}><Lock className="h-4 w-4" />{t("register.close")}</Button> : <Button onClick={() => setOpenDlg(true)} disabled={!sid}><Unlock className="h-4 w-4" />{t("register.open")}</Button>} />

      <Tabs defaultValue="current">
        <TabsList><TabsTrigger value="current"><Banknote className="h-4 w-4 me-1.5" />{t("register.summary")}</TabsTrigger>{can("register.viewAll") || true ? <TabsTrigger value="history"><History className="h-4 w-4 me-1.5" />{t("register.history")}</TabsTrigger> : null}</TabsList>
        <TabsContent value="current">
          {reg.isLoading ? <Skeleton className="h-64" /> : !r ? (
            <EmptyState icon={Lock} title={t("register.noOpen")} action={<Button onClick={() => setOpenDlg(true)} disabled={!sid}><Unlock className="h-4 w-4" />{t("register.open")}</Button>} className="py-20" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader><CardTitle className="flex items-center justify-between">{r.name}<Badge variant="success">{t("register.status.OPEN")}</Badge></CardTitle><CardDescription>{t("register.openedAt")} {formatDateTime(r.openedAt)}</CardDescription></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {([["openingBalance", r.summary.openingBalance], ["cashSales", r.summary.cashSales], ["cashRefunds", r.summary.cashRefunds], ["deposits", r.summary.deposits], ["withdrawals", r.summary.withdrawals]] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span className="text-muted-foreground">{t(`register.${k}`)}</span><Money value={v} signed={k !== "openingBalance"} /></div>
                  ))}
                  <div className="flex justify-between border-t pt-2 font-semibold text-base"><span>{t("register.expected")}</span><Money value={r.summary.expected} /></div>
                  <p className="text-xs text-muted-foreground">{t("register.salesCount")}: {r.summary.saleCount}</p>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button variant="outline" onClick={() => setTxDlg("DEPOSIT")}><ArrowDownToLine className="h-4 w-4" />{t("register.deposit")}</Button>
                    <Button variant="outline" onClick={() => setTxDlg("WITHDRAWAL")}><ArrowUpFromLine className="h-4 w-4" />{t("register.withdrawal")}</Button>
                  </div>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>{t("register.transactions")}</CardTitle></CardHeader>
                <CardContent>
                  {r.transactions.length ? (
                    <div className="divide-y text-sm max-h-[480px] overflow-y-auto scrollbar-thin">
                      {r.transactions.map((x) => (
                        <div key={x.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0"><p className="font-medium"><Badge variant={x.type === "SALE" || x.type === "DEPOSIT" ? "success" : "destructive"} className="me-2">{t(`register.types.${x.type}`)}</Badge>{x.reason}</p><p className="text-xs text-muted-foreground">{formatDateTime(x.createdAt)}</p></div>
                          <Money value={x.amount} signed className="font-semibold" />
                        </div>
                      ))}
                    </div>
                  ) : <EmptyState title={t("inventory.noMovements")} className="py-8" />}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        <TabsContent value="history">
          <DataTable columns={histCols} rows={hist.data?.items} rowKey={(x) => x.id} loading={hist.isLoading} emptyTitle={t("register.noOpen")} pagination={hist.data ? { page: histPage, pageSize: hist.data.pageSize, total: hist.data.total, onPageChange: setHistPage } : undefined} />
        </TabsContent>
      </Tabs>

      {/* Open */}
      <Dialog open={openDlg} onOpenChange={setOpenDlg}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("register.open")}</DialogTitle></DialogHeader>
          <FormField label={t("register.registerName")}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</FormField>
          <FormField label={t("register.openingBalance")} required>{(id) => <Input id={id} type="number" step="0.01" min={0} autoFocus value={opening} onChange={(e) => setOpening(e.target.value)} className="text-lg tabular-nums" />}</FormField>
          <DialogFooter><Button variant="outline" onClick={() => setOpenDlg(false)}>{t("common.cancel")}</Button><Button onClick={() => open.mutate()} disabled={opening === "" || name.trim().length < 1} loading={open.isPending}>{t("register.open")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close */}
      <Dialog open={closeDlg} onOpenChange={setCloseDlg}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("register.close")}</DialogTitle><DialogDescription>{t("register.closeConfirm")}</DialogDescription></DialogHeader>
          {r ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3 text-sm flex justify-between"><span>{t("register.expected")}</span><Money value={r.summary.expected} className="font-semibold" /></div>
              <FormField label={t("register.actual")} required>{(id) => <Input id={id} type="number" step="0.01" min={0} autoFocus value={actual} onChange={(e) => setActual(e.target.value)} className="text-lg tabular-nums" />}</FormField>
              {diff != null ? <div className="flex justify-between text-sm"><span>{t("register.difference")}</span><Money value={diff} signed className="font-semibold" /></div> : null}
              {diff != null && Math.abs(diff) >= 0.01 ? <FormField label={t("register.differenceReason")} required hint={t("register.differenceReasonRequired")}>{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />}</FormField> : null}
            </div>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setCloseDlg(false)}>{t("common.cancel")}</Button><Button variant="destructive" onClick={() => close.mutate()} disabled={actual === "" || (diff != null && Math.abs(diff) >= 0.01 && reason.trim().length < 2)} loading={close.isPending}>{t("register.close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deposit / withdrawal */}
      <Dialog open={!!txDlg} onOpenChange={(o) => !o && setTxDlg(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{txDlg ? t(`register.${txDlg.toLowerCase()}`) : ""}</DialogTitle></DialogHeader>
          <FormField label={t("common.amount")} required>{(id) => <Input id={id} type="number" step="0.01" min={0.01} autoFocus value={txAmount} onChange={(e) => setTxAmount(e.target.value)} className="text-lg tabular-nums" />}</FormField>
          <FormField label={t("common.reason")} required>{(id) => <Input id={id} value={txReason} onChange={(e) => setTxReason(e.target.value)} />}</FormField>
          <DialogFooter><Button variant="outline" onClick={() => setTxDlg(null)}>{t("common.cancel")}</Button><Button onClick={() => tx.mutate()} disabled={!(Number(txAmount) > 0) || txReason.trim().length < 2} loading={tx.isPending}>{t("common.confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  )
}
