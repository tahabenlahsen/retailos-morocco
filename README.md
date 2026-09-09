# RetailOS Morocco

All-in-one business management platform for small and medium Moroccan retail businesses — mini-markets, groceries, clothing, electronics, cosmetics, restaurants/snacks and parapharmacies. Built as a multi-tenant SaaS foundation: one business → many stores → many users with granular roles.

**Languages:** Français (default) · العربية (RTL) · English  **Currency:** MAD / DH

---

## Features

| Area | What's implemented |
|---|---|
| **Authentication** | Email/password (bcrypt), JWT sessions in HTTP-only cookies, sign-up, forgot/reset password (hashed one-time tokens), brute-force rate limiting, audit-logged logins |
| **Onboarding** | 3-step wizard creating the business, default VAT, categories per business type, expense categories and the first store |
| **Multi-tenancy** | Every store-scoped row carries `businessId` + `storeId`; every query is scoped by a server-side `TenantContext`; per-store user assignment; cross-tenant access is tested |
| **RBAC** | 6 roles (OWNER, ADMIN, MANAGER, CASHIER, INVENTORY_MANAGER, ACCOUNTANT) with a code-defined permission matrix (`src/lib/permissions.ts`) enforced on every API route and mirrored in the UI |
| **Dashboard** | Revenue, gross/net profit, transactions, AOV, expenses, inventory value, low/out-of-stock, sales trend, payment mix, top products, recent sales — with period presets + custom range and comparison to the previous period |
| **POS** | Barcode scan (keyboard-wedge), product search & category grid, cart with quantity/line discounts, price override (permission-gated), order discount, customer selection/creation, hold & resume carts, split payments (cash/card/transfer/check/other), change calculation, 80 mm receipt printing, keyboard shortcuts (Enter/F2/F4) |
| **Cash register** | Open with float, cash sales/refunds tracked, deposits/withdrawals, expected vs counted cash, mandatory reason on discrepancy, session history |
| **Products** | CRUD, per-store SKU & barcode uniqueness, categories/brands, margins, min/max stock, CSV import (row-level validation, upsert by SKU) & export, bulk price and bulk stock updates, soft delete |
| **Inventory** | Movement ledger for **every** stock change (sale, purchase, return, adjustment, transfer, damage, loss) with previous/new quantity, reason, user; adjustments; inter-store transfers; valuation; reorder recommendations (velocity-based, labelled as estimates) |
| **Purchases** | Purchase orders DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED / CANCELLED; receiving updates stock, weighted-average cost and supplier balance; pre-fill from reorder recommendations |
| **Suppliers** | CRUD, products supplied, order history, performance (order count, total, average delivery days, on-time rate), outstanding balance & payments |
| **Customers** | CRUD, purchase history, spending stats, loyalty points (1 pt / 10 DH) |
| **Expenses** | Categories (system + custom), cash expenses debit the open register, large-expense alerts |
| **Analytics** | P&L (revenue, VAT, COGS, gross profit, expenses by category, net profit, margins), sales by day/hour/cashier/category/store, inventory valuation & turnover, customers, suppliers, payment methods |
| **AI assistant** | FR/AR/Darija/EN questions → deterministic intent detection → scoped DB queries → answer. With `OPENAI_API_KEY` the LLM only receives the structured results; without it, answers are templated from the same data. Never invents numbers. |
| **New store planner** | Budget allocation, equipment checklist, category split, recurring costs, break-even and payback — with assumptions and formulas displayed and a prominent disclaimer |
| **Notifications** | In-app: low/out of stock (de-duplicated), large expense, register discrepancy, purchase received, sales decrease (daily cron). Email transport via SMTP when configured; WhatsApp is **not** implemented (architecture hook only) |
| **Employees & stores** | Invite users with role + store assignment, activate/suspend, reset password; create/edit/delete stores with safety checks |
| **Audit log** | Login, product/price/stock changes, sales, refunds, cancellations, register operations, purchases, expenses, user/role/store changes — with user, IP and metadata |
| **PWA** | Manifest, icons, public static-asset cache, generic offline navigation fallback; authenticated POS catalogue and sale queue in user/business-scoped IndexedDB |
| **Security** | Zod validation on every input, Prisma (parameterised SQL), CSP + HSTS + frame/sniff protection, secure cookies, rate limiting, secrets only server-side, user-safe error messages |

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Radix UI primitives (shadcn-style) · TanStack Query · react-hook-form + Zod · Recharts · i18next · NextAuth v4 (JWT) · Prisma 5 · PostgreSQL (production) / SQLite (zero-setup dev) · Vitest · Playwright · Docker

## Quick start (development)

> **New here?** See [`FRIEND_SETUP.md`](FRIEND_SETUP.md) for a 5-minute zero-setup guide.

```bash
git clone <repo> retailos-morocco && cd retailos-morocco
npm install
cp .env.example .env            # defaults use SQLite: DATABASE_URL="file:./dev.db"
npm run db:push                 # create the schema (uses SQLite, no install needed)
npm run db:seed                 # demo data (two isolated businesses)
npm run dev                     # http://localhost:3000
```

Demo accounts (password `Demo12345`):

| Email | Role | Business |
|---|---|---|
| `owner@demo.ma` | OWNER | Demo Mini Market (2 stores) |
| `manager@demo.ma` | MANAGER | Demo Mini Market |
| `cashier@demo.ma` | CASHIER | Demo Mini Market (store 1 only) |
| `owner@boutique.ma` | OWNER | Boutique Zahra (separate tenant) |

> The seed is **development/demo data only**. Never run it against a production database.

## Environment variables

See [`.env.example`](.env.example). Required: `DATABASE_URL`, `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL`. Optional: `OPENAI_API_KEY` (+ `OPENAI_MODEL`) for natural-language AI answers, `SMTP_*` for e-mail (password reset, alerts), `CRON_SECRET` for the daily job, `LOGIN_RATE_LIMIT` (default 10 attempts / 15 min / IP+email).

Secrets live only in environment variables; nothing sensitive is bundled into the client (`NEXT_PUBLIC_*` variables are the only ones exposed).

## Database

The Prisma schema is provider-neutral. Local development can use SQLite (no install); production targets PostgreSQL. The original baseline was checked with both engines. The latest credit/offline changes are being verified on PostgreSQL 17; a fresh SQLite verification is still required before claiming current provider parity.

```bash
# 1. point DATABASE_URL at your database in .env, then align the schema provider with it
npm run db:provider                 # infers sqlite|postgresql from DATABASE_URL (or pass it explicitly)
npm run db:generate

# 2a. PostgreSQL: apply the versioned migrations (+ optional demo data)
npm run db:migrate:deploy
npm run db:seed

# 2b. SQLite dev: push schema directly (+ demo data)
npm run db:push && npm run db:seed

# create a new migration after changing the schema (PostgreSQL)
npm run db:migrate -- --name describe_change
```

`prisma/migrations/20260906000000_init` is the initial PostgreSQL migration. Design notes: [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md).

Provider differences are isolated in `src/lib/prisma.ts` (`icontains()` gives case-insensitive search on both engines). To run the test suite against PostgreSQL instead of SQLite: `TEST_DATABASE_URL=postgresql://…/retailos_test npm test` (with the schema provider set to `postgresql`).

Key integrity rules enforced in code and covered by tests:

- **Stock is only ever changed through `applyStockChange`**, which writes an `InventoryMovement` in the same transaction and rejects negative stock (guarded update prevents overselling under concurrency).
- **Sale creation is atomic**: validate → sale → items → payments → movements → register transaction → customer stats → audit log. Any failure rolls back everything. A client `idempotencyKey` prevents duplicate transactions on retries.
- Refunds, cancellations, purchase receipts, transfers and expense deletions follow the same transactional pattern.
- SKU/barcode are unique **per store**; document numbers are unique **per business**.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run typecheck` · `npm run lint` | TypeScript · ESLint |
| `npm test` | Vitest unit + integration tests on SQLite; default setup resets `prisma/test.db` |
| PowerShell: `$env:UNIT_ONLY="1"; npx vitest run` | Unit tests only, without database setup |
| PowerShell: `$env:REUSE_TEST_DATABASE="1"; npm run test:pg` | Reuse an existing dedicated `*_test` PostgreSQL database without resetting it |
| `npm run test:pg` | Same suite against PostgreSQL (`<db>_test` derived from `DATABASE_URL`) |
| `npm run test:e2e` | Playwright end-to-end tests (desktop + tablet) against the seeded dev server |
| `npm run test:smoke` | API, page and search smoke tests against a running dev server (`scripts/smoke.mjs`, `pages.mjs`, `search-check.mjs`; also `integrations-check.mjs`, `ai-check.mjs`) |
| `npm run db:provider [sqlite\|postgresql]` | Align `prisma/schema.prisma` with `DATABASE_URL` (run `db:generate` after) |
| `npm run db:push` / `db:seed` / `db:reset` / `db:studio` | Schema push / demo data / reset+seed / Prisma Studio |
| `npm run db:migrate:deploy` | Apply committed PostgreSQL migrations |
| `npm run icons` | Regenerate PWA icons |

## Testing

```bash
npm test                 # unit (money, permissions, AI intents, planner, dates) + integration (sales, refunds, register, inventory, purchases, expenses, users, tenant isolation)
npm run db:reset && npm run test:e2e   # e2e: login, POS sale → receipt → history, RBAC, RTL persistence, tenant isolation
npm run test:smoke       # with `npm run dev` running
```

The tenant-isolation suite (`tests/integration/tenant-isolation.test.ts`) exercises every service with a foreign business context — reads and writes — and is the most important test in the repository.

## Production deployment

### Docker (recommended)

```bash
cp .env.example .env
# set POSTGRES_PASSWORD, NEXTAUTH_SECRET, CRON_SECRET and DOMAIN=your.public.hostname (+ optional OPENAI/SMTP)
docker compose up -d --build
```

The stack is **PostgreSQL + Redis + app + Caddy + cron**:
- the image switches Prisma to PostgreSQL, builds a standalone Next.js server and runs `prisma migrate deploy` on boot;
- **Caddy** terminates TLS with automatic Let's Encrypt certificates for `DOMAIN` (ports 80/443) and proxies to the app — no manual certificate handling;
- **Redis** backs the shared rate limiter (`REDIS_URL`), so several app replicas enforce the same limits;
- the `cron` sidecar calls `/api/cron/daily` at 06:00.

Health check: `GET /api/health`. HSTS and secure cookies are enabled automatically in production. Settings → **Integrations** shows which services (database, AI, SMTP, Redis, cron) are active — booleans only, never secrets — and lets the owner send a test e-mail.

### Manual

```bash
node scripts/set-db-provider.mjs postgresql
npm ci && npx prisma generate && npm run build
npx prisma migrate deploy
npm start
```

Schedule `POST /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` once a day.

## Architecture

```
src/
  app/                 App Router: (app)/* authenticated pages, auth/*, api/* route handlers
  components/          ui/ (primitives) · shared/ (table, dialogs, forms) · pos/ · products/ · shell/ · providers/
  services/            Business logic (sales, inventory, purchases, register, analytics, ai, planner, business, expenses…)
  lib/                 api.ts (withTenant wrapper), auth.ts, permissions.ts, audit.ts, errors.ts, rate-limit.ts, email.ts, i18n/
  utils/               validation.ts (Zod), money.ts, dates.ts
  hooks/               React Query hooks (useMe, useCrud, useDebounce, usePagination…)
prisma/                schema.prisma, migrations/, seed/
tests/                 unit/, integration/, e2e/, setup/
scripts/               smoke tests, icon generator, DB provider switch
```

**Request flow:** `withTenant(handler, { permission })` → authenticates the session → loads the `TenantContext` (user, business, role, accessible store IDs) → checks the permission → validates input with Zod → calls a service → maps `AppError`/Prisma errors to safe JSON. Services never trust client-provided business/store IDs beyond what the context allows.

**AI assistant flow:** question → `detectIntent()` (weighted multilingual rules) → period detection → service queries scoped by `TenantContext` → (optional LLM with strict "use only this JSON" instructions) → answer + source + underlying data shown in the UI.

More detail: [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`DECISIONS.md`](DECISIONS.md).

## Localisation

All UI strings live in `src/lib/i18n/{fr,ar,en}.ts` (type-checked against the French source). The locale is stored in a cookie so the server renders the correct `lang`/`dir` on first paint (no RTL flash); switching language never reloads or loses state. Numbers, currency and dates use `Intl` with `fr-MA` / `ar-MA` / `en-US`.

## Known limitations / future improvements

- **Offline POS**: an already-open, server-authenticated POS can scan its downloaded catalogue and persist non-credit sales in IndexedDB, issue provisional receipts, and retry with the original idempotency key. A cold start/reload needs a connection to verify identity; authenticated HTML is not cached. Queues/catalogues are scoped by business and user; logout hides rather than deletes pending sales. Legacy ownerless queue entries are retained on disk but never automatically adopted. Cash tickets are bound to their original register; tickets rejected after register closure require manual accounting reconciliation, not automatic posting to the next register. Browser-profile loss/clearing storage can lose unsynced tickets. Cross-device stock reservations and offline card authorisation are not provided.
- **WhatsApp notifications**: architecture hook only; no provider integrated.
- **Rate limiter** is Redis-backed when `REDIS_URL` is set (shared across instances) and falls back to in-memory otherwise.
- **Subscriptions/billing** (`subscriptionPlan` field exists) — no payment provider integration yet.
- **Product images** are URLs; no upload/storage service.
- **Email verification** flow exists in the data model (`emailVerified`) but is not enforced at login.
- Loyalty programme is a simple points ledger; tiers/redemption not implemented.
- PDF/CSV exports are available for receipts and seven accounting reports. Arabic PDF rendering uses Amiri and a limited word-order correction, not a complete bidirectional-layout implementation; complex mixed-script text needs further validation.
- Customer credit sales, manager-set limits and repayments are implemented. **Release blockers:** repayment requests still need server-side idempotency and concurrent settlement/refund hardening. Cash-register closure versus other concurrent cash operations also needs a complete concurrency audit. Passing happy-path tests does not establish production readiness.

## Licence

Proprietary — all rights reserved.
