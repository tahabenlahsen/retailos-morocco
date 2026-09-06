import { withTenant, parseQuery, ok } from "@/lib/api"
import { notificationListQuerySchema } from "@/utils/validation"
import { notificationService } from "@/services/notification.service"

export const GET = withTenant(
  async (req, ctx) => {
    const q = parseQuery(req, notificationListQuerySchema)
    return ok(await notificationService.list(ctx, { ...q, unreadOnly: q.unreadOnly === "true" }))
  },
  { permission: "notification.view" }
)

/** Mark all as read. */
export const POST = withTenant(async (_req, ctx) => ok(await notificationService.markAllRead(ctx)), { permission: "notification.view" })
