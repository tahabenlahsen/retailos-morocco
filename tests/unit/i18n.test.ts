import { describe, expect, it } from "vitest"
import fr from "@/lib/i18n/fr"
import en from "@/lib/i18n/en"
import ar from "@/lib/i18n/ar"

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe("i18n completeness", () => {
  const frKeys = flatten(fr).sort()
  for (const [name, dict] of [["en", en], ["ar", ar]] as const) {
    it(`${name} has exactly the same keys as fr`, () => {
      const keys = flatten(dict as Record<string, unknown>).sort()
      const missing = frKeys.filter((k) => !keys.includes(k))
      const extra = keys.filter((k) => !frKeys.includes(k))
      expect(missing, `missing in ${name}`).toEqual([])
      expect(extra, `extra in ${name}`).toEqual([])
    })
  }
  it("no empty translations", () => {
    for (const dict of [fr, en, ar]) {
      const empties = Object.entries(Object.fromEntries(flatten(dict as Record<string, unknown>).map((k) => [k, k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], dict)])))
        .filter(([, v]) => typeof v !== "string" || !v.trim())
        .map(([k]) => k)
      expect(empties).toEqual([])
    }
  })
  it("interpolation placeholders match across locales", () => {
    const placeholders = (s: unknown) => (typeof s === "string" ? (s.match(/\{\{\w+\}\}/g) ?? []).sort() : [])
    for (const key of frKeys) {
      const get = (d: Record<string, unknown>) => key.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], d)
      expect(placeholders(get(en as Record<string, unknown>)), key).toEqual(placeholders(get(fr)))
      expect(placeholders(get(ar as Record<string, unknown>)), key).toEqual(placeholders(get(fr)))
    }
  })
})
