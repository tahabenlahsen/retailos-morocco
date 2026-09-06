import { withTenant, parseBody, ok } from "@/lib/api"
import { updateExpenseSchema } from "@/utils/validation"
import { expenseService } from "@/services/expense.service"

type P = { id: string }

export const GET = withTenant<P>(async (_req, ctx, { id }) => ok(await expenseService.getById(ctx, id)), { permission: "expense.view" })
export const PATCH = withTenant<P>(async (req, ctx, { id }) => ok(await expenseService.update(ctx, id, await parseBody(req, updateExpenseSchema))), { permission: "expense.update" })
export const DELETE = withTenant<P>(
  async (_req, ctx, { id }) => {
    await expenseService.remove(ctx, id)
    return ok({ deleted: true })
  },
  { permission: "expense.delete" }
)
