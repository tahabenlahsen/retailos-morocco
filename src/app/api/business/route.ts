import { withTenant, parseBody, ok } from "@/lib/api"
import { updateBusinessSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"

export const GET = withTenant(async (_req, ctx) => ok(await businessService.get(ctx)), { permission: "business.view" })

export const PATCH = withTenant(
  async (req, ctx) => {
    const input = await parseBody(req, updateBusinessSchema)
    return ok(await businessService.update(ctx, input))
  },
  { permission: "business.update" }
)
