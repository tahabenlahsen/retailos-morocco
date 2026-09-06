import { withTenant, parseBody, ok } from "@/lib/api"
import { aiQuerySchema } from "@/utils/validation"
import { aiService, getLlmHealth } from "@/services/ai.service"

export const GET = withTenant(async () => {
  const h = getLlmHealth()
  return ok({ llmConfigured: aiService.isLlmConfigured(), llmDegraded: Boolean(h.lastError), lastErrorType: h.lastError?.type ?? null })
}, { permission: "ai.use" })

export const POST = withTenant(
  async (req, ctx) => {
    const { question, locale, storeId } = await parseBody(req, aiQuerySchema)
    return ok(await aiService.ask(ctx, question, locale, storeId))
  },
  { permission: "ai.use", rateLimit: 30 }
)
