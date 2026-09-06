import { z } from "zod"
import { withTenant, parseQuery, ok } from "@/lib/api"
import { inventoryService } from "@/services/inventory.service"

export const GET = withTenant(
  async (req, ctx) => {
    const { storeId } = parseQuery(req, z.object({ storeId: z.string().uuid().optional() }))
    return ok(await inventoryService.summary(ctx, storeId))
  },
  { permission: "inventory.view" }
)
