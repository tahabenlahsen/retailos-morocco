import { withTenant, parseBody, parseQuery, ok, created } from "@/lib/api"
import { createExpenseSchema, expenseListQuerySchema } from "@/utils/validation"
import { expenseService } from "@/services/expense.service"

export const GET = withTenant(async (req, ctx) => ok(await expenseService.list(ctx, parseQuery(req, expenseListQuerySchema))), { permission: "expense.view" })
export const POST = withTenant(async (req, ctx) => created(await expenseService.create(ctx, await parseBody(req, createExpenseSchema))), { permission: "expense.create" })
