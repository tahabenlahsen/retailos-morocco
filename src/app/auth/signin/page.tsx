"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/shared/form-field"
import { signInSchema } from "@/utils/validation"

type Form = z.infer<typeof signInSchema>

function SignInForm() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(signInSchema) })

  const onSubmit = async (data: Form) => {
    setError(null)
    const res = await signIn("credentials", { ...data, redirect: false })
    if (res?.error) {
      setError(res.error === "RATE_LIMITED" ? t("auth.rateLimited") : res.error === "ACCOUNT_INACTIVE" ? t("auth.accountInactive") : t("auth.invalidCredentials"))
      return
    }
    const cb = params.get("callbackUrl")
    router.push(cb && cb.startsWith("/") ? cb : "/")
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.welcomeBack")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("auth.signInSubtitle")}</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error ? <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
        <FormField label={t("auth.email")} error={errors.email && t("common.required")}>
          {(id, invalid) => <Input id={id} type="email" autoComplete="email" autoFocus aria-invalid={invalid} {...register("email")} />}
        </FormField>
        <FormField label={t("auth.password")} error={errors.password && t("common.required")}>
          {(id, invalid) => <Input id={id} type="password" autoComplete="current-password" aria-invalid={invalid} {...register("password")} />}
        </FormField>
        <div className="flex justify-end"><Link href="/auth/forgot-password" className="text-sm text-primary hover:underline">{t("auth.forgotPassword")}</Link></div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>{t("auth.signIn")}</Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">{t("auth.noAccount")} <Link href="/auth/signup" className="text-primary font-medium hover:underline">{t("auth.signUp")}</Link></p>
    </div>
  )
}

export default function SignInPage() {
  return <Suspense><SignInForm /></Suspense>
}
