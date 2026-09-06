import { Skeleton } from "@/components/ui/misc"

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-32" /></div>
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-80" />
    </div>
  )
}
