# Sage Auto — Stage 4 Authenticated Release Acceptance

**Scope:** original `Sage-Auto` repository (not `Sage-Auto-v2`). The repair branch is `fix/return-finance-closure-20261014`; `main` remains unchanged pending release verification.

## Automated evidence (14 October 2026)

- [Stage 4 authenticated browser/API workflow](https://github.com/Sean-steve/Sage-Auto/actions/runs/38537564483) — **PASS**.
- Six authenticated roles tested in real headless Chromium against a running Vite app and a separate running Express API, both using a disposable review SQLite database:
  - Company Owner: Returns, Finance, Settlements, Bookings, Rentals.
  - Finance Manager: Returns, Finance, Settlements.
  - Booking Agent: Bookings, Rentals, Returns.
  - Driver: My trips, My inspections.
  - Vehicle Owner: My vehicles, My settlements.
  - Renter: My bookings, My profile.
- Browser checks verify permitted navigation, authenticated module content, session persistence after reload, and no unauthorized sidebar entries (**31 assertions** total).
- Server-side permission probes verify Finance invoice visibility as defined by the actual permission matrix, cross-tenant read denial, and rejection of unauthorized settlement/vehicle-completion actions.
- Live API **zero-balance return** smoke (**16 assertions**): seeded saved Final Calculation → Finance Manager finalizes settlement → Company Owner completes rental → Booking and Contract become COMPLETED → Vehicle becomes AVAILABLE with received odometer → linked allocation RELEASED → completed Return record → idempotent replay → second authenticated session reads durable completion.
- Read-only integrity scan of synthetic completed records: **0 findings**.
- All review users, credentials and database are created under `.review/access/` and removed at the end of CI.

This is genuine browser rendering and HTTP-boundary verification, not only text/code assertions. It is also explicitly **not** a complete production E2E run: the synthetic API scenario begins from a saved Final Calculation. The full Bookings → Handover → Active Rental → Inspection journey remains covered by lower-level suites, but has not yet been driven click-by-click through the browser.

## Run locally without touching business data

In a clean checkout of the repair branch, using separate terminals:

```bash
# Terminal 1: seeds 20 dedicated test accounts and starts isolated API :3511
pnpm review:api

# Terminal 2: isolated web app on :3510, proxies API requests to :3511
pnpm review:web

# Terminal 3: requires Node 24+ and a Chrome/Chromium executable
NODE_ENV=test APP_ENV=test SQLITE_PATH=.review/access/review.sqlite \
  pnpm exec tsx scripts/stage4-live-closure-acceptance.ts
SQLITE_PATH=.review/access/review.sqlite pnpm audit:closure -- --all-tenants
node scripts/stage4-browser-acceptance.mjs
```

**Warning:** The stage4-live script intentionally refuses any database path other than `.review/access/review.sqlite`, and both tests should never be run against real customer data. Start `review:api` on a clean `.review/access` directory for fresh identities and fixtures. `scripts/access-review.ts` refuses staging/production or a caller-supplied `SQLITE_PATH`.

Review-mode sign-in instructions are written locally at `.review/access/ACCESS.md` (owner-only permissions). Never commit or publish them. CI never uploads these credentials.

## Read-only audit against an actual existing SQLite database

Use the separate **read-only** command below for a business database after making a backup, during a controlled maintenance window. It prints hashed record tokens, not raw IDs. This command does not repair or rewrite records.

```bash
SQLITE_PATH=/absolute/path/to/your-existing-sage.sqlite \
  pnpm audit:closure -- --all-tenants
```

Exit status: `0` clean; `2` one or more findings requiring manual review; `1` audit could not run. **Do not use the synthetic closure test script against a business DB.**

If the deployed data source is PostgreSQL or another backend, this SQLite-specific scanner is not a substitute for an equivalent read-only audit against that data source. Confirm authoritative production storage first.

## Remaining pre-merge acceptance

1. Run a complete **click-by-click browser journey** from customer availability and booking through payment, contract, handover, rental, return inspection, final calculation, Finance settlement, fleet release and owner-settlement impact. Verify real persistence after refresh and multiple authorized sessions.
2. Exercise provider callback/refund paths with real provider sandbox accounts. No sandbox transaction may be reported as actual customer money.
3. Inspect the real, backed-up database using a non-mutating audit appropriate to its actual engine. Review historical inconsistencies with a human before any corrective migration.
4. Obtain a Company Owner + Finance + Operations sign-off on permission behavior and reconciliation totals.
5. Confirm release pipeline, rollback plan, environment secrets and deployment readiness before removing draft status and merging `Sage-Auto/main`.

**Release status:** Automated Stage 4 isolation gate passed; production/business-data sign-off remains **NOT VERIFIED**. The draft PR is intentionally unmerged.
