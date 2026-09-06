"use client"

import { useTranslation } from "react-i18next"
import { Minus, Plus, Trash2, ShoppingCart, User, X, PauseCircle, Percent } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Money } from "@/components/shared/money"
import { EmptyState } from "@/components/shared/empty-state"
import type { CartState, CartLine } from "./cart-store"
import type { useCart } from "./cart-store"
import { cn } from "@/utils/cn"

type Cart = ReturnType<typeof useCart>

interface Props {
  cart: Cart
  canOverridePrice: boolean
  onPay: () => void
  onHold: () => void
  onPickCustomer: () => void
  onClear: () => void
  disabled?: boolean
}

function Line({ line, computed, dispatch, canOverridePrice }: { line: CartLine; computed: { total: number }; dispatch: Cart["dispatch"]; canOverridePrice: boolean }) {
  const { t } = useTranslation()
  const over = line.quantity > line.product.stockQuantity
  return (
    <div className={cn("rounded-lg border p-2.5", over && "border-destructive/50 bg-destructive/5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight truncate">{line.product.name}</p>
          <p className="text-[11px] text-muted-foreground">{t("pos.stock", { count: line.product.stockQuantity })}{over ? ` — ${t("errors.INSUFFICIENT_STOCK")}` : ""}</p>
        </div>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive -me-1 -mt-1" onClick={() => dispatch({ type: "remove", productId: line.product.id })} aria-label={t("common.remove")}><Trash2 /></Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center rounded-md border">
          <Button variant="ghost" size="icon-sm" className="h-9 w-9" onClick={() => dispatch({ type: "setQty", productId: line.product.id, quantity: line.quantity - 1 })} aria-label="-"><Minus /></Button>
          <input className="h-9 w-12 bg-transparent text-center text-sm font-semibold tabular-nums outline-none" type="number" min={1} value={line.quantity} onChange={(e) => dispatch({ type: "setQty", productId: line.product.id, quantity: Number(e.target.value) || 1 })} aria-label={t("common.quantity")} />
          <Button variant="ghost" size="icon-sm" className="h-9 w-9" onClick={() => dispatch({ type: "setQty", productId: line.product.id, quantity: line.quantity + 1 })} aria-label="+"><Plus /></Button>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>×</span>
          {canOverridePrice ? (
            <Input type="number" step="0.01" min={0} className="h-9 w-24 text-end tabular-nums" value={line.unitPrice} onChange={(e) => dispatch({ type: "setPrice", productId: line.product.id, unitPrice: Number(e.target.value) || 0 })} aria-label={t("pos.unitPrice")} />
          ) : (
            <Money value={line.unitPrice} className="text-foreground" />
          )}
        </div>
        <div className="ms-auto text-end">
          <Money value={computed.total} className="font-semibold" />
        </div>
      </div>
      {canOverridePrice ? (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Percent className="h-3 w-3" />
          <span>{t("pos.lineDiscount")}</span>
          <Input type="number" step="0.01" min={0} className="h-7 w-20 text-end tabular-nums" value={line.discount || ""} placeholder="0" onChange={(e) => dispatch({ type: "setDiscount", productId: line.product.id, discount: Number(e.target.value) || 0 })} />
        </div>
      ) : null}
    </div>
  )
}

export function CartPanel({ cart, canOverridePrice, onPay, onHold, onPickCustomer, onClear, disabled }: Props) {
  const { t } = useTranslation()
  const { state, dispatch, totals, isEmpty, stockIssues } = cart

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" />{t("pos.cart")} {totals.itemCount ? <span className="text-muted-foreground text-sm font-normal">({totals.itemCount})</span> : null}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onHold} disabled={isEmpty}><PauseCircle className="h-4 w-4" /><span className="hidden sm:inline">{t("pos.hold")}</span></Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onClear} disabled={isEmpty}><X className="h-4 w-4" /><span className="hidden sm:inline">{t("pos.clear")}</span></Button>
        </div>
      </div>

      <button onClick={onPickCustomer} className="flex items-center gap-2 border-b px-4 py-2.5 text-sm hover:bg-accent/50 text-start cursor-pointer">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className={cn("flex-1 truncate", !state.customer && "text-muted-foreground")}>{state.customer?.name ?? t("pos.walkIn")}</span>
        {state.customer ? <X className="h-4 w-4 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); dispatch({ type: "setCustomer", customer: null }) }} /> : <span className="text-xs text-primary">{t("pos.selectCustomer")}</span>}
      </button>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {isEmpty ? <EmptyState icon={ShoppingCart} title={t("pos.emptyCart")} description={t("pos.emptyCartHint")} className="py-16" /> : totals.lines.map((l) => <Line key={l.product.id} line={l} computed={l} dispatch={dispatch} canOverridePrice={canOverridePrice} />)}
      </div>

      <div className="border-t p-4 space-y-2 bg-card">
        <div className="flex justify-between text-sm text-muted-foreground"><span>{t("common.subtotal")}</span><Money value={totals.subtotal} /></div>
        <div className="flex justify-between text-sm text-muted-foreground"><span>{t("common.tax")}</span><Money value={totals.tax} /></div>
        {canOverridePrice ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("pos.orderDiscount")}</span>
            <Input type="number" step="0.01" min={0} max={totals.linesTotal} className="h-8 w-28 text-end tabular-nums" value={state.orderDiscount || ""} placeholder="0" onChange={(e) => dispatch({ type: "setOrderDiscount", value: Number(e.target.value) || 0 })} />
          </div>
        ) : totals.orderDiscount ? <div className="flex justify-between text-sm"><span>{t("pos.orderDiscount")}</span><Money value={-totals.orderDiscount} /></div> : null}
        <div className="flex items-baseline justify-between pt-2 border-t"><span className="font-semibold">{t("common.total")}</span><Money value={totals.total} className="text-2xl font-bold" /></div>
        <Button size="xl" className="w-full mt-1" onClick={onPay} disabled={isEmpty || disabled || stockIssues.length > 0}>
          {t("pos.pay")} · <Money value={totals.total} />
        </Button>
        <p className="hidden lg:block text-center text-[11px] text-muted-foreground">{t("pos.keyboardHint")}</p>
      </div>
    </div>
  )
}

export type { CartState }
