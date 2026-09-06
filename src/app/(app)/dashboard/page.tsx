"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { TrendingUp, PiggyBank, Receipt, ShoppingBag, Wallet, Boxes, AlertTriangle, ArrowRight } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { DateRangePicker } from "@/components/shared/date-range-picker"
import { RequirePermission } from "@/components/shared/require-permission"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { SalesTrendChart, PaymentMethodsChart, TopProductsChart } from "@/components/dashboard/charts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge, Skeleton } from "@/components/ui/misc"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { Money } from "@/components/shared/money"
import { useDateFilter } from "@/hooks/use-date-filter"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { api } from "@/lib/api-client"

interface Dashboard {
  kpis: {
    revenue: { value: number; change: number | null }
    grossProfit: { value: number; change: number | null }
    netProfit: { value: number; change: number | null }
    transactions: { value: number; change: number | null }
    averageOrderValue: { value: number; change: number | null }
    expenses: { value: number; change: number | null }
    cogs: number; tax: number; refunds: number; discounts: number; grossMargin: number; netMargin: number
    inventoryValue: number; inventoryRetailValue: number; lowStockCount: number; outOfStockCount: number
  }
  trend: { date: string; revenue: number; profit: number; count: number; expenses: number }[]
  paymentMethods: { method: string; amount: number; count: number }[]
  topProducts: { product: { id: string; name: string; sku: string; unit: string; stockQuantity: number }; quantity: number; revenue: number; profit: number }[]
  lowStock: { id: string; name: string; sku: string; stockQuantity: number; minimumStock: number; unit: string }[]
  recentSales: { id: string; saleNumber: string; total: number; status: string; createdAt: string; customer: { name: string } | null; payments: { method: string }[]; _count: { items: number } }[]
}

export default function DashboardPage() {
  const { t } = useTranslation()
  const { filter, setFilter, params, ready } = useDateFilter("today")
  const { storeId } = useStore()
  const { formatDateTime, formatNumber } = useLocale()

  const q = useQuery({
    queryKey: ["analytics", "dashboard", params, storeId],
    queryFn: () => api.get<Dashboard>("/api/analytics/dashboard", { ...params, storeId: storeId ?? undefined }),
    enabled: ready,
  })
  const d = q.data
  const k = d?.kpis
  const loading = q.isLoading

  return (
    <RequirePermission permission="analytics.view">
      <PageHeader title={t("dashboard.title")} actions={<DateRangePicker value={filter} onChange={setFilter} />} />

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
        <KpiCard title={t("dashboard.revenue")} value={k?.revenue.value} change={k?.revenue.change} icon={TrendingUp} loading={loading} />
        <KpiCard title={t("dashboard.netProfit")} value={k?.netProfit.value} change={k?.netProfit.change} icon={PiggyBank} loading={loading} tone={k && k.netProfit.value < 0 ? "destructive" : "success"} />
        <KpiCard title={t("dashboard.transactions")} value={k?.transactions.value} change={k?.transactions.change} icon={Receipt} money={false} loading={loading} />
        <KpiCard title={t("dashboard.aov")} value={k?.averageOrderValue.value} change={k?.averageOrderValue.change} icon={ShoppingBag} loading={loading} />
      </div>
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
        <KpiCard title={t("dashboard.grossProfit")} value={k?.grossProfit.value} change={k?.grossProfit.change} icon={TrendingUp} loading={loading} />
        <KpiCard title={t("dashboard.expenses")} value={k?.expenses.value} change={k?.expenses.change} icon={Wallet} loading={loading} tone="warning" invert />
        <KpiCard title={t("dashboard.inventoryValue")} value={k?.inventoryValue} icon={Boxes} loading={loading} />
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("dashboard.lowStock")} / {t("dashboard.outOfStock")}</p>
            {loading ? <Skeleton className="h-8 w-24 mt-2" /> : <p className="text-2xl font-bold mt-1 tabular-nums"><span className="text-amber-600 dark:text-amber-400">{formatNumber(k?.lowStockCount ?? 0)}</span> <span className="text-muted-foreground">/</span> <span className="text-destructive">{formatNumber(k?.outOfStockCount ?? 0)}</span></p>}
            <Link href="/inventory?tab=reorder" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">{t("inventory.reorder")} <ArrowRight className="h-3 w-3 rtl:rotate-180" /></Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("dashboard.salesTrend")}</CardTitle><CardDescription>{t("dashboard.grossMargin")}: {k ? `${formatNumber(k.grossMargin)}%` : "—"} · {t("dashboard.netMargin")}: {k ? `${formatNumber(k.netMargin)}%` : "—"}</CardDescription></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[280px] w-full" /> : d && d.trend.some((x) => x.revenue > 0 || x.expenses > 0) ? <SalesTrendChart data={d.trend} /> : <EmptyState title={t("dashboard.noSales")} className="h-[280px]" />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("dashboard.paymentMethods")}</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[240px] w-full" /> : d?.paymentMethods.length ? <PaymentMethodsChart data={d.paymentMethods} /> : <EmptyState title={t("dashboard.noSales")} className="h-[240px]" />}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t("dashboard.topProducts")}</CardTitle></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[240px] w-full" /> : d?.topProducts.length ? <TopProductsChart data={d.topProducts} /> : <EmptyState title={t("dashboard.noSales")} className="h-[200px]" />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>{t("dashboard.lowStockProducts")}</CardTitle><Button asChild variant="ghost" size="sm"><Link href="/products?lowStock=true">{t("common.viewAll")}</Link></Button></CardHeader>
          <CardContent className="space-y-2">
            {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />) : d?.lowStock.length ? d.lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0"><p className="font-medium truncate">{p.name}</p><p className="text-xs text-muted-foreground">{p.sku}</p></div>
                <Badge variant={p.stockQuantity <= 0 ? "destructive" : "warning"}><AlertTriangle className="h-3 w-3 me-1" />{p.stockQuantity} / {p.minimumStock}</Badge>
              </div>
            )) : <EmptyState title={t("dashboard.noLowStock")} className="py-8" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>{t("dashboard.recentSales")}</CardTitle><Button asChild variant="ghost" size="sm"><Link href="/sales">{t("common.viewAll")}</Link></Button></CardHeader>
          <CardContent className="space-y-2">
            {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />) : d?.recentSales.length ? d.recentSales.map((s) => (
              <Link key={s.id} href={`/sales/${s.id}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-accent/50">
                <div className="min-w-0"><p className="font-medium truncate">{s.saleNumber}</p><p className="text-xs text-muted-foreground truncate">{formatDateTime(s.createdAt)} · {s.customer?.name ?? t("pos.walkIn")} · {t("pos.items", { count: s._count.items })}</p></div>
                <div className="text-end"><Money value={s.total} className="font-semibold" />{s.status !== "COMPLETED" ? <p className="text-[10px] text-muted-foreground">{t(`sales.status.${s.status}`)}</p> : null}</div>
              </Link>
            )) : <EmptyState title={t("dashboard.noSales")} className="py-8" />}
          </CardContent>
        </Card>
      </div>
    </RequirePermission>
  )
}
