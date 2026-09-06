import { withTenant, parseBody, ok } from "@/lib/api"
import { storePlannerSchema } from "@/utils/validation"
import { plan } from "@/services/planner.service"

export const POST = withTenant(async (req, _ctx) => ok(plan(await parseBody(req, storePlannerSchema))), { rateLimit: 60 })
