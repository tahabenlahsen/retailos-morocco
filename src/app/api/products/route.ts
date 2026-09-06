import { withTenant, parseBody, parseQuery, ok, created } from "@/lib/api"
import { createProductSchema, productListQuerySchema } from "@/utils/validation"
import { productService } from "@/services/product.service"

export const GET = withTenant(async (req, ctx) => ok(await productService.list(ctx, parseQuery(req, productListQuerySchema))), { permission: "product.view" })

export const POST = withTenant(
  async (req, ctx) => created(await productService.create(ctx, await parseBody(req, createProductSchema))),
  { permission: "product.create" }
)
