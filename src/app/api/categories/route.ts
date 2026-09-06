import { withTenant, parseBody, ok, created } from "@/lib/api"
import { createCategorySchema } from "@/utils/validation"
import { productService } from "@/services/product.service"

export const GET = withTenant(async (_req, ctx) => ok(await productService.listCategories(ctx)), { permission: "product.view" })
export const POST = withTenant(async (req, ctx) => created(await productService.createCategory(ctx, await parseBody(req, createCategorySchema))), { permission: "category.manage" })
