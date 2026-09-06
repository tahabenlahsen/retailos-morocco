"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { useApiError } from "./use-api-error"

/**
 * Generic create/update/delete mutations for a REST resource, with toast feedback
 * and query invalidation of the given keys.
 */
export function useCrud<TCreate, TUpdate = Partial<TCreate>>(basePath: string, invalidateKeys: readonly (readonly unknown[])[]) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { showError } = useApiError()
  const invalidate = () => Promise.all(invalidateKeys.map((k) => qc.invalidateQueries({ queryKey: [...k] })))

  const create = useMutation({
    mutationFn: (body: TCreate) => api.post(basePath, body),
    onSuccess: async () => {
      await invalidate()
      toast.success(t("common.saved"))
    },
    onError: showError,
  })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TUpdate }) => api.patch(`${basePath}/${id}`, body),
    onSuccess: async () => {
      await invalidate()
      toast.success(t("common.saved"))
    },
    onError: showError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${basePath}/${id}`),
    onSuccess: async () => {
      await invalidate()
      toast.success(t("common.deleted"))
    },
    onError: showError,
  })
  return { create, update, remove, invalidate }
}
