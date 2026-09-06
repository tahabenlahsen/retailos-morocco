import type { LucideIcon } from "lucide-react"
import { Inbox } from "lucide-react"
import { cn } from "@/utils/cn"

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-4", className)}>
      <div className="rounded-full bg-muted p-3 mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium">{title}</p>
      {description ? <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
