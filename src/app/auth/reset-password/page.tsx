"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/shared/form-field"
import { passwordSchema } from "@/utils/validation"
import { api, ApiError } from "@/lib/api-client"

const schema = z.object({ password: passwordSchema, confirmPassword: z.string() }).refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "mismatch" })
type Form = z.infer<typeof schema>

function ResetForm() {
  const { t } = useTranslation()
  const token = useSearchParams().get("token") ?? ""
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Form) => {
    setError(null)
    try {
      await api.post("/api/auth/reset-password", { token, password: data.password })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError && err.code === "VALIDATION_ERROR" ? t("auth.invalidToken") : t("common.unknownError"))
    }
  }

  if (!token) return <p className="text-sm text-destructive">{t("auth.invalidToken")}</p>
  if (done) return (
    <div className="space-y-4 text-center">
      <h1 className="text-xl font-bold">{t("auth.resetPassword")}</h1>
      <p className="text-sm text-muted-foreground">{t("auth.resetDone")}</p>
      <Button asChild><Link href="/auth/signin">{t("auth.signIn")}</Link></Button>
    </div>
  )
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("auth.resetPassword")}</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error ? <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
        <FormField label={t("auth.newPassword")} required hint={t("auth.passwordRules")} error={errors.password && t("auth.passwordRules")}>{(id, inv) => <Input id={id} type="password" autoComplete="new-password" autoFocus aria-invalid={inv} {...register("password")} />}</FormField>
        <FormField label={t("auth.confirmPassword")} required error={errors.confirmPassword && t("auth.passwordsMismatch")}>{(id, inv) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={inv} {...register("confirmPassword")} />}</FormField>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>{t("auth.resetPassword")}</Button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>
}
