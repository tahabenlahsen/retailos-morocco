"use client"

import { useEffect } from "react"

/** Root error boundary — rendered without providers, so no i18n hooks here. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[root-error]", error.digest ?? error.message)
  }, [error])
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 text-center">
      <div className="space-y-4 max-w-sm">
        <h1 className="text-xl font-semibold">Une erreur s&apos;est produite · حدث خطأ · Something went wrong</h1>
        {error.digest ? <p className="text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
        <button onClick={reset} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground cursor-pointer">Réessayer · إعادة المحاولة · Retry</button>
      </div>
    </div>
  )
}
