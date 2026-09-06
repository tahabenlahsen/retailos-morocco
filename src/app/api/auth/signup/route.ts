import { withPublic, parseBody, created } from "@/lib/api"
import { signUpSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"
import { getClientIp } from "@/lib/rate-limit"

export const POST = withPublic(
  async (req) => {
    const input = await parseBody(req, signUpSchema)
    const result = await businessService.signUp(input, getClientIp(req.headers))
    return created(result)
  },
  { rateLimit: 5, windowMs: 15 * 60_000 }
)
