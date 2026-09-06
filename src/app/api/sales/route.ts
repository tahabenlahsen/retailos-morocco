import { withTenant, parseBody, parseQuery, ok, created } from "@/lib/api"
import { createSaleSchema, saleListQuerySchema } from "@/utils/validation"
import { salesService } from "@/services/sales.service"

export const GET = withTenant(async (req, ctx) => ok(await salesService.list(ctx, parseQuery(req, saleListQuerySchema))), { permission: "sale.view" })

export const POST = withTenant(
  async (req, ctx) => {
    const { sale, duplicate } = await salesService.create(ctx, await parseBody(req, createSaleSchema))
    return duplicate ? ok(sale) : created(sale)
  },
  { permission: "sale.create", rateLimit: 120 }
)
