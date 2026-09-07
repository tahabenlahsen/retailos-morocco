"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useDebounce } from "@/hooks/use-debounce"
import { useTranslation } from "react-i18next"
import { Search, UserPlus, User } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { api } from "@/lib/api-client"
import { useApiError } from "@/hooks/use-api-error"

import { Money } from "@/components/shared/money"
import type { CartCustomer } from "./cart-store"

interface Customer { id: string; name: string; phone: string | null; loyaltyPoints: number; outstandingBalance?: number; creditLimit?: number | null }

type PickerProps = { open: boolean; onOpenChange: (o: boolean) => void; onSelect: (c: CartCustomer) => void }

export function CustomerPicker({ open, onOpenChange, onSelect }: PickerProps) {
  // Content is remounted on every open, so search/create state starts fresh.
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <PickerContent onOpenChange={onOpenChange} onSelect={onSelect} /> : null}</Dialog>
}

function PickerContent({ onOpenChange, onSelect }: Omit<PickerProps, "open">) {
  const { t } = useTranslation()
  const { showError } = useApiError()
  const qc = useQueryClient()
  const [term, setTerm] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const debounced = useDebounce(term.trim(), 200)

  const q = useQuery({
    queryKey: ["customers", "quick", debounced],
    queryFn: () => (debounced ? api.get<Customer[]>("/api/customers", { search: debounced, quick: "true" }) : api.get<{ items: Customer[] }>("/api/customers", { pageSize: 10 }).then((r) => r.items)),
  })
  const create = useMutation({
    mutationFn: () => api.post<Customer>("/api/customers", { name: newName.trim(), phone: newPhone.trim() || undefined }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["customers"] })
      onSelect({ id: c.id, name: c.name, creditLimit: c.creditLimit ?? null, outstandingBalance: c.outstandingBalance ?? 0 })
      onOpenChange(false)
    },
    onError: showError,
  })

  return (
      <DialogContent>
        <DialogHeader><DialogTitle>{t("pos.selectCustomer")}</DialogTitle></DialogHeader>
        {creating ? (
          <div className="space-y-3">
            <Input autoFocus placeholder={t("common.name")} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder={t("common.phone")} type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>{t("common.back")}</Button>
              <Button onClick={() => create.mutate()} disabled={newName.trim().length < 2} loading={create.isPending}>{t("common.create")}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus className="ps-9" placeholder={t("common.searchPlaceholder")} value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin space-y-1">
              {q.data?.length ? q.data.map((c) => (
                <button key={c.id} onClick={() => { onSelect({ id: c.id, name: c.name, creditLimit: c.creditLimit ?? null, outstandingBalance: c.outstandingBalance ?? 0 }); onOpenChange(false) }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-accent cursor-pointer">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{c.name}</span>
                  {(c.outstandingBalance ?? 0) > 0 ? <span className="text-xs text-amber-700 dark:text-amber-300">{t("customers.owes")} <Money value={c.outstandingBalance ?? 0} /></span> : null}
                  <span className="text-xs text-muted-foreground" dir="ltr">{c.phone ?? ""}</span>
                </button>
              )) : !q.isLoading ? <EmptyState icon={User} title={t("customers.noCustomers")} className="py-6" /> : null}
            </div>
            <Button variant="outline" onClick={() => { setCreating(true); setNewName(term) }}><UserPlus className="h-4 w-4" />{t("customers.add")}</Button>
          </>
        )}
      </DialogContent>
  )
}
