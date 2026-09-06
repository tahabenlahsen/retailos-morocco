import { describe, expect, it } from "vitest"
import { computeLine, percent, round2, sum } from "@/utils/money"

describe("money", () => {
  it("round2 avoids floating point drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(19.999)).toBe(20)
  })
  it("sum rounds the aggregate", () => {
    expect(sum([0.1, 0.2, 0.3])).toBe(0.6)
    expect(sum([])).toBe(0)
  })
  it("computeLine derives HT base and tax from a TTC price", () => {
    const l = computeLine(2, 6, 0, 0.2) // 2 × 6 DH TTC
    expect(l.total).toBe(12)
    expect(l.subtotal).toBe(10)
    expect(l.taxAmount).toBe(2)
  })
  it("computeLine applies line discount and never goes negative", () => {
    expect(computeLine(1, 10, 3, 0.2).total).toBe(7)
    expect(computeLine(1, 10, 50, 0.2).total).toBe(0)
  })
  it("computeLine subtotal + tax equals total", () => {
    for (const [q, p, d, r] of [[3, 7.99, 0, 0.2], [1, 19.9, 2.5, 0.1], [7, 3.33, 0, 0.14], [2, 0.5, 0.25, 0.2]]) {
      const l = computeLine(q, p, d, r)
      expect(round2(l.subtotal + l.taxAmount)).toBe(l.total)
    }
  })
  it("percent handles zero denominators", () => {
    expect(percent(50, 200)).toBe(25)
    expect(percent(1, 0)).toBe(0)
  })
})
