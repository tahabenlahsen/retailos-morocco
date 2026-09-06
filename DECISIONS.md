# Architectural decisions

Short records of the non-obvious choices made while building RetailOS Morocco, and why.

## 1. Next.js 16 App Router with route handlers (no separate backend)
One deployable, one language, shared Zod schemas between client and server. All server logic lives in `src/services` and is called from thin route handlers, so a separate API service could be extracted later without rewriting business logic.

## 2. Multi-tenancy via `businessId`/`storeId` columns + a mandatory `TenantContext`
Row-level columns (not schema-per-tenant) keep operations simple for a SaaS with many small tenants. Every route goes through `withTenant()`, which resolves the context from the session and the database — never from client input. Services accept a `TenantContext` and scope every query with it. Cross-tenant behaviour is covered by `tests/integration/tenant-isolation.test.ts`.

## 3. Roles and permissions defined in code, not in the database
The six roles are system roles; the permission matrix is versioned with the application (`src/lib/permissions.ts`). This makes authorisation deterministic, testable and reviewable in pull requests. Custom per-business roles are a possible later addition (the `Role` table exists).

## 4. String "enums" in the Prisma schema
SQLite (zero-setup local development) does not support enums. Allowed values are documented in the schema and enforced by Zod at the API boundary, so the same schema runs on SQLite and PostgreSQL. The provider is switched with `scripts/set-db-provider.mjs`; the PostgreSQL migration is committed.

## 5. Stock changes only through `applyStockChange`
A single function inside `inventory.service.ts` performs a guarded `updateMany` (`WHERE stockQuantity = previous`) and writes the `InventoryMovement` in the same transaction. This guarantees the ledger matches the stock and prevents overselling under concurrent sales.

## 6. Prices are tax-inclusive (TTC) at the POS, tax-exclusive (HT) for purchases
Moroccan retail displays TTC prices; supplier invoices are HT. `computeLine` derives HT/VAT from TTC per line; purchase orders compute VAT on top of HT. Profit is computed on HT revenue minus cost (weighted-average cost updated on receipt).

## 7. Idempotency keys for sales
The POS generates a UUID per cart and sends it with the sale. A retry after a network failure returns the existing sale (HTTP 200) instead of creating a duplicate (HTTP 201). The key is globally unique but the service verifies the owning business before returning the record.

## 8. Cash requires an open register
Cash payments, cash refunds, cash expenses and cash supplier payments all require an open register for that store and write a `CashRegisterTransaction`. Card/transfer payments do not, so a store can sell by card without a float.

## 9. Document numbers per business, per day
`S-YYYYMMDD-0001`, `R-…`, `PO-…` are generated inside the creating transaction with a `@@unique([businessId, number])` constraint; a P2002 collision under concurrency triggers a retry.

## 10. AI assistant: data first, model second
Intent detection is deterministic (weighted multilingual regex rules) so the same question always maps to the same query. The database is queried through the normal tenant-scoped services; the LLM (optional) only receives the resulting JSON and is instructed to answer from it. Without an API key the same data is rendered through templates. The UI always shows the underlying data and the period analysed.

## 11. Planner and reorder outputs are labelled estimates
Both return their assumptions and formulas alongside the numbers and carry a disclaimer string that the UI displays prominently.

## 12. Service worker never caches `/api/*`
Financial data must always reflect the server. Static assets are cache-first; pages are network-first with an offline fallback. Offline sales are intentionally not supported (see README).

## 13. Locale in a cookie
Read on the server in the root layout so the first HTML already has the right `lang`/`dir`, avoiding an RTL flash. Client switching updates the cookie, `localStorage` and the `<html>` attributes without a reload.

## 14. In-memory rate limiting
Good enough for a single instance and simple to reason about; the `checkRateLimit` interface is designed to be swapped for a Redis implementation when scaling horizontally.

## 15. Soft deletes for master data, hard history
Products, customers, suppliers, stores, users and expenses are soft-deleted so historical sales and reports stay consistent. Deleted users' e-mails are rewritten so the address can be reused.
