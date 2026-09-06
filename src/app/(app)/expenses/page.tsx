"use client"

import { useMemo, useState } from "react"
import { usePagination } from "@/hooks/use-pagination"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Pencil, Trash2, MoreHorizontal, Tags } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DateRangePicker } from "@/components/shared/date-range-picker"
import { EntityDialog, type FieldDef } from "@/components/shared/entity-dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Money } from "@/components/shared/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/misc"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMe } from "@/hooks/use-me"
import { useCrud } from "@/hooks/use-crud"
import { useDateFilter } from "@/hooks/use-date-filter"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { api, type Paginated } from "@/lib/api-client"
import { createExpenseSchema, PAYMENT_METHODS } from "@/utils/validation"
import { resolveDateRange } from "@/utils/dates"
import type { z } from "zod"

interface Expense { id: string; amount: number; description: string | null; date: string; paymentMethod: string; notes: string | null; categoryId: string; storeId: string; category: { id: string; name: string; code: string | null }; store: { id: string; name: string } }
interface ExpenseCategory { id: string; name: string; code: string | null }
type In = z.input<typeof createExpenseSchema>
const ALL = "__all__"

export default function ExpensesPage() {
  const { t } = useTranslation()
  const { can } = useMe()
  const { storeId, effectiveStoreId, stores } = useStore()
  const { formatDate } = useLocale()
  const { filter, setFilter } = useDateFilter("thisMonth")
  const [categoryId, setCategoryId] = useState(ALL)
  const { page, setPage } = usePagination(`${storeId ?? "all"}:${categoryId}:${filter.preset}:${filter.from}:${filter.to}`)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [del, setDel] = useState<Expense | null>(null)
  const [catOpen, setCatOpen] = useState(false)
  const [newCat, setNewCat] = useState("")

  const range = filter.preset === "custom" ? (filter.from && filter.to ? { from: new Date(filter.from), to: new Date(filter.to + "T23:59:59") } : null) : resolveDateRange(filter.preset)
  const q = useQuery({ queryKey: ["expenses", storeId, range?.from?.toISOString(), range?.to?.toISOString(), categoryId, page], queryFn: () => api.get<Paginated<Expense> & { sum: number }>("/api/expenses", { storeId: storeId ?? undefined, from: range?.from, to: range?.to, categoryId: categoryId === ALL ? undefined : categoryId, page, pageSize: 25 }), enabled: !!range, placeholderData: (p) => p })
  const cats = useQuery({ queryKey: ["expense-categories"], queryFn: () => api.get<ExpenseCategory[]>("/api/expenses/categories") })
  const crud = useCrud<In>("/api/expenses", [["expenses"], ["register"], ["analytics"]])
  const catCrud = useCrud<{ name: string }>("/api/expenses/categories", [["expense-categories"]])

  const catLabel = (c: ExpenseCategory) => (c.code ? t(`expenses.codes.${c.code}`, { defaultValue: c.name }) : c.name)
  const fields: FieldDef<In>[] = useMemo(() => [
    { name: "amount", label: t("common.amount"), type: "number", step: "0.01", min: 0, required: true },
    { name: "categoryId", label: t("expenses.category"), type: "select", required: true, options: (cats.data ?? []).map((c) => ({ value: c.id, label: catLabel(c) })) },
    { name: "date", label: t("common.date"), type: "date" },
    { name: "paymentMethod", label: t("expenses.paymentMethod"), type: "select", required: true, options: PAYMENT_METHODS.map((m) => ({ value: m, label: t(`pos.methods.${m}`) })), hint: t("expenses.cashHint") },
    ...(stores.length > 1 && !editing ? [{ name: "storeId" as const, label: t("common.store"), type: "select" as const, options: stores.map((s) => ({ value: s.id, label: s.name })) }] : []),
    { name: "description", label: t("common.description"), colSpan: 2 },
    { name: "notes", label: t("common.notes"), type: "textarea" },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, cats.data, stores, editing])
  const defaults = useMemo<In>(() => editing
    ? { amount: editing.amount, categoryId: editing.categoryId, date: editing.date.slice(0, 10) as unknown as Date, paymentMethod: editing.paymentMethod as In["paymentMethod"], description: editing.description ?? "", notes: editing.notes ?? "" }
    : { amount: undefined as unknown as number, categoryId: cats.data?.[0]?.id ?? "", date: new Date().toISOString().slice(0, 10) as unknown as Date, paymentMethod: "CASH", storeId: storeId ?? effectiveStoreId, description: "", notes: "" }, [editing, cats.data, storeId, effectiveStoreId])

  const cols: Column<Expense>[] = [
    { key: "date", header: t("common.date"), cell: (e) => <span className="text-xs">{formatDate(e.date)}</span> },
    { key: "cat", header: t("expenses.category"), cell: (e) => <Badge variant="secondary">{catLabel(e.category)}</Badge> },
    { key: "desc", header: t("common.description"), cell: (e) => <div className="min-w-0"><p className="truncate">{e.description ?? "—"}</p>{stores.length > 1 && !storeId ? <p className="text-xs text-muted-foreground">{e.store.name}</p> : null}</div> },
    { key: "method", header: t("expenses.paymentMethod"), cell: (e) => <span className="text-muted-foreground">{t(`pos.methods.${e.paymentMethod}`)}</span>, hideOnMobile: true },
    { key: "amount", header: t("common.amount"), cell: (e) => <Money value={e.amount} className="font-semibold" />, align: "end" },
    { key: "act", header: "", cell: (e) => (can("expense.update") || can("expense.delete")) ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{can("expense.update") ? <DropdownMenuItem onClick={() => { setEditing(e); setFormOpen(true) }}><Pencil />{t("common.edit")}</DropdownMenuItem> : null}{can("expense.delete") ? <DropdownMenuItem destructive onClick={() => setDel(e)}><Trash2 />{t("common.delete")}</DropdownMenuItem> : null}</DropdownMenuContent></DropdownMenu> : null, align: "end", className: "w-12" },
  ]

  return (
    <RequirePermission permission="expense.view">
      <PageHeader title={t("expenses.title")} description={q.data ? `${t("expenses.totalPeriod")}: ` : undefined} actions={<>
        {can("expense.create") ? <Button variant="outline" onClick={() => setCatOpen(true)}><Tags className="h-4 w-4" /><span className="hidden sm:inline">{t("expenses.categories")}</span></Button> : null}
        {can("expense.create") ? <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" />{t("expenses.add")}</Button> : null}
      </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangePicker value={filter} onChange={setFilter} />
        <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("common.all")}</SelectItem>{cats.data?.map((c) => <SelectItem key={c.id} value={c.id}>{catLabel(c)}</SelectItem>)}</SelectContent></Select>
        {q.data ? <div className="ms-auto rounded-lg bg-accent px-3 py-1.5 text-sm">{t("expenses.totalPeriod")}: <Money value={q.data.sum} className="font-semibold" /></div> : null}
      </div>
      <DataTable columns={cols} rows={q.data?.items} rowKey={(e) => e.id} loading={q.isLoading} emptyTitle={t("expenses.noExpenses")} pagination={q.data ? { page, pageSize: q.data.pageSize, total: q.data.total, onPageChange: setPage } : undefined} emptyAction={can("expense.create") ? <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" />{t("expenses.add")}</Button> : undefined} />
      <EntityDialog open={formOpen} onOpenChange={setFormOpen} title={editing ? t("expenses.edit") : t("expenses.add")} schema={createExpenseSchema} fields={fields} defaultValues={defaults} submitting={crud.create.isPending || crud.update.isPending}
        onSubmit={async (v) => { if (editing) { const { storeId: _s, ...body } = v; await crud.update.mutateAsync({ id: editing.id, body }) } else await crud.create.mutateAsync(v); setFormOpen(false) }} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} loading={crud.remove.isPending} onConfirm={() => del && crud.remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("expenses.categories")}</DialogTitle></DialogHeader>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newCat.trim()) catCrud.create.mutate({ name: newCat.trim() }, { onSuccess: () => setNewCat("") }) }}><Input placeholder={t("expenses.newCategory")} value={newCat} onChange={(e) => setNewCat(e.target.value)} /><Button type="submit" disabled={newCat.trim().length < 2} loading={catCrud.create.isPending}><Plus className="h-4 w-4" /></Button></form>
          <div className="divide-y rounded-md border max-h-72 overflow-y-auto scrollbar-thin">{cats.data?.map((c) => <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm"><span>{catLabel(c)}</span>{c.code ? <Badge variant="muted">{t("common.system")}</Badge> : <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => catCrud.remove.mutate(c.id)}><Trash2 /></Button>}</div>)}</div>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  )
}
