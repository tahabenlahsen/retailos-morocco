import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 text-center">
      <div className="space-y-4">
        <p className="text-6xl font-bold text-primary">404</p>
        <h1 className="text-xl font-semibold">Page introuvable · الصفحة غير موجودة · Page not found</h1>
        <Link href="/" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">RetailOS Morocco</Link>
      </div>
    </div>
  )
}
