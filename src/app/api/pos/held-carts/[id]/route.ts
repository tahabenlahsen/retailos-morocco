import { withTenant, ok } from "@/lib/api"
import { salesService } from "@/services/sales.service"

type P = { id: string }
export const DELETE = withTenant<P>(
  async (_req, ctx, { id }) => {
    await salesService.deleteHeldCart(ctx, id)
    return ok({ deleted: true })
  },
  { permission: "sale.create" }
)
