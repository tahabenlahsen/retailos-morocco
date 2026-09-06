import { withTenant, parseBody, parseQuery, ok, created } from "@/lib/api"
import { createSupplierSchema, paginationSchema } from "@/utils/validation"
import { purchaseService } from "@/services/purchase.service"

export const GET = withTenant(async (req, ctx) => ok(await purchaseService.listSuppliers(ctx, parseQuery(req, paginationSchema))), { permission: "supplier.view" })
export const POST = withTenant(async (req, ctx) => created(await purchaseService.createSupplier(ctx, await parseBody(req, createSupplierSchema) as never)), { permission: "supplier.manage" })
