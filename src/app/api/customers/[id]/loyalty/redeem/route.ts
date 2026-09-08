import { withTenant, parseBody, ok } from "@/lib/api"
import { customerService } from "@/services/customer.service"
import { loyaltyRedeemSchema } from "@/utils/validation"

type P = { id: string }

/** POST /api/customers/{id}/loyalty/redeem — redeem loyalty points as store credit (1 pt = 1 MAD). */
export const POST = withTenant<P>(async (req, ctx, { id }) => ok(await customerService.redeemLoyaltyPoints(ctx, id, await parseBody(req, loyaltyRedeemSchema))), { permission: "customer.manage" })
