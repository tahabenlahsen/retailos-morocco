import type { TenantContext } from "@/lib/api"
import { analyticsService } from "./analytics.service"
import { inventoryService } from "./inventory.service"
import { resolveDateRange, type DatePreset } from "@/utils/dates"
import { formatMoney } from "@/utils/money"

/**
 * AI Business Assistant — data-first architecture.
 *
 * 1. Intent detection (deterministic keyword rules; multilingual FR/AR/Darija/EN).
 * 2. Scoped database queries via existing services (tenant isolation enforced by TenantContext).
 * 3. The LLM (if configured) receives ONLY the structured results + strict instructions
 *    to answer from that data. If no LLM key is configured, a deterministic templated
 *    answer is produced from the same data. The model never queries the DB itself.
 */

export type Intent = "TOP_PRODUCTS" | "MOST_PROFITABLE" | "LOW_STOCK" | "PROFIT_ANALYSIS" | "REORDER" | "SALES_SUMMARY" | "EXPENSES" | "PAYMENT_METHODS" | "UNKNOWN"

interface IntentRule {
  intent: Intent
  patterns: RegExp[]
}

/**
 * Each pattern that matches adds its weight to the intent score; the highest score wins.
 * Order below is the tie-break priority. Weights let specific phrases beat generic words
 * (e.g. "commander" beats a generic mention of "stock").
 */
const RULES: (IntentRule & { weight?: number })[] = [
  { intent: "REORDER", weight: 3, patterns: [/reorder|what (should|do) i (order|buy)|commander|acheter|réapprovision|نشري|نطلب|خاصني ن|supplier|fournisseur|مورد/i] },
  { intent: "PROFIT_ANALYSIS", weight: 3, patterns: [/why.*(profit|decreas|drop|down)|(profit|bénéfice).*(diminu|baiss|chut|decreas|drop)|pourquoi.*bénéfice|علاش.*(ربح|نقص)|(الأرباح|الربح).*(نقص|انخفض|طاح)|انخفض/i] },
  { intent: "MOST_PROFITABLE", weight: 3, patterns: [/most profit|profitable|rapporte|marge|bénéfice.*produit|produit.*bénéfice|ربح.*منتج|منتج.*ربح|كيربح|earns? (me )?the most/i] },
  { intent: "TOP_PRODUCTS", weight: 2, patterns: [/best.?sell|top (product|selling)|sells? the most|plus vendu|vend.*(le )?plus|meilleur.*vente|أكثر.*(تباع|مبيع)|تباع.*أكثر|كثر.*(مبيع|تباع)|الأكثر مبيعا/i] },
  { intent: "LOW_STOCK", weight: 2, patterns: [/low stock|running (low|out)|out of stock|rupture|stock (faible|bas)|manque|ناقص|نفد|قليل|قريب.*(يسالي|ينفد|تنفد)|المخزون/i] },
  { intent: "EXPENSES", weight: 2, patterns: [/expense|dépense|charges|مصاريف|مصروف|صرف/i] },
  { intent: "PAYMENT_METHODS", weight: 2, patterns: [/payment method|cash vs|card|tpe|espèces|mode.*paiement|طريقة الدفع|كاش|بطاقة/i] },
  { intent: "SALES_SUMMARY", weight: 1, patterns: [/sales? (summary|report|total)|summary|résumé|ventes|chiffre|revenue|\bca\b|مبيعات|ملخص/i] },
]

const PERIOD_RULES: { preset: DatePreset; patterns: RegExp[] }[] = [
  { preset: "today", patterns: [/today|aujourd|اليوم|ليوم/i] },
  { preset: "yesterday", patterns: [/yesterday|hier|البارح|أمس/i] },
  { preset: "last7", patterns: [/week|semaine|سيمانة|أسبوع|7 (days|jours)/i] },
  { preset: "lastMonth", patterns: [/last month|mois dernier|الشهر (الماضي|لي فات|الفايت)/i] },
  { preset: "thisMonth", patterns: [/this month|ce mois|هاد الشهر|هذا الشهر|الشهر/i] },
  { preset: "last30", patterns: [/30 (days|jours)|month|mois|شهر/i] },
]

export function detectIntent(q: string): { intent: Intent; preset: DatePreset } {
  let intent: Intent = "UNKNOWN"
  let best = 0
  for (const r of RULES) {
    const score = r.patterns.filter((p) => p.test(q)).length * (r.weight ?? 1)
    if (score > best) {
      best = score
      intent = r.intent
    }
  }
  const preset = PERIOD_RULES.find((r) => r.patterns.some((p) => p.test(q)))?.preset ?? (intent === "LOW_STOCK" || intent === "REORDER" ? "today" : "last30")
  return { intent, preset }
}

interface AiAnswer {
  intent: Intent
  period: { preset: DatePreset; from: string; to: string }
  answer: string
  data: unknown
  source: "llm" | "template"
}

const L = {
  fr: {
    noData: "Aucune donnée disponible pour cette période.",
    unknown: "Je peux répondre sur : les produits les plus vendus, les plus rentables, le stock faible, les recommandations de commande, le résumé des ventes, les dépenses, les modes de paiement et l'analyse des bénéfices.",
    period: { today: "aujourd'hui", yesterday: "hier", last7: "les 7 derniers jours", last30: "les 30 derniers jours", thisMonth: "ce mois", lastMonth: "le mois dernier", custom: "la période" },
  },
  en: {
    noData: "No data available for this period.",
    unknown: "I can answer about: top-selling products, most profitable products, low stock, reorder recommendations, sales summary, expenses, payment methods and profit analysis.",
    period: { today: "today", yesterday: "yesterday", last7: "the last 7 days", last30: "the last 30 days", thisMonth: "this month", lastMonth: "last month", custom: "the period" },
  },
  ar: {
    noData: "لا توجد بيانات لهذه الفترة.",
    unknown: "يمكنني الإجابة عن: المنتجات الأكثر مبيعاً، الأكثر ربحية، المخزون المنخفض، توصيات الطلب، ملخص المبيعات، المصاريف، طرق الدفع وتحليل الأرباح.",
    period: { today: "اليوم", yesterday: "أمس", last7: "آخر 7 أيام", last30: "آخر 30 يوماً", thisMonth: "هذا الشهر", lastMonth: "الشهر الماضي", custom: "الفترة" },
  },
}

type Locale = keyof typeof L

type Range = ReturnType<typeof resolveDateRange>
type TopProducts = Awaited<ReturnType<typeof analyticsService.topProducts>>
type Pnl = Awaited<ReturnType<typeof analyticsService.profitAndLoss>>
type Gathered =
  | { kind: "top"; range: Range; top: TopProducts }
  | { kind: "inventory"; range: Range; inventory: Awaited<ReturnType<typeof inventoryService.summary>> }
  | { kind: "reorder"; range: Range; reorder: Awaited<ReturnType<typeof analyticsService.reorderRecommendations>> }
  | { kind: "profit"; range: Range; current: Pnl; previous: Pnl }
  | { kind: "pnl"; range: Range; pnl: Pnl; top?: TopProducts }
  | { kind: "payments"; range: Range; payments: Awaited<ReturnType<typeof analyticsService.paymentMethodReport>> }
  | { kind: "none"; range: Range }

async function gather(ctx: TenantContext, intent: Intent, preset: DatePreset, storeId?: string): Promise<Gathered> {
  const range = resolveDateRange(preset)
  switch (intent) {
    case "TOP_PRODUCTS":
      return { kind: "top", range, top: await analyticsService.topProducts(ctx, range, storeId, 5) }
    case "MOST_PROFITABLE": {
      const top = await analyticsService.topProducts(ctx, range, storeId, 50)
      return { kind: "top", range, top: [...top].sort((a, b) => b.profit - a.profit).slice(0, 5) }
    }
    case "LOW_STOCK":
      return { kind: "inventory", range, inventory: await inventoryService.summary(ctx, storeId) }
    case "REORDER": {
      const r = await analyticsService.reorderRecommendations(ctx, storeId)
      return { kind: "reorder", range, reorder: { ...r, items: r.items.slice(0, 10) } }
    }
    case "PROFIT_ANALYSIS": {
      const cur = await analyticsService.profitAndLoss(ctx, range, storeId)
      const prevRange = resolveDateRange(preset === "thisMonth" ? "lastMonth" : "last30", undefined, undefined, new Date(range.from.getTime() - 1))
      const prev = await analyticsService.profitAndLoss(ctx, prevRange, storeId)
      return { kind: "profit", range, current: cur, previous: prev }
    }
    case "EXPENSES":
      return { kind: "pnl", range, pnl: await analyticsService.profitAndLoss(ctx, range, storeId) }
    case "PAYMENT_METHODS":
      return { kind: "payments", range, payments: await analyticsService.paymentMethodReport(ctx, range, storeId) }
    case "SALES_SUMMARY":
      return { kind: "pnl", range, pnl: await analyticsService.profitAndLoss(ctx, range, storeId), top: await analyticsService.topProducts(ctx, range, storeId, 3) }
    default:
      return { kind: "none", range }
  }
}

function template(intent: Intent, preset: DatePreset, d: Gathered, locale: Locale): string {
  const t = L[locale]
  const per = t.period[preset]
  const m = (v: number) => formatMoney(v, locale === "ar" ? "ar-MA" : locale === "en" ? "en-MA" : "fr-MA")
  switch (intent) {
    case "TOP_PRODUCTS": {
      if (d.kind !== "top" || !d.top.length) return t.noData
      const lines = d.top.map((p, i) => `${i + 1}. ${p.product.name} — ${p.quantity} ${p.product.unit}, ${m(p.revenue)}`)
      return locale === "fr" ? `Produits les plus vendus ${per} :\n${lines.join("\n")}` : locale === "ar" ? `المنتجات الأكثر مبيعاً ${per}:\n${lines.join("\n")}` : `Top-selling products ${per}:\n${lines.join("\n")}`
    }
    case "MOST_PROFITABLE": {
      if (d.kind !== "top" || !d.top.length) return t.noData
      const lines = d.top.map((p, i) => `${i + 1}. ${p.product.name} — ${m(p.profit)} (${p.quantity} ${locale === "fr" ? "vendus" : locale === "ar" ? "مبيعة" : "sold"})`)
      return locale === "fr" ? `Produits les plus rentables ${per} (bénéfice brut) :\n${lines.join("\n")}` : locale === "ar" ? `المنتجات الأكثر ربحية ${per} (الربح الإجمالي):\n${lines.join("\n")}` : `Most profitable products ${per} (gross profit):\n${lines.join("\n")}`
    }
    case "LOW_STOCK": {
      if (d.kind !== "inventory") return t.noData
      const inv = d.inventory
      const items = [...inv.outOfStock, ...inv.lowStock].slice(0, 10)
      if (!items.length) return locale === "fr" ? "Aucun produit en stock faible. Tous les niveaux sont au-dessus du minimum." : locale === "ar" ? "لا توجد منتجات بمخزون منخفض. جميع المستويات فوق الحد الأدنى." : "No products are low on stock. All levels are above minimum."
      const lines = items.map((p) => `• ${p.name}: ${p.stockQuantity} / min ${p.minimumStock}`)
      return locale === "fr" ? `${inv.outOfStockCount} en rupture, ${inv.lowStockCount} en stock faible :\n${lines.join("\n")}` : locale === "ar" ? `${inv.outOfStockCount} نفد مخزونها، ${inv.lowStockCount} مخزون منخفض:\n${lines.join("\n")}` : `${inv.outOfStockCount} out of stock, ${inv.lowStockCount} low:\n${lines.join("\n")}`
    }
    case "REORDER": {
      if (d.kind !== "reorder") return t.noData
      const items = d.reorder.items
      if (!items.length) return locale === "fr" ? "Aucune commande recommandée pour le moment." : locale === "ar" ? "لا توجد توصيات طلب حالياً." : "No reorder recommended right now."
      const lines = items.map((r) => `• ${r.product.name}${r.product.supplier ? ` (${r.product.supplier.name})` : ""}: ${locale === "fr" ? "commander" : locale === "ar" ? "اطلب" : "order"} ${r.suggestedOrderQty} ${r.product.unit} — ${r.estimatedDaysRemaining != null ? `≈${r.estimatedDaysRemaining} ${locale === "fr" ? "jours restants" : locale === "ar" ? "أيام متبقية" : "days left"}` : locale === "fr" ? "pas de ventes récentes" : locale === "ar" ? "بدون مبيعات حديثة" : "no recent sales"}`)
      const total = items.reduce((a, r) => a + r.estimatedCost, 0)
      const disc = locale === "fr" ? "Estimations basées sur les ventes des 30 derniers jours." : locale === "ar" ? "تقديرات مبنية على مبيعات آخر 30 يوماً." : "Estimates based on the last 30 days of sales."
      return `${lines.join("\n")}\n${locale === "fr" ? "Coût estimé" : locale === "ar" ? "التكلفة التقديرية" : "Estimated cost"}: ${m(total)}\n${disc}`
    }
    case "PROFIT_ANALYSIS": {
      if (d.kind !== "profit") return t.noData
      const c = d.current, p = d.previous
      const delta = c.netProfit - p.netProfit
      const reasons: string[] = []
      if (c.revenue < p.revenue) reasons.push(locale === "fr" ? `le chiffre d'affaires a baissé de ${m(p.revenue - c.revenue)}` : locale === "ar" ? `انخفضت المبيعات بـ ${m(p.revenue - c.revenue)}` : `revenue fell by ${m(p.revenue - c.revenue)}`)
      if (c.totalExpenses > p.totalExpenses) reasons.push(locale === "fr" ? `les dépenses ont augmenté de ${m(c.totalExpenses - p.totalExpenses)}` : locale === "ar" ? `ارتفعت المصاريف بـ ${m(c.totalExpenses - p.totalExpenses)}` : `expenses rose by ${m(c.totalExpenses - p.totalExpenses)}`)
      if (c.grossMargin < p.grossMargin) reasons.push(locale === "fr" ? `la marge brute est passée de ${p.grossMargin}% à ${c.grossMargin}%` : locale === "ar" ? `تراجع هامش الربح من ${p.grossMargin}% إلى ${c.grossMargin}%` : `gross margin dropped from ${p.grossMargin}% to ${c.grossMargin}%`)
      if (c.refunds > p.refunds) reasons.push(locale === "fr" ? `les remboursements ont augmenté (${m(c.refunds)})` : locale === "ar" ? `زادت المرتجعات (${m(c.refunds)})` : `refunds increased (${m(c.refunds)})`)
      const head = locale === "fr" ? `Bénéfice net ${per} : ${m(c.netProfit)} (période précédente : ${m(p.netProfit)}, ${delta >= 0 ? "+" : ""}${m(delta)}).` : locale === "ar" ? `الربح الصافي ${per}: ${m(c.netProfit)} (الفترة السابقة: ${m(p.netProfit)}، ${delta >= 0 ? "+" : ""}${m(delta)}).` : `Net profit ${per}: ${m(c.netProfit)} (previous period: ${m(p.netProfit)}, ${delta >= 0 ? "+" : ""}${m(delta)}).`
      if (delta >= 0) return `${head} ${locale === "fr" ? "Le bénéfice n'a pas diminué." : locale === "ar" ? "لم ينخفض الربح." : "Profit did not decrease."}`
      return `${head}\n${locale === "fr" ? "Facteurs" : locale === "ar" ? "العوامل" : "Factors"}: ${reasons.length ? reasons.join(" ; ") : locale === "fr" ? "aucun facteur dominant identifié." : locale === "ar" ? "لم يتم تحديد عامل رئيسي." : "no dominant factor identified."}`
    }
    case "EXPENSES": {
      if (d.kind !== "pnl") return t.noData
      const p = d.pnl
      if (!p.totalExpenses) return t.noData
      const lines = p.expenses.slice(0, 6).map((e) => `• ${e.category.name}: ${m(e.amount)}`)
      return `${locale === "fr" ? "Dépenses" : locale === "ar" ? "المصاريف" : "Expenses"} ${per}: ${m(p.totalExpenses)}\n${lines.join("\n")}`
    }
    case "PAYMENT_METHODS": {
      if (d.kind !== "payments") return t.noData
      const pm = d.payments
      if (!pm.methods.length) return t.noData
      return `${locale === "fr" ? "Encaissements" : locale === "ar" ? "المقبوضات" : "Collected"} ${per}: ${m(pm.total)}\n${pm.methods.map((x) => `• ${x.method}: ${m(x.amount)} (${x.share}%)`).join("\n")}`
    }
    case "SALES_SUMMARY": {
      if (d.kind !== "pnl") return t.noData
      const p = d.pnl
      if (!p.transactions) return t.noData
      const top = d.top?.[0] ? ` ${locale === "fr" ? "Meilleur produit" : locale === "ar" ? "أفضل منتج" : "Top product"}: ${d.top[0].product.name}.` : ""
      return locale === "fr"
        ? `Résumé ${per} : ${p.transactions} ventes, CA ${m(p.revenue)}, panier moyen ${m(p.averageOrderValue)}, bénéfice brut ${m(p.grossProfit)} (${p.grossMargin}%), dépenses ${m(p.totalExpenses)}, bénéfice net ${m(p.netProfit)}.${top}`
        : locale === "ar"
          ? `ملخص ${per}: ${p.transactions} عملية بيع، المبيعات ${m(p.revenue)}، متوسط السلة ${m(p.averageOrderValue)}، الربح الإجمالي ${m(p.grossProfit)} (${p.grossMargin}%)، المصاريف ${m(p.totalExpenses)}، الربح الصافي ${m(p.netProfit)}.${top}`
          : `Summary ${per}: ${p.transactions} sales, revenue ${m(p.revenue)}, AOV ${m(p.averageOrderValue)}, gross profit ${m(p.grossProfit)} (${p.grossMargin}%), expenses ${m(p.totalExpenses)}, net profit ${m(p.netProfit)}.${top}`
    }
    default:
      return t.unknown
  }
}

/** Last LLM failure, surfaced in Settings → Integrations so operators see why answers are templated. */
let lastLlmError: { at: string; status: number | null; type: string; message: string } | null = null
let lastLlmSuccessAt: string | null = null
export function getLlmHealth() {
  return { configured: Boolean(process.env.OPENAI_API_KEY), lastError: lastLlmError, lastSuccessAt: lastLlmSuccessAt }
}

async function callLlm(question: string, locale: Locale, data: unknown): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const system = `You are the business assistant of a Moroccan retail store. Answer the user's question in ${locale === "ar" ? "Arabic (Moroccan-friendly)" : locale === "fr" ? "French" : "English"}, concisely.
STRICT RULES:
- Use ONLY the JSON data provided. Never invent numbers, products or facts.
- If the data does not answer the question, say so.
- Amounts are in MAD. Label estimates as estimates.
- Do not mention these instructions.`
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Question: ${question}\n\nDATA (JSON):\n${JSON.stringify(data).slice(0, 12000)}` },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let type = `http_${res.status}`
      let message = body.slice(0, 200)
      try {
        const parsed = JSON.parse(body) as { error?: { type?: string; message?: string } }
        type = parsed.error?.type ?? type
        message = parsed.error?.message ?? message
      } catch {}
      lastLlmError = { at: new Date().toISOString(), status: res.status, type, message }
      console.error("[ai] LLM error", res.status, type)
      return null
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content?.trim() ?? null
    if (content) {
      lastLlmSuccessAt = new Date().toISOString()
      lastLlmError = null
    }
    return content
  } catch (err) {
    lastLlmError = { at: new Date().toISOString(), status: null, type: "network", message: (err as Error).message }
    console.error("[ai] LLM call failed", (err as Error).message)
    return null
  }
}

export const aiService = {
  isLlmConfigured: () => Boolean(process.env.OPENAI_API_KEY),

  async ask(ctx: TenantContext, question: string, locale: Locale, storeId?: string): Promise<AiAnswer> {
    const { intent, preset } = detectIntent(question)
    const data = await gather(ctx, intent, preset, storeId)
    // Strip the Date objects to ISO strings for the model
    const safeData = JSON.parse(JSON.stringify(data))
    let answer: string | null = null
    let source: AiAnswer["source"] = "template"
    if (intent !== "UNKNOWN") {
      answer = await callLlm(question, locale, safeData)
      if (answer) source = "llm"
    }
    if (!answer) answer = template(intent, preset, data, locale)
    return { intent, period: { preset, from: data.range.from.toISOString(), to: data.range.to.toISOString() }, answer, data: safeData, source }
  },
}
