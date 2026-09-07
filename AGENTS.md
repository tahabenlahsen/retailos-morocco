<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# RetailOS Morocco — working notes

## Verify before finishing any change
```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint (0 errors expected; react-hook-form `watch` compiler notes are known warnings)
npm test                   # vitest unit + integration (creates prisma/test.db, ~45s)
npm run dev                # then, in another shell:
npm run test:smoke         # scripts/smoke.mjs (API, isolation, RBAC) + scripts/pages.mjs (every page renders)
npm run test:e2e           # playwright desktop + tablet (needs seeded DB: npm run db:reset)
npm run build              # production build must be clean
```

## Conventions
- Next.js 16: middleware file is `src/proxy.ts` (export `proxy`), route params are Promises, `cookies()`/`headers()` are async.
- Every API route goes through `withTenant()` from `src/lib/api.ts` with an explicit `permission`. Never query Prisma from a route handler directly — add/extend a service in `src/services`.
- **Never change `Product.stockQuantity` except through `applyStockChange()`** (writes the InventoryMovement in the same transaction).
- Money: always `round2()` / `computeLine()` from `src/utils/money.ts`. POS prices are TTC; purchase prices are HT.
- Strings: add keys to `src/lib/i18n/fr.ts` first, then `en.ts` and `ar.ts` (a test enforces parity). Use logical CSS (`ms-`, `pe-`, `start-`, `end-`) for RTL.
- Client state resets: don't `setState` synchronously in `useEffect` (lint error). Use `usePagination(resetKey)`, `useDebounce(value, ms, onSettle)`, render-phase adjustment, or remount dialog content (`{open ? <Content/> : null}`).
- Radix `Slot`/`asChild` requires exactly one child (Button handles this).
- DB provider is chosen by `DATABASE_URL` + `npm run db:provider` (edits `prisma/schema.prisma`, then `npm run db:generate`). This PC's `.env` points at local PostgreSQL 17 (`retailos` db/role; `retailos_test` for `npm run test:pg`). SQLite remains the zero-setup option. Keep the schema free of provider-specific types (no enums/Json) and use `icontains()` for text search.
- `npm test` requires provider `sqlite`; `npm run test:pg` requires provider `postgresql` (the global setup enforces the match).
- To build while `next dev` is running: `BUILD_DIST_DIR=.next-build npm run build` (separate dist dir), then delete `.next-build`.
- Free disk was very low on this PC (build failed once with os error 112); `npm cache clean --force` reclaimed ~4.7 GB.
- `.env` must be UTF-8 (PowerShell `echo >` writes UTF-16 and breaks dotenv).
- If Turbopack throws `TurbopackInternalError` after config changes, delete `.next` and restart `next dev`.

## Non-destructive verification
- PowerShell: `$env:UNIT_ONLY="1"; npx vitest run` runs only unit tests without database setup. Remove the process environment override before running integration tests.
- PowerShell: `$env:REUSE_TEST_DATABASE="1"; npm run test:pg` reuses the existing dedicated `*_test` database without resetting it. Integration fixtures create their own records.
- Do not run `db:reset`, `prisma migrate reset`, or the default integration setup against existing data without explicit confirmation. A Git commit does not back up local database contents.

## Demo logins (password `Demo12345`)
owner@demo.ma · manager@demo.ma · cashier@demo.ma · owner@boutique.ma (separate tenant)
