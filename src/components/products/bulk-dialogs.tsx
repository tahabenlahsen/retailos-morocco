"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Upload, FileDown } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/shared/form-field"
import { api } from "@/lib/api-client"
import { useApiError } from "@/hooks/use-api-error"
import type { ProductRow } from "./product-form"

const TEMPLATE = "name,sku,barcode,category,brand,purchasePrice,sellingPrice,taxRate,stockQuantity,minimumStock,unit\nCoca-Cola 33cl,CC-33,5449000000996,Boissons,Coca-Cola,4,6,0.2,120,30,pièce\n"

export function BulkPriceDialog({ open, onOpenChange, productIds, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; productIds: string[]; onDone: () => void }) {
  const { t } = useTranslation()
  const { showError } = useApiError()
  const [mode, setMode] = useState<"SET" | "PERCENT" | "AMOUNT">("PERCENT")
  const [field, setField] = useState<"sellingPrice" | "purchasePrice">("sellingPrice")
  const [value, setValue] = useState("")
  const m = useMutation({
    mutationFn: () => api.post<{ updated: number }>("/api/products/bulk", { kind: "price", productIds, mode, field, value: Number(value) }),
    onSuccess: (r) => { toast.success(`${r.updated} ${t("common.saved").toLowerCase()}`); onOpenChange(false); onDone() },
    onError: showError,
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{t("products.bulkPrice")}</DialogTitle><DialogDescription>{t("products.selected", { count: productIds.length })}</DialogDescription></DialogHeader>
        <FormField label={t("products.margin")}>{(id) => <Select value={field} onValueChange={(v) => setField(v as typeof field)}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sellingPrice">{t("products.field.sellingPrice")}</SelectItem><SelectItem value="purchasePrice">{t("products.field.purchasePrice")}</SelectItem></SelectContent></Select>}</FormField>
        <FormField label={t("common.change")}>{(id) => <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{(["SET", "PERCENT", "AMOUNT"] as const).map((k) => <SelectItem key={k} value={k}>{t(`products.priceMode.${k}`)}</SelectItem>)}</SelectContent></Select>}</FormField>
        <FormField label={mode === "PERCENT" ? "%" : "DH"} required>{(id) => <Input id={id} type="number" step="0.01" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />}</FormField>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button onClick={() => m.mutate()} disabled={value === ""} loading={m.isPending}>{t("common.apply")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BulkStockDialog({ open, onOpenChange, products, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; products: ProductRow[]; onDone: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <BulkStockContent onOpenChange={onOpenChange} products={products} onDone={onDone} /> : null}</Dialog>
}

function BulkStockContent({ onOpenChange, products, onDone }: { onOpenChange: (o: boolean) => void; products: ProductRow[]; onDone: () => void }) {
  const { t } = useTranslation()
  const { showError } = useApiError()
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(products.map((p) => [p.id, String(p.stockQuantity)])))
  const [reason, setReason] = useState("")
  const m = useMutation({
    mutationFn: () => api.post<{ updated: number }>("/api/products/bulk", { kind: "stock", reason, items: products.map((p) => ({ productId: p.id, newQuantity: Number(qty[p.id]) || 0 })) }),
    onSuccess: (r) => { toast.success(`${r.updated} ${t("common.saved").toLowerCase()}`); onOpenChange(false); onDone() },
    onError: showError,
  })
  return (
      <DialogContent>
        <DialogHeader><DialogTitle>{t("products.bulkStock")}</DialogTitle><DialogDescription>{t("products.selected", { count: products.length })}</DialogDescription></DialogHeader>
        <div className="max-h-80 overflow-y-auto scrollbar-thin divide-y">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0"><p className="font-medium truncate">{p.name}</p><p className="text-xs text-muted-foreground">{t("products.stock")}: {p.stockQuantity}</p></div>
              <Input type="number" min={0} step={1} className="w-24 text-end" value={qty[p.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))} />
            </div>
          ))}
        </div>
        <FormField label={t("common.reason")} required>{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Inventaire physique" />}</FormField>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button onClick={() => m.mutate()} disabled={reason.trim().length < 2} loading={m.isPending}>{t("common.apply")}</Button></DialogFooter>
      </DialogContent>
  )
}

export function ImportDialog({ open, onOpenChange, storeId }: { open: boolean; onOpenChange: (o: boolean) => void; storeId: string }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <ImportContent onOpenChange={onOpenChange} storeId={storeId} /> : null}</Dialog>
}

function ImportContent({ onOpenChange, storeId }: { onOpenChange: (o: boolean) => void; storeId: string }) {
  const { t } = useTranslation()
  const { showError } = useApiError()
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(null)
  const m = useMutation({
    mutationFn: () => { const fd = new FormData(); fd.append("file", file!); fd.append("storeId", storeId); return api.upload<{ created: number; updated: number; errors: { row: number; message: string }[] }>("/api/products/import", fd) },
    onSuccess: (r) => { setResult(r); void qc.invalidateQueries({ queryKey: ["products"] }); void qc.invalidateQueries({ queryKey: ["categories"] }); toast.success(t("products.importResult", { created: r.created, updated: r.updated, errors: r.errors.length })) },
    onError: showError,
  })
  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + TEMPLATE], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "products-template.csv"; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
      <DialogContent>
        <DialogHeader><DialogTitle>{t("products.importCsv")}</DialogTitle><DialogDescription>{t("products.importHint")}</DialogDescription></DialogHeader>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-fit"><FileDown className="h-4 w-4" />{t("products.downloadTemplate")}</Button>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {result ? (
          <div className="rounded-md border p-3 text-sm space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
            <p className="font-medium">{t("products.importResult", { created: result.created, updated: result.updated, errors: result.errors.length })}</p>
            {result.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e.row ? `L${e.row}: ` : ""}{e.message}</p>)}
          </div>
        ) : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.close")}</Button><Button onClick={() => m.mutate()} disabled={!file} loading={m.isPending}><Upload className="h-4 w-4" />{t("common.import")}</Button></DialogFooter>
      </DialogContent>
  )
}
