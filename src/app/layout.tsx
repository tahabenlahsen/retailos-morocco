import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { cookies } from "next/headers"
import "./globals.css"
import { Providers } from "./providers"
import { COOKIE_KEY, DEFAULT_LOCALE, dirFor, isLocale, type Locale } from "@/lib/i18n/config"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "RetailOS Morocco", template: "%s · RetailOS Morocco" },
  description: "Système de gestion complet pour les commerces marocains : caisse, stock, achats, dépenses, analytique.",
  applicationName: "RetailOS Morocco",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "RetailOS" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#151821" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieLocale = (await cookies()).get(COOKIE_KEY)?.value
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
  return (
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  )
}
