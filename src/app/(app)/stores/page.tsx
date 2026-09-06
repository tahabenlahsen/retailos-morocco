"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Store as StoreIcon, Pencil, Trash2, MapPin, Clock, Package, Users } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { RequirePermission } from "@/components/shared/require-permission"
import { EntityDialog, type FieldDef } from "@/components/shared/entity-dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge, Skeleton } from "@/components/ui/misc"
import { useMe, ME_KEY } from "@/hooks/use-me"
import { useCrud } from "@/hooks/use-crud"
import { useStore } from "@/components/providers/store-provider"
import { api } from "@/lib/api-client"
import { createStoreSchema } from "@/utils/validation"
import { z } from "zod"

interface StoreRow { id: string; name: string; city: string; address: string | null; phone: string | null; email: string | null; size: number | null; openTime: string | null; closeTime: string | null; isActive: boolean; _count: { products: number; users: number } }
const storeFormSchema = createStoreSchema.extend({ isActive: z.boolean().optional() })
type In = z.input<typeof storeFormSchema>

export default function StoresPage() {
  const { t } = useTranslation()
  const { can } = useMe()
  const { storeId, setStoreId } = useStore()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<StoreRow | null>(null)
  const [del, setDel] = useState<StoreRow | null>(null)
  const q = useQuery({ queryKey: ["stores"], queryFn: () => api.get<StoreRow[]>("/api/stores") })
  const crud = useCrud<In>("/api/stores", [["stores"], [...ME_KEY]])

  const fields: FieldDef<In>[] = useMemo(() => [
    { name: "name", label: t("common.name"), required: true },
    { name: "city", label: t("common.city"), required: true },
    { name: "address", label: t("common.address"), colSpan: 2 },
    { name: "phone", label: t("common.phone"), type: "tel" },
    { name: "email", label: t("common.email"), type: "email" },
    { name: "size", label: t("stores.size"), type: "number", min: 0 },
    { name: "openTime", label: t("stores.openTime"), placeholder: "08:00" },
    { name: "closeTime", label: t("stores.closeTime"), placeholder: "22:00" },
    ...(editing ? [{ name: "isActive" as const, label: t("common.active"), type: "switch" as const }] : []),
  ], [t, editing])
  const defaults = useMemo<In>(() => ({ name: editing?.name ?? "", city: editing?.city ?? "", address: editing?.address ?? "", phone: editing?.phone ?? "", email: editing?.email ?? "", size: editing?.size ?? undefined, openTime: editing?.openTime ?? "", closeTime: editing?.closeTime ?? "", isActive: editing?.isActive ?? true }), [editing])

  return (
    <RequirePermission permission="store.view">
      <PageHeader title={t("stores.title")} description={t("stores.deleteHint")} actions={can("store.create") ? <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="h-4 w-4" />{t("stores.add")}</Button> : undefined} />
      {q.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div> : q.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((s) => (
            <Card key={s.id} className={storeId === s.id ? "border-primary" : ""}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0"><div className="rounded-lg bg-primary/10 p-2 text-primary"><StoreIcon className="h-5 w-5" /></div><div className="min-w-0"><p className="font-semibold truncate">{s.name}</p><p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{[s.address, s.city].filter(Boolean).join(", ")}</p></div></div>
                  {!s.isActive ? <Badge variant="muted">{t("common.inactive")}</Badge> : storeId === s.id ? <Badge>{t("stores.current")}</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{s._count.products} {t("nav.products").toLowerCase()}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s._count.users} {t("stores.users").toLowerCase()}</span>
                  {s.openTime && s.closeTime ? <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{s.openTime}–{s.closeTime}</span> : null}
                  {s.size ? <span>{s.size} m²</span> : null}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant={storeId === s.id ? "secondary" : "outline"} onClick={() => setStoreId(s.id)} disabled={storeId === s.id}>{t("common.select")}</Button>
                  {can("store.update") ? <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setOpen(true) }}><Pencil className="h-4 w-4" />{t("common.edit")}</Button> : null}
                  {can("store.delete") && q.data && q.data.length > 1 ? <Button size="sm" variant="ghost" className="text-destructive ms-auto" onClick={() => setDel(s)}><Trash2 className="h-4 w-4" /></Button> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : <EmptyState icon={StoreIcon} title={t("common.noResults")} />}
      <EntityDialog open={open} onOpenChange={setOpen} title={editing ? t("stores.edit") : t("stores.add")} schema={storeFormSchema} fields={fields} defaultValues={defaults} submitting={crud.create.isPending || crud.update.isPending} onSubmit={async (v) => { if (editing) await crud.update.mutateAsync({ id: editing.id, body: v }); else { const { isActive: _a, ...body } = v; await crud.create.mutateAsync(body) } setOpen(false) }} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} description={t("stores.deleteHint")} loading={crud.remove.isPending} onConfirm={() => del && crud.remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
    </RequirePermission>
  )
}
