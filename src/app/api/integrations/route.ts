import { z } from "zod"
import { withTenant, parseBody, ok } from "@/lib/api"
import { forbidden, invalidState } from "@/lib/errors"
import { isEmailConfigured, sendEmail } from "@/lib/email"
import { aiService, getLlmHealth } from "@/services/ai.service"
import { isRedisConfigured, rateLimitBackend } from "@/lib/rate-limit"
import { isPostgres } from "@/lib/prisma"
import { prisma } from "@/lib/prisma"

/**
 * Integration status for the Settings page. Exposes booleans only — never secrets.
 */
export const GET = withTenant(
  async () =>
    ok({
      database: isPostgres ? "postgresql" : "sqlite",
      ai: { ...getLlmHealth(), model: aiService.isLlmConfigured() ? process.env.OPENAI_MODEL ?? "gpt-4o-mini" : null },
      email: { configured: isEmailConfigured(), from: isEmailConfigured() ? process.env.SMTP_FROM ?? null : null },
      redis: { configured: isRedisConfigured(), active: rateLimitBackend() === "redis" },
      cron: { configured: Boolean(process.env.CRON_SECRET) },
      whatsapp: { configured: false, note: "not implemented" },
    }),
  { permission: "business.view" }
)

/** Owner-only: send a test e-mail to the current user's address to validate SMTP settings. */
export const POST = withTenant(
  async (req, ctx) => {
    if (ctx.role !== "OWNER") throw forbidden()
    const { action } = await parseBody(req, z.object({ action: z.literal("test-email") }))
    if (action === "test-email") {
      if (!isEmailConfigured()) throw invalidState("SMTP is not configured (set SMTP_HOST, SMTP_PORT, SMTP_FROM)")
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { email: true, firstName: true } })
      const sent = await sendEmail({ to: user.email, subject: "RetailOS Morocco – test e-mail", text: `Bonjour ${user.firstName},\n\nCeci est un e-mail de test envoyé depuis RetailOS Morocco. La configuration SMTP fonctionne.\n\n— RetailOS Morocco` })
      return ok({ sent, to: user.email })
    }
    return ok({})
  },
  { permission: "business.update", rateLimit: 5 }
)
