"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/shared/form-field"
import { signUpSchema } from "@/utils/validation"
import { api, ApiError } from "@/lib/api-client"
import { useLocale } from "@/components/providers/locale-provider"

const schema = signUpSchema.omit({ locale: true }).extend({ confirmPassword: z.string() }).refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "mismatch" })
type Form = z.infer<typeof schema>

export default function SignUpPage() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Form) => {
    setError(null)
    try {
      const { confirmPassword: _c, ...payload } = data
      await api.post("/api/auth/signup", { ...payload, locale })
      const res = await signIn("credentials", { email: data.email, password: data.password, redirect: false })
      if (res?.error) throw new Error(res.error)
      router.push("/auth/onboarding")
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") setError(t("auth.emailExists"))
      else if (err instanceof ApiError && err.code === "RATE_LIMITED") setError(t("auth.rateLimited"))
      else setError(t("common.unknownError"))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.signUp")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("auth.signUpSubtitle")}</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error ? <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t("auth.firstName")} required error={errors.firstName && t("common.required")}>{(id, inv) => <Input id={id} autoComplete="given-name" aria-invalid={inv} {...register("firstName")} />}</FormField>
          <FormField label={t("auth.lastName")} required error={errors.lastName && t("common.required")}>{(id, inv) => <Input id={id} autoComplete="family-name" aria-invalid={inv} {...register("lastName")} />}</FormField>
        </div>
        <FormField label={t("auth.email")} required error={errors.email && t("common.required")}>{(id, inv) => <Input id={id} type="email" autoComplete="email" aria-invalid={inv} {...register("email")} />}</FormField>
        <FormField label={`${t("common.phone")} (${t("common.optional")})`} error={errors.phone && t("common.required")}>{(id, inv) => <Input id={id} type="tel" autoComplete="tel" placeholder="+212 6…" aria-invalid={inv} {...register("phone")} />}</FormField>
        <FormField label={t("auth.password")} required hint={t("auth.passwordRules")} error={errors.password && t("auth.passwordRules")}>{(id, inv) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={inv} {...register("password")} />}</FormField>
        <FormField label={t("auth.confirmPassword")} required error={errors.confirmPassword && t("auth.passwordsMismatch")}>{(id, inv) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={inv} {...register("confirmPassword")} />}</FormField>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>{t("auth.signUp")}</Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">{t("auth.haveAccount")} <Link href="/auth/signin" className="text-primary font-medium hover:underline">{t("auth.signIn")}</Link></p>
    </div>
  )
}
