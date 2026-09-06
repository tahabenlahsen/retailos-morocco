"use client"

import { useTranslation } from "react-i18next"
import { Store, Languages } from "lucide-react"
import { useLocale } from "@/components/providers/locale-provider"
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Store className="h-6 w-6" /></div>
          <span className="text-lg font-semibold">{t("app.name")}</span>
        </div>
        <div className="space-y-4 max-w-md">
          <h2 className="text-3xl font-bold leading-tight">{t("app.tagline")}</h2>
          <ul className="space-y-2 text-primary-foreground/85 text-sm">
            <li>• {t("nav.pos")} · {t("nav.register")} · {t("nav.sales")}</li>
            <li>• {t("nav.products")} · {t("nav.inventory")} · {t("nav.purchases")}</li>
            <li>• {t("nav.analytics")} · {t("nav.ai")} · {t("nav.stores")}</li>
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} RetailOS Morocco</p>
      </div>
      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden"><Store className="h-5 w-5 text-primary" /><span className="font-semibold">{t("app.name")}</span></div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Languages className="h-4 w-4" />{LOCALE_LABELS[locale]}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">{LOCALES.map((l) => <DropdownMenuCheckboxItem key={l} checked={locale === l} onCheckedChange={() => setLocale(l)}>{LOCALE_LABELS[l]}</DropdownMenuCheckboxItem>)}</DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-1 items-center justify-center py-8"><div className="w-full max-w-md">{children}</div></div>
      </div>
    </div>
  )
}
