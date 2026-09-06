/** Locale constants safe to import from Server Components (no react-i18next import). */
export const LOCALES = ["fr", "ar", "en"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "fr"
export const RTL_LOCALES: Locale[] = ["ar"]
export const LOCALE_LABELS: Record<Locale, string> = { fr: "Français", ar: "العربية", en: "English" }
export const INTL_LOCALES: Record<Locale, string> = { fr: "fr-MA", ar: "ar-MA", en: "en-US" }
export const STORAGE_KEY = "retailos.locale"
export const COOKIE_KEY = "retailos_locale"

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v)
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr"
}
