import { withTenant, parseBody, ok } from "@/lib/api"
import { updateCategorySchema } from "@/utils/validation"
import { productService } from "@/services/product.service"

type P = { id: string }
export const PATCH = withTenant<P>(async (req, ctx, { id }) => ok(await productService.updateCategory(ctx, id, await parseBody(req, updateCategorySchema))), { permission: "category.manage" })
export const DELETE = withTenant<P>(async (_req, ctx, { id }) => ok(await productService.deleteCategory(ctx, id)), { permission: "category.manage" })
