import { z } from "zod"
import { withTenant, parseQuery } from "@/lib/api"
import { productService } from "@/services/product.service"

export const GET = withTenant(
  async (req, ctx) => {
    const { storeId } = parseQuery(req, z.object({ storeId: z.string().uuid().optional() }))
    const csv = await productService.exportCsv(ctx, storeId)
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  },
  { permission: "product.view", rateLimit: 10 }
)
