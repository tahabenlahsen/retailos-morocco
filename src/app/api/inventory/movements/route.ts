import { withTenant, parseQuery, ok } from "@/lib/api"
import { movementListQuerySchema } from "@/utils/validation"
import { inventoryService } from "@/services/inventory.service"

export const GET = withTenant(async (req, ctx) => ok(await inventoryService.listMovements(ctx, parseQuery(req, movementListQuerySchema))), { permission: "inventory.view" })
