import { withTenant, parseBody, ok } from "@/lib/api"
import { updateCustomerSchema } from "@/utils/validation"
import { customerService } from "@/services/customer.service"

type P = { id: string }

export const GET = withTenant<P>(async (_req, ctx, { id }) => ok(await customerService.getById(ctx, id)), { permission: "customer.view" })
export const PATCH = withTenant<P>(async (req, ctx, { id }) => ok(await customerService.update(ctx, id, await parseBody(req, updateCustomerSchema) as never)), { permission: "customer.manage" })
export const DELETE = withTenant<P>(
  async (_req, ctx, { id }) => {
    await customerService.remove(ctx, id)
    return ok({ deleted: true })
  },
  { permission: "customer.manage" }
)
