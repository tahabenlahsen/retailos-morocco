import { withTenant, parseBody, ok } from "@/lib/api"
import { stockAdjustmentSchema } from "@/utils/validation"
import { inventoryService } from "@/services/inventory.service"

export const POST = withTenant(async (req, ctx) => ok(await inventoryService.adjust(ctx, await parseBody(req, stockAdjustmentSchema))), { permission: "inventory.adjust" })
