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
import { useMe } from "@/hooks/use-me"
import { useCrud } from "@/hooks/use-crud"
import { api, type Paginated } from "@/lib/api-client"
import { createCustomerSchema } from "@/utils/validation"
import type { z } from "zod"

interface Customer { id: string; name: string; phone: string | null; email: string | null; loyaltyPoints: number; totalSpending: number; outstandingBalance: number; _count: { sales: number } }
type In = z.input<typeof createCustomerSchema>

export default function CustomersPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { can } = useMe()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const debounced = useDebounce(search.trim(), 250, () => setPage(1))

  const q = useQuery({ queryKey: ["customers", debounced, page], queryFn: () => api.get<Paginated<Customer>>("/api/customers", { search: debounced || undefined, page, pageSize: 25 }), placeholderData: (p) => p })
  const crud = useCrud<In>("/api/customers", [["customers"]])

  const fields: FieldDef<In>[] = useMemo(() => [
    { name: "name", label: t("common.name"), required: true, colSpan: 2 },
    { name: "phone", label: t("common.phone"), type: "tel" },
    { name: "email", label: t("common.email"), type: "email" },
    { name: "address", label: t("common.address"), colSpan: 2 },
    { name: "notes", label: t("common.notes"), type: "textarea" },
  ], [t])
  const defaults = useMemo<In>(() => ({ name: "", phone: "", email: "", address: "", notes: "" }), [])

  const cols: Column<Customer>[] = [
    { key: "name", header: t("common.name"), cell: (c) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground" dir="ltr">{[c.phone, c.email].filter(Boolean).join(" · ")}</p></div> },
    { key: "orders", header: t("customers.orders"), cell: (c) => c._count.sales, align: "center", hideOnMobile: true },
    { key: "loyalty", header: t("customers.loyalty"), cell: (c) => c.loyaltyPoints, align: "center", hideOnMobile: true },
    { key: "spent", header: t("customers.totalSpending"), cell: (c) => <Money value={c.totalSpending} className="font-medium" />, align: "end" },
  ]

  return (
    <RequirePermission permission="customer.view">
      <PageHeader title={t("customers.title")} actions={can("customer.manage") ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t("customers.add")}</Button> : undefined} />
      <div className="mb-4 relative max-w-sm"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <DataTable columns={cols} rows={q.data?.items} rowKey={(c) => c.id} loading={q.isLoading} emptyTitle={t("customers.noCustomers")} onRowClick={(c) => router.push(`/customers/${c.id}`)} pagination={q.data ? { page, pageSize: q.data.pageSize, total: q.data.total, onPageChange: setPage } : undefined} emptyAction={can("customer.manage") ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t("customers.add")}</Button> : undefined} />
      <EntityDialog open={open} onOpenChange={setOpen} title={t("customers.add")} schema={createCustomerSchema} fields={fields} defaultValues={defaults} submitting={crud.create.isPending} onSubmit={async (v) => { await crud.create.mutateAsync(v); setOpen(false) }} />
    </RequirePermission>
  )
}
