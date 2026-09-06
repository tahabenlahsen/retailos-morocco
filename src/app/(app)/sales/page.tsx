"use client"

import { useState } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { usePagination } from "@/hooks/use-pagination"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Search } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DateRangePicker } from "@/components/shared/date-range-picker"
import { Money } from "@/components/shared/money"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDateFilter } from "@/hooks/use-date-filter"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { api, type Paginated } from "@/lib/api-client"
import { resolveDateRange } from "@/utils/dates"

interface SaleRow { id: string; saleNumber: string; total: number; status: string; createdAt: string; customer: { name: string } | null; payments: { method: string; amount: number }[]; _count: { items: number } }
const ALL = "__all__"
const STATUSES = ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"]

export default function SalesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { storeId } = useStore()
  const { formatDateTime } = useLocale()
  const { filter, setFilter } = useDateFilter("last7")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(ALL)
  const debounced = useDebounce(search.trim(), 250)
  const { page, setPage } = usePagination(`${storeId ?? "all"}:${status}:${debounced}:${filter.preset}:${filter.from}:${filter.to}`)

  const range = filter.preset === "custom" ? (filter.from && filter.to ? { from: new Date(filter.from), to: new Date(filter.to + "T23:59:59") } : null) : resolveDateRange(filter.preset)
  const q = useQuery({
    queryKey: ["sales", storeId, range?.from?.toISOString(), range?.to?.toISOString(), debounced, status, page],
    queryFn: () => api.get<Paginated<SaleRow>>("/api/sales", { storeId: storeId ?? undefined, from: range?.from, to: range?.to, search: debounced || undefined, status: status === ALL ? undefined : status, page, pageSize: 25 }),
    enabled: !!range,
    placeholderData: (p) => p,
  })

  const statusVariant = (s: string) => (s === "COMPLETED" ? "success" : s === "CANCELLED" ? "destructive" : "warning") as "success" | "destructive" | "warning"
  const cols: Column<SaleRow>[] = [
    { key: "number", header: t("sales.number"), cell: (s) => <span className="font-mono font-medium">{s.saleNumber}</span> },
    { key: "date", header: t("common.date"), cell: (s) => <span className="text-xs">{formatDateTime(s.createdAt)}</span> },
    { key: "customer", header: t("pos.customer"), cell: (s) => <span className={s.customer ? "" : "text-muted-foreground"}>{s.customer?.name ?? t("pos.walkIn")}</span>, hideOnMobile: true },
    { key: "items", header: t("sales.items"), cell: (s) => s._count.items, align: "center", hideOnMobile: true },
    { key: "payment", header: t("sales.payment"), cell: (s) => <div className="flex flex-wrap gap-1">{[...new Set(s.payments.map((p) => p.method))].map((m) => <Badge key={m} variant="secondary">{t(`pos.methods.${m}`)}</Badge>)}</div>, hideOnMobile: true },
    { key: "status", header: t("common.status"), cell: (s) => <Badge variant={statusVariant(s.status)}>{t(`sales.status.${s.status}`)}</Badge> },
    { key: "total", header: t("common.total"), cell: (s) => <Money value={s.total} className="font-semibold" />, align: "end" },
  ]

  return (
    <RequirePermission permission="sale.view">
      <PageHeader title={t("sales.title")} actions={<DateRangePicker value={filter} onChange={setFilter} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" placeholder={t("sales.number")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("common.all")}</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`sales.status.${s}`)}</SelectItem>)}</SelectContent></Select>
      </div>
      <DataTable columns={cols} rows={q.data?.items} rowKey={(s) => s.id} loading={q.isLoading} emptyTitle={t("sales.noSales")} onRowClick={(s) => router.push(`/sales/${s.id}`)} pagination={q.data ? { page, pageSize: q.data.pageSize, total: q.data.total, onPageChange: setPage } : undefined} />
    </RequirePermission>
  )
}
