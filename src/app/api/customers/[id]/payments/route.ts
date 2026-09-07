import { withTenant, parseBody, ok } from "@/lib/api"
import { customerPaymentSchema } from "@/utils/validation"
import { customerService } from "@/services/customer.service"

type P = { id: string }

/** Record a repayment of the customer's outstanding credit balance. */
export const POST = withTenant<P>(async (req, ctx, { id }) => ok(await customerService.recordPayment(ctx, id, await parseBody(req, customerPaymentSchema)), 201), {
  permission: "customer.payment",
  rateLimit: 60,
})
