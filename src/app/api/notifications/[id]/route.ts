import { withTenant, ok } from "@/lib/api"
import { notificationService } from "@/services/notification.service"

type P = { id: string }
export const POST = withTenant<P>(async (_req, ctx, { id }) => ok(await notificationService.markRead(ctx, id)), { permission: "notification.view" })
