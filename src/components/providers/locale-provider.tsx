"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { I18nextProvider } from "react-i18next"
import i18n, { COOKIE_KEY, DEFAULT_LOCALE, INTL_LOCALES, STORAGE_KEY, dirFor, isLocale, type Locale } from "@/lib/i18n"

interface LocaleContextValue {
  locale: Locale
  dir: "rtl" | "ltr"
  setLocale: (l: Locale) => void
  formatMoney: (v: number, currency?: string) => string
  formatNumber: (v: number, opts?: Intl.NumberFormatOptions) => string
  formatDate: (d: Date | string, opts?: Intl.DateTimeFormatOptions) => string
  formatDateTime: (d: Date | string) => string
  formatRelative: (d: Date | string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE)

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale)
    document.documentElement.lang = locale
    document.documentElement.dir = dirFor(locale)
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    if (!isLocale(l)) return
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {}
    document.cookie = `${COOKIE_KEY}=${l}; path=/; max-age=31536000; samesite=lax`
  }, [])

  const value = useMemo<LocaleContextValue>(() => {
    const intl = INTL_LOCALES[locale]
    const money = new Intl.NumberFormat(intl, { style: "currency", currency: "MAD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const num = new Intl.NumberFormat(intl)
    const date = new Intl.DateTimeFormat(intl, { dateStyle: "medium" })
    const dateTime = new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short" })
    const rel = new Intl.RelativeTimeFormat(intl, { numeric: "auto" })
    return {
      locale,
      dir: dirFor(locale),
      setLocale,
      formatMoney: (v, currency) => (currency && currency !== "MAD" ? new Intl.NumberFormat(intl, { style: "currency", currency }).format(v) : money.format(v)),
      formatNumber: (v, opts) => (opts ? new Intl.NumberFormat(intl, opts).format(v) : num.format(v)),
      formatDate: (d, opts) => (opts ? new Intl.DateTimeFormat(intl, opts).format(new Date(d)) : date.format(new Date(d))),
      formatDateTime: (d) => dateTime.format(new Date(d)),
      formatRelative: (d) => {
        const diff = (new Date(d).getTime() - Date.now()) / 1000
        const abs = Math.abs(diff)
        if (abs < 60) return rel.format(Math.round(diff), "second")
        if (abs < 3600) return rel.format(Math.round(diff / 60), "minute")
        if (abs < 86400) return rel.format(Math.round(diff / 3600), "hour")
        return rel.format(Math.round(diff / 86400), "day")
      },
    }
  }, [locale, setLocale])

  return (
    <LocaleContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider")
  return ctx
}
