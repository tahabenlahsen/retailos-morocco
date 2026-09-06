"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/misc"
import { FormField } from "@/components/shared/form-field"
import { productBaseSchema } from "@/utils/validation"
import { api } from "@/lib/api-client"
import { useLocale } from "@/components/providers/locale-provider"

export interface ProductRow {
  id: string
  name: string
  sku: string
  barcode: string | null
  description: string | null
  image: string | null
  purchasePrice: number
  sellingPrice: number
  costPrice: number | null
  taxRate: number
  stockQuantity: number
  minimumStock: number
  maximumStock: number | null
  unit: string
  isActive: boolean
  storeId: string
  categoryId: string
  brandId: string | null
  supplierId: string | null
  category: { id: string; name: string }
  brand: { id: string; name: string } | null
  supplier: { id: string; name: string } | null
  store: { id: string; name: string }
}

const formSchema = productBaseSchema
  .omit({ storeId: true })
  .extend({ isActive: z.boolean().default(true) })
  .refine((d) => d.maximumStock == null || d.maximumStock >= d.minimumStock, { message: "max >= min", path: ["maximumStock"] })
type FormIn = z.input<typeof formSchema>
type FormOut = z.output<typeof formSchema>

const NONE = "__none__"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  product?: ProductRow | null
  storeId: string
  onSubmit: (values: FormOut) => Promise<unknown>
  submitting?: boolean
}

export function ProductForm({ open, onOpenChange, product, storeId, onSubmit, submitting }: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocale()
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/categories"), enabled: open })
  const brands = useQuery({ queryKey: ["brands"], queryFn: () => api.get<{ id: string; name: string }[]>("/api/brands"), enabled: open })
  const suppliers = useQuery({ queryKey: ["suppliers", "all"], queryFn: () => api.get<{ items: { id: string; name: string }[] }>("/api/suppliers", { pageSize: 200 }).then((r) => r.items), enabled: open })

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(formSchema), defaultValues: { taxRate: 0.2, unit: "pièce", stockQuantity: 0, minimumStock: 0, isActive: true } })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = form

  useEffect(() => {
    if (!open) return
    if (product) {
      reset({ name: product.name, sku: product.sku, barcode: product.barcode ?? "", description: product.description ?? "", image: product.image ?? "", purchasePrice: product.purchasePrice, sellingPrice: product.sellingPrice, taxRate: product.taxRate, stockQuantity: product.stockQuantity, minimumStock: product.minimumStock, maximumStock: product.maximumStock ?? undefined, unit: product.unit, categoryId: product.categoryId, brandId: product.brandId, supplierId: product.supplierId, isActive: product.isActive })
    } else {
      reset({ name: "", sku: "", barcode: "", description: "", image: "", purchasePrice: 0, sellingPrice: 0, taxRate: 0.2, stockQuantity: 0, minimumStock: 0, maximumStock: undefined, unit: "pièce", categoryId: categories.data?.[0]?.id ?? "", brandId: null, supplierId: null, isActive: true })
    }
  }, [open, product, reset, categories.data])

  const purchase = Number(watch("purchasePrice")) || 0
  const selling = Number(watch("sellingPrice")) || 0
  const taxRate = Number(watch("taxRate")) || 0
  const sellingHT = selling / (1 + taxRate)
  const margin = sellingHT > 0 ? ((sellingHT - purchase) / sellingHT) * 100 : 0

  const generateSku = () => {
    const name = (watch("name") || "PRD").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 4).padEnd(3, "X")
    setValue("sku", `${name}-${Date.now().toString(36).toUpperCase().slice(-5)}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{product ? t("products.edit") : t("products.add")}</DialogTitle></DialogHeader>
        <form id="product-form" onSubmit={handleSubmit((v) => onSubmit(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <FormField label={t("common.name")} required className="sm:col-span-2" error={errors.name && t("common.required")}>{(id, inv) => <Input id={id} autoFocus aria-invalid={inv} {...register("name")} />}</FormField>
          <FormField label={t("products.sku")} required error={errors.sku && t("common.required")}>
            {(id, inv) => <div className="flex gap-2"><Input id={id} aria-invalid={inv} {...register("sku")} className="font-mono" /><Button type="button" variant="outline" onClick={generateSku}>{t("products.generateSku")}</Button></div>}
          </FormField>
          <FormField label={t("products.barcode")} error={errors.barcode && t("common.required")}>{(id, inv) => <Input id={id} inputMode="numeric" aria-invalid={inv} {...register("barcode")} className="font-mono" />}</FormField>
          <FormField label={t("products.category")} required error={errors.categoryId && t("common.required")}>
            {(id) => (
              <Select value={watch("categoryId") || ""} onValueChange={(v) => setValue("categoryId", v, { shouldValidate: true })}>
                <SelectTrigger id={id}><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                <SelectContent>{categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={t("products.brand")}>
            {(id) => (
              <Select value={watch("brandId") ?? NONE} onValueChange={(v) => setValue("brandId", v === NONE ? null : v)}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>{t("common.none")}</SelectItem>{brands.data?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={t("products.supplier")} className="sm:col-span-2">
            {(id) => (
              <Select value={watch("supplierId") ?? NONE} onValueChange={(v) => setValue("supplierId", v === NONE ? null : v)}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>{t("common.none")}</SelectItem>{suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={t("products.purchasePrice")} required error={errors.purchasePrice && t("common.required")}>{(id, inv) => <Input id={id} type="number" step="0.01" min={0} aria-invalid={inv} {...register("purchasePrice", { valueAsNumber: true })} />}</FormField>
          <FormField label={t("products.sellingPrice")} required error={errors.sellingPrice && t("common.required")} hint={`${t("products.margin")}: ${formatNumber(margin, { maximumFractionDigits: 1 })}%`}>{(id, inv) => <Input id={id} type="number" step="0.01" min={0} aria-invalid={inv} {...register("sellingPrice", { valueAsNumber: true })} />}</FormField>
          <FormField label={t("products.taxRate")} hint="0.2 = 20%" error={errors.taxRate && t("common.required")}>{(id, inv) => <Input id={id} type="number" step="0.01" min={0} max={1} aria-invalid={inv} {...register("taxRate", { valueAsNumber: true })} />}</FormField>
          <FormField label={t("products.unit")}>{(id) => <Input id={id} {...register("unit")} />}</FormField>
          {!product ? <FormField label={t("products.initialStock")} error={errors.stockQuantity && t("common.required")}>{(id, inv) => <Input id={id} type="number" min={0} step={1} aria-invalid={inv} {...register("stockQuantity", { valueAsNumber: true })} />}</FormField> : <div />}
          <FormField label={t("products.minStock")} error={errors.minimumStock && t("common.required")}>{(id, inv) => <Input id={id} type="number" min={0} step={1} aria-invalid={inv} {...register("minimumStock", { valueAsNumber: true })} />}</FormField>
          <FormField label={t("products.maxStock")} error={errors.maximumStock?.message ? String(errors.maximumStock.message) : undefined}>{(id, inv) => <Input id={id} type="number" min={0} step={1} aria-invalid={inv} {...register("maximumStock", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} />}</FormField>
          <FormField label={t("products.image")} className="sm:col-span-2" error={errors.image && "URL"}>{(id, inv) => <Input id={id} type="url" placeholder="https://" aria-invalid={inv} {...register("image")} />}</FormField>
          <FormField label={t("common.description")} className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} {...register("description")} />}</FormField>
          {product ? <label className="flex items-center gap-3 text-sm sm:col-span-2"><Switch checked={!!watch("isActive")} onCheckedChange={(v) => setValue("isActive", v)} />{t("common.active")}</label> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="product-form" loading={submitting}>{t("common.save")}</Button>
        </DialogFooter>
        <input type="hidden" value={storeId} readOnly />
      </DialogContent>
    </Dialog>
  )
}
