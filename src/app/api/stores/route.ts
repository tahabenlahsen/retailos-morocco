import { withTenant, parseBody, ok, created } from "@/lib/api"
import { createStoreSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"

export const GET = withTenant(async (_req, ctx) => ok(await businessService.listStores(ctx)), { permission: "store.view" })

export const POST = withTenant(
  async (req, ctx) => created(await businessService.createStore(ctx, await parseBody(req, createStoreSchema))),
  { permission: "store.create" }
)
