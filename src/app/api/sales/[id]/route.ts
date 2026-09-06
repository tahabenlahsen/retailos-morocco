import { withTenant, ok } from "@/lib/api"
import { salesService } from "@/services/sales.service"

type P = { id: string }
export const GET = withTenant<P>(async (_req, ctx, { id }) => ok(await salesService.getById(ctx, id)), { permission: "sale.view" })
