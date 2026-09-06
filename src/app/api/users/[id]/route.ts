import { withTenant, parseBody, ok } from "@/lib/api"
import { updateUserSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"

type P = { id: string }

export const PATCH = withTenant<P>(
  async (req, ctx, { id }) => ok(await businessService.updateUser(ctx, id, await parseBody(req, updateUserSchema))),
  { permission: "user.update" }
)

export const DELETE = withTenant<P>(
  async (_req, ctx, { id }) => {
    await businessService.deleteUser(ctx, id)
    return ok({ deleted: true })
  },
  { permission: "user.delete" }
)
