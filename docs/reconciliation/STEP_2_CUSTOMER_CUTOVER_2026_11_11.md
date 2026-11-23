# Step 2 customer cutover checkpoint — 11 November 2026

**Full Step 2 is incomplete. Launch readiness and every-workflow acceptance are not certified.**

## Implemented

- Complete typed customer columns, tenant-scoped tag rows and number allocation in migration 007. Migration 007 intentionally requires an empty customer staging table: rebuild earlier incomplete staging snapshots from preserved source rather than inventing identity details.
- `CustomerRepository` selects the normalized implementation when `CUSTOMER_REPOSITORY_BACKEND=normalized`. Default remains compatibility. Normalized CRUD does not read or write `application_records`, requires PostgreSQL and a restricted non-owner role, and shares the request transaction.
- Full-field backfill uses the same explicit field map as the repository and preserves ordered tags. The mapping is checked against the Customer TypeScript type.
- Shared transaction tenant binding rejects nested cross-tenant changes. Unknown storage backend settings now fail rather than silently falling back.
- Runtime source inventory identifies 164 named compatibility-store namespaces. This counts declarations, including the optional customer fallback; it is not a count of broken workflows. `pnpm db:cutover-coverage --require-complete` deliberately fails while compatibility call sites remain.

## Verified

- Isolated normalized customer regression passed with no compatibility table present: routed CRUD, all fields/tags, reconnect, tenant isolation, duplicate constraints, number allocation, stale-version rejection, rollback and privileged-role refusal.
- Expanded V5 staging backfill passed: full customer mapping, byte-exact archive, paid invoice, zero held deposit, completed refund/rental and available vehicle. Preview did not write; invalid batch rolled back; repeat/privileged target attempts were refused; source hash remained unchanged.
- Shared transaction regression passed, including nested tenant switching rejection and context clearing after commit.
- Coverage gate regression passed. Diff whitespace check passed.
- Final typecheck and production build passed (exit 0). The build retains the existing bundle-size advisory. Existing customer/driver/corporate/agent regression passed against a fresh compatibility-backed PostgreSQL database.

## Activation limits and next work

1. Do not enable the customer flag against the current review application database: migrations, full backfill, restricted application role and tenant root provisioning must be coordinated first. The isolated test proves repository operation, not fresh-company application cutover.
2. Complete normalized tenant lifecycle and permission-aware access paths, corporate accounts/drivers and customer relationships. The staged corporate account reference is not yet a foreign key.
3. Implement and switch the remaining operational and platform repositories, with full field preservation, tenant-safe constraints, atomic cross-domain transactions and worker/public/owner contexts. Keep the inventory current.
4. Repeat fresh-company paid-rental UI acceptance using normalized runtime repositories, then all role-separated and failure/recovery scenarios. Existing V5 UI evidence ran on compatibility-backed PostgreSQL.
5. Complete provider, worker recovery, backup/restore and reproducible deployment gates before a launch recommendation. No blanket workflow PASS is supported.

Evidence: `.review/normalized-core/customer-test.json`, `customer-test.log`, `customer-backfill-test.log`, `cutover-boundary.json`, `coverage-test.log`; prior tests and failed attempts remain private diagnostic evidence. Shared Obsidian save is pending because its MCP tools are unavailable.
