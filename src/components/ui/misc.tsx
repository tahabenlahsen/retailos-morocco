"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { Check } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/utils/cn"

// ---------- Tabs ----------
export const Tabs = TabsPrimitive.Root
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn("inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground overflow-x-auto max-w-full", className)} {...props} />
))
TabsList.displayName = "TabsList"
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs cursor-pointer", className)} {...props} />
))
TabsTrigger.displayName = "TabsTrigger"
export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-4 ring-offset-background focus-visible:outline-none", className)} {...props} />
))
TabsContent.displayName = "TabsContent"

// ---------- Switch ----------
export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root className={cn("peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", className)} {...props} ref={ref}>
    <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5 data-[state=unchecked]:translate-x-0" />
  </SwitchPrimitive.Root>
))
Switch.displayName = "Switch"

// ---------- Checkbox ----------
export const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root ref={ref} className={cn("peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground cursor-pointer", className)} {...props}>
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current"><Check className="h-3.5 w-3.5" /></CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = "Checkbox"

// ---------- Tooltip ----------
export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger
export const TooltipContent = React.forwardRef<React.ElementRef<typeof TooltipPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn("z-50 overflow-hidden rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95", className)} {...props} />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = "TooltipContent"

// ---------- Separator ----------
export const Separator = React.forwardRef<React.ElementRef<typeof SeparatorPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root ref={ref} decorative={decorative} orientation={orientation} className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)} {...props} />
))
Separator.displayName = "Separator"

// ---------- Badge ----------
const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      destructive: "border-transparent bg-destructive/10 text-destructive",
      success: "border-transparent bg-success/15 text-success",
      warning: "border-transparent bg-warning/20 text-amber-800 dark:text-amber-300",
      outline: "text-foreground",
      muted: "border-transparent bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
})
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

// ---------- Skeleton ----------
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}

// ---------- Avatar (initials) ----------
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
  return <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold", className)}>{initials || "?"}</div>
}
