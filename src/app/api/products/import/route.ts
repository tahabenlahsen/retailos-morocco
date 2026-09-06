import { withTenant, ok } from "@/lib/api"
import { validation } from "@/lib/errors"
import { productService } from "@/services/product.service"

const MAX_BYTES = 2 * 1024 * 1024

/** multipart/form-data with `file` (CSV) and optional `storeId`. */
export const POST = withTenant(
  async (req, ctx) => {
    const form = await req.formData().catch(() => null)
    if (!form) throw validation("Expected multipart form data")
    const file = form.get("file")
    if (!(file instanceof File)) throw validation("CSV file is required")
    if (file.size > MAX_BYTES) throw validation("File exceeds 2 MB limit")
    if (!/\.csv$/i.test(file.name) && !file.type.includes("csv") && file.type !== "text/plain") throw validation("Only .csv files are accepted")
    const storeId = form.get("storeId")
    const csv = await file.text()
    return ok(await productService.importCsv(ctx, typeof storeId === "string" && storeId ? storeId : undefined, csv))
  },
  { permission: "product.import", rateLimit: 10 }
)
