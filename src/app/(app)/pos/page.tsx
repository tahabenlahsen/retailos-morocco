"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Banknote, PauseCircle, Printer, Plus, Trash2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/misc"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { RequirePermission } from "@/components/shared/require-permission"
import { EmptyState } from "@/components/shared/empty-state"
import { ProductSearch } from "@/components/pos/product-search"
import { CartPanel } from "@/components/pos/cart-panel"
import { PaymentDialog, type PaymentLine } from "@/components/pos/payment-dialog"
import { CustomerPicker } from "@/components/pos/customer-picker"
import { Receipt, printReceipt, type ReceiptSale } from "@/components/pos/receipt"
import { useCart, cartToItems, type PosProduct, type CartState } from "@/components/pos/cart-store"
import { useMe } from "@/hooks/use-me"
import { useStore } from "@/components/providers/store-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { useApiError } from "@/hooks/use-api-error"
import { api, ApiError } from "@/lib/api-client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OfflineQueueButton } from "@/components/pos/offline-queue-dialog"
import { useOfflineQueue, useOnline } from "@/hooks/use-offline"
import { offlineQueue, QUEUE_SYNCED_EVENT, type SyncResult } from "@/lib/offline/queue"
import { provisionalRef, type QueuedSale } from "@/lib/offline/queue-logic"
import { requireOfflineIdentity, type OfflineOwner } from "@/lib/offline/identity"

interface HeldCart { id: string; label: string | null; customerId: string | null; createdAt: string; items: { productId: string; quantity: number; unitPrice?: number; discount: number }[] }

/** Builds the queued-sale record (and its provisional receipt) from the cart when the network is down. */
function buildQueuedSale(cart: ReturnType<typeof useCart>, payments: PaymentLine[], storeId: string, storeName: string, key: string, owner: OfflineOwner): QueuedSale {
  return {
    owner: { businessId: owner.businessId, userId: owner.userId },
    key,
    ref: provisionalRef(key),
    storeId,
    storeName,
    soldAt: new Date().toISOString(),
    customer: cart.state.customer ? { id: cart.state.customer.id, name: cart.state.customer.name } : null,
    lines: cart.totals.lines.map((l) => ({ productId: l.product.id, name: l.product.name, sku: l.product.sku, unit: l.product.unit, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, total: l.total })),
    payments,
    totals: { subtotal: cart.totals.subtotal, tax: cart.totals.tax, discount: cart.totals.orderDiscount, total: cart.totals.total },
    notes: cart.state.notes || undefined,
    status: "pending",
    attempts: 0,
  }
}

function queuedToReceipt(q: QueuedSale, store: { id: string; name: string; address: string | null; phone: string | null }): ReceiptSale {
  return {
    id: q.key,
    saleNumber: q.ref,
    createdAt: q.soldAt,
    subtotal: q.totals.subtotal,
    taxAmount: q.totals.tax,
    discountAmount: q.totals.discount,
    total: q.totals.total,
    status: "QUEUED",
    items: q.lines.map((l) => ({ id: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, total: l.total, product: { name: l.name, sku: l.sku, unit: l.unit } })),
    payments: q.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
    customer: q.customer ? { name: q.customer.name, phone: null } : null,
    store,
    cashierName: null,
  }
}

export default function PosPage() {
  const { t } = useTranslation()
  const { me, can } = useMe()
  const { effectiveStoreId, stores, storeId, setStoreId } = useStore()
  const { formatDateTime } = useLocale()
  const { showError, messageFor } = useApiError()
  const qc = useQueryClient()
  const cart = useCart()
  const [payOpen, setPayOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [holdLabel, setHoldLabel] = useState("")
  const [holdPrompt, setHoldPrompt] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptSale | null>(null)
  const idemRef = useRef<string>(crypto.randomUUID())

  const posStoreId = storeId ?? effectiveStoreId

  const register = useQuery({ queryKey: ["register", "open", posStoreId], queryFn: () => api.get<{ id: string } | null>("/api/register", { storeId: posStoreId }), enabled: !!posStoreId, refetchInterval: 60_000 })
  const held = useQuery({ queryKey: ["held-carts", posStoreId], queryFn: () => api.get<HeldCart[]>("/api/pos/held-carts", { storeId: posStoreId }), enabled: !!posStoreId })
  // Fresh credit standing of the attached customer while the payment dialog is open (balance may have changed on another till).
  const customerId = cart.state.customer?.id
  const creditQ = useQuery({
    queryKey: ["customers", customerId, "credit"],
    queryFn: () => api.get<{ name: string; creditLimit: number | null; outstandingBalance: number }>(`/api/customers/${customerId}`),
    enabled: payOpen && !!customerId,
    staleTime: 0,
  })
  const creditInfo = cart.state.customer
    ? { customerName: cart.state.customer.name, creditLimit: creditQ.data?.creditLimit ?? cart.state.customer.creditLimit ?? null, outstandingBalance: creditQ.data?.outstandingBalance ?? cart.state.customer.outstandingBalance ?? 0 }
    : undefined

  const online = useOnline()
  useOfflineQueue() // starts background sync + keeps the queue loaded while the POS is open
  const currentStore = stores.find((s) => s.id === posStoreId)

  // When queued offline sales get synced, refresh stock/register and tell the cashier the final numbers.
  useEffect(() => {
    const onSynced = (e: Event) => {
      const r = (e as CustomEvent<SyncResult>).detail
      toast.success(t("offline.syncedCount", { count: r.synced.length }) + (r.synced.length <= 3 ? ` · ${r.synced.map((s) => s.saleNumber).join(", ")}` : ""))
      void qc.invalidateQueries({ queryKey: ["pos-products"] })
      void qc.invalidateQueries({ queryKey: ["pos-catalog"] })
      void qc.invalidateQueries({ queryKey: ["register"] })
      void qc.invalidateQueries({ queryKey: ["sales"] })
    }
    window.addEventListener(QUEUE_SYNCED_EVENT, onSynced)
    return () => window.removeEventListener(QUEUE_SYNCED_EVENT, onSynced)
  }, [qc, t])

  const finishSale = (sale: ReceiptSale, queued: boolean) => {
    setPayOpen(false)
    setReceipt(sale)
    cart.dispatch({ type: "clear" })
    idemRef.current = crypto.randomUUID()
    if (queued) toast.warning(t("offline.saleQueued", { ref: sale.saleNumber }))
    else {
      toast.success(`${t("pos.saleComplete")} · ${sale.saleNumber}`)
      void qc.invalidateQueries({ queryKey: ["pos-products"] })
      void qc.invalidateQueries({ queryKey: ["register"] })
      void qc.invalidateQueries({ queryKey: ["customers"] })
    }
  }

  const createSale = useMutation({
    mutationFn: async (payments: PaymentLine[]): Promise<{ sale: ReceiptSale; queued: boolean }> => {
      const owner = requireOfflineIdentity() // Capture before any network await; never adopt a new cashier.
      const storeInfo = { id: posStoreId!, name: currentStore?.name ?? "", address: currentStore?.address ?? null, phone: currentStore?.phone ?? null }
      const queue = async () => {
        // Credit sales need a live limit check; never queue them offline.
        if (payments.some((p) => p.method === "CREDIT")) throw new ApiError("NETWORK", t("offline.creditNotOffline"), 0)
        const q = buildQueuedSale(cart, payments, posStoreId!, storeInfo.name, idemRef.current, owner)
        q.registerId = register.data?.id
        await offlineQueue.enqueue(q, owner)
        return { sale: queuedToReceipt(q, storeInfo), queued: true }
      }
      if (!online) return queue()
      try {
        const sale = await api.post<ReceiptSale>("/api/sales", { offlineOwner: { businessId: owner.businessId, userId: owner.userId }, registerId: register.data?.id, storeId: posStoreId, items: cartToItems(cart.state), customerId: cart.state.customer?.id ?? null, discountAmount: cart.totals.orderDiscount, payments, notes: cart.state.notes || undefined, idempotencyKey: idemRef.current })
        return { sale, queued: false }
      } catch (err) {
        // Connection dropped mid-sale: keep the same idempotency key so a later sync can never duplicate it.
        if (err instanceof ApiError && err.code === "NETWORK") return queue()
        throw err
      }
    },
    onSuccess: ({ sale, queued }) => finishSale(sale, queued),
    onError: (err) => {
      // Refresh stock on insufficient-stock errors so the cart reflects reality
      if (err instanceof ApiError && err.code === "INSUFFICIENT_STOCK") void qc.invalidateQueries({ queryKey: ["pos-products"] })
      toast.error(err instanceof ApiError && err.code === "NETWORK" && err.message !== "Network error" ? err.message : messageFor(err))
    },
  })

  const holdCart = useMutation({
    mutationFn: () => api.post("/api/pos/held-carts", { storeId: posStoreId, label: holdLabel.trim() || undefined, customerId: cart.state.customer?.id ?? null, items: cartToItems(cart.state) }),
    onSuccess: () => {
      cart.dispatch({ type: "clear" })
      setHoldPrompt(false)
      setHoldLabel("")
      void qc.invalidateQueries({ queryKey: ["held-carts"] })
      toast.success(t("pos.hold"))
    },
    onError: showError,
  })
  const deleteHeld = useMutation({ mutationFn: (id: string) => api.delete(`/api/pos/held-carts/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ["held-carts"] }), onError: showError })

  const resumeHeld = async (h: HeldCart) => {
    try {
      const products = await Promise.all(h.items.map((i) => api.get<PosProduct>(`/api/products/${i.productId}`)))
      const state: CartState = {
        lines: h.items.map((i, idx) => ({ product: products[idx], quantity: i.quantity, unitPrice: i.unitPrice ?? products[idx].sellingPrice, discount: i.discount })),
        customer: null,
        orderDiscount: 0,
        notes: "",
      }
      if (h.customerId) {
        const c = await api.get<{ id: string; name: string; creditLimit: number | null; outstandingBalance: number }>(`/api/customers/${h.customerId}`).catch(() => null)
        if (c) state.customer = { id: c.id, name: c.name, creditLimit: c.creditLimit, outstandingBalance: c.outstandingBalance }
      }
      cart.dispatch({ type: "replace", state })
      await deleteHeld.mutateAsync(h.id)
      setHeldOpen(false)
    } catch (err) {
      showError(err)
    }
  }

  const onAdd = useCallback((p: PosProduct) => {
    if (p.stockQuantity <= 0) {
      toast.error(t("pos.insufficientStock", { name: p.name, available: 0 }))
      return
    }
    cart.add(p)
  }, [cart, t])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2" && !cart.isEmpty) { e.preventDefault(); setPayOpen(true) }
      if (e.key === "F4" && !cart.isEmpty) { e.preventDefault(); setHoldPrompt(true) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cart.isEmpty])

  const canOverridePrice = can("product.update")
  const registerOpen = !!register.data

  if (!posStoreId) return <EmptyState title={t("register.noOpen")} className="py-24" />

  return (
    <RequirePermission permission="sale.create">
      <div className="flex h-[calc(100dvh-4rem)] flex-col lg:flex-row">
        {/* Products */}
        <section className="flex min-h-0 flex-1 flex-col p-3 sm:p-4 lg:border-e">
          <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
            {stores.length > 1 ? (
              <Select value={posStoreId} onValueChange={(v) => setStoreId(v)}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : null}
            {register.isLoading ? null : registerOpen ? (
              <Badge variant="success"><Banknote className="h-3 w-3 me-1" />{t("dashboard.registerOpen")}</Badge>
            ) : (
              <Button asChild size="sm" variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300"><Link href="/cash-register"><Lock className="h-4 w-4" />{t("pos.openRegister")}</Link></Button>
            )}
            {!online ? <Badge variant="warning" data-testid="pos-offline-badge">{t("offline.offline")}</Badge> : null}
            <OfflineQueueButton />
            <Button size="sm" variant="outline" className="ms-auto" onClick={() => setHeldOpen(true)}>
              <PauseCircle className="h-4 w-4" />{t("pos.heldCarts")} {held.data?.length ? <Badge variant="secondary" className="ms-1">{held.data.length}</Badge> : null}
            </Button>
          </div>
          <div className="min-h-0 flex-1"><ProductSearch storeId={posStoreId} onAdd={onAdd} /></div>
        </section>

        {/* Cart */}
        <aside className="flex h-[45dvh] lg:h-auto lg:w-[400px] xl:w-[440px] shrink-0 flex-col border-t lg:border-t-0 bg-card">
          <CartPanel cart={cart} canOverridePrice={canOverridePrice} onPay={() => setPayOpen(true)} onHold={() => setHoldPrompt(true)} onPickCustomer={() => setCustomerOpen(true)} onClear={() => cart.dispatch({ type: "clear" })} disabled={createSale.isPending} />
        </aside>
      </div>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} total={cart.totals.total} registerOpen={registerOpen} credit={creditInfo} canCredit={online && can("sale.credit")} onConfirm={(p) => createSale.mutateAsync(p).then(() => undefined, () => undefined)} />
      <CustomerPicker open={customerOpen} onOpenChange={setCustomerOpen} onSelect={(c) => cart.dispatch({ type: "setCustomer", customer: c })} />

      {/* Hold prompt */}
      <Dialog open={holdPrompt} onOpenChange={setHoldPrompt}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{t("pos.hold")}</DialogTitle></DialogHeader>
          <Input autoFocus placeholder={`${t("common.name")} (${t("common.optional")})`} value={holdLabel} onChange={(e) => setHoldLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && holdCart.mutate()} />
          <DialogFooter><Button variant="outline" onClick={() => setHoldPrompt(false)}>{t("common.cancel")}</Button><Button onClick={() => holdCart.mutate()} loading={holdCart.isPending}>{t("pos.hold")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Held carts */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("pos.heldCarts")}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
            {held.data?.length ? held.data.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{h.label || t("pos.cart")}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)} · {t("pos.items", { count: h.items.reduce((a, i) => a + i.quantity, 0) })}</p>
                </div>
                <Button size="sm" onClick={() => void resumeHeld(h)} disabled={!cart.isEmpty}>{t("pos.resume")}</Button>
                <Button size="icon-sm" variant="ghost" onClick={() => deleteHeld.mutate(h.id)} aria-label={t("common.delete")}><Trash2 className="text-destructive" /></Button>
              </div>
            )) : <EmptyState icon={PauseCircle} title={t("pos.noHeldCarts")} className="py-8" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent size="sm">
          <DialogHeader className="no-print"><DialogTitle>{t("pos.receipt")}</DialogTitle></DialogHeader>
          {receipt ? <Receipt sale={{ ...receipt, cashierName: me ? `${me.user.firstName} ${me.user.lastName}` : null }} /> : null}
          <DialogFooter className="no-print">
            <Button variant="outline" onClick={printReceipt}><Printer className="h-4 w-4" />{t("pos.printReceipt")}</Button>
            <Button onClick={() => setReceipt(null)}><Plus className="h-4 w-4" />{t("pos.newSale")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  )
}
