"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Pencil, Trash2, Check, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { api } from "@/lib/api-client"
import { useCrud } from "@/hooks/use-crud"

interface Item { id: string; name: string; _count?: { products: number } }

function TaxonomyList({ path, queryKey }: { path: string; queryKey: string }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: [queryKey], queryFn: () => api.get<Item[]>(path) })
  const crud = useCrud<{ name: string }>(path, [[queryKey], ["products"]])
  const [newName, setNewName] = useState("")
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [del, setDel] = useState<Item | null>(null)
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) crud.create.mutate({ name: newName.trim() }, { onSuccess: () => setNewName("") }) }}>
        <Input placeholder={t("common.name")} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit" disabled={newName.trim().length < 1} loading={crud.create.isPending}><Plus className="h-4 w-4" />{t("common.add")}</Button>
      </form>
      <div className="divide-y rounded-md border max-h-80 overflow-y-auto scrollbar-thin">
        {q.data?.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            {editing?.id === c.id ? (
              <>
                <Input autoFocus className="h-8" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") crud.update.mutate({ id: c.id, body: { name: editing.name.trim() } }, { onSuccess: () => setEditing(null) }); if (e.key === "Escape") setEditing(null) }} />
                <Button size="icon-sm" variant="ghost" onClick={() => crud.update.mutate({ id: c.id, body: { name: editing.name.trim() } }, { onSuccess: () => setEditing(null) })}><Check /></Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setEditing(null)}><X /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate">{c.name}</span>
                {c._count ? <span className="text-xs text-muted-foreground">{t("products.productsCount", { count: c._count.products })}</span> : null}
                <Button size="icon-sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={t("common.edit")}><Pencil /></Button>
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDel(c)} aria-label={t("common.delete")}><Trash2 /></Button>
              </>
            )}
          </div>
        ))}
        {q.data && !q.data.length ? <p className="p-4 text-center text-sm text-muted-foreground">{t("common.noResults")}</p> : null}
      </div>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} loading={crud.remove.isPending} onConfirm={() => del && crud.remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
    </div>
  )
}

export function TaxonomyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("products.manageCategories")}</DialogTitle></DialogHeader>
        <Tabs defaultValue="categories">
          <TabsList className="w-full"><TabsTrigger value="categories" className="flex-1">{t("products.categories")}</TabsTrigger><TabsTrigger value="brands" className="flex-1">{t("products.brands")}</TabsTrigger></TabsList>
          <TabsContent value="categories"><TaxonomyList path="/api/categories" queryKey="categories" /></TabsContent>
          <TabsContent value="brands"><TaxonomyList path="/api/brands" queryKey="brands" /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
