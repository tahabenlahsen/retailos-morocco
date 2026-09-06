import { withTenant, parseBody, created } from "@/lib/api"
import { refundSchema } from "@/utils/validation"
import { salesService } from "@/services/sales.service"

type P = { id: string }
export const POST = withTenant<P>(async (req, ctx, { id }) => created(await salesService.refund(ctx, id, await parseBody(req, refundSchema))), { permission: "sale.refund" })
