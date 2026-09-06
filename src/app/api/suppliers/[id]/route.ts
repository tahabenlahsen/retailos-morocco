import { withTenant, parseBody, ok } from "@/lib/api"
import { updateSupplierSchema, supplierPaymentSchema } from "@/utils/validation"
import { purchaseService } from "@/services/purchase.service"
import { z } from "zod"

type P = { id: string }

export const GET = withTenant<P>(async (_req, ctx, { id }) => ok(await purchaseService.getSupplier(ctx, id)), { permission: "supplier.view" })
export const PATCH = withTenant<P>(async (req, ctx, { id }) => ok(await purchaseService.updateSupplier(ctx, id, await parseBody(req, updateSupplierSchema) as never)), { permission: "supplier.manage" })
export const DELETE = withTenant<P>(
  async (_req, ctx, { id }) => {
    await purchaseService.deleteSupplier(ctx, id)
    return ok({ deleted: true })
  },
  { permission: "supplier.manage" }
)
/** Record a payment to the supplier. */
export const POST = withTenant<P>(
  async (req, ctx, { id }) => ok(await purchaseService.paySupplier(ctx, id, await parseBody(req, supplierPaymentSchema.extend({ storeId: z.string().uuid().optional() })))),
  { permission: "purchase.create" }
)
