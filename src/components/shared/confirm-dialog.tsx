"use client"

import { useTranslation } from "react-i18next"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  title?: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => unknown
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive = true, loading, onConfirm }: Props) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? t("common.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{description ?? t("common.deleteConfirmText")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={loading}
            onClick={(e) => {
              e.preventDefault()
              void onConfirm()
            }}
          >
            {confirmLabel ?? (destructive ? t("common.delete") : t("common.confirm"))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
