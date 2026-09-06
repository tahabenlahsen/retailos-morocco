import { z } from "zod"
import { withTenant, parseBody, ok } from "@/lib/api"
import { salesService } from "@/services/sales.service"

type P = { id: string }
export const POST = withTenant<P>(
  async (req, ctx, { id }) => {
    const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(2).max(300) }))
    return ok(await salesService.cancel(ctx, id, reason))
  },
  { permission: "sale.cancel" }
)
