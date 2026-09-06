"use client"

import { useCallback, useMemo, useReducer } from "react"
import { computeLine, round2, sum } from "@/utils/money"

export interface PosProduct {
  id: string
  name: string
  sku: string
  barcode: string | null
  sellingPrice: number
  taxRate: number
  stockQuantity: number
  unit: string
  image: string | null
  category?: { id: string; name: string } | null
}

export interface CartLine {
  product: PosProduct
  quantity: number
  unitPrice: number
  discount: number
}

export interface CartState {
  lines: CartLine[]
  customer: { id: string; name: string } | null
  orderDiscount: number
  notes: string
}

type Action =
  | { type: "add"; product: PosProduct; quantity?: number }
  | { type: "setQty"; productId: string; quantity: number }
  | { type: "setPrice"; productId: string; unitPrice: number }
  | { type: "setDiscount"; productId: string; discount: number }
  | { type: "remove"; productId: string }
  | { type: "setCustomer"; customer: CartState["customer"] }
  | { type: "setOrderDiscount"; value: number }
  | { type: "setNotes"; value: string }
  | { type: "replace"; state: CartState }
  | { type: "clear" }

export const EMPTY_CART: CartState = { lines: [], customer: null, orderDiscount: 0, notes: "" }

function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "add": {
      const qty = action.quantity ?? 1
      const existing = state.lines.find((l) => l.product.id === action.product.id)
      if (existing) return { ...state, lines: state.lines.map((l) => (l.product.id === action.product.id ? { ...l, quantity: l.quantity + qty, product: action.product } : l)) }
      return { ...state, lines: [...state.lines, { product: action.product, quantity: qty, unitPrice: action.product.sellingPrice, discount: 0 }] }
    }
    case "setQty":
      if (action.quantity <= 0) return { ...state, lines: state.lines.filter((l) => l.product.id !== action.productId) }
      return { ...state, lines: state.lines.map((l) => (l.product.id === action.productId ? { ...l, quantity: Math.floor(action.quantity) } : l)) }
    case "setPrice":
      return { ...state, lines: state.lines.map((l) => (l.product.id === action.productId ? { ...l, unitPrice: Math.max(0, action.unitPrice) } : l)) }
    case "setDiscount":
      return { ...state, lines: state.lines.map((l) => (l.product.id === action.productId ? { ...l, discount: Math.max(0, action.discount) } : l)) }
    case "remove":
      return { ...state, lines: state.lines.filter((l) => l.product.id !== action.productId) }
    case "setCustomer":
      return { ...state, customer: action.customer }
    case "setOrderDiscount":
      return { ...state, orderDiscount: Math.max(0, action.value) }
    case "setNotes":
      return { ...state, notes: action.value }
    case "replace":
      return action.state
    case "clear":
      return EMPTY_CART
  }
}

export function useCart() {
  const [state, dispatch] = useReducer(reducer, EMPTY_CART)
  const totals = useMemo(() => {
    const lines = state.lines.map((l) => ({ ...l, ...computeLine(l.quantity, l.unitPrice, l.discount, l.product.taxRate) }))
    const linesTotal = sum(lines.map((l) => l.total))
    const orderDiscount = Math.min(state.orderDiscount, linesTotal)
    const total = round2(linesTotal - orderDiscount)
    const ratio = linesTotal > 0 ? total / linesTotal : 1
    const subtotal = round2(sum(lines.map((l) => l.subtotal)) * ratio)
    return { lines, linesTotal, orderDiscount, total, subtotal, tax: round2(total - subtotal), itemCount: lines.reduce((a, l) => a + l.quantity, 0) }
  }, [state])
  const stockIssues = useMemo(() => state.lines.filter((l) => l.quantity > l.product.stockQuantity), [state.lines])
  const add = useCallback((product: PosProduct, quantity?: number) => dispatch({ type: "add", product, quantity }), [])
  return { state, dispatch, totals, stockIssues, add, isEmpty: state.lines.length === 0 }
}

/** Serialisable payload for hold / sale APIs. */
export function cartToItems(state: CartState) {
  return state.lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitPrice: l.unitPrice !== l.product.sellingPrice ? l.unitPrice : undefined, discount: l.discount }))
}
