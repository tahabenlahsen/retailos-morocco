/**
 * PDF / CSV exports for accountants: receipts, P&L, sales, inventory, customers, top products,
 * payment methods and receivables. Data comes from the tenant-scoped analytics/sales services;
 * this module only formats it.
 */
import { prisma } from "@/lib/prisma"
import { notFound } from "@/lib/errors"
import type { TenantContext } from "@/lib/api"
import type { Locale } from "@/lib/i18n/config"
import { serverFormatters, serverT } from "@/lib/i18n/server"
import { ReceiptPdf, ReportPdf, toCsv } from "@/lib/pdf"
import type { DateRange } from "@/utils/dates"
import { analyticsService } from "./analytics.service"
import { salesService } from "./sales.service"
import { customerService } from "./customer.service"

export const EXPORT_REPORTS = ["pnl", "sales", "inventory", "customers", "top-products", "payments", "receivables"] as const
export type ExportReport = (typeof EXPORT_REPORTS)[number]

async function businessMeta(businessId: string) {
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true, address: true, city: true, phone: true } })
  return { name: b.name, address: [b.address, b.city].filter(Boolean).join(", "), phone: b.phone }
}

function rangeLabel(range: DateRange, locale: Locale) {
  const f = serverFormatters(locale)
  return `${f.date(range.from)} – ${f.date(range.to)}`
}

export const exportService = {
  /** 80 mm receipt PDF for a sale (same content as the on-screen receipt). */
  async receiptPdf(ctx: TenantContext, saleId: string, locale: Locale): Promise<{ buffer: Buffer; filename: string }> {
    const sale = await salesService.getById(ctx, saleId)
    const biz = await businessMeta(ctx.businessId)
    const t = serverT(locale)
    const f = serverFormatters(locale)
    const credit = sale.payments.filter((p) => p.method === "CREDIT").reduce((a, p) => a + p.amount, 0)
    const buffer = await ReceiptPdf.render((pdf) => {
      pdf.center(biz.name, 11, true)
      if (sale.store.address) pdf.center(sale.store.address, 7)
      if (sale.store.phone) pdf.center(sale.store.phone, 7)
      pdf.dashed()
      pdf.line(t("sales.number"), sale.saleNumber, { bold: true })
      pdf.line(t("common.date"), f.dateTime(sale.createdAt))
      if (sale.cashierName) pdf.line(t("pos.cashier"), sale.cashierName)
      if (sale.customer) pdf.line(t("pos.customer"), sale.customer.name)
      pdf.dashed()
      for (const it of sale.items) {
        pdf.line(it.product.name, f.money(it.total), { bold: true })
        pdf.text(`${it.quantity} × ${f.money(it.unitPrice)}${it.discount ? `  -${f.money(it.discount)}` : ""}`, 7)
      }
      pdf.dashed()
      pdf.line(t("common.subtotal"), f.money(sale.subtotal))
      pdf.line(t("common.tax"), f.money(sale.taxAmount))
      if (sale.discountAmount) pdf.line(t("common.discount"), `-${f.money(sale.discountAmount)}`)
      pdf.line(t("common.total"), f.money(sale.total), { bold: true, size: 10 })
      pdf.dashed()
      for (const p of sale.payments) pdf.line(`${t(`pos.methods.${p.method}`)}${p.reference ? ` (${p.reference})` : ""}`, f.money(p.amount))
      if (credit > 0) pdf.center(`${t("pos.creditDue")}: ${f.money(credit)}`, 9, true)
      if (sale.refunds?.length) {
        pdf.dashed()
        for (const r of sale.refunds) pdf.line(`${t("sales.refund")} ${r.refundNumber}`, `-${f.money(r.amount)}`)
      }
      if (sale.status === "CANCELLED") pdf.center(`*** ${t("sales.status.CANCELLED").toUpperCase()} ***`, 9, true)
      pdf.dashed()
      pdf.center(t("pos.thankYou"), 8)
    })
    return { buffer, filename: `${sale.saleNumber}.pdf` }
  },

  /** Accounting report as PDF. */
  async reportPdf(ctx: TenantContext, report: ExportReport, range: DateRange, locale: Locale, storeId?: string, groupBy: "day" | "hour" | "cashier" | "category" | "store" = "day"): Promise<{ buffer: Buffer; filename: string }> {
    const t = serverT(locale)
    const f = serverFormatters(locale)
    const biz = await businessMeta(ctx.businessId)
    const store = storeId ? await prisma.store.findFirst({ where: { id: storeId, businessId: ctx.businessId }, select: { name: true } }) : null
    const titleKey: Record<ExportReport, string> = { pnl: "analytics.pnl", sales: "analytics.salesReport", inventory: "analytics.inventoryReport", customers: "analytics.customerReport", "top-products": "analytics.topProducts", payments: "analytics.paymentMethods", receivables: "analytics.receivables" }
    const title = t(titleKey[report])
    const subtitle = [rangeLabel(range, locale), store?.name ?? t("common.allStores")].join(" · ")
    const pdf = new ReportPdf({ title, subtitle, business: biz, locale, generatedLabel: `${t("analytics.generatedAt")} ${f.dateTime(new Date())}`, pageLabel: t("analytics.page") })
    const stamp = `${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}`

    switch (report) {
      case "pnl": {
        const d = await analyticsService.profitAndLoss(ctx, range, storeId)
        pdf.section(t("analytics.revenueSection"))
        pdf.keyValues([
          { label: t("analytics.grossRevenue"), value: f.money(d.revenue) },
          { label: t("analytics.refunds"), value: `−${f.money(d.refunds)}`, indent: true },
          { label: t("analytics.taxCollected"), value: `−${f.money(d.tax)}`, indent: true },
          { label: t("analytics.netRevenueHT"), value: f.money(d.netRevenueHT), bold: true },
          { label: t("analytics.cogs"), value: `−${f.money(d.cogs)}` },
          { label: `${t("analytics.grossProfit")} (${f.pct(d.grossMargin)})`, value: f.money(d.grossProfit), bold: true },
        ])
        pdf.section(t("analytics.expensesSection"))
        pdf.table(
          [
            { header: t("expenses.category"), width: 3, cell: (e: (typeof d.expenses)[number]) => (e.category.code ? t(`expenses.codes.${e.category.code}`) : e.category.name) },
            { header: t("common.amount"), width: 1, align: "right", cell: (e) => f.money(e.amount) },
          ],
          d.expenses,
          { footer: [t("analytics.totalExpenses"), f.money(d.totalExpenses)] }
        )
        pdf.section(t("analytics.resultSection"))
        pdf.keyValues([
          { label: `${t("analytics.netProfit")} (${f.pct(d.netMargin)})`, value: f.money(d.netProfit), bold: true },
          { label: t("analytics.transactions"), value: f.num(d.transactions) },
          { label: t("analytics.averageOrder"), value: f.money(d.averageOrderValue) },
        ])
        pdf.paragraph(t("analytics.pnlNote"), { color: "#666", size: 8 })
        break
      }
      case "sales": {
        const d = await analyticsService.salesReport(ctx, range, storeId, groupBy)
        pdf.section(`${t("analytics.salesReport")} — ${t(`analytics.groups.${groupBy}`)}`)
        pdf.table(
          [
            { header: t(`analytics.groups.${groupBy}`), width: 3, cell: (r: (typeof d.rows)[number]) => r.label },
            { header: t("analytics.transactions"), width: 1, align: "right", cell: (r) => (r.count ? f.num(r.count) : "—") },
            { header: t("analytics.units"), width: 1, align: "right", cell: (r) => f.num(r.units) },
            { header: t("dashboard.revenue"), width: 1.5, align: "right", cell: (r) => f.money(r.revenue) },
            { header: t("dashboard.profit"), width: 1.5, align: "right", cell: (r) => f.money(r.profit) },
          ],
          d.rows,
          { footer: [t("common.total"), f.num(d.totals.count), null, f.money(d.totals.revenue), f.money(d.totals.profit)] }
        )
        break
      }
      case "inventory": {
        const d = await analyticsService.inventoryReport(ctx, range, storeId)
        pdf.section(t("analytics.stockValuation"))
        pdf.keyValues([
          { label: t("analytics.productCount"), value: f.num(d.productCount) },
          { label: t("analytics.totalUnits"), value: f.num(d.totalUnits) },
          { label: t("analytics.costValue"), value: f.money(d.costValue), bold: true },
          { label: t("analytics.retailValue"), value: f.money(d.retailValue) },
          { label: t("analytics.potentialProfit"), value: f.money(d.potentialProfit) },
          { label: t("analytics.cogsInPeriod"), value: f.money(d.cogsInPeriod) },
          { label: t("analytics.turnover"), value: d.annualisedTurnover == null ? "—" : `${f.num(d.annualisedTurnover)}×` },
          { label: t("dashboard.lowStock"), value: f.num(d.lowStock) },
          { label: t("dashboard.outOfStock"), value: f.num(d.outOfStock) },
        ])
        pdf.section(t("analytics.byCategory"))
        pdf.table(
          [
            { header: t("products.category"), width: 3, cell: (c: (typeof d.byCategory)[number]) => c.name },
            { header: t("products.title"), width: 1, align: "right", cell: (c) => f.num(c.products) },
            { header: t("analytics.units"), width: 1, align: "right", cell: (c) => f.num(c.units) },
            { header: t("analytics.costValue"), width: 1.5, align: "right", cell: (c) => f.money(c.costValue) },
            { header: t("analytics.retailValue"), width: 1.5, align: "right", cell: (c) => f.money(c.retailValue) },
          ],
          d.byCategory
        )
        pdf.section(t("inventory.movements"))
        pdf.table(
          [
            { header: t("common.type"), width: 3, cell: (m: (typeof d.movements)[number]) => t(`inventory.types.${m.type}`) },
            { header: t("analytics.count"), width: 1, align: "right", cell: (m) => f.num(m.count) },
            { header: t("analytics.units"), width: 1, align: "right", cell: (m) => f.num(m.units) },
          ],
          d.movements
        )
        break
      }
      case "customers": {
        const d = await analyticsService.customerReport(ctx, range, storeId)
        pdf.keyValues([
          { label: t("analytics.newCustomers"), value: f.num(d.newCustomers) },
          { label: t("analytics.anonymousSales"), value: `${f.num(d.anonymous.count)} · ${f.money(d.anonymous.revenue)}` },
        ])
        pdf.section(t("analytics.topCustomers"))
        pdf.table(
          [
            { header: t("common.name"), width: 3, cell: (r: (typeof d.top)[number]) => r.customer.name },
            { header: t("common.phone"), width: 1.5, cell: (r) => r.customer.phone ?? "" },
            { header: t("customers.orders"), width: 1, align: "right", cell: (r) => f.num(r.orders) },
            { header: t("dashboard.revenue"), width: 1.5, align: "right", cell: (r) => f.money(r.revenue) },
            { header: t("dashboard.profit"), width: 1.5, align: "right", cell: (r) => f.money(r.profit) },
          ],
          d.top
        )
        break
      }
      case "top-products": {
        const d = await analyticsService.topProducts(ctx, range, storeId, 50)
        pdf.table(
          [
            { header: t("inventory.product"), width: 3, cell: (r: (typeof d)[number]) => r.product.name },
            { header: "SKU", width: 1.2, cell: (r) => r.product.sku },
            { header: t("common.quantity"), width: 1, align: "right", cell: (r) => `${f.num(r.quantity)} ${r.product.unit}` },
            { header: t("dashboard.revenue"), width: 1.5, align: "right", cell: (r) => f.money(r.revenue) },
            { header: t("dashboard.profit"), width: 1.5, align: "right", cell: (r) => f.money(r.profit) },
          ],
          d
        )
        break
      }
      case "payments": {
        const d = await analyticsService.paymentMethodReport(ctx, range, storeId)
        pdf.table(
          [
            { header: t("pos.paymentMethod"), width: 3, cell: (r: (typeof d.methods)[number]) => t(`pos.methods.${r.method}`) },
            { header: t("analytics.count"), width: 1, align: "right", cell: (r) => f.num(r.count) },
            { header: t("common.amount"), width: 1.5, align: "right", cell: (r) => f.money(r.amount) },
            { header: "%", width: 1, align: "right", cell: (r) => f.pct(r.share) },
          ],
          d.methods,
          { footer: [t("common.total"), null, f.money(d.total), null] }
        )
        break
      }
      case "receivables": {
        const d = await customerService.receivables(ctx)
        pdf.keyValues([
          { label: t("analytics.debtors"), value: f.num(d.count) },
          { label: t("analytics.totalReceivables"), value: f.money(d.total), bold: true },
        ])
        pdf.table(
          [
            { header: t("common.name"), width: 3, cell: (r: (typeof d.debtors)[number]) => r.name },
            { header: t("common.phone"), width: 1.5, cell: (r) => r.phone ?? "" },
            { header: t("customers.creditLimit"), width: 1.5, align: "right", cell: (r) => (r.creditLimit == null ? "—" : f.money(r.creditLimit)) },
            { header: t("customers.balance"), width: 1.5, align: "right", cell: (r) => f.money(r.outstandingBalance) },
          ],
          d.debtors,
          { footer: [t("common.total"), null, null, f.money(d.total)] }
        )
        break
      }
      default:
        throw notFound("Report")
    }
    return { buffer: await pdf.finish(), filename: `${report}_${stamp}.pdf` }
  },

  /** Same reports as CSV (semicolon-separated, UTF-8 BOM for Excel). */
  async reportCsv(ctx: TenantContext, report: ExportReport, range: DateRange, locale: Locale, storeId?: string, groupBy: "day" | "hour" | "cashier" | "category" | "store" = "day"): Promise<{ csv: string; filename: string }> {
    const t = serverT(locale)
    const stamp = `${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}`
    let headers: string[] = []
    let rows: (string | number | null)[][] = []
    switch (report) {
      case "pnl": {
        const d = await analyticsService.profitAndLoss(ctx, range, storeId)
        headers = [t("common.type"), t("common.amount")]
        rows = [
          [t("analytics.grossRevenue"), d.revenue], [t("analytics.refunds"), -d.refunds], [t("analytics.taxCollected"), -d.tax], [t("analytics.netRevenueHT"), d.netRevenueHT], [t("analytics.cogs"), -d.cogs], [t("analytics.grossProfit"), d.grossProfit],
          ...d.expenses.map((e) => [`${t("expenses.title")}: ${e.category.code ? t(`expenses.codes.${e.category.code}`) : e.category.name}`, -e.amount] as (string | number)[]),
          [t("analytics.totalExpenses"), -d.totalExpenses], [t("analytics.netProfit"), d.netProfit], [t("analytics.transactions"), d.transactions], [t("analytics.averageOrder"), d.averageOrderValue],
        ]
        break
      }
      case "sales": {
        const d = await analyticsService.salesReport(ctx, range, storeId, groupBy)
        headers = [t(`analytics.groups.${groupBy}`), t("analytics.transactions"), t("analytics.units"), t("dashboard.revenue"), t("dashboard.profit")]
        rows = d.rows.map((r) => [r.label, r.count, r.units, r.revenue, r.profit])
        break
      }
      case "inventory": {
        const d = await analyticsService.inventoryReport(ctx, range, storeId)
        headers = [t("products.category"), t("products.title"), t("analytics.units"), t("analytics.costValue"), t("analytics.retailValue")]
        rows = d.byCategory.map((c) => [c.name, c.products, c.units, c.costValue, c.retailValue])
        break
      }
      case "customers": {
        const d = await analyticsService.customerReport(ctx, range, storeId)
        headers = [t("common.name"), t("common.phone"), t("customers.orders"), t("dashboard.revenue"), t("dashboard.profit")]
        rows = d.top.map((r) => [r.customer.name, r.customer.phone, r.orders, r.revenue, r.profit])
        break
      }
      case "top-products": {
        const d = await analyticsService.topProducts(ctx, range, storeId, 100)
        headers = [t("inventory.product"), "SKU", t("common.quantity"), t("common.unit"), t("dashboard.revenue"), t("dashboard.profit")]
        rows = d.map((r) => [r.product.name, r.product.sku, r.quantity, r.product.unit, r.revenue, r.profit])
        break
      }
      case "payments": {
        const d = await analyticsService.paymentMethodReport(ctx, range, storeId)
        headers = [t("pos.paymentMethod"), t("analytics.count"), t("common.amount"), "%"]
        rows = d.methods.map((r) => [t(`pos.methods.${r.method}`), r.count, r.amount, r.share])
        break
      }
      case "receivables": {
        const d = await customerService.receivables(ctx)
        headers = [t("common.name"), t("common.phone"), t("customers.creditLimit"), t("customers.balance")]
        rows = d.debtors.map((r) => [r.name, r.phone, r.creditLimit, r.outstandingBalance])
        break
      }
      default:
        throw notFound("Report")
    }
    return { csv: toCsv(headers, rows), filename: `${report}_${stamp}.csv` }
  },
}
