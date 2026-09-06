import { describe, expect, it } from "vitest"
import { detectIntent } from "@/services/ai.service"

describe("AI intent detection (FR / AR / Darija / EN)", () => {
  const cases: [string, string][] = [
    ["Quel produit se vend le plus cette semaine ?", "TOP_PRODUCTS"],
    ["What sells the most this month?", "TOP_PRODUCTS"],
    ["شنو أكثر produit تباع هاد السيمانة؟", "TOP_PRODUCTS"],
    ["Quel produit me rapporte le plus ?", "MOST_PROFITABLE"],
    ["Which product earns me the most?", "MOST_PROFITABLE"],
    ["What products are running low?", "LOW_STOCK"],
    ["Quels produits sont en rupture ?", "LOW_STOCK"],
    ["شنو خاصني نشري من supplier؟", "REORDER"],
    ["Que dois-je commander chez le fournisseur ?", "REORDER"],
    ["Pourquoi mes bénéfices ont diminué ce mois-ci ?", "PROFIT_ANALYSIS"],
    ["Why did my profits drop this month?", "PROFIT_ANALYSIS"],
    ["علاش نقصو الأرباح هاد الشهر؟", "PROFIT_ANALYSIS"],
    ["Give me a sales summary for this month.", "SALES_SUMMARY"],
    ["Résumé des ventes de ce mois", "SALES_SUMMARY"],
    ["Combien de dépenses ce mois ?", "EXPENSES"],
    ["Cash vs card this week", "PAYMENT_METHODS"],
    ["Bonjour, ça va ?", "UNKNOWN"],
  ]
  for (const [q, intent] of cases) {
    it(`"${q}" → ${intent}`, () => {
      expect(detectIntent(q).intent).toBe(intent)
    })
  }
  it("detects periods", () => {
    expect(detectIntent("ventes aujourd'hui").preset).toBe("today")
    expect(detectIntent("sales this week").preset).toBe("last7")
    expect(detectIntent("bénéfice du mois dernier").preset).toBe("lastMonth")
    expect(detectIntent("résumé ce mois").preset).toBe("thisMonth")
  })
})
