import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { notificationService } from "@/services/notification.service"

/**
 * Daily maintenance job. Trigger from an external scheduler (cron, Vercel Cron, etc.)
 * with `Authorization: Bearer $CRON_SECRET`.
 *  - Sales-decrease detection per business
 *  - Low/out-of-stock sweep (catches products whose minimum was raised without a movement)
 *  - Purge expired password reset tokens
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 })
  }
  const businesses = await prisma.business.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true } })
  let stockChecks = 0
  for (const b of businesses) {
    await notificationService.checkSalesDecrease(b.id)
    const products = await prisma.product.findMany({ where: { businessId: b.id, deletedAt: null, isActive: true }, select: { id: true, stockQuantity: true, minimumStock: true } })
    for (const p of products.filter((p) => p.stockQuantity <= p.minimumStock)) {
      await notificationService.checkStockLevel(b.id, p.id)
      stockChecks++
    }
  }
  const purged = await prisma.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] } })
  return NextResponse.json({ success: true, data: { businesses: businesses.length, stockChecks, purgedTokens: purged.count } })
}
