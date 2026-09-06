"use client"

import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import { Compass, AlertTriangle, Info } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { FormField } from "@/components/shared/form-field"
import { Money } from "@/components/shared/money"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { storePlannerSchema, BUSINESS_TYPES } from "@/utils/validation"
import { api } from "@/lib/api-client"
import { useApiError } from "@/hooks/use-api-error"
import { useLocale } from "@/components/providers/locale-provider"
import type { plan } from "@/services/planner.service"

type Plan = ReturnType<typeof plan>
type In = z.input<typeof storePlannerSchema>
type Out = z.output<typeof storePlannerSchema>

export default function StorePlannerPage() {
  const { t } = useTranslation()
  const { showError } = useApiError()
  const { formatNumber } = useLocale()
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(storePlannerSchema), defaultValues: { budget: 150000, businessType: "MINI_MARKET", city: "Casablanca", storeSizeM2: 40, expectedDailyCustomers: 100, employees: 1 } })
  const { register, handleSubmit, watch, setValue, formState: { errors } } = form
  const m = useMutation({ mutationFn: (v: Out) => api.post<Plan>("/api/planner", v), onError: showError })
  const p = m.data

  return (
    <RequirePermission permission="business.view">
      <PageHeader title={t("planner.title")} description={t("planner.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 h-fit">
          <CardContent className="p-5">
            <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
              <FormField label={t("planner.budget")} required error={errors.budget && t("common.required")}>{(id, inv) => <Input id={id} type="number" min={1000} step={1000} aria-invalid={inv} {...register("budget", { valueAsNumber: true })} />}</FormField>
              <FormField label={t("planner.businessType")}>{(id) => <Select value={watch("businessType")} onValueChange={(v) => setValue("businessType", v as In["businessType"])}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{BUSINESS_TYPES.map((b) => <SelectItem key={b} value={b}>{t(`onboarding.types.${b}`)}</SelectItem>)}</SelectContent></Select>}</FormField>
              <FormField label={t("common.city")} required error={errors.city && t("common.required")}>{(id, inv) => <Input id={id} aria-invalid={inv} {...register("city")} />}</FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t("planner.size")} required error={errors.storeSizeM2 && t("common.required")}>{(id, inv) => <Input id={id} type="number" min={5} aria-invalid={inv} {...register("storeSizeM2", { valueAsNumber: true })} />}</FormField>
                <FormField label={t("planner.customers")} required error={errors.expectedDailyCustomers && t("common.required")}>{(id, inv) => <Input id={id} type="number" min={1} aria-invalid={inv} {...register("expectedDailyCustomers", { valueAsNumber: true })} />}</FormField>
                <FormField label={t("planner.employees")}>{(id) => <Input id={id} type="number" min={0} {...register("employees", { valueAsNumber: true })} />}</FormField>
                <FormField label={t("planner.rent")}>{(id) => <Input id={id} type="number" min={0} {...register("monthlyRent", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} />}</FormField>
              </div>
              <Button type="submit" className="w-full" loading={m.isPending}><Compass className="h-4 w-4" />{t("planner.generate")}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {!p ? <Card><CardContent className="p-12 text-center text-muted-foreground"><Compass className="mx-auto h-10 w-10 mb-3 opacity-40" />{t("planner.subtitle")}</CardContent></Card> : (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-warning/15 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{t("planner.disclaimer")}</div>
              {p.budgetAllocation.warning ? <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{p.budgetAllocation.warning}</div> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Card><CardHeader><CardTitle>{t("planner.allocation")}</CardTitle></CardHeader><CardContent className="text-sm space-y-1.5">
                  {[["planner.essential", p.budgetAllocation.essentialEquipment], ["planner.deposit", p.budgetAllocation.deposit], ["planner.firstRent", p.budgetAllocation.firstMonthRent], ["planner.workingCapital", p.budgetAllocation.workingCapital], ["planner.inventoryBudget", p.budgetAllocation.inventoryBudget]].map(([k, v]) => <div key={String(k)} className="flex justify-between"><span className="text-muted-foreground">{t(String(k))}</span><Money value={Number(v)} /></div>)}
                  <div className="flex justify-between border-t pt-1.5 font-semibold"><span>{t("common.total")}</span><Money value={p.budgetAllocation.total} /></div>
                </CardContent></Card>
                <Card><CardHeader><CardTitle>{t("planner.projection")}</CardTitle></CardHeader><CardContent className="text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("planner.monthlyRevenue")}</span><Money value={p.projection.monthlyRevenueTTC} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("planner.monthlyGross")}</span><Money value={p.projection.monthlyGrossProfit} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("planner.recurring")}</span><Money value={-p.recurringMonthly.total} /></div>
                  <div className="flex justify-between font-semibold border-t pt-1.5"><span>{t("planner.monthlyNet")}</span><Money value={p.projection.monthlyNetProfit} signed /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("planner.breakEven")}</span><Money value={p.projection.breakEvenRevenueHT} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("planner.breakEvenCustomers")}</span><span className={p.projection.breakEvenCustomersPerDay > p.projection.currentCustomersPerDay ? "text-destructive font-medium" : "text-success font-medium"}>{p.projection.breakEvenCustomersPerDay} / {p.projection.currentCustomersPerDay}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("planner.payback")}</span><span>{p.projection.paybackMonths != null ? t("planner.months", { count: p.projection.paybackMonths }) : t("planner.notProfitable")}</span></div>
                </CardContent></Card>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card><CardHeader><CardTitle>{t("planner.categories")}</CardTitle></CardHeader><CardContent className="text-sm space-y-1.5">{p.categories.map((c) => <div key={c.name} className="flex justify-between"><span>{c.name} <span className="text-muted-foreground text-xs">({formatNumber(c.share * 100)}%)</span></span><Money value={c.budget} /></div>)}</CardContent></Card>
                <Card><CardHeader><CardTitle>{t("planner.recurring")}</CardTitle></CardHeader><CardContent className="text-sm space-y-1.5">{p.recurringMonthly.items.map((r) => <div key={r.item} className="flex justify-between"><span className="text-muted-foreground">{r.item}</span><Money value={r.amount} /></div>)}<div className="flex justify-between border-t pt-1.5 font-semibold"><span>{t("common.total")}</span><Money value={p.recurringMonthly.total} /></div></CardContent></Card>
              </div>

              <Card><CardHeader><CardTitle>{t("planner.equipment")}</CardTitle></CardHeader><CardContent className="text-sm divide-y">{p.equipment.map((e) => <div key={e.item} className="flex items-center justify-between py-1.5"><span className="flex items-center gap-2">{e.item}<Badge variant={e.essential ? "default" : "muted"} className="text-[10px]">{e.essential ? t("planner.essential") : t("planner.optional")}</Badge></span><Money value={e.cost} /></div>)}</CardContent></Card>

              <Card><CardHeader><CardTitle className="flex items-center gap-2"><Info className="h-4 w-4" />{t("planner.formulas")}</CardTitle><CardDescription>{t("planner.assumptions")}: {t("planner.customers").toLowerCase()} × {formatNumber(p.assumptions.avgBasket)} DH × {p.assumptions.openDaysPerMonth} j · {t("analytics.grossMargin").toLowerCase()} {formatNumber(p.assumptions.grossMargin * 100)}% · SMIG {formatNumber(p.assumptions.smigMonthly)} DH</CardDescription></CardHeader><CardContent><ul className="text-xs text-muted-foreground space-y-1 list-disc ps-4">{p.formulas.map((f) => <li key={f}>{f}</li>)}</ul></CardContent></Card>
            </>
          )}
        </div>
      </div>
    </RequirePermission>
  )
}
