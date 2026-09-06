import { withTenant, parseBody, ok } from "@/lib/api"
import { updateProductSchema } from "@/utils/validation"
import { productService } from "@/services/product.service"

type P = { id: string }

export const GET = withTenant<P>(async (_req, ctx, { id }) => ok(await productService.getById(ctx, id)), { permission: "product.view" })

export const PATCH = withTenant<P>(
  async (req, ctx, { id }) => ok(await productService.update(ctx, id, await parseBody(req, updateProductSchema))),
  { permission: "product.update" }
)

export const DELETE = withTenant<P>(
  async (_req, ctx, { id }) => {
    await productService.remove(ctx, id)
    return ok({ deleted: true })
  },
  { permission: "product.delete" }
)
