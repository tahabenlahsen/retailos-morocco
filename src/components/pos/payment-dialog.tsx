"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Banknote, CreditCard, Landmark, FileText, CircleDollarSign, Plus, Trash2, BookUser } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Money } from "@/components/shared/money"
import { SALE_PAYMENT_METHODS, type SalePaymentMethod } from "@/utils/validation"
import { round2, sum } from "@/utils/money"
import { cn } from "@/utils/cn"

export interface PaymentLine {
  method: SalePaymentMethod
  amount: number
  reference?: string
}

/** Customer credit context for on-account ("crédit") sales. */
export interface CreditInfo {
  customerName: string
  /** null = customer has no credit limit → credit sales not allowed */
  creditLimit: number | null
  outstandingBalance: number
}

const ICONS: Record<SalePaymentMethod, typeof Banknote> = { CASH: Banknote, CARD: CreditCard, BANK_TRANSFER: Landmark, CHECK: FileText, OTHER: CircleDollarSign, CREDIT: BookUser }

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  total: number
  registerOpen: boolean
  /** Undefined when no customer is attached to the cart. */
  credit?: CreditInfo
  /** Whether the current user may sell on credit (sale.credit permission). */
  canCredit: boolean
  onConfirm: (payments: PaymentLine[]) => Promise<void>
}

function quickAmounts(total: number): number[] {
  const steps = [5, 10, 20, 50, 100, 200, 500]
  const out = new Set<number>()
  for (const s of steps) {
    const v = Math.ceil(total / s) * s
    if (v >= total) out.add(v)
    if (out.size >= 4) break
  }
  return [...out].sort((a, b) => a - b)
}

export function PaymentDialog({ open, onOpenChange, ...rest }: Props) {
  // Radix unmounts the content when closed, so PaymentForm's state resets on every open.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <PaymentForm {...rest} onOpenChange={onOpenChange} /> : null}
    </Dialog>
  )
}

function PaymentForm({ onOpenChange, total, registerOpen, credit, canCredit, onConfirm }: Omit<Props, "open">) {
  const { t } = useTranslation()
  const [lines, setLines] = useState<PaymentLine[]>([{ method: registerOpen ? "CASH" : "CARD", amount: total }])
  const [cashGiven, setCashGiven] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)

  const creditAvailable = credit && credit.creditLimit != null ? round2(Math.max(0, credit.creditLimit - credit.outstandingBalance)) : 0
  const creditEnabled = canCredit && Boolean(credit) && credit!.creditLimit != null
  const creditAmount = sum(lines.filter((l) => l.method === "CREDIT").map((l) => l.amount))
  const creditOk = creditAmount <= creditAvailable + 0.005 && lines.filter((l) => l.method === "CREDIT").length <= 1

  const paid = useMemo(() => sum(lines.map((l) => l.amount)), [lines])
  const remaining = round2(total - paid)
  const cashLine = lines.find((l) => l.method === "CASH")
  const given = Number(cashGiven)
  const change = cashLine && given > cashLine.amount ? round2(given - cashLine.amount) : 0
  const valid = Math.abs(remaining) < 0.005 && lines.every((l) => l.amount > 0) && (!lines.some((l) => l.method === "CASH") || registerOpen) && (creditAmount === 0 || (creditEnabled && creditOk))

  const setLine = (i: number, patch: Partial<PaymentLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const addLine = () => {
    const used = new Set(lines.map((l) => l.method))
    const next = SALE_PAYMENT_METHODS.find((m) => !used.has(m) && (m !== "CASH" || registerOpen) && (m !== "CREDIT" || creditEnabled)) ?? "OTHER"
    setLines((ls) => [...ls, { method: next, amount: Math.max(0, remaining) }])
  }
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i))

  const submit = async () => {
    if (!valid) return
    setSubmitting(true)
    try {
      await onConfirm(lines.map((l) => ({ ...l, amount: round2(l.amount), reference: l.reference?.trim() || undefined })))
    } finally {
      setSubmitting(false)
    }
  }

  // Enter confirms the sale (barcode scanners and keyboards), unless typing a reference.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && valid && !submitting && !(e.target instanceof HTMLInputElement && e.target.type === "text")) {
      e.preventDefault()
      void submit()
    }
  }

  const creditHint = !credit ? t("pos.creditNeedsCustomer") : credit.creditLimit == null ? t("pos.creditNoLimit", { name: credit.customerName }) : !canCredit ? t("pos.creditNotAllowed") : null

  return (
      <DialogContent size="lg" onKeyDown={onKeyDown} onEscapeKeyDown={(e) => submitting && e.preventDefault()} onInteractOutside={(e) => submitting && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("pos.payment")}</DialogTitle>
          <DialogDescription>{t("common.total")}: <Money value={total} className="font-semibold text-foreground text-base" /></DialogDescription>
        </DialogHeader>

        {!registerOpen ? <div className="rounded-md bg-warning/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">{t("pos.registerRequired")}</div> : null}

        <div className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-6 gap-1.5">
                {SALE_PAYMENT_METHODS.map((m) => {
                  const Icon = ICONS[m]
                  const disabled = (m === "CASH" && !registerOpen) || (m === "CREDIT" && !creditEnabled)
                  return (
                    <button key={m} disabled={disabled} title={m === "CREDIT" && creditHint ? creditHint : undefined} onClick={() => setLine(i, { method: m })} className={cn("flex flex-col items-center gap-1 rounded-md border p-2 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed", line.method === m ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
                      <Icon className="h-4 w-4" />
                      <span className="truncate w-full text-center">{t(`pos.methods.${m}`)}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" step="0.01" min={0} className="h-11 text-lg font-semibold tabular-nums text-end flex-1" value={line.amount || ""} onChange={(e) => setLine(i, { amount: Number(e.target.value) || 0 })} aria-label={t("common.amount")} autoFocus={i === 0} />
                {lines.length > 1 ? <Button variant="ghost" size="icon" onClick={() => removeLine(i)} aria-label={t("common.remove")}><Trash2 className="text-destructive" /></Button> : null}
              </div>
              {line.method !== "CASH" && line.method !== "CREDIT" ? <Input placeholder={t("pos.reference")} value={line.reference ?? ""} onChange={(e) => setLine(i, { reference: e.target.value })} className="h-9" /> : null}
              {line.method === "CREDIT" && credit ? (
                <div className={cn("rounded-md px-3 py-2 text-sm", creditOk ? "bg-muted" : "bg-destructive/10 text-destructive")}>
                  <div className="flex justify-between"><span>{t("pos.creditFor", { name: credit.customerName })}</span><span>{t("customers.creditAvailable")}: <Money value={creditAvailable} className="font-semibold" /></span></div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>{t("customers.balance")}: <Money value={credit.outstandingBalance} /></span><span>{t("customers.creditLimit")}: <Money value={credit.creditLimit ?? 0} /></span></div>
                  {!creditOk ? <p className="mt-1 text-xs font-medium">{t("errors.CREDIT_LIMIT_EXCEEDED")}</p> : null}
                </div>
              ) : null}
              {line.method === "CASH" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-muted-foreground self-center me-1">{t("pos.quickAmounts")}:</span>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setCashGiven(String(line.amount))}>{t("pos.exact")}</Button>
                    {quickAmounts(line.amount).map((a) => <Button key={a} size="sm" variant="outline" className="h-7 tabular-nums" onClick={() => setCashGiven(String(a))}>{a}</Button>)}
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <label className="text-muted-foreground flex items-center gap-2">{t("pos.received")}<Input type="number" step="0.01" min={0} className="h-9 w-32 text-end tabular-nums" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} /></label>
                    <span className="font-semibold">{t("pos.change")}: <Money value={change} className={change > 0 ? "text-success" : ""} /></span>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {lines.length < 4 && Math.abs(remaining) >= 0.005 ? <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-4 w-4" />{t("pos.splitPayment")}</Button> : null}
          {creditHint && !lines.some((l) => l.method === "CREDIT") ? <p className="text-xs text-muted-foreground">{creditHint}</p> : null}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
          <span className="text-sm">{t("pos.remaining")}</span>
          <Money value={remaining} className={cn("text-xl font-bold", Math.abs(remaining) < 0.005 ? "text-success" : remaining < 0 ? "text-destructive" : "")} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t("common.cancel")}</Button>
          <Button size="lg" onClick={submit} disabled={!valid} loading={submitting}>{submitting ? t("pos.completing") : t("pos.complete")}</Button>
        </DialogFooter>
      </DialogContent>
  )
}
