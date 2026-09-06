import { withTenant, parseBody, ok } from "@/lib/api"
import { closeRegisterSchema, registerTransactionSchema } from "@/utils/validation"
import { registerService } from "@/services/register.service"

type P = { id: string }

export const GET = withTenant<P>(async (_req, ctx, { id }) => ok(await registerService.getById(ctx, id)), { permission: "register.open" })

/** Close the register. */
export const POST = withTenant<P>(async (req, ctx, { id }) => ok(await registerService.close(ctx, id, await parseBody(req, closeRegisterSchema))), { permission: "register.close" })

/** Add a deposit/withdrawal. */
export const PUT = withTenant<P>(async (req, ctx, { id }) => ok(await registerService.addTransaction(ctx, id, await parseBody(req, registerTransactionSchema))), { permission: "register.transaction" })
