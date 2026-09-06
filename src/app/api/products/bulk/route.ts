import { z } from "zod"
import { withTenant, parseBody, ok } from "@/lib/api"
import { bulkPriceUpdateSchema, bulkStockUpdateSchema } from "@/utils/validation"
import { productService } from "@/services/product.service"

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("price") }).merge(bulkPriceUpdateSchema),
  z.object({ kind: z.literal("stock") }).merge(bulkStockUpdateSchema),
])

export const POST = withTenant(
  async (req, ctx) => {
    const input = await parseBody(req, schema)
    if (input.kind === "price") return ok(await productService.bulkPrice(ctx, input))
    return ok(await productService.bulkStock(ctx, input))
  },
  { permission: "product.bulkUpdate" }
)
