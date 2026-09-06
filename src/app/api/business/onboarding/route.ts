import { withTenant, parseBody, ok } from "@/lib/api"
import { businessOnboardingSchema } from "@/utils/validation"
import { businessService } from "@/services/business.service"

export const POST = withTenant(async (req, ctx) => {
  const input = await parseBody(req, businessOnboardingSchema)
  const result = await businessService.onboard(ctx, input)
  return ok(result)
})
