import { z } from "zod"
import { withTenant, parseBody, parseQuery, ok, created } from "@/lib/api"
import { openRegisterSchema, paginationSchema } from "@/utils/validation"
import { registerService } from "@/services/register.service"

/** GET ?storeId= → currently open register (or null). GET ?history=true → paginated history. */
export const GET = withTenant(
  async (req, ctx) => {
    const q = parseQuery(req, paginationSchema.extend({ storeId: z.string().uuid().optional(), history: z.enum(["true", "false"]).optional() }))
    if (q.history === "true") return ok(await registerService.history(ctx, q))
    return ok(await registerService.getOpen(ctx, q.storeId))
  },
  { permission: "register.open" }
)

export const POST = withTenant(async (req, ctx) => created(await registerService.open(ctx, await parseBody(req, openRegisterSchema))), { permission: "register.open" })
