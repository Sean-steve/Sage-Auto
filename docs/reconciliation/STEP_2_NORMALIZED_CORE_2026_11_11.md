# Step 2 normalized rental core — 11 November 2026

Status: partial implementation; **not full Step 2 certification**.

## Implemented

Migration `20261111_006_normalized_rental_core.sql` adds 12 typed tables in `rental_domain`, composite tenant foreign keys, currency and money checks, date/mileage constraints, invoice/payment/deposit reconciliation triggers and independent refund approval checks. All 12 tables enable and force tenant RLS without the legacy platform bypass flag. Source archive retains migration evidence separately from normalized fields.

The backfill script defaults to preview, reads the source in a read-only repeatable-read transaction, requires a restricted target role, refuses populated tenant targets, and rolls back the whole apply if any tenant fails. It does not activate normalized repositories or delete source records.

## Verification

- Restricted actual PostgreSQL login: schema, tenant isolation, missing context, cross-tenant writes, financial constraints, concurrent refund reservation and pooled context checks passed (`.review/normalized-core/schema-test-v3.log`, exit 0).
- Mixed retained-data preview left target empty; failed whole-batch apply rolled back. Selected V4 migration was rejected because actual return precedes actual start. Historical refund classification errors were also rejected. No constraint was relaxed.
- Fixed return form precision and added receipt/final-calculation chronology validation. Fresh isolated PostgreSQL rental lifecycle regression passed (`chronology-regression.json`), including invalid-time rejection without saving a return or calculation.
- Typecheck and frontend build passed. Build still reports bundle-size advice.
- V5 UI lifecycle completed: invoice INV-2026-001003 paid KES 4,060; independent approver completed deposit refund REF-2026-001003 KES 1,000; owner closed rental; CERT 1113 returned AVAILABLE at 10,020 km/full fuel.
- V5 selected backfill passed with 12 source records and one invoice line, including chronology constraints and byte-exact archive verification. Repeat and privileged-role attempts were refused; full source hash unchanged. Mixed-data preview and atomic rejection passed again (`backfill-v5-test.log`, exit 0).

- V5 completed rental, paid invoice and returned vehicle/mileage survived owned API restart and browser reload. Mobile viewport measured 390 px document width at 390 px viewport.

## Reproduce safely

`pnpm test:normalized-core` requires `SAGE_TEST_DATABASE_URL` pointing to an empty isolated local database whose name ends `_test`; the harness creates and removes a restricted login.

`pnpm db:backfill-normalized-core` requires read-source `DATABASE_URL` and separate staging `NORMALIZED_DATABASE_URL`. Preview is default. `--tenant-id <id>` selects a tenant; `--apply` writes only the staging target. Use a restricted target role; never point this staging proof at the active application database.

## Remaining acceptance gates

1. Promote the staging backfill harness into a repeatable tracked integration suite, including representative domain variants beyond the successful V5 path.
2. Implement normalized authoritative repositories and transactional cutover; test rollback and restart. Current application repositories still use `application_records`.
3. Cover remaining domains and all API, worker, public, platform and independent-owner scopes using restricted runtime credentials and explicit context.
4. Apply and verify protection for remaining active application tables. The compatibility table currently has no application-table RLS; the new schema does not protect it.
5. Certify broader failure/recovery and production acceptance separately.

Shared Obsidian checkpoint save remains pending because its MCP tools are unavailable.

Offline usage snapshot (2026-11-11): daily estimated cost USD 15.56. Daily totals include concurrent sessions; this is not an invoice or savings measure.

## Customer repository continuation

See `STEP_2_CUSTOMER_CUTOVER_2026_11_11.md` for migration 007, optional normalized customer CRUD, complete-field staging backfill and the remaining activation limits. This does not replace the earlier runtime-cutover limitation.
