"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormField } from "@/components/shared/form-field"
import { businessOnboardingSchema, BUSINESS_TYPES } from "@/utils/validation"
import { api } from "@/lib/api-client"
import { useApiError } from "@/hooks/use-api-error"
import { cn } from "@/utils/cn"

type Form = z.input<typeof businessOnboardingSchema>
type FormOut = z.output<typeof businessOnboardingSchema>
const STEP_FIELDS: (keyof Form)[][] = [["businessName", "businessType", "ownerName"], ["phone", "email", "city", "address", "taxRate"], ["storeName"]]

export default function OnboardingPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { data: session, update } = useSession()
  const { showError } = useApiError()
  const [step, setStep] = useState(0)
  const form = useForm<Form, unknown, FormOut>({
    resolver: zodResolver(businessOnboardingSchema),
    defaultValues: { businessType: "MINI_MARKET", currency: "MAD", taxRate: 0.2, email: session?.user?.email ?? "", ownerName: session?.user?.name ?? "" },
  })
  const { register, handleSubmit, trigger, watch, setValue, formState: { errors, isSubmitting } } = form

  const next = async () => {
    if (await trigger(STEP_FIELDS[step])) setStep((s) => s + 1)
  }

  const onSubmit = async (data: FormOut) => {
    try {
      await api.post("/api/business/onboarding", data)
      await update() // refresh JWT `onboarded` flag
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      showError(err)
    }
  }

  const steps = [t("onboarding.step1"), t("onboarding.step2"), t("onboarding.step3")]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("onboarding.subtitle")}</p>
      </div>
      <ol className="flex items-center gap-2 text-xs">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2 flex-1">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", i < step ? "bg-primary border-primary text-primary-foreground" : i === step ? "border-primary text-primary" : "text-muted-foreground")}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
            <span className={cn("truncate", i === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {i < steps.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {step === 0 ? (
          <>
            <FormField label={t("onboarding.businessName")} required error={errors.businessName && t("common.required")}>{(id, inv) => <Input id={id} autoFocus aria-invalid={inv} {...register("businessName")} />}</FormField>
            <FormField label={t("onboarding.businessType")} required>
              {(id) => (
                <Select value={watch("businessType")} onValueChange={(v) => setValue("businessType", v as Form["businessType"])}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{BUSINESS_TYPES.map((bt) => <SelectItem key={bt} value={bt}>{t(`onboarding.types.${bt}`)}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label={t("onboarding.ownerName")} required error={errors.ownerName && t("common.required")}>{(id, inv) => <Input id={id} aria-invalid={inv} {...register("ownerName")} />}</FormField>
          </>
        ) : step === 1 ? (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label={t("common.phone")} required error={errors.phone && t("common.required")}>{(id, inv) => <Input id={id} type="tel" placeholder="+212 5…" aria-invalid={inv} {...register("phone")} />}</FormField>
              <FormField label={t("common.email")} required error={errors.email && t("common.required")}>{(id, inv) => <Input id={id} type="email" aria-invalid={inv} {...register("email")} />}</FormField>
            </div>
            <FormField label={t("common.city")} required error={errors.city && t("common.required")}>{(id, inv) => <Input id={id} aria-invalid={inv} {...register("city")} />}</FormField>
            <FormField label={`${t("common.address")} (${t("common.optional")})`}>{(id) => <Input id={id} {...register("address")} />}</FormField>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label={t("onboarding.taxRate")} hint="20% = 0.2" error={errors.taxRate && t("common.required")}>{(id, inv) => <Input id={id} type="number" step="0.01" min={0} max={1} aria-invalid={inv} {...register("taxRate", { valueAsNumber: true })} />}</FormField>
              <FormField label={t("onboarding.currency")}>{(id) => <Input id={id} readOnly {...register("currency")} />}</FormField>
            </div>
          </>
        ) : (
          <FormField label={t("onboarding.storeName")} required hint={t("onboarding.storeNameHint")} error={errors.storeName && t("common.required")}>{(id, inv) => <Input id={id} autoFocus aria-invalid={inv} {...register("storeName")} />}</FormField>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t("common.back")}</Button>
          {step < 2 ? <Button type="button" onClick={next}>{t("common.next")}</Button> : <Button type="submit" loading={isSubmitting}>{t("onboarding.finish")}</Button>}
        </div>
      </form>
    </div>
  )
}
