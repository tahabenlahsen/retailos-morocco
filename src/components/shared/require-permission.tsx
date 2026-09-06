"use client"

import { useTranslation } from "react-i18next"
import { ShieldOff } from "lucide-react"
import { useMe } from "@/hooks/use-me"
import type { Permission } from "@/lib/permissions"
import { EmptyState } from "./empty-state"
import { Skeleton } from "@/components/ui/misc"

/** Client-side guard: renders children only if the user has the permission. Server APIs enforce independently. */
export function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { t } = useTranslation()
  const { me, isLoading } = useMe()
  if (isLoading && !me) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>
  if (!me?.permissions.includes(permission)) return <EmptyState icon={ShieldOff} title={t("errors.FORBIDDEN")} description={t("common.permissionDenied")} className="py-24" />
  return <>{children}</>
}
