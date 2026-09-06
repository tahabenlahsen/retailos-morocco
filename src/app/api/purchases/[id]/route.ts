import { withTenant, parseBody, ok } from "@/lib/api"
import { updatePurchaseOrderSchema, receivePurchaseOrderSchema } from "@/utils/validation"
import { purchaseService } from "@/services/purchase.service"

type P = { id: string }

export const GET = withTenant<P>(async (_req, ctx, { id }) => ok(await purchaseService.getById(ctx, id)), { permission: "purchase.view" })
export const PATCH = withTenant<P>(async (req, ctx, { id }) => ok(await purchaseService.update(ctx, id, await parseBody(req, updatePurchaseOrderSchema))), { permission: "purchase.update" })
/** Receive goods. */
export const POST = withTenant<P>(async (req, ctx, { id }) => ok(await purchaseService.receive(ctx, id, await parseBody(req, receivePurchaseOrderSchema))), { permission: "purchase.receive" })
