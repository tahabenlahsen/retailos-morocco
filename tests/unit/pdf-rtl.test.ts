import { describe, it, expect } from "vitest"
import { visualRtl, toCsv } from "@/lib/pdf"

describe("visualRtl (pdfkit word-order fix for Arabic)", () => {
  it("leaves Latin text untouched", () => {
    expect(visualRtl("Compte de résultat (TTC)")).toBe("Compte de résultat (TTC)")
    expect(visualRtl("17 879,00 MAD")).toBe("17 879,00 MAD")
  })
  it("reverses the word order of Arabic phrases", () => {
    expect(visualRtl("حساب النتائج")).toBe("النتائج حساب")
  })
  it("keeps Latin/number runs intact and places them as one block", () => {
    // "الربح الإجمالي (11,74 %)" → number block first (leftmost), then Arabic words reversed
    expect(visualRtl("الربح الإجمالي (11,74 %)")).toBe("(11,74 %) الإجمالي الربح")
  })
  it("mirrors brackets inside Arabic runs", () => {
    expect(visualRtl("المبيعات (مع الضريبة)")).toBe("الضريبة( )مع المبيعات")
  })
  it("attaches neutral punctuation to the current run and pads RTL→LTR boundaries", () => {
    // trailing double space compensates for fontkit moving the Arabic word's space to its left
    expect(visualRtl("المتاجر · 2026")).toBe("2026 · المتاجر")
    expect(visualRtl("09/08/2026 – 07/09/2026 · جميع المتاجر")).toBe("المتاجر جميع  09/08/2026 – 07/09/2026 ·")
  })
})

describe("toCsv", () => {
  it("adds a BOM, uses ; and quotes fields containing separators or quotes", () => {
    const csv = toCsv(["a", "b"], [["x;y", 'he said "hi"'], [1, null]])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('a;b\r\n"x;y";"he said ""hi"""\r\n1;')
  })
})
