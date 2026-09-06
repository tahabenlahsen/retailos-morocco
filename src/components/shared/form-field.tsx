"use client"

import { useId } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/utils/cn"

interface Props {
  label: React.ReactNode
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: (id: string, invalid: boolean) => React.ReactNode
}

/** Accessible label + control + error wrapper. */
export function FormField({ label, error, hint, required, className, children }: Props) {
  const id = useId()
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive ms-0.5">*</span> : null}
      </Label>
      {children(id, !!error)}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
