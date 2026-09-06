import { withTenant, parseBody, ok } from "@/lib/api"
import { inventoryTransferSchema } from "@/utils/validation"
import { inventoryService } from "@/services/inventory.service"

export const POST = withTenant(async (req, ctx) => ok(await inventoryService.transfer(ctx, await parseBody(req, inventoryTransferSchema))), { permission: "inventory.transfer" })
