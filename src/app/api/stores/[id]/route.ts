import { withTenant, parseBody, ok } from "@/lib/api"
import { updateStoreSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"

type P = { id: string }

export const PATCH = withTenant<P>(
  async (req, ctx, { id }) => ok(await businessService.updateStore(ctx, id, await parseBody(req, updateStoreSchema))),
  { permission: "store.update" }
)

export const DELETE = withTenant<P>(
  async (_req, ctx, { id }) => {
    await businessService.deleteStore(ctx, id)
    return ok({ deleted: true })
  },
  { permission: "store.delete" }
)
