/**
 * Lightweight ESC/POS thermal printer command encoder.
 *
 * Generates the binary byte stream that 80mm ESC/POS-compatible thermal printers
 * (EPSON TM-T20/T82, Xprinter, Zjiang, etc.) understand over USB/serial/network.
 * No external dependency — just raw bytes.
 *
 * Usage:
 *   const data = escposReceipt({ ... })
 *   // send `data` to the printer via WebUSB, a print server, or a serial port
 */

export interface EscposLine {
  type: "text" | "center" | "bold" | "normal" | "divider" | "spacer" | "cut" | "qr" | "barcode"
  text?: string
  height?: number
}

export interface EscposReceiptInput {
  /** Business name (printed bold, centered) */
  businessName: string
  /** Store info lines (name, address, phone) */
  storeLines: string[]
  /** Sale number, e.g. "S-20260908-0001" */
  saleNumber: string
  /** ISO date string */
  date: string
  /** Cashier name (optional) */
  cashierName?: string | null
  /** Customer name (optional) */
  customerName?: string | null
  /** Line items */
  items: { name: string; qty: number; unitPrice: number; total: number }[]
  /** Monetary totals */
  subtotal: number
  taxAmount: number
  discountAmount: number
  total: number
  /** Payment lines */
  payments: { method: string; amount: number; reference?: string | null }[]
  /** Amount still owed on credit (if any) */
  creditDue?: number
  /** Footer message */
  footer: string
  /** "PROVISIONAL" or "CANCELLED" stamp (optional) */
  stamp?: string
  /** Currency formatter, e.g. (n) => `${n.toFixed(2)} DH` */
  formatMoney: (n: number) => string
  /** Date formatter, e.g. (iso) => "08/09/2026 15:30" */
  formatDate: (iso: string) => string
}

// ESC/POS command bytes
const ESC = 0x1b
const GS = 0x1d
const INIT = [ESC, 0x40] // ESC @ — initialize
const CENTER = [ESC, 0x61, 0x01] // ESC a 1 — center align
const LEFT = [ESC, 0x61, 0x00] // ESC a 0 — left align
const BOLD_ON = [ESC, 0x45, 0x01] // ESC E 1 — bold on
const BOLD_OFF = [ESC, 0x45, 0x00] // ESC E 0 — bold off
const DOUBLE_ON = [GS, 0x21, 0x11] // GS ! 0x11 — double width + height
const DOUBLE_OFF = [GS, 0x21, 0x00] // GS ! 0x00 — normal size
const CUT = [GS, 0x56, 0x42, 0x00] // GS V B 0 — partial cut
const FEED = (n: number) => [ESC, 0x64, n] // ESC d n — feed n lines

function strToBytes(s: string): number[] {
  // Encode as UTF-8; most thermal printers handle UTF-8 for Latin/Arabic with
  // the right code page, but pure ASCII is safest for the core receipt.
  return Array.from(new TextEncoder().encode(s))
}

function line(text: string, maxLen = 42): number[] {
  // Truncate long lines to fit 80mm (42 chars at normal font).
  const truncated = text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text
  return [...strToBytes(truncated), 0x0a]
}

function twoColumns(left: string, right: string, maxLen = 42): number[] {
  const rightLen = right.length
  const leftMax = maxLen - rightLen - 1
  const leftPadded = left.length > leftMax ? left.slice(0, leftMax - 1) + "…" : left
  const gap = Math.max(1, maxLen - leftPadded.length - rightLen)
  return [...strToBytes(leftPadded + " ".repeat(gap) + right), 0x0a]
}

/**
 * Encode a receipt as ESC/POS binary data.
 * Returns a Uint8Array ready to send to a thermal printer.
 */
export function escposReceipt(input: EscposReceiptInput): Uint8Array {
  const bytes: number[] = [...INIT]

  // Header: business name (bold, centered)
  bytes.push(...CENTER, ...BOLD_ON, ...DOUBLE_ON)
  bytes.push(...line(input.businessName))
  bytes.push(...DOUBLE_OFF, ...BOLD_OFF)
  // Store info
  for (const s of input.storeLines) bytes.push(...CENTER, ...line(s))
  bytes.push(...FEED(1))

  // Divider
  bytes.push(...LEFT, ...strToBytes("-".repeat(42)), 0x0a)

  // Stamp (provisional / cancelled)
  if (input.stamp) {
    bytes.push(...CENTER, ...BOLD_ON, ...line(`*** ${input.stamp} ***`), ...BOLD_OFF)
  }

  // Sale number + date
  bytes.push(...twoColumns(input.saleNumber, input.formatDate(input.date)))
  if (input.cashierName) bytes.push(...line(`Cashier: ${input.cashierName}`))
  if (input.customerName) bytes.push(...line(`Customer: ${input.customerName}`))

  // Divider
  bytes.push(...strToBytes("-".repeat(42)), 0x0a)

  // Items
  for (const it of input.items) {
    bytes.push(...line(it.name))
    const left = `  ${it.qty} x ${input.formatMoney(it.unitPrice)}`
    bytes.push(...twoColumns(left, input.formatMoney(it.total)))
  }

  // Divider
  bytes.push(...strToBytes("-".repeat(42)), 0x0a)

  // Totals
  bytes.push(...twoColumns("Subtotal", input.formatMoney(input.subtotal)))
  bytes.push(...twoColumns("Tax", input.formatMoney(input.taxAmount)))
  if (input.discountAmount > 0) bytes.push(...twoColumns("Discount", `-${input.formatMoney(input.discountAmount)}`))
  bytes.push(...BOLD_ON, ...DOUBLE_ON, ...twoColumns("TOTAL", input.formatMoney(input.total)), ...DOUBLE_OFF, ...BOLD_OFF)

  // Divider
  bytes.push(...strToBytes("-".repeat(42)), 0x0a)

  // Payments
  for (const p of input.payments) {
    const label = p.reference ? `${p.method} (${p.reference})` : p.method
    bytes.push(...twoColumns(label, input.formatMoney(p.amount)))
  }
  if (input.creditDue && input.creditDue > 0) {
    bytes.push(...CENTER, ...BOLD_ON, ...line(`DUE: ${input.formatMoney(input.creditDue)}`), ...BOLD_OFF)
  }

  // Divider
  bytes.push(...strToBytes("-".repeat(42)), 0x0a)

  // Footer
  bytes.push(...CENTER, ...line(input.footer))
  bytes.push(...FEED(3), ...CUT)

  return new Uint8Array(bytes)
}
