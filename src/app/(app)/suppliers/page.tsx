"use client"

import { useMemo, useState } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Search } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EntityDialog, type FieldDef } from "@/components/shared/entity-dialog"
import { Money } from "@/components/shared/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/misc"
import { useMe } from "@/hooks/use-me"
import { useCrud } from "@/hooks/use-crud"
import { api, type Paginated } from "@/lib/api-client"
import { createSupplierSchema } from "@/utils/validation"
import type { z } from "zod"

interface Supplier { id: string; name: string; phone: string | null; email: string | null; address: string | null; taxNumber: string | null; creditLimit: number | null; currentBalance: number; isActive: boolean; notes: string | null; _count: { purchaseOrders: number; products: number } }
type In = z.input<typeof createSupplierSchema>

export default function SuppliersPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { can } = useMe()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const debounced = useDebounce(search.trim(), 250, () => setPage(1))

  const q = useQuery({ queryKey: ["suppliers", debounced, page], queryFn: () => api.get<Paginated<Supplier>>("/api/suppliers", { search: debounced || undefined, page, pageSize: 25 }), placeholderData: (p) => p })
  const crud = useCrud<In>("/api/suppliers", [["suppliers"]])

  const fields: FieldDef<In>[] = useMemo(() => [
    { name: "name", label: t("common.name"), required: true, colSpan: 2 },
    { name: "phone", label: t("common.phone"), type: "tel" },
    { name: "email", label: t("common.email"), type: "email" },
    { name: "taxNumber", label: t("suppliers.taxNumber") },
    { name: "creditLimit", label: t("suppliers.creditLimit"), type: "number", step: "0.01", min: 0 },
    { name: "address", label: t("common.address"), colSpan: 2 },
    { name: "notes", label: t("common.notes"), type: "textarea" },
  ], [t])
  const defaults = useMemo<In>(() => ({ name: "", phone: "", email: "", taxNumber: "", address: "", notes: "" }), [])

  const cols: Column<Supplier>[] = [
    { key: "name", header: t("common.name"), cell: (s) => <div><p className="font-medium">{s.name}{!s.isActive ? <Badge variant="muted" className="ms-2">{t("common.inactive")}</Badge> : null}</p><p className="text-xs text-muted-foreground">{[s.phone, s.email].filter(Boolean).join(" · ")}</p></div> },
    { key: "products", header: t("suppliers.products"), cell: (s) => s._count.products, align: "center", hideOnMobile: true },
    { key: "orders", header: t("suppliers.orderCount"), cell: (s) => s._count.purchaseOrders, align: "center", hideOnMobile: true },
    { key: "balance", header: t("suppliers.balance"), cell: (s) => <Money value={s.currentBalance} className={s.currentBalance > 0.009 ? "text-destructive font-medium" : ""} />, align: "end" },
  ]

  return (
    <RequirePermission permission="supplier.view">
      <PageHeader title={t("suppliers.title")} actions={can("supplier.manage") ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t("suppliers.add")}</Button> : undefined} />
      <div className="mb-4 relative max-w-sm"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <DataTable columns={cols} rows={q.data?.items} rowKey={(s) => s.id} loading={q.isLoading} emptyTitle={t("suppliers.noSuppliers")} onRowClick={(s) => router.push(`/suppliers/${s.id}`)} pagination={q.data ? { page, pageSize: q.data.pageSize, total: q.data.total, onPageChange: setPage } : undefined} emptyAction={can("supplier.manage") ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t("suppliers.add")}</Button> : undefined} />
      <EntityDialog open={open} onOpenChange={setOpen} title={t("suppliers.add")} schema={createSupplierSchema} fields={fields} defaultValues={defaults} submitting={crud.create.isPending} onSubmit={async (v) => { await crud.create.mutateAsync(v); setOpen(false) }} />
    </RequirePermission>
  )
}
