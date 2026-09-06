import { z } from "zod"
import { withTenant, parseBody, parseQuery, ok, created } from "@/lib/api"
import { heldCartSchema } from "@/utils/validation"
import { salesService } from "@/services/sales.service"

export const GET = withTenant(
  async (req, ctx) => {
    const { storeId } = parseQuery(req, z.object({ storeId: z.string().uuid().optional() }))
    return ok(await salesService.listHeldCarts(ctx, storeId))
  },
  { permission: "sale.create" }
)

export const POST = withTenant(async (req, ctx) => created(await salesService.holdCart(ctx, await parseBody(req, heldCartSchema))), { permission: "sale.create" })
