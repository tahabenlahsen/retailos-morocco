import { withTenant, ok } from "@/lib/api"
import { expenseService } from "@/services/expense.service"

type P = { id: string }
export const DELETE = withTenant<P>(async (_req, ctx, { id }) => ok(await expenseService.deleteCategory(ctx, id)), { permission: "expense.delete" })
