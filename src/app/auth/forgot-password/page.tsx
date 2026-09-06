"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/shared/form-field"
import { forgotPasswordSchema } from "@/utils/validation"
import { api } from "@/lib/api-client"
import { useApiError } from "@/hooks/use-api-error"

type Form = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const { showError } = useApiError()
  const [sent, setSent] = useState<{ delivered: boolean } | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(forgotPasswordSchema) })

  const onSubmit = async (data: Form) => {
    try {
      setSent(await api.post<{ delivered: boolean }>("/api/auth/forgot-password", data))
    } catch (err) {
      showError(err)
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><MailCheck className="h-6 w-6" /></div>
        <h1 className="text-xl font-bold">{t("auth.resetPassword")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.resetSent")}</p>
        {!sent.delivered ? <p className="text-xs text-amber-700 dark:text-amber-300 bg-warning/20 rounded-md p-2">{t("auth.resetSentDev")}</p> : null}
        <Button asChild variant="outline"><Link href="/auth/signin">{t("auth.signIn")}</Link></Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.resetPassword")}</h1>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField label={t("auth.email")} required error={errors.email && t("common.required")}>{(id, inv) => <Input id={id} type="email" autoComplete="email" autoFocus aria-invalid={inv} {...register("email")} />}</FormField>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>{t("auth.sendResetLink")}</Button>
      </form>
      <p className="text-center text-sm"><Link href="/auth/signin" className="text-primary hover:underline">{t("common.back")}</Link></p>
    </div>
  )
}
