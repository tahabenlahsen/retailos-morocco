import Link from "next/link"
import { WifiOff } from "lucide-react"

export const dynamic = "force-static"

export default function OfflinePage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 text-center">
      <div className="space-y-4 max-w-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted"><WifiOff className="h-7 w-7 text-muted-foreground" /></div>
        <h1 className="text-xl font-semibold">Hors ligne · غير متصل · Offline</h1>
        <p className="text-sm text-muted-foreground">Vous êtes hors ligne. Les ventes et le stock nécessitent une connexion. Reconnectez-vous puis réessayez.</p>
        <p className="text-sm text-muted-foreground" dir="rtl">أنت غير متصل بالإنترنت. تحتاج المبيعات والمخزون إلى اتصال. أعد الاتصال ثم حاول مجدداً.</p>
        <Link href="/" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Réessayer · إعادة المحاولة · Retry</Link>
      </div>
    </div>
  )
}
