import { z } from "zod"
import { withTenant, parseBody, parseQuery, ok, created } from "@/lib/api"
import { createPurchaseOrderSchema, paginationSchema, PURCHASE_STATUSES } from "@/utils/validation"
import { purchaseService } from "@/services/purchase.service"

const listSchema = paginationSchema.extend({ storeId: z.string().uuid().optional(), supplierId: z.string().uuid().optional(), status: z.enum(PURCHASE_STATUSES).optional() })

export const GET = withTenant(async (req, ctx) => ok(await purchaseService.list(ctx, parseQuery(req, listSchema))), { permission: "purchase.view" })
export const POST = withTenant(async (req, ctx) => created(await purchaseService.create(ctx, await parseBody(req, createPurchaseOrderSchema))), { permission: "purchase.create" })
