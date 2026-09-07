"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { Permission } from "@/lib/permissions"

export interface Me {
  user: { id: string; email: string; firstName: string; lastName: string; phone: string | null; avatar: string | null; lastLoginAt: string | null }
  business: { id: string; name: string; type: string; currency: string; taxRate: number; logo: string | null; onboarded: boolean; subscriptionPlan: string }
  stores: { id: string; name: string; city: string; address?: string | null; phone?: string | null; isActive: boolean }[]
  role: string
  permissions: Permission[]
}

export const ME_KEY = ["me"] as const

export function useMe() {
  const q = useQuery({ queryKey: ME_KEY, queryFn: () => api.get<Me>("/api/me"), staleTime: 5 * 60_000 })
  const can = (p: Permission) => q.data?.permissions.includes(p) ?? false
  return { ...q, me: q.data, can }
}
