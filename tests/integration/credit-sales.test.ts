import { describe, it, expect, beforeAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { salesService } from "@/services/sales.service"
import { customerService } from "@/services/customer.service"
import { registerService } from "@/services/register.service"
import { createBusiness, createProduct, openRegister, type TestBusiness } from "../setup/factory"
import { round2 } from "@/utils/money"

const key = () => `idem-${Math.random().toString(36).slice(2)}-${Date.now()}`

describe("credit ('crédit') sales", () => {
  let b: TestBusiness
  let productId: string
  let registerId: string

  beforeAll(async () => {
    b = await createBusiness("Credit Biz")
    productId = (await createProduct(b, { sellingPrice: 100, taxRate: 0, stockQuantity: 1000 })).id
    registerId = (await openRegister(b, 500)).id
    await prisma.customer.update({ where: { id: b.customerId }, data: { creditLimit: 250 } })
  })

  const creditSale = (amount: number, cash = 0, customerId: string | null = b.customerId) =>
    salesService.create(b.ctx(), {
      items: [{ productId, quantity: (amount + cash) / 100, discount: 0 }],
      discountAmount: 0,
      customerId,
      payments: [...(cash > 0 ? [{ amount: cash, method: "CASH" as const }] : []), { amount, method: "CREDIT" as const }],
      idempotencyKey: key(),
    })

  it("requires a customer", async () => {
    await expect(creditSale(100, 0, null)).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("refuses customers without a credit limit", async () => {
    const noLimit = await prisma.customer.create({ data: { name: "No Limit", businessId: b.businessId } })
    await expect(creditSale(100, 0, noLimit.id)).rejects.toMatchObject({ code: "CREDIT_NOT_ALLOWED" })
  })

  it("records a full credit sale: balance up, payment PENDING, sale PENDING, no register cash", async () => {
    const before = (await registerService.computeExpected(registerId)).summary.expected
    const { sale } = await creditSale(100)
    expect(sale.paymentStatus).toBe("PENDING")
    expect(sale.payments[0]).toMatchObject({ method: "CREDIT", status: "PENDING", settledAmount: 0 })
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })
    expect(c.outstandingBalance).toBe(100)
    expect((await registerService.computeExpected(registerId)).summary.expected).toBe(before) // nothing hit the till
    // Stock still moves like any sale
    const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    expect(p.stockQuantity).toBe(999)
  })

  it("supports split cash + credit and marks the sale PARTIALLY_PAID", async () => {
    const before = (await registerService.computeExpected(registerId)).summary.expected
    const { sale } = await creditSale(50, 50)
    expect(sale.paymentStatus).toBe("PARTIALLY_PAID")
    expect((await registerService.computeExpected(registerId)).summary.expected).toBe(before + 50)
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })
    expect(c.outstandingBalance).toBe(150)
  })

  it("enforces the credit limit with the available amount in the error details", async () => {
    // balance 150, limit 250 → 100 available
    await expect(creditSale(100.01)).rejects.toMatchObject({ code: "CREDIT_LIMIT_EXCEEDED", details: expect.objectContaining({ available: 100 }) })
    const { sale } = await creditSale(100) // exactly the remaining room is fine
    expect(sale.paymentStatus).toBe("PENDING")
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })).outstandingBalance).toBe(250)
  })

  it("cashiers may sell on credit, accountants may not", async () => {
    await prisma.customer.update({ where: { id: b.customerId }, data: { creditLimit: 1000 } })
    await expect(
      salesService.create(b.ctx("ACCOUNTANT", b.ownerId), { items: [{ productId, quantity: 1, discount: 0 }], discountAmount: 0, customerId: b.customerId, payments: [{ amount: 100, method: "CREDIT" }], idempotencyKey: key() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    const { sale } = await salesService.create(b.ctx("CASHIER", b.cashierId, [b.storeId]), { items: [{ productId, quantity: 1, discount: 0 }], discountAmount: 0, customerId: b.customerId, payments: [{ amount: 100, method: "CREDIT" }], idempotencyKey: key() })
    expect(sale.paymentStatus).toBe("PENDING")
  })

  it("repayment settles the oldest credit lines first (FIFO), updates sale statuses and the register", async () => {
    // Balance is now 350 across 4 credit lines: 100, 50, 100, 100 (oldest first)
    const before = (await registerService.computeExpected(registerId)).summary
    const r = await customerService.recordPayment(b.ctx(), b.customerId, { amount: 120, method: "CASH" })
    expect(r.outstandingBalance).toBe(230)
    expect(r.settled).toBe(120)
    const after = (await registerService.computeExpected(registerId)).summary
    expect(after.customerPayments).toBe(before.customerPayments + 120)
    expect(after.expected).toBe(before.expected + 120)

    const credits = await prisma.payment.findMany({ where: { businessId: b.businessId, method: "CREDIT" }, orderBy: { createdAt: "asc" }, include: { sale: { select: { paymentStatus: true } } } })
    expect(credits[0]).toMatchObject({ amount: 100, settledAmount: 100, status: "PAID" }) // fully settled
    expect(credits[0].sale.paymentStatus).toBe("PAID")
    expect(credits[1]).toMatchObject({ amount: 50, settledAmount: 20, status: "PENDING" }) // partially settled
    expect(credits[1].sale.paymentStatus).toBe("PARTIALLY_PAID")
    expect(credits[2]).toMatchObject({ settledAmount: 0, status: "PENDING" })
  })

  it("rejects repayments above the balance and when nothing is owed", async () => {
    await expect(customerService.recordPayment(b.ctx(), b.customerId, { amount: 999, method: "CASH" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    const clean = await prisma.customer.create({ data: { name: "Clean", businessId: b.businessId } })
    await expect(customerService.recordPayment(b.ctx(), clean.id, { amount: 1, method: "CASH" })).rejects.toMatchObject({ code: "NO_OUTSTANDING_BALANCE" })
  })

  it("cash repayment needs an open register in the store", async () => {
    await expect(customerService.recordPayment(b.ctx(), b.customerId, { amount: 10, method: "CASH", storeId: b.store2Id })).rejects.toMatchObject({ code: "REGISTER_CLOSED" })
    // Non-cash works without a register
    const r = await customerService.recordPayment(b.ctx(), b.customerId, { amount: 30, method: "BANK_TRANSFER", reference: "VIR-1", storeId: b.store2Id })
    expect(r.outstandingBalance).toBe(200)
  })

  it("refund 'to credit' cancels debt on that sale instead of paying out cash", async () => {
    const { sale } = await creditSale(100) // balance 300
    const cashBefore = (await registerService.computeExpected(registerId)).summary.expected
    const refund = await salesService.refund(b.ctx(), sale.id, { items: [{ saleItemId: sale.items[0].id, quantity: 1 }], reason: "Returned", paymentMethod: "CREDIT", restock: true })
    expect(refund.amount).toBe(100)
    expect((await registerService.computeExpected(registerId)).summary.expected).toBe(cashBefore) // no cash out
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })
    expect(c.outstandingBalance).toBe(200)
    const pay = await prisma.payment.findFirstOrThrow({ where: { saleId: sale.id, method: "CREDIT" } })
    expect(pay).toMatchObject({ settledAmount: 100, status: "PAID" })
    const updated = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(updated.status).toBe("REFUNDED")
  })

  it("refund 'to credit' cannot exceed what is still owed on that sale", async () => {
    const { sale } = await creditSale(50, 50) // 50 credit, 50 cash → balance 250
    await expect(
      salesService.refund(b.ctx(), sale.id, { items: [{ saleItemId: sale.items[0].id, quantity: 1 }], reason: "Too much", paymentMethod: "CREDIT", restock: true })
    ).rejects.toMatchObject({ code: "REFUND_EXCEEDS_CREDIT" })
  })

  it("cancelling an unpaid credit sale reverses the balance; a partly repaid one cannot be cancelled", async () => {
    const { sale } = await creditSale(100) // balance 350
    await salesService.cancel(b.ctx(), sale.id, "Mistake")
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })).outstandingBalance).toBe(250)

    // Build a partially repaid sale: pay off everything older, plus 10 of the new sale (FIFO reaches it last).
    const older = await prisma.payment.findMany({ where: { businessId: b.businessId, method: "CREDIT", status: "PENDING", sale: { customerId: b.customerId, status: { not: "CANCELLED" } } } })
    const olderDue = older.reduce((a, p) => a + (p.amount - p.settledAmount), 0)
    const { sale: partial } = await creditSale(100) // balance 350
    await customerService.recordPayment(b.ctx(), b.customerId, { amount: olderDue + 10, method: "BANK_TRANSFER" })
    const line = await prisma.payment.findFirstOrThrow({ where: { saleId: partial.id, method: "CREDIT" } })
    expect(line).toMatchObject({ settledAmount: 10, status: "PENDING" })
    await expect(salesService.cancel(b.ctx(), partial.id, "Nope")).rejects.toMatchObject({ code: "INVALID_STATE" })
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })).outstandingBalance).toBe(90)
  })

  it("only managers can set credit limits; cashiers cannot", async () => {
    await expect(customerService.update(b.ctx("CASHIER", b.cashierId, [b.storeId]), b.customerId, { creditLimit: 99999 })).rejects.toMatchObject({ code: "FORBIDDEN" })
    const ok = await customerService.update(b.ctx("MANAGER"), b.customerId, { creditLimit: 5000 })
    expect(ok.creditLimit).toBe(5000)
    // Unchanged limit passes through for a cashier editing other fields
    const same = await customerService.update(b.ctx("CASHIER", b.cashierId, [b.storeId]), b.customerId, { creditLimit: 5000, notes: "ok" })
    expect(same.notes).toBe("ok")
  })

  it("receivables report and customer removal guard", async () => {
    const r = await customerService.receivables(b.ctx())
    expect(r.count).toBeGreaterThanOrEqual(1)
    expect(r.debtors.find((d) => d.id === b.customerId)?.outstandingBalance).toBe(90)
    expect(r.total).toBeGreaterThanOrEqual(90)
    await expect(customerService.remove(b.ctx(), b.customerId)).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("records a repeated repayment request (same paymentId) only once, even when simultaneous", async () => {
    const { sale } = await creditSale(100) // balance 190
    const before = (await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })).outstandingBalance
    const paymentId = crypto.randomUUID()
    const input = { amount: 40, method: "BANK_TRANSFER" as const, paymentId }
    const results = await Promise.all([customerService.recordPayment(b.ctx(), b.customerId, input), customerService.recordPayment(b.ctx(), b.customerId, input)])
    expect(results[0].payment.id).toBe(paymentId)
    expect(results[1].payment.id).toBe(paymentId)
    expect(await prisma.customerPayment.count({ where: { id: paymentId } })).toBe(1)
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })
    expect(after.outstandingBalance).toBe(round2(before - 40))
    // A third call with the same id but a different amount is a conflict, not a silent duplicate
    await expect(customerService.recordPayment(b.ctx(), b.customerId, { ...input, amount: 10 })).rejects.toMatchObject({ code: "CONFLICT" })
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })).outstandingBalance).toBe(round2(before - 40))
    void sale
  })

  it("never lets simultaneous repayments push the balance below zero", async () => {
    const debtor = await prisma.customer.create({ data: { name: "Racer", creditLimit: 1000, businessId: b.businessId } })
    await salesService.create(b.ctx(), { items: [{ productId, quantity: 1, discount: 0 }], discountAmount: 0, customerId: debtor.id, payments: [{ amount: 100, method: "CREDIT" }], idempotencyKey: key() })
    const attempts = await Promise.allSettled([60, 60, 60].map((amount) => customerService.recordPayment(b.ctx(), debtor.id, { amount, method: "BANK_TRANSFER" })))
    const ok = attempts.filter((a) => a.status === "fulfilled")
    expect(ok).toHaveLength(1)
    for (const a of attempts) if (a.status === "rejected") expect(["VALIDATION_ERROR", "CONFLICT", "NO_OUTSTANDING_BALANCE"]).toContain((a.reason as { code: string }).code)
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: debtor.id } })
    expect(after.outstandingBalance).toBe(40)
    const settled = await prisma.payment.aggregate({ where: { sale: { customerId: debtor.id }, method: "CREDIT" }, _sum: { settledAmount: true } })
    expect(settled._sum.settledAmount).toBe(60)
  })

  it("refuses to cancel a credit sale that is being repaid at the same time (no double reversal)", async () => {
    const debtor = await prisma.customer.create({ data: { name: "Cancel race", creditLimit: 1000, businessId: b.businessId } })
    const { sale } = await salesService.create(b.ctx(), { items: [{ productId, quantity: 1, discount: 0 }], discountAmount: 0, customerId: debtor.id, payments: [{ amount: 100, method: "CREDIT" }], idempotencyKey: key() })
    const outcomes = await Promise.allSettled([customerService.recordPayment(b.ctx(), debtor.id, { amount: 100, method: "BANK_TRANSFER" }), salesService.cancel(b.ctx(), sale.id, "race")])
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: debtor.id } })
    const fresh = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { payments: true } })
    if (fresh.status === "CANCELLED") {
      expect(outcomes[0].status).toBe("rejected")
      expect(after.outstandingBalance).toBe(0)
    } else {
      expect(outcomes[1].status).toBe("rejected")
      expect(after.outstandingBalance).toBe(0)
      expect(fresh.payments[0]).toMatchObject({ settledAmount: 100, status: "PAID" })
    }
    expect(after.outstandingBalance).toBeGreaterThanOrEqual(0)
  })

  it("redeems loyalty points safely (1 pt = 1 MAD) and refuses to go negative", async () => {
    // Give the demo customer 100 loyalty points
    await prisma.customer.update({ where: { id: b.customerId }, data: { loyaltyPoints: 100 } })
    const r1 = await customerService.redeemLoyaltyPoints(b.ctx(), b.customerId, { points: 30 })
    expect(r1.redeemed).toBe(30)
    expect(r1.remainingPoints).toBe(70)
    // Redeeming more than remaining fails
    await expect(customerService.redeemLoyaltyPoints(b.ctx(), b.customerId, { points: 80 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    // Two simultaneous redemptions of 50 points each: only one succeeds (70 available)
    const attempts = await Promise.allSettled([customerService.redeemLoyaltyPoints(b.ctx(), b.customerId, { points: 50 }), customerService.redeemLoyaltyPoints(b.ctx(), b.customerId, { points: 50 })])
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1)
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: b.customerId } })
    expect(after.loyaltyPoints).toBe(20)
  })

  it("is tenant-isolated: another business cannot record payments or read receivables of this customer", async () => {
    const other = await createBusiness("Other")
    await expect(customerService.recordPayment(other.ctx(), b.customerId, { amount: 10, method: "BANK_TRANSFER" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    const r = await customerService.receivables(other.ctx())
    expect(r.debtors.find((d) => d.id === b.customerId)).toBeUndefined()
  })
})
