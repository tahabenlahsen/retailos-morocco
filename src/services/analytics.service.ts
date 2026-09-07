import { prisma } from "@/lib/prisma"
import { forbidden } from "@/lib/errors"
import type { TenantContext } from "@/lib/api"
import { type DateRange, previousRange, dayKey, daysInRange } from "@/utils/dates"
import { round2, percent } from "@/utils/money"

/**
 * Accounting definitions used throughout (all amounts in MAD):
 *  Revenue (TTC)      = sum(sale.total) for COMPLETED / PARTIALLY_REFUNDED sales − refunds in period
 *  Net revenue (HT)   = sum(sale.subtotal)  (tax-exclusive)
 *  COGS               = sum(saleItem.quantity × unit cost at time of sale)  (= subtotal − profit per line)
 *  Gross profit       = Net revenue (HT) − COGS
 *  Expenses           = sum(expense.amount) in period
 *  Net profit         = Gross profit − Expenses
 *  Gross margin %     = Gross profit / Net revenue
 *  Net margin %       = Net profit / Net revenue
 *  AOV                = Revenue / number of sales
 *  Inventory turnover = COGS / average inventory cost value  (period-normalised)
 */

function scope(ctx: TenantContext, storeId?: string) {
  if (storeId && !ctx.storeIds.includes(storeId)) throw forbidden("You do not have access to this store")
  return storeId ? [storeId] : ctx.storeIds
}

const SALE_OK = ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"]

async function salesFigures(businessId: string, storeIds: string[], range: DateRange) {
  const [sales, refunds] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, storeId: { in: storeIds }, status: { in: SALE_OK }, createdAt: { gte: range.from, lte: range.to } },
      select: { id: true, total: true, subtotal: true, taxAmount: true, profit: true, discountAmount: true, createdAt: true, customerId: true },
    }),
    prisma.refund.findMany({
      where: { businessId, storeId: { in: storeIds }, status: "COMPLETED", createdAt: { gte: range.from, lte: range.to } },
      select: { amount: true, items: true, createdAt: true },
    }),
  ])
  const grossRevenue = round2(sales.reduce((a, s) => a + s.total, 0))
  const refundTotal = round2(refunds.reduce((a, r) => a + r.amount, 0))
  const revenue = round2(grossRevenue - refundTotal)
  const netRevenueHT = round2(sales.reduce((a, s) => a + s.subtotal, 0))
  const grossProfitRaw = round2(sales.reduce((a, s) => a + (s.profit ?? 0), 0))
  // Refunded portions reduce profit proportionally (approximation: refund amount HT × margin ratio)
  const marginRatio = netRevenueHT > 0 ? grossProfitRaw / netRevenueHT : 0
  const refundHT = sales.length ? round2(refundTotal / (1 + (sales[0] ? sales[0].taxAmount / Math.max(sales[0].subtotal, 0.01) : 0.2))) : refundTotal
  const grossProfit = round2(grossProfitRaw - refundHT * marginRatio)
  const cogs = round2(netRevenueHT - refundHT - grossProfit)
  const tax = round2(sales.reduce((a, s) => a + s.taxAmount, 0))
  return { sales, refunds, grossRevenue, refundTotal, revenue, netRevenueHT: round2(netRevenueHT - refundHT), grossProfit, cogs, tax, count: sales.length, discounts: round2(sales.reduce((a, s) => a + s.discountAmount, 0)) }
}

async function expensesTotal(businessId: string, storeIds: string[], range: DateRange) {
  const agg = await prisma.expense.aggregate({ where: { businessId, storeId: { in: storeIds }, deletedAt: null, date: { gte: range.from, lte: range.to } }, _sum: { amount: true } })
  return round2(agg._sum.amount ?? 0)
}

export const analyticsService = {
  async dashboard(ctx: TenantContext, range: DateRange, storeId?: string) {
    const storeIds = scope(ctx, storeId)
    const prev = previousRange(range)
    const [cur, before, expenses, prevExpenses, inventory, lowStock, payments, recent, top] = await Promise.all([
      salesFigures(ctx.businessId, storeIds, range),
      salesFigures(ctx.businessId, storeIds, prev),
      expensesTotal(ctx.businessId, storeIds, range),
      expensesTotal(ctx.businessId, storeIds, prev),
      prisma.product.findMany({ where: { businessId: ctx.businessId, storeId: { in: storeIds }, deletedAt: null, isActive: true }, select: { stockQuantity: true, purchasePrice: true, costPrice: true, sellingPrice: true, minimumStock: true } }),
      prisma.product.findMany({ where: { businessId: ctx.businessId, storeId: { in: storeIds }, deletedAt: null, isActive: true }, select: { id: true, name: true, sku: true, stockQuantity: true, minimumStock: true, unit: true } }),
      prisma.payment.groupBy({ by: ["method"], where: { businessId: ctx.businessId, storeId: { in: storeIds }, status: "PAID", createdAt: { gte: range.from, lte: range.to }, sale: { status: { in: SALE_OK } } }, _sum: { amount: true }, _count: true }),
      prisma.sale.findMany({ where: { businessId: ctx.businessId, storeId: { in: storeIds }, createdAt: { gte: range.from, lte: range.to } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, saleNumber: true, total: true, status: true, createdAt: true, customer: { select: { name: true } }, payments: { select: { method: true } }, _count: { select: { items: true } } } }),
      this.topProducts(ctx, range, storeId, 8),
    ])

    const netProfit = round2(cur.grossProfit - expenses)
    const prevNet = round2(before.grossProfit - prevExpenses)
    const inventoryValue = round2(inventory.reduce((a, p) => a + p.stockQuantity * (p.costPrice ?? p.purchasePrice), 0))
    const inventoryRetail = round2(inventory.reduce((a, p) => a + p.stockQuantity * p.sellingPrice, 0))

    // Daily trend
    const buckets = new Map<string, { date: string; revenue: number; profit: number; count: number; expenses: number }>()
    const days = daysInRange(range)
    for (let i = 0; i < days; i++) {
      const d = new Date(range.from)
      d.setDate(d.getDate() + i)
      buckets.set(dayKey(d), { date: dayKey(d), revenue: 0, profit: 0, count: 0, expenses: 0 })
    }
    for (const s of cur.sales) {
      const b = buckets.get(dayKey(s.createdAt))
      if (b) {
        b.revenue = round2(b.revenue + s.total)
        b.profit = round2(b.profit + (s.profit ?? 0))
        b.count++
      }
    }
    for (const r of cur.refunds) {
      const b = buckets.get(dayKey(r.createdAt))
      if (b) b.revenue = round2(b.revenue - r.amount)
    }
    const dailyExpenses = await prisma.expense.findMany({ where: { businessId: ctx.businessId, storeId: { in: storeIds }, deletedAt: null, date: { gte: range.from, lte: range.to } }, select: { amount: true, date: true } })
    for (const e of dailyExpenses) {
      const b = buckets.get(dayKey(e.date))
      if (b) b.expenses = round2(b.expenses + e.amount)
    }

    const change = (now: number, prevVal: number) => (prevVal === 0 ? (now === 0 ? 0 : null) : round2(((now - prevVal) / Math.abs(prevVal)) * 100))

    return {
      range,
      kpis: {
        revenue: { value: cur.revenue, change: change(cur.revenue, before.revenue) },
        grossProfit: { value: cur.grossProfit, change: change(cur.grossProfit, before.grossProfit) },
        netProfit: { value: netProfit, change: change(netProfit, prevNet) },
        transactions: { value: cur.count, change: change(cur.count, before.count) },
        averageOrderValue: { value: cur.count ? round2(cur.revenue / cur.count) : 0, change: change(cur.count ? cur.revenue / cur.count : 0, before.count ? before.revenue / before.count : 0) },
        expenses: { value: expenses, change: change(expenses, prevExpenses) },
        cogs: cur.cogs,
        tax: cur.tax,
        refunds: cur.refundTotal,
        discounts: cur.discounts,
        grossMargin: percent(cur.grossProfit, cur.netRevenueHT),
        netMargin: percent(netProfit, cur.netRevenueHT),
        inventoryValue,
        inventoryRetailValue: inventoryRetail,
        lowStockCount: lowStock.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.minimumStock).length,
        outOfStockCount: lowStock.filter((p) => p.stockQuantity <= 0).length,
      },
      trend: [...buckets.values()],
      paymentMethods: payments.map((p) => ({ method: p.method, amount: round2(p._sum.amount ?? 0), count: p._count })),
      topProducts: top,
      lowStock: lowStock.filter((p) => p.stockQuantity <= p.minimumStock).sort((a, b) => a.stockQuantity - b.stockQuantity).slice(0, 10),
      recentSales: recent,
    }
  },

  async topProducts(ctx: TenantContext, range: DateRange, storeId?: string, limit = 10) {
    const storeIds = scope(ctx, storeId)
    const rows = await prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { businessId: ctx.businessId, storeId: { in: storeIds }, status: { in: SALE_OK }, createdAt: { gte: range.from, lte: range.to } } },
      _sum: { quantity: true, total: true, profit: true },
      orderBy: { _sum: { total: "desc" } },
      take: limit,
    })
    const products = await prisma.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true, sku: true, unit: true, stockQuantity: true } })
    const map = new Map(products.map((p) => [p.id, p]))
    return rows.map((r) => ({ product: map.get(r.productId) ?? { id: r.productId, name: "(deleted)", sku: "", unit: "", stockQuantity: 0 }, quantity: r._sum.quantity ?? 0, revenue: round2(r._sum.total ?? 0), profit: round2(r._sum.profit ?? 0) }))
  },

  async profitAndLoss(ctx: TenantContext, range: DateRange, storeId?: string) {
    const storeIds = scope(ctx, storeId)
    const [fig, expensesByCat] = await Promise.all([
      salesFigures(ctx.businessId, storeIds, range),
      prisma.expense.groupBy({ by: ["categoryId"], where: { businessId: ctx.businessId, storeId: { in: storeIds }, deletedAt: null, date: { gte: range.from, lte: range.to } }, _sum: { amount: true } }),
    ])
    const cats = await prisma.expenseCategory.findMany({ where: { id: { in: expensesByCat.map((e) => e.categoryId) } }, select: { id: true, name: true, code: true } })
    const catMap = new Map(cats.map((c) => [c.id, c]))
    const expenses = expensesByCat.map((e) => ({ category: catMap.get(e.categoryId) ?? { id: e.categoryId, name: "?", code: null }, amount: round2(e._sum.amount ?? 0) })).sort((a, b) => b.amount - a.amount)
    const totalExpenses = round2(expenses.reduce((a, e) => a + e.amount, 0))
    const netProfit = round2(fig.grossProfit - totalExpenses)
    return {
      range,
      revenue: fig.revenue,
      refunds: fig.refundTotal,
      tax: fig.tax,
      netRevenueHT: fig.netRevenueHT,
      cogs: fig.cogs,
      grossProfit: fig.grossProfit,
      grossMargin: percent(fig.grossProfit, fig.netRevenueHT),
      expenses,
      totalExpenses,
      netProfit,
      netMargin: percent(netProfit, fig.netRevenueHT),
      transactions: fig.count,
      averageOrderValue: fig.count ? round2(fig.revenue / fig.count) : 0,
    }
  },

  async inventoryReport(ctx: TenantContext, range: DateRange, storeId?: string) {
    const storeIds = scope(ctx, storeId)
    const [products, fig, movements] = await Promise.all([
      prisma.product.findMany({ where: { businessId: ctx.businessId, storeId: { in: storeIds }, deletedAt: null }, include: { category: { select: { name: true } } } }),
      salesFigures(ctx.businessId, storeIds, range),
      prisma.inventoryMovement.groupBy({ by: ["type"], where: { businessId: ctx.businessId, storeId: { in: storeIds }, createdAt: { gte: range.from, lte: range.to } }, _sum: { quantity: true }, _count: true }),
    ])
    const costValue = round2(products.reduce((a, p) => a + p.stockQuantity * (p.costPrice ?? p.purchasePrice), 0))
    const days = daysInRange(range)
    // Annualised turnover = (COGS / avg inventory) × (365 / days). We only have the ending inventory value; documented approximation.
    const turnover = costValue > 0 ? round2((fig.cogs / costValue) * (365 / days)) : null
    const byCategory = new Map<string, { name: string; products: number; units: number; costValue: number; retailValue: number }>()
    for (const p of products) {
      const c = byCategory.get(p.category.name) ?? { name: p.category.name, products: 0, units: 0, costValue: 0, retailValue: 0 }
      c.products++
      c.units += p.stockQuantity
      c.costValue = round2(c.costValue + p.stockQuantity * (p.costPrice ?? p.purchasePrice))
      c.retailValue = round2(c.retailValue + p.stockQuantity * p.sellingPrice)
      byCategory.set(p.category.name, c)
    }
    return {
      range,
      productCount: products.length,
      totalUnits: products.reduce((a, p) => a + p.stockQuantity, 0),
      costValue,
      retailValue: round2(products.reduce((a, p) => a + p.stockQuantity * p.sellingPrice, 0)),
      potentialProfit: round2(products.reduce((a, p) => a + p.stockQuantity * (p.sellingPrice / (1 + p.taxRate) - (p.costPrice ?? p.purchasePrice)), 0)),
      cogsInPeriod: fig.cogs,
      annualisedTurnover: turnover,
      lowStock: products.filter((p) => p.isActive && p.stockQuantity > 0 && p.stockQuantity <= p.minimumStock).length,
      outOfStock: products.filter((p) => p.isActive && p.stockQuantity <= 0).length,
      movements: movements.map((m) => ({ type: m.type, units: m._sum.quantity ?? 0, count: m._count })),
      byCategory: [...byCategory.values()].sort((a, b) => b.costValue - a.costValue),
    }
  },

  async salesReport(ctx: TenantContext, range: DateRange, storeId?: string, groupBy: "day" | "hour" | "cashier" | "category" | "store" = "day") {
    const storeIds = scope(ctx, storeId)
    const sales = await prisma.sale.findMany({
      where: { businessId: ctx.businessId, storeId: { in: storeIds }, status: { in: SALE_OK }, createdAt: { gte: range.from, lte: range.to } },
      select: { total: true, profit: true, createdAt: true, userId: true, storeId: true, items: { select: { total: true, profit: true, quantity: true, product: { select: { categoryId: true, category: { select: { name: true } } } } } } },
    })
    const groups = new Map<string, { key: string; label: string; revenue: number; profit: number; count: number; units: number }>()
    const add = (key: string, label: string, revenue: number, profit: number, count: number, units: number) => {
      const g = groups.get(key) ?? { key, label, revenue: 0, profit: 0, count: 0, units: 0 }
      g.revenue = round2(g.revenue + revenue)
      g.profit = round2(g.profit + profit)
      g.count += count
      g.units += units
      groups.set(key, g)
    }
    if (groupBy === "category") {
      for (const s of sales) for (const it of s.items) add(it.product.categoryId, it.product.category.name, it.total, it.profit ?? 0, 0, it.quantity)
    } else {
      const userIds = [...new Set(sales.map((s) => s.userId))]
      const users = groupBy === "cashier" ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : []
      const stores = groupBy === "store" ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : []
      for (const s of sales) {
        const units = s.items.reduce((a, i) => a + i.quantity, 0)
        if (groupBy === "day") add(dayKey(s.createdAt), dayKey(s.createdAt), s.total, s.profit ?? 0, 1, units)
        else if (groupBy === "hour") add(String(s.createdAt.getHours()).padStart(2, "0"), `${String(s.createdAt.getHours()).padStart(2, "0")}:00`, s.total, s.profit ?? 0, 1, units)
        else if (groupBy === "cashier") {
          const u = users.find((x) => x.id === s.userId)
          add(s.userId, u ? `${u.firstName} ${u.lastName}` : "?", s.total, s.profit ?? 0, 1, units)
        } else add(s.storeId, stores.find((x) => x.id === s.storeId)?.name ?? "?", s.total, s.profit ?? 0, 1, units)
      }
    }
    const rows = [...groups.values()].sort((a, b) => (groupBy === "day" || groupBy === "hour" ? a.key.localeCompare(b.key) : b.revenue - a.revenue))
    return { range, groupBy, rows, totals: { revenue: round2(rows.reduce((a, r) => a + r.revenue, 0)), profit: round2(rows.reduce((a, r) => a + r.profit, 0)), count: sales.length } }
  },

  async customerReport(ctx: TenantContext, range: DateRange, storeId?: string) {
    const storeIds = scope(ctx, storeId)
    const rows = await prisma.sale.groupBy({ by: ["customerId"], where: { businessId: ctx.businessId, storeId: { in: storeIds }, status: { in: SALE_OK }, createdAt: { gte: range.from, lte: range.to } }, _sum: { total: true, profit: true }, _count: true, orderBy: { _sum: { total: "desc" } }, take: 50 })
    const ids = rows.map((r) => r.customerId).filter(Boolean) as string[]
    const customers = await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true, loyaltyPoints: true } })
    const map = new Map(customers.map((c) => [c.id, c]))
    const anon = rows.find((r) => !r.customerId)
    return {
      range,
      anonymous: anon ? { count: anon._count, revenue: round2(anon._sum.total ?? 0) } : { count: 0, revenue: 0 },
      top: rows.filter((r) => r.customerId).map((r) => ({ customer: map.get(r.customerId!) ?? { id: r.customerId, name: "?", phone: null, loyaltyPoints: 0 }, orders: r._count, revenue: round2(r._sum.total ?? 0), profit: round2(r._sum.profit ?? 0) })),
      newCustomers: await prisma.customer.count({ where: { businessId: ctx.businessId, deletedAt: null, createdAt: { gte: range.from, lte: range.to } } }),
    }
  },

  async supplierReport(ctx: TenantContext, range: DateRange, storeId?: string) {
    const storeIds = scope(ctx, storeId)
    const pos = await prisma.purchaseOrder.findMany({ where: { businessId: ctx.businessId, storeId: { in: storeIds }, deletedAt: null, createdAt: { gte: range.from, lte: range.to } }, select: { supplierId: true, total: true, status: true, createdAt: true, deliveredAt: true, expectedDelivery: true, supplier: { select: { name: true, currentBalance: true } } } })
    const map = new Map<string, { id: string; name: string; orders: number; received: number; cancelled: number; total: number; balance: number; deliveryDays: number[]; onTime: number }>()
    for (const p of pos) {
      const s = map.get(p.supplierId) ?? { id: p.supplierId, name: p.supplier.name, orders: 0, received: 0, cancelled: 0, total: 0, balance: p.supplier.currentBalance, deliveryDays: [], onTime: 0 }
      s.orders++
      if (p.status === "CANCELLED") s.cancelled++
      else s.total = round2(s.total + p.total)
      if (p.status === "RECEIVED" && p.deliveredAt) {
        s.received++
        s.deliveryDays.push((p.deliveredAt.getTime() - p.createdAt.getTime()) / 86_400_000)
        if (!p.expectedDelivery || p.deliveredAt <= p.expectedDelivery) s.onTime++
      }
      map.set(p.supplierId, s)
    }
    return {
      range,
      suppliers: [...map.values()].map(({ deliveryDays, onTime, ...s }) => ({ ...s, averageDeliveryDays: deliveryDays.length ? round2(deliveryDays.reduce((a, b) => a + b, 0) / deliveryDays.length) : null, onTimeRate: s.received ? round2((onTime / s.received) * 100) : null })).sort((a, b) => b.total - a.total),
      totalPurchases: round2(pos.filter((p) => p.status !== "CANCELLED").reduce((a, p) => a + p.total, 0)),
      totalOutstanding: round2([...new Set(pos.map((p) => p.supplierId))].reduce((a, id) => a + (map.get(id)?.balance ?? 0), 0)),
    }
  },

  async paymentMethodReport(ctx: TenantContext, range: DateRange, storeId?: string) {
    const storeIds = scope(ctx, storeId)
    // PENDING = credit lines not yet repaid; they are still how the sale was paid for (excluded: REFUNDED from cancelled sales)
    const rows = await prisma.payment.groupBy({ by: ["method"], where: { businessId: ctx.businessId, storeId: { in: storeIds }, status: { in: ["PAID", "PENDING"] }, createdAt: { gte: range.from, lte: range.to }, sale: { status: { in: SALE_OK } } }, _sum: { amount: true }, _count: true })
    const total = round2(rows.reduce((a, r) => a + (r._sum.amount ?? 0), 0))
    return { range, total, methods: rows.map((r) => ({ method: r.method, amount: round2(r._sum.amount ?? 0), count: r._count, share: percent(r._sum.amount ?? 0, total) })).sort((a, b) => b.amount - a.amount) }
  },

  /**
   * Reorder recommendations. Estimates only — based on the trailing sales velocity.
   *  avgDaily         = units sold in lookback / lookback days
   *  daysRemaining    = stock / avgDaily
   *  suggestedQty     = max(0, avgDaily × coverDays + minimumStock − stock)   (default coverDays = 14)
   */
  async reorderRecommendations(ctx: TenantContext, storeId?: string, lookbackDays = 30, coverDays = 14) {
    const storeIds = scope(ctx, storeId)
    const from = new Date()
    from.setDate(from.getDate() - lookbackDays)
    const [products, sold] = await Promise.all([
      prisma.product.findMany({ where: { businessId: ctx.businessId, storeId: { in: storeIds }, deletedAt: null, isActive: true }, select: { id: true, name: true, sku: true, unit: true, stockQuantity: true, minimumStock: true, maximumStock: true, purchasePrice: true, supplier: { select: { id: true, name: true } }, store: { select: { id: true, name: true } } } }),
      prisma.saleItem.groupBy({ by: ["productId"], where: { sale: { businessId: ctx.businessId, storeId: { in: storeIds }, status: { in: SALE_OK }, createdAt: { gte: from } } }, _sum: { quantity: true } }),
    ])
    const soldMap = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]))
    const recs = products.map((p) => {
      const units = soldMap.get(p.id) ?? 0
      const avgDaily = round2(units / lookbackDays)
      const daysRemaining = avgDaily > 0 ? round2(p.stockQuantity / avgDaily) : null
      let suggested = Math.max(0, Math.ceil(avgDaily * coverDays + p.minimumStock - p.stockQuantity))
      if (p.maximumStock != null) suggested = Math.min(suggested, Math.max(0, p.maximumStock - p.stockQuantity))
      const urgency: "OUT" | "CRITICAL" | "LOW" | "OK" = p.stockQuantity <= 0 ? "OUT" : daysRemaining != null && daysRemaining <= 3 ? "CRITICAL" : p.stockQuantity <= p.minimumStock ? "LOW" : "OK"
      return { product: { id: p.id, name: p.name, sku: p.sku, unit: p.unit, store: p.store, supplier: p.supplier }, stock: p.stockQuantity, minimumStock: p.minimumStock, soldInPeriod: units, avgDailySales: avgDaily, estimatedDaysRemaining: daysRemaining, suggestedOrderQty: suggested, estimatedCost: round2(suggested * p.purchasePrice), urgency }
    })
    const order = { OUT: 0, CRITICAL: 1, LOW: 2, OK: 3 }
    return { lookbackDays, coverDays, disclaimer: "Estimates based on recent sales velocity; not a guarantee of future demand.", items: recs.filter((r) => r.suggestedOrderQty > 0 || r.urgency !== "OK").sort((a, b) => order[a.urgency] - order[b.urgency] || (a.estimatedDaysRemaining ?? 1e9) - (b.estimatedDaysRemaining ?? 1e9)) }
  },
}
