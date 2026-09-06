import { z } from "zod"
import { withTenant, parseQuery, ok } from "@/lib/api"
import { productService } from "@/services/product.service"

const schema = z.object({ q: z.string().trim().min(1).max(120), storeId: z.string().uuid().optional() })

/** POS lookup: exact barcode/SKU match first, then fuzzy name search. */
export const GET = withTenant(
  async (req, ctx) => {
    const { q, storeId } = parseQuery(req, schema)
    return ok(await productService.lookup(ctx, storeId, q))
  },
  { permission: "product.view", rateLimit: 240 }
)
