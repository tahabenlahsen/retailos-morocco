"use client"

import { useTranslation } from "react-i18next"
import { useLocale } from "@/components/providers/locale-provider"
import { useMe } from "@/hooks/use-me"

export interface ReceiptSale {
  id: string
  saleNumber: string
  createdAt: string
  subtotal: number
  taxAmount: number
  discountAmount: number
  total: number
  status: string
  items: { id: string; quantity: number; unitPrice: number; discount: number; total: number; product: { name: string; sku: string; unit: string } }[]
  paymentStatus?: string
  payments: { method: string; amount: number; reference: string | null; settledAmount?: number }[]
  refunds?: { refundNumber: string; amount: number; createdAt: string }[]
  customer: { name: string; phone: string | null } | null
  store: { name: string; address: string | null; phone: string | null }
  cashierName?: string | null
}

/** 80mm thermal-style receipt. Printed via window.print() with `.receipt-print` rules. */
export function Receipt({ sale }: { sale: ReceiptSale }) {
  const { t } = useTranslation()
  const { formatDateTime, formatMoney } = useLocale()
  const { me } = useMe()
  const m = (v: number) => formatMoney(v)
  return (
    <div className="receipt-print mx-auto w-full max-w-[320px] bg-white text-black text-xs font-mono p-4 rounded-md border" dir="ltr">
      <div className="text-center space-y-0.5">
        <p className="font-bold text-sm">{me?.business.name}</p>
        <p>{sale.store.name}</p>
        {sale.store.address ? <p>{sale.store.address}</p> : null}
        {sale.store.phone ? <p>{sale.store.phone}</p> : null}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {sale.status === "QUEUED" ? <p className="text-center font-bold" data-testid="receipt-offline">*** {t("offline.provisionalReceipt")} ***</p> : null}
      <div className="flex justify-between"><span>{sale.saleNumber}</span><span>{formatDateTime(sale.createdAt)}</span></div>
      {sale.cashierName ? <p>{t("pos.cashier")}: {sale.cashierName}</p> : null}
      {sale.customer ? <p>{t("pos.customer")}: {sale.customer.name}</p> : null}
      <div className="my-2 border-t border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id} className="align-top">
              <td className="pe-1">
                <div>{it.product.name}</div>
                <div className="text-[10px]">{it.quantity} × {m(it.unitPrice)}{it.discount ? ` − ${m(it.discount)}` : ""}</div>
              </td>
              <td className="text-end whitespace-nowrap">{m(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="space-y-0.5">
        <div className="flex justify-between"><span>{t("common.subtotal")}</span><span>{m(sale.subtotal)}</span></div>
        <div className="flex justify-between"><span>{t("common.tax")}</span><span>{m(sale.taxAmount)}</span></div>
        {sale.discountAmount ? <div className="flex justify-between"><span>{t("common.discount")}</span><span>−{m(sale.discountAmount)}</span></div> : null}
        <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-1"><span>{t("common.total")}</span><span>{m(sale.total)}</span></div>
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {sale.payments.map((p, i) => (
        <div key={i} className="flex justify-between"><span>{t(`pos.methods.${p.method}`)}{p.reference ? ` (${p.reference})` : ""}</span><span>{m(p.amount)}</span></div>
      ))}
      {sale.payments.some((p) => p.method === "CREDIT") ? (
        <p className="mt-1 text-center font-bold">{t("pos.creditDue")}: {m(sale.payments.filter((p) => p.method === "CREDIT").reduce((a, p) => a + p.amount, 0))}</p>
      ) : null}
      {sale.refunds?.length ? (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          {sale.refunds.map((r) => <div key={r.refundNumber} className="flex justify-between"><span>{t("sales.refund")} {r.refundNumber}</span><span>−{m(r.amount)}</span></div>)}
        </>
      ) : null}
      {sale.status === "CANCELLED" ? <p className="mt-2 text-center font-bold">*** {t("sales.status.CANCELLED").toUpperCase()} ***</p> : null}
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">{t("pos.thankYou")}</p>
    </div>
  )
}

export function printReceipt() {
  window.print()
}
