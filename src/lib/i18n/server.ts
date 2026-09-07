/**
 * Server-side translation for generated documents (PDF/CSV). Plain dictionary lookup with
 * {{var}} interpolation — no react-i18next, so it is safe in route handlers and services.
 */
import fr from "./fr"
import en from "./en"
import ar from "./ar"
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "./config"

const DICTS: Record<Locale, unknown> = { fr, en, ar }

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === "string" ? cur : undefined
}

export function serverT(locale: Locale) {
  const dict = DICTS[locale] ?? DICTS[DEFAULT_LOCALE]
  return (key: string, vars: Record<string, string | number> = {}): string => {
    const raw = lookup(dict, key) ?? lookup(DICTS[DEFAULT_LOCALE], key) ?? key
    return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{{${k}}}`))
  }
}

/**
 * Intl output for Arabic locales embeds bidi control marks (U+200E/U+200F) and the Arabic comma
 * (U+060C) in dates/numbers. Browsers use them for reordering; PDF layout does not, so strip them
 * to keep dates and amounts as plain left-to-right tokens.
 */
const clean = (s: string) => s.replace(/[\u200e\u200f\u061c]/g, "").replace(/\u060c/g, ",")

export function serverFormatters(locale: Locale) {
  const intl = INTL_LOCALES[locale] ?? INTL_LOCALES[DEFAULT_LOCALE]
  const money = new Intl.NumberFormat(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const num = new Intl.NumberFormat(intl, { maximumFractionDigits: 2 })
  const date = new Intl.DateTimeFormat(intl, { dateStyle: "medium" })
  const dateTime = new Intl.DateTimeFormat(intl, { dateStyle: "short", timeStyle: "short" })
  return {
    money: (v: number) => `${clean(money.format(v))} MAD`,
    num: (v: number) => clean(num.format(v)),
    pct: (v: number | null | undefined) => (v == null ? "—" : `${clean(num.format(v))} %`),
    date: (d: Date | string) => clean(date.format(new Date(d))),
    dateTime: (d: Date | string) => clean(dateTime.format(new Date(d))),
  }
}
