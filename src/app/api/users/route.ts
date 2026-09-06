import { withTenant, parseBody, ok, created } from "@/lib/api"
import { createUserSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"

export const GET = withTenant(async (_req, ctx) => ok(await businessService.listUsers(ctx)), { permission: "user.view" })

export const POST = withTenant(
  async (req, ctx) => created(await businessService.createUser(ctx, await parseBody(req, createUserSchema))),
  { permission: "user.create" }
)
