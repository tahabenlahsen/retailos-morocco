import { z } from "zod"
import { NextResponse } from "next/server"
import { withTenant, parseQuery } from "@/lib/api"
import { notFound } from "@/lib/errors"
import { dateRangeQuerySchema } from "@/utils/validation"
import { resolveDateRange } from "@/utils/dates"
import { COOKIE_KEY, DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config"
import { exportService, EXPORT_REPORTS, type ExportReport } from "@/services/export.service"

type P = { report: string }

const schema = dateRangeQuerySchema.extend({
  format: z.enum(["pdf", "csv"]).default("pdf"),
  groupBy: z.enum(["day", "hour", "cashier", "category", "store"]).default("day"),
})

/**
 * GET /api/exports/{pnl|sales|inventory|customers|top-products|payments|receivables}?format=pdf|csv&preset=…&storeId=…
 * Streams a downloadable PDF or CSV in the user's UI language (retailos_locale cookie).
 */
export const GET = withTenant<P>(
  async (req, ctx, { report }) => {
    if (!(EXPORT_REPORTS as readonly string[]).includes(report)) throw notFound("Report")
    const q = parseQuery(req, schema)
    const range = resolveDateRange(q.preset, q.from, q.to)
    const cookieLocale = req.cookies.get(COOKIE_KEY)?.value
    const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
    if (q.format === "csv") {
      const { csv, filename } = await exportService.reportCsv(ctx, report as ExportReport, range, locale, q.storeId, q.groupBy)
      return new NextResponse(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" } })
    }
    const { buffer, filename } = await exportService.reportPdf(ctx, report as ExportReport, range, locale, q.storeId, q.groupBy)
    return new NextResponse(new Uint8Array(buffer), { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"`, "content-length": String(buffer.length), "cache-control": "no-store" } })
  },
  { permission: "analytics.view", rateLimit: 30 }
)
