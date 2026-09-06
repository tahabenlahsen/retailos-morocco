import { withTenant, parseBody, ok, created } from "@/lib/api"
import { createBrandSchema } from "@/utils/validation"
import { productService } from "@/services/product.service"

export const GET = withTenant(async (_req, ctx) => ok(await productService.listBrands(ctx)), { permission: "product.view" })
export const POST = withTenant(async (req, ctx) => created(await productService.createBrand(ctx, await parseBody(req, createBrandSchema))), { permission: "category.manage" })
