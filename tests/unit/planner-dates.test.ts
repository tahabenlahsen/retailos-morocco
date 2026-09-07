import { describe, expect, it } from "vitest"
import { plan } from "@/services/planner.service"
import { resolveDateRange, previousRange, daysInRange } from "@/utils/dates"
import { round2 } from "@/utils/money"
import { BUSINESS_TYPES, businessOnboardingSchema, updateBusinessSchema, storePlannerSchema } from "@/utils/validation"
import { serverT } from "@/lib/i18n/server"

describe("store planner", () => {
  const p = plan({ budget: 150000, businessType: "MINI_MARKET", city: "Casablanca", storeSizeM2: 40, expectedDailyCustomers: 120, employees: 1 })
  it("allocates the full budget", () => {
    expect(p.budgetAllocation.total).toBe(150000)
  })
  it("break-even uses fixed costs / gross margin", () => {
    expect(p.projection.breakEvenRevenueHT).toBe(round2(p.recurringMonthly.total / p.assumptions.grossMargin))
  })
  it("net profit = gross profit − fixed costs", () => {
    expect(p.projection.monthlyNetProfit).toBe(round2(p.projection.monthlyGrossProfit - p.recurringMonthly.total))
  })
  it("category budgets sum to inventory budget", () => {
    expect(round2(p.categories.reduce((a, c) => a + c.budget, 0))).toBeCloseTo(p.budgetAllocation.inventoryBudget, 0)
  })
  it("warns when budget is too small", () => {
    const tiny = plan({ budget: 20000, businessType: "ELECTRONICS", city: "Fès", storeSizeM2: 60, expectedDailyCustomers: 20, employees: 2 })
    expect(tiny.budgetAllocation.sufficient).toBe(false)
    expect(tiny.budgetAllocation.warning).toBeTruthy()
  })
  it("always carries a disclaimer", () => {
    expect(p.disclaimer).toMatch(/estimation/i)
  })
})

describe("coffee shop support", () => {
  it("accepts coffee shops during onboarding, settings updates and planning", () => {
    expect(BUSINESS_TYPES).toContain("COFFEE_SHOP")
    expect(businessOnboardingSchema.shape.businessType.parse("COFFEE_SHOP")).toBe("COFFEE_SHOP")
    expect(updateBusinessSchema.parse({ type: "COFFEE_SHOP" }).type).toBe("COFFEE_SHOP")
    expect(storePlannerSchema.shape.businessType.parse("COFFEE_SHOP")).toBe("COFFEE_SHOP")
  })
  it("has a coffee-specific equipment and stock profile, not the generic shop fallback", () => {
    const cafe = plan({ budget: 150000, businessType: "COFFEE_SHOP", city: "Rabat", storeSizeM2: 40, expectedDailyCustomers: 100, employees: 2 })
    expect(cafe.equipment.some((e) => /espresso/i.test(e.item))).toBe(true)
    expect(cafe.categories.some((c) => /café/i.test(c.name))).toBe(true)
    expect(cafe.budgetAllocation.total).toBe(150000)
    expect(cafe.categories.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(1)
    expect(cafe.disclaimer).toMatch(/estimation/i)
  })
  it("labels coffee shops in all supported languages", () => {
    expect(serverT("fr")("onboarding.types.COFFEE_SHOP")).toBe("Café / Coffee shop")
    expect(serverT("en")("onboarding.types.COFFEE_SHOP")).toBe("Coffee shop / Café")
    expect(serverT("ar")("onboarding.types.COFFEE_SHOP")).toBe("مقهى")
  })
})

describe("date ranges", () => {
  const now = new Date(2026, 8, 15, 14, 30) // 15 Sep 2026
  it("today / yesterday", () => {
    const t = resolveDateRange("today", undefined, undefined, now)
    expect(t.from.getDate()).toBe(15)
    expect(t.to.getHours()).toBe(23)
    expect(resolveDateRange("yesterday", undefined, undefined, now).from.getDate()).toBe(14)
  })
  it("last7 spans 7 calendar days", () => {
    expect(daysInRange(resolveDateRange("last7", undefined, undefined, now))).toBe(7)
  })
  it("lastMonth is the full previous month", () => {
    const r = resolveDateRange("lastMonth", undefined, undefined, now)
    expect(r.from.getMonth()).toBe(7)
    expect(r.from.getDate()).toBe(1)
    expect(r.to.getDate()).toBe(31)
  })
  it("previousRange has the same length and ends right before", () => {
    const r = resolveDateRange("last30", undefined, undefined, now)
    const prev = previousRange(r)
    expect(daysInRange(prev)).toBe(30)
    expect(prev.to.getTime()).toBeLessThan(r.from.getTime())
  })
  it("custom requires both bounds", () => {
    expect(() => resolveDateRange("custom")).toThrow()
  })
})
