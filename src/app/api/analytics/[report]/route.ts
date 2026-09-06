import { z } from "zod"
import { withTenant, parseQuery, ok } from "@/lib/api"
import { notFound } from "@/lib/errors"
import { dateRangeQuerySchema } from "@/utils/validation"
import { resolveDateRange } from "@/utils/dates"
import { analyticsService } from "@/services/analytics.service"

type P = { report: string }

const salesSchema = dateRangeQuerySchema.extend({ groupBy: z.enum(["day", "hour", "cashier", "category", "store"]).default("day") })

/**
 * /api/analytics/dashboard | pnl | sales | inventory | customers | suppliers | payments | top-products
 * Query: preset=today|yesterday|last7|last30|thisMonth|lastMonth|custom&from=&to=&storeId=
 */
export const GET = withTenant<P>(
  async (req, ctx, { report }) => {
    const q = parseQuery(req, report === "sales" ? salesSchema : dateRangeQuerySchema)
    const range = resolveDateRange(q.preset, q.from, q.to)
    switch (report) {
      case "dashboard":
        return ok(await analyticsService.dashboard(ctx, range, q.storeId))
      case "pnl":
        return ok(await analyticsService.profitAndLoss(ctx, range, q.storeId))
      case "sales":
        return ok(await analyticsService.salesReport(ctx, range, q.storeId, (q as z.infer<typeof salesSchema>).groupBy))
      case "inventory":
        return ok(await analyticsService.inventoryReport(ctx, range, q.storeId))
      case "customers":
        return ok(await analyticsService.customerReport(ctx, range, q.storeId))
      case "suppliers":
        return ok(await analyticsService.supplierReport(ctx, range, q.storeId))
      case "payments":
        return ok(await analyticsService.paymentMethodReport(ctx, range, q.storeId))
      case "top-products":
        return ok(await analyticsService.topProducts(ctx, range, q.storeId, 20))
      default:
        throw notFound("Report")
    }
  },
  { permission: "analytics.view", rateLimit: 120 }
)
