"use client"

import { Fragment, useEffect, useState, useSyncExternalStore } from "react"
import { SessionProvider, useSession } from "next-auth/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { LocaleProvider } from "@/components/providers/locale-provider"
import type { Locale } from "@/lib/i18n/config"
import { api, ApiError } from "@/lib/api-client"
import { clearOfflineIdentity, getIdentityGeneration, getOfflineIdentity, IDENTITY_INVALIDATED_KEY, sameOwner, subscribeOfflineIdentity } from "@/lib/offline/identity"

/** Session data alone never grants offline authority: /api/me must succeed against the server. */
function OfflineSessionLifecycle({ client }: { client: QueryClient }) {
  const { data: session, status } = useSession()
  useEffect(() => {
    let previous = getOfflineIdentity()
    const unsubscribe = subscribeOfflineIdentity(() => {
      const current = getOfflineIdentity()
      if (previous && !sameOwner(previous, current)) client.clear()
      previous = current
    })
    const onStorage = (event: StorageEvent) => {
      if (event.key === IDENTITY_INVALIDATED_KEY || event.key === "nextauth.message") clearOfflineIdentity(false)
    }
    window.addEventListener("storage", onStorage)
    return () => { unsubscribe(); window.removeEventListener("storage", onStorage) }
  }, [client])
  useEffect(() => {
    if (status === "unauthenticated") {
      if (getOfflineIdentity()) {
        clearOfflineIdentity()
        client.clear()
      }
    } else if (status === "authenticated") {
      const current = getOfflineIdentity()
      if (current && !sameOwner(current, { userId: session.user.id, businessId: session.user.businessId })) clearOfflineIdentity()
      // Network failure preserves only the authority already verified in this running tab.
      void api.getFresh("/api/me").catch(() => undefined)
    }
  }, [status, session?.user.id, session?.user.businessId, client, session])
  return null
}

/** Drop component-local sensitive state (including unfinished carts) on logout/account change. */
function OfflineIdentityBoundary({ children }: { children: React.ReactNode }) {
  const generation = useSyncExternalStore(subscribeOfflineIdentity, getIdentityGeneration, () => 0)
  return <Fragment key={generation}>{children}</Fragment>
}

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
            refetchOnWindowFocus: false,
            // Offline support lives in the API client (IndexedDB read-through + sale queue), so
            // queries/mutations must run even when navigator.onLine is false instead of pausing.
            networkMode: "always",
          },
          mutations: { networkMode: "always" },
        },
      })
  )
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <QueryClientProvider client={client}>
        <OfflineSessionLifecycle client={client} />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LocaleProvider initialLocale={locale}>
            <OfflineIdentityBoundary>{children}</OfflineIdentityBoundary>
            <Toaster position={locale === "ar" ? "top-left" : "top-right"} richColors closeButton dir={locale === "ar" ? "rtl" : "ltr"} />
          </LocaleProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
