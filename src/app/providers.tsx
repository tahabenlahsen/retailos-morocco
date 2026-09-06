"use client"

import { useState } from "react"
import { SessionProvider } from "next-auth/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { LocaleProvider } from "@/components/providers/locale-provider"
import type { Locale } from "@/lib/i18n/config"
import { ApiError } from "@/lib/api-client"

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  )
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={false}>
      <QueryClientProvider client={client}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LocaleProvider initialLocale={locale}>
            {children}
            <Toaster position={locale === "ar" ? "top-left" : "top-right"} richColors closeButton dir={locale === "ar" ? "rtl" : "ltr"} />
          </LocaleProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
