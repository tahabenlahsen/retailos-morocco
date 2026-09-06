import { withTenant, parseQuery, ok } from "@/lib/api"
import { paginationSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"

export const GET = withTenant(async (req, ctx) => ok(await businessService.auditLogs(ctx, parseQuery(req, paginationSchema))), { permission: "audit.view" })
