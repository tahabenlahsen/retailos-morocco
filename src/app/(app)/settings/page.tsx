"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { Building2, User, Shield, Palette, ScrollText, Plug } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { FormField } from "@/components/shared/form-field"
import { DataTable, type Column } from "@/components/shared/data-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMe, ME_KEY } from "@/hooks/use-me"
import { useLocale } from "@/components/providers/locale-provider"
import { useApiError } from "@/hooks/use-api-error"
import { api, type Paginated } from "@/lib/api-client"
import { updateBusinessSchema, changePasswordSchema, BUSINESS_TYPES } from "@/utils/validation"
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config"

interface Business { id: string; name: string; type: string; ownerName: string; phone: string; email: string; city: string; address: string | null; currency: string; taxRate: number; logo: string | null; subscriptionPlan: string; status: string; createdAt: string; _count: { stores: number; users: number } }
interface AuditRow { id: string; action: string; entityType: string; entityId: string; createdAt: string; ipAddress: string | null; metadata: Record<string, unknown> | null; user: { firstName: string; lastName: string; email: string } | null }
type BizIn = z.input<typeof updateBusinessSchema>
type PwdIn = z.input<typeof changePasswordSchema>

function BusinessTab() {
  const { t } = useTranslation()
  const { can } = useMe()
  const { showError } = useApiError()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["business"], queryFn: () => api.get<Business>("/api/business") })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<BizIn>({ resolver: zodResolver(updateBusinessSchema) })
  useEffect(() => { if (q.data) reset({ name: q.data.name, type: q.data.type as BizIn["type"], ownerName: q.data.ownerName, phone: q.data.phone, email: q.data.email, city: q.data.city, address: q.data.address ?? "", logo: q.data.logo ?? "", taxRate: q.data.taxRate }) }, [q.data, reset])
  const m = useMutation({ mutationFn: (v: BizIn) => api.patch("/api/business", { ...v, logo: v.logo || null }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["business"] }); void qc.invalidateQueries({ queryKey: [...ME_KEY] }); toast.success(t("common.saved")) }, onError: showError })
  const ro = !can("business.update")
  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.business")}</CardTitle>{q.data ? <CardDescription>{t("settings.plan")}: <Badge variant="secondary">{q.data.subscriptionPlan}</Badge> · {q.data._count.stores} {t("nav.stores").toLowerCase()} · {q.data._count.users} {t("nav.employees").toLowerCase()}</CardDescription> : null}</CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => m.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <FormField label={t("onboarding.businessName")} required error={errors.name && t("common.required")}>{(id, inv) => <Input id={id} readOnly={ro} aria-invalid={inv} {...register("name")} />}</FormField>
          <FormField label={t("onboarding.businessType")}>{(id) => <Select value={watch("type") ?? ""} onValueChange={(v) => setValue("type", v as BizIn["type"])} disabled={ro}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{BUSINESS_TYPES.map((b) => <SelectItem key={b} value={b}>{t(`onboarding.types.${b}`)}</SelectItem>)}</SelectContent></Select>}</FormField>
          <FormField label={t("onboarding.ownerName")} error={errors.ownerName && t("common.required")}>{(id, inv) => <Input id={id} readOnly={ro} aria-invalid={inv} {...register("ownerName")} />}</FormField>
          <FormField label={t("common.phone")} error={errors.phone && t("common.required")}>{(id, inv) => <Input id={id} type="tel" readOnly={ro} aria-invalid={inv} {...register("phone")} />}</FormField>
          <FormField label={t("common.email")} error={errors.email && t("common.required")}>{(id, inv) => <Input id={id} type="email" readOnly={ro} aria-invalid={inv} {...register("email")} />}</FormField>
          <FormField label={t("common.city")} error={errors.city && t("common.required")}>{(id, inv) => <Input id={id} readOnly={ro} aria-invalid={inv} {...register("city")} />}</FormField>
          <FormField label={t("common.address")} className="sm:col-span-2">{(id) => <Input id={id} readOnly={ro} {...register("address")} />}</FormField>
          <FormField label={t("onboarding.taxRate")} hint="0.2 = 20%" error={errors.taxRate && t("common.required")}>{(id, inv) => <Input id={id} type="number" step="0.01" min={0} max={1} readOnly={ro} aria-invalid={inv} {...register("taxRate", { valueAsNumber: true })} />}</FormField>
          <FormField label={t("settings.logo")} error={errors.logo && "URL"}>{(id, inv) => <Input id={id} type="url" readOnly={ro} aria-invalid={inv} {...register("logo")} />}</FormField>
          {!ro ? <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={m.isPending}>{t("common.save")}</Button></div> : null}
        </form>
      </CardContent>
    </Card>
  )
}

function ProfileTab() {
  const { t } = useTranslation()
  const { me } = useMe()
  const { showError } = useApiError()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PwdIn>({ resolver: zodResolver(changePasswordSchema) })
  const m = useMutation({ mutationFn: (v: PwdIn) => api.post("/api/me", v), onSuccess: () => { reset(); toast.success(t("auth.passwordChanged")) }, onError: showError })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>{t("settings.profile")}</CardTitle></CardHeader><CardContent className="text-sm space-y-2">
        <div className="flex justify-between"><span className="text-muted-foreground">{t("common.name")}</span><span>{me?.user.firstName} {me?.user.lastName}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">{t("common.email")}</span><span>{me?.user.email}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">{t("employees.role")}</span><Badge variant="secondary">{me ? t(`employees.roles.${me.role}`) : ""}</Badge></div>
        <div className="flex justify-between"><span className="text-muted-foreground">{t("employees.stores")}</span><span className="text-end">{me?.stores.map((s) => s.name).join(", ")}</span></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4" />{t("auth.changePassword")}</CardTitle></CardHeader><CardContent>
        <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
          <FormField label={t("auth.currentPassword")} required error={errors.currentPassword && t("common.required")}>{(id, inv) => <Input id={id} type="password" autoComplete="current-password" aria-invalid={inv} {...register("currentPassword")} />}</FormField>
          <FormField label={t("auth.newPassword")} required hint={t("auth.passwordRules")} error={errors.newPassword && t("auth.passwordRules")}>{(id, inv) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={inv} {...register("newPassword")} />}</FormField>
          <Button type="submit" loading={m.isPending}>{t("auth.changePassword")}</Button>
        </form>
      </CardContent></Card>
    </div>
  )
}

function AppearanceTab() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  return (
    <Card><CardHeader><CardTitle>{t("settings.appearance")}</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <FormField label={t("common.language")}>{(id) => <Select value={locale} onValueChange={(v) => setLocale(v as typeof locale)}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{LOCALES.map((l) => <SelectItem key={l} value={l}>{LOCALE_LABELS[l]}</SelectItem>)}</SelectContent></Select>}</FormField>
      <FormField label={t("common.theme")}>{(id) => <Select value={theme ?? "system"} onValueChange={setTheme}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{["light", "dark", "system"].map((x) => <SelectItem key={x} value={x}>{t(`common.${x}`)}</SelectItem>)}</SelectContent></Select>}</FormField>
    </CardContent></Card>
  )
}

function AuditTab() {
  const { t } = useTranslation()
  const { formatDateTime } = useLocale()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const q = useQuery({ queryKey: ["audit", page, search], queryFn: () => api.get<Paginated<AuditRow>>("/api/audit", { page, pageSize: 30, search: search || undefined }), placeholderData: (p) => p })
  const cols: Column<AuditRow>[] = [
    { key: "when", header: t("settings.when"), cell: (r) => <span className="text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</span> },
    { key: "who", header: t("settings.who"), cell: (r) => <span className="text-xs">{r.user ? `${r.user.firstName} ${r.user.lastName}` : r.entityId.slice(0, 8)}</span> },
    { key: "action", header: t("settings.action"), cell: (r) => <Badge variant="secondary" className="font-mono text-[10px]">{r.action}</Badge> },
    { key: "entity", header: t("settings.entity"), cell: (r) => <span className="text-xs">{r.entityType} <span className="text-muted-foreground font-mono">{r.entityId.slice(0, 8)}</span></span>, hideOnMobile: true },
    { key: "meta", header: t("common.details"), cell: (r) => <span className="text-[11px] text-muted-foreground font-mono truncate block max-w-[280px]" dir="ltr">{r.metadata ? JSON.stringify(r.metadata) : ""}</span>, hideOnMobile: true },
    { key: "ip", header: t("settings.ip"), cell: (r) => <span className="text-xs text-muted-foreground" dir="ltr">{r.ipAddress ?? ""}</span>, hideOnMobile: true },
  ]
  return (
    <RequirePermission permission="audit.view">
      <div className="mb-3 max-w-xs"><Input placeholder={t("common.searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></div>
      <DataTable dense columns={cols} rows={q.data?.items} rowKey={(r) => r.id} loading={q.isLoading} emptyTitle={t("settings.auditEmpty")} pagination={q.data ? { page, pageSize: q.data.pageSize, total: q.data.total, onPageChange: setPage } : undefined} />
    </RequirePermission>
  )
}

interface Integrations {
  database: "postgresql" | "sqlite"
  ai: { configured: boolean; model: string | null; lastError: { at: string; status: number | null; type: string; message: string } | null; lastSuccessAt: string | null }
  email: { configured: boolean; from: string | null }
  redis: { configured: boolean; active: boolean }
  cron: { configured: boolean }
  whatsapp: { configured: boolean; note: string }
}

function IntegrationStatus({ ok, label }: { ok: boolean; label?: string }) {
  const { t } = useTranslation()
  return <Badge variant={ok ? "success" : "muted"}>{label ?? (ok ? t("settings.configured") : t("settings.notConfigured"))}</Badge>
}

function IntegrationsTab() {
  const { t } = useTranslation()
  const { me } = useMe()
  const { showError } = useApiError()
  const q = useQuery({ queryKey: ["integrations"], queryFn: () => api.get<Integrations>("/api/integrations") })
  const test = useMutation({ mutationFn: () => api.post<{ sent: boolean; to: string }>("/api/integrations", { action: "test-email" }), onSuccess: (r) => toast.success(t("settings.testEmailSent", { to: r.to })), onError: showError })
  const d = q.data
  const Status = IntegrationStatus
  const rows: { key: string; title: string; help: string; status: React.ReactNode; extra?: React.ReactNode }[] = d
    ? [
        { key: "db", title: t("settings.database"), help: d.database === "postgresql" ? "PostgreSQL" : "SQLite (development)", status: <Badge variant={d.database === "postgresql" ? "success" : "warning"}>{d.database}</Badge> },
        {
          key: "ai",
          title: t("settings.aiIntegration"),
          help: d.ai.lastError ? `${t("settings.aiHelp")} — ${t("settings.lastError")}: ${d.ai.lastError.type} (${d.ai.lastError.message})` : t("settings.aiHelp"),
          status: <Status ok={d.ai.configured && !d.ai.lastError} label={d.ai.configured ? (d.ai.lastError ? t("settings.fallback") : d.ai.lastSuccessAt ? t("settings.active") : t("settings.configured")) : undefined} />,
          extra: d.ai.model ? <span className="text-xs text-muted-foreground">{t("settings.model")}: {d.ai.model}</span> : null,
        },
        { key: "email", title: t("settings.emailIntegration"), help: t("settings.emailHelp"), status: <Status ok={d.email.configured} />, extra: d.email.configured && me?.role === "OWNER" ? <Button size="sm" variant="outline" onClick={() => test.mutate()} loading={test.isPending}>{t("settings.sendTestEmail")}</Button> : null },
        { key: "redis", title: t("settings.redisIntegration"), help: t("settings.redisHelp"), status: <Status ok={d.redis.configured} label={d.redis.configured ? (d.redis.active ? t("settings.active") : t("settings.fallback")) : undefined} /> },
        { key: "cron", title: t("settings.cronIntegration"), help: t("settings.cronHelp"), status: <Status ok={d.cron.configured} /> },
        { key: "wa", title: t("settings.whatsappIntegration"), help: t("settings.whatsappHelp"), status: <Status ok={false} /> },
      ]
    : []
  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.integrations")}</CardTitle><CardDescription>{t("settings.integrationsHint")}</CardDescription></CardHeader>
      <CardContent className="divide-y">
        {q.isLoading ? <p className="py-4 text-sm text-muted-foreground">{t("common.loading")}</p> : rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><p className="font-medium text-sm">{r.title}</p><p className="text-xs text-muted-foreground mt-0.5 break-words">{r.help}</p></div>
            <div className="flex items-center gap-2 shrink-0">{r.extra}{r.status}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function SettingsInner() {
  const { t } = useTranslation()
  const { can } = useMe()
  const router = useRouter()
  const params = useSearchParams()
  const tab = params.get("tab") ?? "business"
  return (
    <>
      <PageHeader title={t("settings.title")} />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/settings?tab=${v}`)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="business"><Building2 className="h-4 w-4 me-1.5" />{t("settings.business")}</TabsTrigger>
          <TabsTrigger value="profile"><User className="h-4 w-4 me-1.5" />{t("settings.profile")}</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="h-4 w-4 me-1.5" />{t("settings.appearance")}</TabsTrigger>
          {can("business.update") ? <TabsTrigger value="integrations"><Plug className="h-4 w-4 me-1.5" />{t("settings.integrations")}</TabsTrigger> : null}
          {can("audit.view") ? <TabsTrigger value="audit"><ScrollText className="h-4 w-4 me-1.5" />{t("settings.audit")}</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="business"><BusinessTab /></TabsContent>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="appearance"><AppearanceTab /></TabsContent>
        {can("business.update") ? <TabsContent value="integrations"><IntegrationsTab /></TabsContent> : null}
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </>
  )
}

export default function SettingsPage() {
  return <RequirePermission permission="business.view"><Suspense><SettingsInner /></Suspense></RequirePermission>
}
