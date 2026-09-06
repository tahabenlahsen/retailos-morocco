import { z } from "zod"
import { withTenant, parseQuery, ok } from "@/lib/api"
import { analyticsService } from "@/services/analytics.service"

const schema = z.object({
  storeId: z.string().uuid().optional(),
  lookbackDays: z.coerce.number().int().min(7).max(180).default(30),
  coverDays: z.coerce.number().int().min(1).max(90).default(14),
})

export const GET = withTenant(
  async (req, ctx) => {
    const q = parseQuery(req, schema)
    return ok(await analyticsService.reorderRecommendations(ctx, q.storeId, q.lookbackDays, q.coverDays))
  },
  { permission: "inventory.view" }
)
