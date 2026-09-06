import { withPublic, parseBody, ok } from "@/lib/api"
import { forgotPasswordSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"
import { getClientIp } from "@/lib/rate-limit"

export const POST = withPublic(
  async (req) => {
    const { email } = await parseBody(req, forgotPasswordSchema)
    const result = await businessService.requestPasswordReset(email, getClientIp(req.headers))
    // Same response whether or not the account exists (no enumeration)
    return ok({ delivered: result.delivered })
  },
  { rateLimit: 5, windowMs: 15 * 60_000 }
)
