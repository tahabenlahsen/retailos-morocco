import { NextResponse } from "next/server"
import { withTenant } from "@/lib/api"
import { COOKIE_KEY, DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config"
import { exportService } from "@/services/export.service"

type P = { id: string }

/** GET /api/sales/{id}/receipt → 80 mm receipt PDF (inline, printable). */
export const GET = withTenant<P>(
  async (req, ctx, { id }) => {
    const cookieLocale = req.cookies.get(COOKIE_KEY)?.value
    const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
    const { buffer, filename } = await exportService.receiptPdf(ctx, id, locale)
    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"
    return new NextResponse(new Uint8Array(buffer), { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `${disposition}; filename="${filename}"`, "content-length": String(buffer.length), "cache-control": "no-store" } })
  },
  { permission: "sale.view", rateLimit: 60 }
)
