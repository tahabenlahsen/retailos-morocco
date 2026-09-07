"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Info } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { ExportMenu } from "@/components/shared/export-menu"
import { RequirePermission } from "@/components/shared/require-permission"
import { DateRangePicker } from "@/components/shared/date-range-picker"
import { DataTable, type Column } from "@/components/shared/data-table"
import { Money, Pct } from "@/components/shared/money"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SimpleBarChart, PaymentMethodsChart } from "@/components/dashboard/charts"
import { EmptyState } from "@/components/shared/empty-state"
import { useDateFilter } from "@/hooks/use-date-filter"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { api } from "@/lib/api-client"

interface Pnl { revenue: number; refunds: number; tax: number; netRevenueHT: number; cogs: number; grossProfit: number; grossMargin: number; expenses: { category: { id: string; name: string; code: string | null }; amount: number }[]; totalExpenses: number; netProfit: number; netMargin: number; transactions: number; averageOrderValue: number }
interface SalesReport { groupBy: string; rows: { key: string; label: string; revenue: number; profit: number; count: number; units: number }[]; totals: { revenue: number; profit: number; count: number } }
interface InventoryReport { productCount: number; totalUnits: number; costValue: number; retailValue: number; potentialProfit: number; cogsInPeriod: number; annualisedTurnover: number | null; lowStock: number; outOfStock: number; movements: { type: string; units: number; count: number }[]; byCategory: { name: string; products: number; units: number; costValue: number; retailValue: number }[] }
interface CustomerReport { anonymous: { count: number; revenue: number }; top: { customer: { id: string; name: string; phone: string | null; loyaltyPoints: number }; orders: number; revenue: number; profit: number }[]; newCustomers: number }
interface SupplierReport { suppliers: { id: string; name: string; orders: number; received: number; cancelled: number; total: number; balance: number; averageDeliveryDays: number | null; onTimeRate: number | null }[]; totalPurchases: number; totalOutstanding: number }
interface PaymentReport { total: number; methods: { method: string; amount: number; count: number; share: number }[] }
interface Receivables { total: number; count: number; debtors: { id: string; name: string; phone: string | null; outstandingBalance: number; creditLimit: number | null }[] }

function Row({ label, value, bold, muted, pct }: { label: string; value: number; bold?: boolean; muted?: boolean; pct?: number }) {
  return <div className={`flex items-center justify-between py-1.5 ${bold ? "font-semibold text-base border-t mt-1 pt-2" : ""} ${muted ? "text-muted-foreground" : ""}`}><span>{label}</span><span className="flex items-center gap-3">{pct != null ? <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span> : null}<Money value={value} /></span></div>
}

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const { filter, setFilter, params, ready } = useDateFilter("thisMonth")
  const { storeId } = useStore()
  const { formatNumber } = useLocale()
  const router = useRouter()
  const [tab, setTab] = useState("pnl")
  const [groupBy, setGroupBy] = useState("day")
  const base = { ...params, storeId: storeId ?? undefined }
  const key = (r: string, extra?: unknown) => ["analytics", r, params, storeId, extra]

  const pnl = useQuery({ queryKey: key("pnl"), queryFn: () => api.get<Pnl>("/api/analytics/pnl", base), enabled: ready && tab === "pnl" })
  const sales = useQuery({ queryKey: key("sales", groupBy), queryFn: () => api.get<SalesReport>("/api/analytics/sales", { ...base, groupBy }), enabled: ready && tab === "sales" })
  const inv = useQuery({ queryKey: key("inventory"), queryFn: () => api.get<InventoryReport>("/api/analytics/inventory", base), enabled: ready && tab === "inventory" })
  const cust = useQuery({ queryKey: key("customers"), queryFn: () => api.get<CustomerReport>("/api/analytics/customers", base), enabled: ready && tab === "customers" })
  const sup = useQuery({ queryKey: key("suppliers"), queryFn: () => api.get<SupplierReport>("/api/analytics/suppliers", base), enabled: ready && tab === "suppliers" })
  const pay = useQuery({ queryKey: key("payments"), queryFn: () => api.get<PaymentReport>("/api/analytics/payments", base), enabled: ready && tab === "payments" })
  const recv = useQuery({ queryKey: ["customers", "receivables"], queryFn: () => api.get<Receivables>("/api/customers/receivables"), enabled: tab === "receivables" })

  const catLabel = (c: { name: string; code: string | null }) => (c.code ? t(`expenses.codes.${c.code}`, { defaultValue: c.name }) : c.name)

  return (
    <RequirePermission permission="analytics.view">
      <PageHeader title={t("analytics.title")} actions={<><DateRangePicker value={filter} onChange={setFilter} />{tab !== "suppliers" ? <ExportMenu report={tab} params={{ ...params, storeId: storeId ?? undefined, groupBy: tab === "sales" ? groupBy : undefined }} /> : null}</>} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">{["pnl", "sales", "inventory", "customers", "suppliers", "payments", "receivables"].map((k) => <TabsTrigger key={k} value={k}>{t(`analytics.${k}`)}</TabsTrigger>)}</TabsList>

        <TabsContent value="pnl">
          {pnl.isLoading ? <Skeleton className="h-96" /> : pnl.data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>{t("analytics.pnl")}</CardTitle><CardDescription className="flex items-start gap-1"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />{t("analytics.formulaText")}</CardDescription></CardHeader><CardContent className="text-sm">
                <Row label={t("analytics.revenue")} value={pnl.data.revenue} />
                <Row label={t("analytics.refunds")} value={-pnl.data.refunds} muted />
                <Row label={t("analytics.tax")} value={-pnl.data.tax} muted />
                <Row label={t("analytics.netRevenue")} value={pnl.data.netRevenueHT} bold />
                <Row label={t("analytics.cogs")} value={-pnl.data.cogs} muted />
                <Row label={t("analytics.grossProfit")} value={pnl.data.grossProfit} bold pct={pnl.data.grossMargin} />
                {pnl.data.expenses.map((e) => <Row key={e.category.id} label={catLabel(e.category)} value={-e.amount} muted />)}
                <Row label={t("analytics.totalExpenses")} value={-pnl.data.totalExpenses} />
                <Row label={t("analytics.netProfit")} value={pnl.data.netProfit} bold pct={pnl.data.netMargin} />
              </CardContent></Card>
              <div className="grid gap-4 sm:grid-cols-2 content-start">
                {[[t("dashboard.transactions"), formatNumber(pnl.data.transactions)], [t("dashboard.aov"), <Money key="a" value={pnl.data.averageOrderValue} />], [t("analytics.grossMargin"), `${formatNumber(pnl.data.grossMargin)}%`], [t("analytics.netMargin"), `${formatNumber(pnl.data.netMargin)}%`]].map(([l, v], i) => <Card key={i}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold mt-1">{v}</p></CardContent></Card>)}
                {pnl.data.expenses.length ? <Card className="sm:col-span-2"><CardHeader><CardTitle>{t("dashboard.expenses")}</CardTitle></CardHeader><CardContent><SimpleBarChart data={pnl.data.expenses.map((e) => ({ name: catLabel(e.category), amount: e.amount }))} xKey="name" yKey="amount" name={t("common.amount")} color="oklch(0.58 0.2 27)" /></CardContent></Card> : null}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="sales">
          <div className="mb-3 flex items-center gap-2 text-sm"><span className="text-muted-foreground">{t("analytics.groupBy")}</span><Select value={groupBy} onValueChange={setGroupBy}><SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger><SelectContent>{["day", "hour", "cashier", "category", "store"].map((g) => <SelectItem key={g} value={g}>{t(`analytics.groups.${g}`)}</SelectItem>)}</SelectContent></Select></div>
          {sales.isLoading ? <Skeleton className="h-96" /> : sales.data ? (
            <div className="space-y-4">
              <Card><CardContent className="pt-5">{sales.data.rows.length ? <SimpleBarChart data={sales.data.rows} xKey="label" yKey="revenue" name={t("dashboard.revenue")} /> : <EmptyState title={t("dashboard.noSales")} />}</CardContent></Card>
              <DataTable dense columns={[
                { key: "label", header: t(`analytics.groups.${groupBy}`), cell: (r) => <span className="font-medium">{r.label}</span> },
                { key: "count", header: t("dashboard.transactions"), cell: (r) => r.count || "—", align: "end" },
                { key: "units", header: t("common.quantity"), cell: (r) => r.units, align: "end", hideOnMobile: true },
                { key: "revenue", header: t("dashboard.revenue"), cell: (r) => <Money value={r.revenue} />, align: "end" },
                { key: "profit", header: t("dashboard.grossProfit"), cell: (r) => <Money value={r.profit} className="text-success" />, align: "end" },
              ] as Column<SalesReport["rows"][number]>[]} rows={sales.data.rows} rowKey={(r) => r.key} emptyTitle={t("dashboard.noSales")} footer={<tr><td className="px-3 py-2">{t("common.total")}</td><td className="px-3 py-2 text-end">{sales.data.totals.count}</td><td className="hidden md:table-cell" /><td className="px-3 py-2 text-end"><Money value={sales.data.totals.revenue} /></td><td className="px-3 py-2 text-end"><Money value={sales.data.totals.profit} /></td></tr>} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="inventory">
          {inv.isLoading ? <Skeleton className="h-96" /> : inv.data ? (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                {[[t("inventory.totalUnits"), formatNumber(inv.data.totalUnits)], [t("inventory.costValue"), <Money key="c" value={inv.data.costValue} />], [t("inventory.retailValue"), <Money key="r" value={inv.data.retailValue} />], [t("analytics.potentialProfit"), <Money key="p" value={inv.data.potentialProfit} />], [t("analytics.cogs"), <Money key="g" value={inv.data.cogsInPeriod} />], [t("analytics.turnover"), inv.data.annualisedTurnover != null ? `${formatNumber(inv.data.annualisedTurnover, { maximumFractionDigits: 2 })}×` : "—"], [t("dashboard.lowStock"), formatNumber(inv.data.lowStock)], [t("dashboard.outOfStock"), formatNumber(inv.data.outOfStock)]].map(([l, v], i) => <Card key={i}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold mt-1">{v}</p></CardContent></Card>)}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3.5 w-3.5" />{t("analytics.turnoverHint")}</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <DataTable dense columns={[{ key: "name", header: t("analytics.byCategory"), cell: (r) => r.name }, { key: "products", header: t("nav.products"), cell: (r) => r.products, align: "end" }, { key: "units", header: t("common.quantity"), cell: (r) => r.units, align: "end" }, { key: "cost", header: t("inventory.costValue"), cell: (r) => <Money value={r.costValue} />, align: "end" }, { key: "retail", header: t("inventory.retailValue"), cell: (r) => <Money value={r.retailValue} />, align: "end", hideOnMobile: true }] as Column<InventoryReport["byCategory"][number]>[]} rows={inv.data.byCategory} rowKey={(r) => r.name} emptyTitle={t("common.noResults")} />
                <DataTable dense columns={[{ key: "type", header: t("inventory.movements"), cell: (r) => <Badge variant="secondary">{t(`inventory.types.${r.type}`)}</Badge> }, { key: "count", header: t("analytics.count"), cell: (r) => r.count, align: "end" }, { key: "units", header: t("common.quantity"), cell: (r) => <span className={r.units >= 0 ? "text-success" : "text-destructive"}>{r.units > 0 ? "+" : ""}{r.units}</span>, align: "end" }] as Column<InventoryReport["movements"][number]>[]} rows={inv.data.movements} rowKey={(r) => r.type} emptyTitle={t("inventory.noMovements")} />
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="customers">
          {cust.isLoading ? <Skeleton className="h-96" /> : cust.data ? (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("analytics.newCustomers")}</p><p className="text-xl font-bold mt-1">{cust.data.newCustomers}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("analytics.anonymous")}</p><p className="text-xl font-bold mt-1">{cust.data.anonymous.count} · <Money value={cust.data.anonymous.revenue} /></p></CardContent></Card>
              </div>
              <DataTable dense columns={[{ key: "name", header: t("analytics.topCustomers"), cell: (r) => <div><p className="font-medium">{r.customer.name}</p><p className="text-xs text-muted-foreground" dir="ltr">{r.customer.phone}</p></div> }, { key: "orders", header: t("customers.orders"), cell: (r) => r.orders, align: "end" }, { key: "rev", header: t("dashboard.revenue"), cell: (r) => <Money value={r.revenue} />, align: "end" }, { key: "profit", header: t("dashboard.grossProfit"), cell: (r) => <Money value={r.profit} className="text-success" />, align: "end", hideOnMobile: true }, { key: "loy", header: t("customers.loyalty"), cell: (r) => r.customer.loyaltyPoints, align: "end", hideOnMobile: true }] as Column<CustomerReport["top"][number]>[]} rows={cust.data.top} rowKey={(r) => r.customer.id ?? "x"} emptyTitle={t("customers.noCustomers")} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="suppliers">
          {sup.isLoading ? <Skeleton className="h-96" /> : sup.data ? (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-2"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("suppliers.totalPurchases")}</p><p className="text-xl font-bold mt-1"><Money value={sup.data.totalPurchases} /></p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("suppliers.balance")}</p><p className="text-xl font-bold mt-1"><Money value={sup.data.totalOutstanding} /></p></CardContent></Card></div>
              <DataTable dense columns={[{ key: "name", header: t("purchases.supplier"), cell: (r) => <span className="font-medium">{r.name}</span> }, { key: "orders", header: t("suppliers.orderCount"), cell: (r) => `${r.orders} (${r.received} ✓${r.cancelled ? ` / ${r.cancelled} ✕` : ""})`, align: "end" }, { key: "total", header: t("suppliers.totalPurchases"), cell: (r) => <Money value={r.total} />, align: "end" }, { key: "delivery", header: t("suppliers.avgDelivery"), cell: (r) => r.averageDeliveryDays != null ? formatNumber(r.averageDeliveryDays, { maximumFractionDigits: 1 }) : "—", align: "end", hideOnMobile: true }, { key: "ontime", header: t("suppliers.onTime"), cell: (r) => <Pct value={r.onTimeRate == null ? null : r.onTimeRate} className="!text-foreground" />, align: "end", hideOnMobile: true }, { key: "bal", header: t("suppliers.balance"), cell: (r) => <Money value={r.balance} className={r.balance > 0.009 ? "text-destructive" : ""} />, align: "end" }] as Column<SupplierReport["suppliers"][number]>[]} rows={sup.data.suppliers} rowKey={(r) => r.id} emptyTitle={t("suppliers.noSuppliers")} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="payments">
          {pay.isLoading ? <Skeleton className="h-96" /> : pay.data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>{t("analytics.payments")}</CardTitle><CardDescription><Money value={pay.data.total} /></CardDescription></CardHeader><CardContent>{pay.data.methods.length ? <PaymentMethodsChart data={pay.data.methods} /> : <EmptyState title={t("dashboard.noSales")} />}</CardContent></Card>
              <DataTable dense columns={[{ key: "m", header: t("pos.paymentMethod"), cell: (r) => t(`pos.methods.${r.method}`) }, { key: "c", header: t("analytics.count"), cell: (r) => r.count, align: "end" }, { key: "a", header: t("common.amount"), cell: (r) => <Money value={r.amount} />, align: "end" }, { key: "s", header: t("analytics.share"), cell: (r) => `${formatNumber(r.share)}%`, align: "end" }] as Column<PaymentReport["methods"][number]>[]} rows={pay.data.methods} rowKey={(r) => r.method} emptyTitle={t("dashboard.noSales")} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="receivables">
          {recv.isLoading ? <Skeleton className="h-96" /> : recv.data ? (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-2"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("analytics.debtors")}</p><p className="text-xl font-bold mt-1">{formatNumber(recv.data.count)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("analytics.totalReceivables")}</p><p className="text-xl font-bold mt-1 text-amber-700 dark:text-amber-300"><Money value={recv.data.total} /></p></CardContent></Card></div>
              <DataTable dense columns={[{ key: "name", header: t("common.name"), cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground" dir="ltr">{r.phone}</p></div> }, { key: "limit", header: t("customers.creditLimit"), cell: (r) => (r.creditLimit == null ? "—" : <Money value={r.creditLimit} />), align: "end", hideOnMobile: true }, { key: "bal", header: t("customers.balance"), cell: (r) => <Money value={r.outstandingBalance} className="font-medium text-amber-700 dark:text-amber-300" />, align: "end" }] as Column<Receivables["debtors"][number]>[]} rows={recv.data.debtors} rowKey={(r) => r.id} emptyTitle={t("customers.noCustomers")} onRowClick={(r) => router.push(`/customers/${r.id}`)} />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </RequirePermission>
  )
}
