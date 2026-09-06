"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { DataTable, type Column } from "@/components/shared/data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FormField } from "@/components/shared/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, Badge, Checkbox } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useMe } from "@/hooks/use-me"
import { useCrud } from "@/hooks/use-crud"
import { useLocale } from "@/components/providers/locale-provider"
import { api } from "@/lib/api-client"
import { createUserSchema, updateUserSchema, ROLE_NAMES } from "@/utils/validation"
import { assignableRoles } from "@/lib/permissions"

interface Employee { id: string; email: string; firstName: string; lastName: string; phone: string | null; status: string; lastLoginAt: string | null; role: string; stores: { id: string; name: string }[] }
const createForm = createUserSchema
const editForm = updateUserSchema.extend({ password: z.string().optional().or(z.literal("")).transform((v) => (v ? v : undefined)) })
type CreateIn = z.input<typeof createForm>

export default function EmployeesPage() {
  const { t } = useTranslation()
  const { me, can } = useMe()
  const { formatDateTime } = useLocale()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [del, setDel] = useState<Employee | null>(null)
  const q = useQuery({ queryKey: ["employees"], queryFn: () => api.get<Employee[]>("/api/users") })
  const crud = useCrud<CreateIn, Record<string, unknown>>("/api/users", [["employees"]])
  const roles = useMemo(() => assignableRoles(me?.role ?? ""), [me])
  const schema = editing ? editForm : createForm

  const form = useForm<Record<string, unknown>>({ resolver: zodResolver(schema as never) })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = form
  useEffect(() => {
    if (!open) return
    reset(editing ? { firstName: editing.firstName, lastName: editing.lastName, phone: editing.phone ?? "", role: editing.role, storeIds: editing.stores.map((s) => s.id), status: editing.status, password: "" } : { email: "", password: "", firstName: "", lastName: "", phone: "", role: "CASHIER", storeIds: me?.stores[0] ? [me.stores[0].id] : [] })
  }, [open, editing, reset, me])
  const storeIds = (watch("storeIds") as string[] | undefined) ?? []
  const err = (k: string) => (errors[k] ? t(k === "password" ? "auth.passwordRules" : "common.required") : undefined)

  const cols: Column<Employee>[] = [
    { key: "name", header: t("common.name"), cell: (u) => <div className="flex items-center gap-3"><Avatar name={`${u.firstName} ${u.lastName}`} /><div><p className="font-medium">{u.firstName} {u.lastName}{u.id === me?.user.id ? <span className="text-xs text-muted-foreground ms-1">({t("nav.profile")})</span> : null}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div> },
    { key: "role", header: t("employees.role"), cell: (u) => <Badge variant={u.role === "OWNER" ? "default" : "secondary"}>{t(`employees.roles.${u.role}`)}</Badge> },
    { key: "stores", header: t("employees.stores"), cell: (u) => <span className="text-muted-foreground text-xs">{u.stores.map((s) => s.name).join(", ") || "—"}</span>, hideOnMobile: true },
    { key: "status", header: t("common.status"), cell: (u) => <Badge variant={u.status === "ACTIVE" ? "success" : "destructive"}>{t(`employees.statuses.${u.status}`)}</Badge>, hideOnMobile: true },
    { key: "login", header: t("employees.lastLogin"), cell: (u) => <span className="text-xs text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t("employees.never")}</span>, hideOnMobile: true },
    { key: "act", header: "", cell: (u) => (can("user.update") || can("user.delete")) && (u.role !== "OWNER" || me?.role === "OWNER") ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{can("user.update") ? <DropdownMenuItem onClick={() => { setEditing(u); setOpen(true) }}><Pencil />{t("common.edit")}</DropdownMenuItem> : null}{can("user.delete") && u.id !== me?.user.id && u.role !== "OWNER" ? <DropdownMenuItem destructive onClick={() => setDel(u)}><Trash2 />{t("common.delete")}</DropdownMenuItem> : null}</DropdownMenuContent></DropdownMenu> : null, align: "end", className: "w-12" },
  ]

  const onSubmit = async (v: Record<string, unknown>) => {
    if (editing) await crud.update.mutateAsync({ id: editing.id, body: v })
    else await crud.create.mutateAsync(v as CreateIn)
    setOpen(false)
  }

  return (
    <RequirePermission permission="user.view">
      <PageHeader title={t("employees.title")} actions={can("user.create") ? <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" />{t("employees.add")}</Button> : undefined} />
      <DataTable columns={cols} rows={q.data} rowKey={(u) => u.id} loading={q.isLoading} emptyTitle={t("common.noResults")} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t("employees.edit") : t("employees.add")}</DialogTitle></DialogHeader>
          <form id="emp-form" onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField label={t("auth.firstName")} required error={err("firstName")}>{(id, inv) => <Input id={id} aria-invalid={inv} {...register("firstName")} />}</FormField>
            <FormField label={t("auth.lastName")} required error={err("lastName")}>{(id, inv) => <Input id={id} aria-invalid={inv} {...register("lastName")} />}</FormField>
            {!editing ? <FormField label={t("common.email")} required error={err("email")} className="sm:col-span-2">{(id, inv) => <Input id={id} type="email" aria-invalid={inv} {...register("email")} />}</FormField> : null}
            <FormField label={t("common.phone")} error={err("phone")}>{(id, inv) => <Input id={id} type="tel" aria-invalid={inv} {...register("phone")} />}</FormField>
            <FormField label={editing ? t("employees.resetPassword") : t("auth.password")} required={!editing} hint={t("auth.passwordRules")} error={err("password")}>{(id, inv) => <Input id={id} type="password" autoComplete="new-password" aria-invalid={inv} {...register("password")} />}</FormField>
            <FormField label={t("employees.role")} required hint={t(`employees.roleHints.${String(watch("role") ?? "CASHIER")}`)} error={err("role")}>
              {(id) => <Select value={String(watch("role") ?? "")} onValueChange={(v) => setValue("role", v)} disabled={editing?.role === "OWNER" && editing.id === me?.user.id}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{ROLE_NAMES.filter((r) => roles.includes(r) || r === editing?.role).map((r) => <SelectItem key={r} value={r}>{t(`employees.roles.${r}`)}</SelectItem>)}</SelectContent></Select>}
            </FormField>
            {editing && editing.id !== me?.user.id ? <FormField label={t("common.status")}>{(id) => <Select value={String(watch("status") ?? "ACTIVE")} onValueChange={(v) => setValue("status", v)}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{["ACTIVE", "INACTIVE", "SUSPENDED"].map((s) => <SelectItem key={s} value={s}>{t(`employees.statuses.${s}`)}</SelectItem>)}</SelectContent></Select>}</FormField> : null}
            <FormField label={t("employees.stores")} required error={err("storeIds")} className="sm:col-span-2">
              {() => <div className="flex flex-wrap gap-3">{me?.stores.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm rounded-md border px-3 py-2 cursor-pointer"><Checkbox checked={storeIds.includes(s.id)} onCheckedChange={(v) => setValue("storeIds", v ? [...storeIds, s.id] : storeIds.filter((x) => x !== s.id), { shouldValidate: true })} />{s.name}</label>)}</div>}
            </FormField>
          </form>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button type="submit" form="emp-form" loading={isSubmitting || crud.create.isPending || crud.update.isPending}>{t("common.save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} description={t("employees.deleteConfirm")} loading={crud.remove.isPending} onConfirm={() => del && crud.remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
    </RequirePermission>
  )
}
