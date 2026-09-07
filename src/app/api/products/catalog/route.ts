import { z } from "zod"
import { withTenant, parseQuery, ok } from "@/lib/api"
import { productService } from "@/services/product.service"

const schema = z.object({ storeId: z.string().uuid().optional() })

/** Full active catalogue for one store; the POS stores it locally for offline barcode lookup. */
export const GET = withTenant(
  async (req, ctx) => {
    const { storeId } = parseQuery(req, schema)
    return ok(await productService.catalog(ctx, storeId))
  },
  { permission: "product.view", rateLimit: 30 }
)
