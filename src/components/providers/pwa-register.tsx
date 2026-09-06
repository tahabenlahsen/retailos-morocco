"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/** Registers the service worker (production only) and shows a dismissible install banner. */
export function PwaRegister() {
  const { t } = useTranslation()
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  // The banner is only ever shown after a client-side `beforeinstallprompt`, so reading
  // localStorage in the initializer cannot cause a hydration mismatch.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("retailos.installDismissed") === "1"
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("[pwa] sw registration failed", e))
    }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  if (!installEvt || dismissed) return null
  return (
    <div className="fixed bottom-20 lg:bottom-4 inset-x-4 lg:inset-x-auto lg:end-4 z-40 flex items-center gap-3 rounded-xl border bg-card p-3 shadow-lg no-print max-w-sm">
      <Download className="h-5 w-5 text-primary shrink-0" />
      <p className="text-sm flex-1">{t("pwa.install")}</p>
      <Button size="sm" onClick={() => void installEvt.prompt().then(() => setInstallEvt(null))}>{t("pwa.install")}</Button>
      <Button size="icon-sm" variant="ghost" onClick={() => { setDismissed(true); try { localStorage.setItem("retailos.installDismissed", "1") } catch {} }} aria-label={t("common.close")}><X /></Button>
    </div>
  )
}
