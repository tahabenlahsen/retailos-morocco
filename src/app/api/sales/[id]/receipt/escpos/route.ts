import { NextResponse } from "next/server"
import { withTenant } from "@/lib/api"
import { COOKIE_KEY, DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config"
import { serverFormatters } from "@/lib/i18n/server"
import { salesService } from "@/services/sales.service"
import { businessMeta } from "@/services/export.service"
import { escposReceipt } from "@/lib/escpos"

type P = { id: string }

/**
 * GET /api/sales/{id}/receipt/escpos → binary ESC/POS data for 80mm thermal printers.
 * Send the response body to a USB/serial/network thermal printer via WebUSB or a print server.
 */
export const GET = withTenant<P>(
  async (req, ctx, { id }) => {
    const cookieLocale = req.cookies.get(COOKIE_KEY)?.value
    const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
    const sale = await salesService.getById(ctx, id)
    const biz = await businessMeta(ctx.businessId)
    const f = serverFormatters(locale)
    const credit = sale.payments.filter((p) => p.method === "CREDIT").reduce((a, p) => a + (p.amount - (p.settledAmount ?? 0)), 0)
    const data = escposReceipt({
      businessName: biz.name,
      storeLines: [sale.store.name, sale.store.address ?? "", sale.store.phone ?? ""].filter(Boolean),
      saleNumber: sale.saleNumber,
      date: sale.createdAt.toISOString(),
      cashierName: sale.cashierName ?? null,
      customerName: sale.customer?.name ?? null,
      items: sale.items.map((it) => ({ name: it.product.name, qty: it.quantity, unitPrice: it.unitPrice, total: it.total })),
      subtotal: sale.subtotal,
      taxAmount: sale.taxAmount,
      discountAmount: sale.discountAmount,
      total: sale.total,
      payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference })),
      creditDue: credit > 0 ? credit : 0,
      footer: locale === "ar" ? "شكرا لزيارتكم" : locale === "fr" ? "Merci de votre visite" : "Thank you for your visit",
      stamp: sale.status === "QUEUED" ? "PROVISIONAL" : sale.status === "CANCELLED" ? "CANCELLED" : undefined,
      formatMoney: f.money,
      formatDate: f.dateTime,
    })
    return new NextResponse(Buffer.from(data), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${sale.saleNumber}.bin"`,
        "content-length": String(data.length),
        "cache-control": "no-store",
      },
    })
  },
  { permission: "sale.view", rateLimit: 60 }
)
