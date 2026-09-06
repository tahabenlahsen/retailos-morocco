import { withTenant, parseBody, ok } from "@/lib/api"
import { updateBrandSchema } from "@/utils/validation"
import { productService } from "@/services/product.service"

type P = { id: string }
export const PATCH = withTenant<P>(async (req, ctx, { id }) => ok(await productService.updateBrand(ctx, id, await parseBody(req, updateBrandSchema))), { permission: "category.manage" })
export const DELETE = withTenant<P>(async (_req, ctx, { id }) => ok(await productService.deleteBrand(ctx, id)), { permission: "category.manage" })
