import { withTenant, ok } from "@/lib/api"
import { customerService } from "@/services/customer.service"

/** Outstanding credit balances across the business (who owes what). */
export const GET = withTenant(async (_req, ctx) => ok(await customerService.receivables(ctx)), { permission: "customer.view" })
