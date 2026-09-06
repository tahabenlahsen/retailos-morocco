import { withPublic, parseBody, ok } from "@/lib/api"
import { resetPasswordSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"
import { getClientIp } from "@/lib/rate-limit"

export const POST = withPublic(
  async (req) => {
    const { token, password } = await parseBody(req, resetPasswordSchema)
    await businessService.resetPassword(token, password, getClientIp(req.headers))
    return ok({ reset: true })
  },
  { rateLimit: 10, windowMs: 15 * 60_000 }
)
