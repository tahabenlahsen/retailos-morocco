"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/shared/form-field"
import { Money } from "@/components/shared/money"
import { ProductSelect } from "@/components/inventory/product-select"
import type { ProductRow } from "@/components/products/product-form"
import { api } from "@/lib/api-client"
import { round2, sum } from "@/utils/money"

export interface PoLine { productId: string; name: string; sku: string; unit: string; quantity: number; unitPrice: number; taxRate: number }
export interface PoFormValue { supplierId: string; items: PoLine[]; expectedDelivery: string; notes: string }

interface Props {
  storeId: string
  value: PoFormValue
  onChange: (v: PoFormValue) => void
  /** Items locked after partial receipt */
  lockItems?: boolean
}

export function PoForm({ storeId, value, onChange, lockItems }: Props) {
  const { t } = useTranslation()
  const suppliers = useQuery({ queryKey: ["suppliers", "all"], queryFn: () => api.get<{ items: { id: string; name: string }[] }>("/api/suppliers", { pageSize: 200 }).then((r) => r.items) })

  const addProduct = (picker: ProductRow | null) => {
    if (!picker || value.items.some((i) => i.productId === picker.id)) return
    onChange({ ...value, items: [...value.items, { productId: picker.id, name: picker.name, sku: picker.sku, unit: picker.unit, quantity: Math.max(1, (picker.minimumStock || 0) * 2 - picker.stockQuantity), unitPrice: picker.purchasePrice, taxRate: picker.taxRate }] })
  }

  const totals = useMemo(() => {
    const lines = value.items.map((i) => ({ sub: round2(i.quantity * i.unitPrice), tax: round2(i.quantity * i.unitPrice * i.taxRate) }))
    const subtotal = sum(lines.map((l) => l.sub))
    const tax = sum(lines.map((l) => l.tax))
    return { subtotal, tax, total: round2(subtotal + tax) }
  }, [value.items])

  const setItem = (i: number, patch: Partial<PoLine>) => onChange({ ...value, items: value.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("purchases.supplier")} required>{(id) => <Select value={value.supplierId} onValueChange={(v) => onChange({ ...value, supplierId: v })}><SelectTrigger id={id}><SelectValue placeholder={t("common.select")} /></SelectTrigger><SelectContent>{suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>}</FormField>
        <FormField label={t("purchases.expected")}>{(id) => <Input id={id} type="date" value={value.expectedDelivery} onChange={(e) => onChange({ ...value, expectedDelivery: e.target.value })} />}</FormField>
      </div>

      {!lockItems ? <FormField label={t("purchases.addProduct")}>{() => <ProductSelect storeId={storeId} value={null} onChange={addProduct} />}</FormField> : null}

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 text-start">{t("inventory.product")}</th><th className="px-3 py-2 text-end w-28">{t("common.quantity")}</th><th className="px-3 py-2 text-end w-32">{t("purchases.unitPriceHT")}</th><th className="px-3 py-2 text-end w-24">{t("common.tax")}</th><th className="px-3 py-2 text-end w-28">{t("common.total")}</th>{!lockItems ? <th className="w-10" /> : null}</tr></thead>
          <tbody className="divide-y">
            {value.items.map((it, i) => (
              <tr key={it.productId}>
                <td className="px-3 py-2"><p className="font-medium">{it.name}</p><p className="text-xs text-muted-foreground font-mono">{it.sku}</p></td>
                <td className="px-3 py-2"><Input type="number" min={1} step={1} className="h-8 text-end" value={it.quantity} disabled={lockItems} onChange={(e) => setItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} /></td>
                <td className="px-3 py-2"><Input type="number" min={0} step="0.01" className="h-8 text-end" value={it.unitPrice} disabled={lockItems} onChange={(e) => setItem(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} /></td>
                <td className="px-3 py-2"><Input type="number" min={0} max={1} step="0.01" className="h-8 text-end" value={it.taxRate} disabled={lockItems} onChange={(e) => setItem(i, { taxRate: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })} /></td>
                <td className="px-3 py-2 text-end font-medium"><Money value={round2(it.quantity * it.unitPrice * (1 + it.taxRate))} /></td>
                {!lockItems ? <td className="px-1"><Button type="button" variant="ghost" size="icon-sm" className="text-destructive" onClick={() => onChange({ ...value, items: value.items.filter((_, j) => j !== i) })} aria-label={t("common.remove")}><Trash2 /></Button></td> : null}
              </tr>
            ))}
            {!value.items.length ? <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground"><Plus className="inline h-4 w-4 me-1" />{t("purchases.addProduct")}</td></tr> : null}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr><td colSpan={4} className="px-3 py-1.5 text-end text-muted-foreground">{t("common.subtotal")}</td><td className="px-3 py-1.5 text-end"><Money value={totals.subtotal} /></td>{!lockItems ? <td /> : null}</tr>
            <tr><td colSpan={4} className="px-3 py-1.5 text-end text-muted-foreground">{t("common.tax")}</td><td className="px-3 py-1.5 text-end"><Money value={totals.tax} /></td>{!lockItems ? <td /> : null}</tr>
            <tr className="font-semibold"><td colSpan={4} className="px-3 py-2 text-end">{t("common.total")}</td><td className="px-3 py-2 text-end"><Money value={totals.total} /></td>{!lockItems ? <td /> : null}</tr>
          </tfoot>
        </table>
      </div>
      <FormField label={t("common.notes")}>{(id) => <Textarea id={id} rows={2} value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />}</FormField>
    </div>
  )
}
