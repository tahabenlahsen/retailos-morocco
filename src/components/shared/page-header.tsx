import { cn } from "@/utils/cn"

export function PageHeader({ title, description, actions, className }: { title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight truncate">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  )
}
