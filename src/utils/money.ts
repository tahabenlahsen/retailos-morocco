/**
 * Money helpers. All monetary values are stored as floats in MAD with 2 decimals.
 * Every arithmetic result is rounded to cents to prevent floating-point drift
 * accumulating across sale lines.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function sum(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0))
}

export interface LineTotals {
  subtotal: number // quantity * unitPrice - discount (tax-exclusive base)
  taxAmount: number
  total: number
}

/**
 * Prices in Moroccan retail are typically displayed tax-inclusive (TTC).
 * We treat `unitPrice` as TTC and derive the HT base and tax for reporting.
 */
export function computeLine(quantity: number, unitPrice: number, discount: number, taxRate: number): LineTotals {
  const gross = round2(quantity * unitPrice - discount)
  const total = Math.max(0, gross)
  const subtotal = round2(total / (1 + taxRate))
  const taxAmount = round2(total - subtotal)
  return { subtotal, taxAmount, total }
}

export function formatMoney(value: number, locale = "fr-MA", currency = "MAD"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0
  return round2((part / whole) * 100)
}
