"use client"

import { useState } from "react"
import { usePagination } from "@/hooks/use-pagination"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { DataTable, type Column } from "@/components/shared/data-table"
import { Money } from "@/components/shared/money"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMe } from "@/hooks/use-me"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { api, type Paginated } from "@/lib/api-client"
import { PURCHASE_STATUSES } from "@/utils/validation"
import { poStatusVariant } from "@/components/purchases/po-status"

interface PoRow { id: string; orderNumber: string; status: string; total: number; createdAt: string; expectedDelivery: string | null; deliveredAt: string | null; supplier: { name: string }; store: { name: string }; _count: { items: number } }
const ALL = "__all__"

export default function PurchasesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { can } = useMe()
  const { storeId, stores } = useStore()
  const { formatDate } = useLocale()
  const [status, setStatus] = useState(ALL)
  const { page, setPage } = usePagination(`${storeId ?? "all"}:${status}`)

  const q = useQuery({ queryKey: ["purchases", storeId, status, page], queryFn: () => api.get<Paginated<PoRow>>("/api/purchases", { storeId: storeId ?? undefined, status: status === ALL ? undefined : status, page, pageSize: 25 }), placeholderData: (p) => p })

  const cols: Column<PoRow>[] = [
    { key: "number", header: t("purchases.number"), cell: (p) => <span className="font-mono font-medium">{p.orderNumber}</span> },
    { key: "supplier", header: t("purchases.supplier"), cell: (p) => <div><p>{p.supplier.name}</p>{stores.length > 1 && !storeId ? <p className="text-xs text-muted-foreground">{p.store.name}</p> : null}</div> },
    { key: "date", header: t("common.date"), cell: (p) => <span className="text-xs">{formatDate(p.createdAt)}</span>, hideOnMobile: true },
    { key: "expected", header: t("purchases.expected"), cell: (p) => <span className="text-xs">{p.deliveredAt ? `${t("purchases.delivered")} ${formatDate(p.deliveredAt)}` : p.expectedDelivery ? formatDate(p.expectedDelivery) : "—"}</span>, hideOnMobile: true },
    { key: "items", header: t("sales.items"), cell: (p) => p._count.items, align: "center", hideOnMobile: true },
    { key: "status", header: t("common.status"), cell: (p) => <Badge variant={poStatusVariant(p.status)}>{t(`purchases.status.${p.status}`)}</Badge> },
    { key: "total", header: t("common.total"), cell: (p) => <Money value={p.total} className="font-semibold" />, align: "end" },
  ]

  return (
    <RequirePermission permission="purchase.view">
      <PageHeader title={t("purchases.title")} actions={<>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("common.all")}</SelectItem>{PURCHASE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`purchases.status.${s}`)}</SelectItem>)}</SelectContent></Select>
        {can("purchase.create") ? <Button asChild><Link href="/purchases/new"><Plus className="h-4 w-4" />{t("purchases.create")}</Link></Button> : null}
      </>} />
      <DataTable columns={cols} rows={q.data?.items} rowKey={(p) => p.id} loading={q.isLoading} emptyTitle={t("purchases.noOrders")} onRowClick={(p) => router.push(`/purchases/${p.id}`)} pagination={q.data ? { page, pageSize: q.data.pageSize, total: q.data.total, onPageChange: setPage } : undefined} emptyAction={can("purchase.create") ? <Button asChild><Link href="/purchases/new"><Plus className="h-4 w-4" />{t("purchases.create")}</Link></Button> : undefined} />
    </RequirePermission>
  )
}
