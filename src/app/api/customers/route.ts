import { z } from "zod"
import { withTenant, parseBody, parseQuery, ok, created } from "@/lib/api"
import { createCustomerSchema, paginationSchema } from "@/utils/validation"
import { customerService } from "@/services/customer.service"

export const GET = withTenant(
  async (req, ctx) => {
    const q = parseQuery(req, paginationSchema.extend({ quick: z.enum(["true", "false"]).optional() }))
    if (q.quick === "true" && q.search) return ok(await customerService.search(ctx, q.search))
    return ok(await customerService.list(ctx, q))
  },
  { permission: "customer.view" }
)
export const POST = withTenant(async (req, ctx) => created(await customerService.create(ctx, await parseBody(req, createCustomerSchema) as never)), { permission: "customer.manage" })
