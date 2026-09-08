# Moroccan Payment Provider Integration

RetailOS Morocco currently supports manual payment methods (cash, card/TPE, bank
transfer, check, credit). This document outlines how to integrate online payment
providers commonly used in Morocco.

## Current payment methods

The app records these payment types out of the box (no external integration needed):

- **CASH** — Cash payments (MAD)
- **CARD** — Card / TPE (the cashier enters the amount after running the card)
- **BANK_TRANSFER** — Bank transfer (attestation entered as reference)
- **CHECK** — Check (check number entered as reference)
- **CREDIT** — Customer credit / "crédit" (tracked on the customer account)
- **OTHER** — Other payment methods

## Online payment integration (future)

### CMI (Centre Monétique Interbancaire)

CMI is the dominant Moroccan online payment gateway. Integration requires:

1. A CMI merchant account (contact CMI at cmi.ma)
2. Your merchant ID and secret key
3. A server-to-server (S2S) or redirect flow

**Integration approach:**

```
Customer → RetailOS POS → CMI Payment Page → Callback → RetailOS confirms sale
```

**What to build:**
- Add `CMI` to `SALE_PAYMENT_METHODS` in `src/utils/validation.ts`
- Create `/api/payments/cmi/init` — initiates a CMI payment session
- Create `/api/payments/cmi/callback` — receives CMI payment notification
- The cashier generates a payment link/QR from the POS payment dialog
- The customer scans/pays, CMI calls the callback, the sale is confirmed

**CMI API docs:** https://www.cmi.ma

### Cash Plus

Cash Plus is a popular cash payment network in Morocco. Integration requires:

1. A Cash Plus merchant account
2. API credentials

**Integration approach:**
- Generate a payment reference in RetailOS
- Customer pays at any Cash Plus agent using the reference
- Cash Plus sends a webhook to RetailOS confirming payment
- The sale is marked as paid

**Cash Plus:** https://www.cashplus.ma

### PayPal / Wise (for international customers)

For shops serving tourists or exporting:
- PayPal Business account
- Wise Business account
- Both offer API-based payment creation and webhook confirmation

## What's already in place

The app's payment architecture is designed for easy integration:

1. **Payment model** (`SalePayment`) records method, amount, and reference
2. **Payment dialog** (`src/components/pos/payment-dialog.tsx`) supports split payments
3. **API routes** accept any payment method in `SALE_PAYMENT_METHODS`
4. **Audit log** records all payment operations
5. **Idempotency keys** prevent duplicate payments

To add a new online payment method:

1. Add it to `SALE_PAYMENT_METHODS` in `src/utils/validation.ts`
2. Add translations for `pos.methods.YOUR_METHOD` in fr/en/ar
3. Create an init endpoint and a webhook callback endpoint
4. Add a button in the payment dialog for the new method
5. Test with the provider's sandbox/test environment first

## Recommendation for shop pilot

For the initial pilot, use the existing manual payment methods:
- Cash and card/TPE cover 90%+ of Moroccan retail transactions
- Credit ("crédit") is built in for trusted customers
- Add CMI/Cash Plus integration only when you need online payments
