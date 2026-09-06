import { withTenant, parseBody, ok, created } from "@/lib/api"
import { createExpenseCategorySchema } from "@/utils/validation"
import { expenseService } from "@/services/expense.service"

export const GET = withTenant(async (_req, ctx) => ok(await expenseService.listCategories(ctx)), { permission: "expense.view" })
export const POST = withTenant(async (req, ctx) => created(await expenseService.createCategory(ctx, await parseBody(req, createExpenseCategorySchema))), { permission: "expense.create" })
