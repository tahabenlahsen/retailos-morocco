import { describe, it, expect } from "vitest"
import { escposReceipt } from "@/lib/escpos"

describe("ESC/POS receipt encoder", () => {
  const sample = {
    businessName: "Demo Mini Market",
    storeLines: ["Casablanca", "0522-123-456"],
    saleNumber: "S-20260908-0001",
    date: "2026-09-08T15:30:00.000Z",
    cashierName: "Amine",
    customerName: null,
    items: [
      { name: "Coca-Cola 33cl", qty: 2, unitPrice: 5, total: 10 },
      { name: "Pain", qty: 1, unitPrice: 1.5, total: 1.5 },
    ],
    subtotal: 11.5,
    taxAmount: 2.3,
    discountAmount: 0,
    total: 13.8,
    payments: [{ method: "CASH", amount: 13.8 }],
    creditDue: 0,
    footer: "Merci de votre visite",
    formatMoney: (n: number) => `${n.toFixed(2)} MAD`,
    formatDate: (iso: string) => new Date(iso).toLocaleString("fr-MA"),
  }

  it("produces non-empty binary data starting with ESC @ init", () => {
    const data = escposReceipt(sample)
    expect(data).toBeInstanceOf(Uint8Array)
    expect(data.length).toBeGreaterThan(50)
    // First two bytes: ESC (0x1b) @ (0x40) — init command
    expect(data[0]).toBe(0x1b)
    expect(data[1]).toBe(0x40)
  })

  it("includes the business name and sale number in the output", () => {
    const data = escposReceipt(sample)
    const text = new TextDecoder().decode(data)
    expect(text).toContain("Demo Mini Market")
    expect(text).toContain("S-20260908-0001")
    expect(text).toContain("Coca-Cola 33cl")
    expect(text).toContain("13.80 MAD")
    expect(text).toContain("Merci de votre visite")
  })

  it("ends with a partial cut command (GS V B 0)", () => {
    const data = escposReceipt(sample)
    const len = data.length
    // GS (0x1d) V (0x56) B (0x42) 0 (0x00)
    expect(data[len - 4]).toBe(0x1d)
    expect(data[len - 3]).toBe(0x56)
    expect(data[len - 2]).toBe(0x42)
    expect(data[len - 1]).toBe(0x00)
  })

  it("includes a PROVISIONAL stamp when status is QUEUED", () => {
    const data = escposReceipt({ ...sample, stamp: "PROVISIONAL" })
    const text = new TextDecoder().decode(data)
    expect(text).toContain("*** PROVISIONAL ***")
  })

  it("includes credit due amount when present", () => {
    const data = escposReceipt({ ...sample, creditDue: 50 })
    const text = new TextDecoder().decode(data)
    expect(text).toContain("DUE: 50.00 MAD")
  })
})
