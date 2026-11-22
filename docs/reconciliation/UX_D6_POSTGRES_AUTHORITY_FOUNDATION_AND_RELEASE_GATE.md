# Phase UX-D6 — Native PostgreSQL Authority Foundation & Production Gate

**Date:** 22 November 2026  
**Repo:** Sean-steve/Sage-Auto  
**Branch:** feature/ux-d6-postgres-authority-foundation-20261122  
**Stack base:** UX-D5 PR #39 (depends on D0–D4 PRs #34–38)  
**Status:** Native SQL foundation and automated financial integrity proof delivered. **Full application database cutover NOT complete. Production NO-GO.**

## Why this phase cannot be truthfully declared fully complete

Audit confirms **108 domain repository files** in packages/database/src/repositories. Many depend on the synchronous Map-compatible createRecordStore implementation backed by node:sqlite. Apps/api/src/runtime-env.ts previously forced SQLITE_PATH for all non-test runtimes. TransactionManager.run had a fake executor returning successful writes in memory. PostgreSQL schema migration was separate from the actual business data.

Converting a SQL connection URL or making schema migrations green cannot make any of those legacy repositories read/write PostgreSQL. Production billing, deposits, rental state and settlement require a **single native transaction authority across API and worker**. The new PG foundation is intentionally additive and does NOT silently mirror or migrate SQLite records.

## Delivered now

1. Added checked SQL migration 20261122_005_pg_business_authority_foundation.sql. Live schema now includes sage_business_records with tenant UUID scope and optimistic record_version; sage_business_claims with durable tenant-scoped deduplication; sage_vehicle_allocations with PostgreSQL GiST exclusion of overlapping active reservations; enforce RLS/FORCE RLS on all three. Unique business keys protect tenant-specific provider transaction, booking number, invoice number and vehicle plate. JSONB payload cannot change its tenant identity.
2. Corrected previously permissive platform bypass: app_is_platform_bypass requires a DBA-granted sage_auto_breakglass membership as well as the GUC. Any unprivileged role setting app.is_platform_bypass=true alone is not enough. Added required permissive policy companions for the original restrictive tenant_settings, tenant_memberships, idempotency_keys RLS rules.
3. Created packages/database/src/postgres/tenant-business-store.ts using real node-postgres Pool. withTenantPgTransaction uses BEGIN ISOLATION LEVEL SERIALIZABLE, checks the executing SQL role is **not superuser/BYPASSRLS**, binds tenant identity by transaction-local set_config, forbids nested cross-tenant operations, rolls back on error and releases the connection. PgTenantRecords exposes paged reads, insert, optimistic CAS update and delete, all mandatory tenant-scoped. claimPgOperation ensures claims survive cross-process restart, with replay/conflict distinction. reservePgVehicle respects PostgreSQL overlap exclusion. These are **not** wired into the legacy API repositories.
4. Installed pg and @types/pg in the database workspace, regenerated and committed the pnpm workspace lockfile via a temporary feature-branch-only GitHub workflow. Removed the write-enabled workflow immediately after sync.
5. Explicitly prevent staging or production API/worker startup while legacy business data remains SQLite. Direct Express creation also checks the NO-GO. Legacy TransactionManager's fake executor now rejects all non-test execution; existing simulated unit tests are explicitly marked test-only.
6. Added real PostgreSQL 17 / Redis 7 CI with five SQL migration checksum/idempotency checks, new RLS/FORCE assertions, a non-superuser NOBYPASSRLS test role, native Pg data authority transactions, duplicate provider prevention, nested tenant denial, optimistic locking, rollback recovery, three allocation intervals, arbitrary platform bypass attempt and **two independent Node processes reading AND changing the same booking plus callback claim**. The same workflow runs D5 HTTP, cross-portal, finance, payments and frontend build checks against the unchanged isolated legacy test runtime.
7. Added a negative startup guard test that forks fresh runtime processes under staging/production environments and confirms the API and worker refuse to run SQLite authority.
8. Updated the Phase 5 and UX-D5 CI PostgreSQL migration ledger assertions to expect five migrations.

## Exact scope of test evidence

- **Real PostgreSQL 17 tests:** native business RECORD foundation, RLS as unprivileged role, CAS, transaction rollback, callback claims, provider uniqueness, interval exclusion, and cross-process booking record reads/writes. This proves the NEW helper works; it does NOT prove BookingService, PaymentService or SettlementService have migrated.
- **Real Redis 7 tests:** BullMQ scheduler/worker startup with simulated Redis explicitly disabled; real external payments are not used.
- **Legacy full API tests:** UX-D5 API, cross-portal, finance, payments and frontend build still execute on isolated SQLite/in-process record storage. They cannot prove native PG business authority.
- **Production gate:** remains deliberately false in scripts/phase5-local-doctor.mjs and the startup guard. pnpm local:certify is intentionally NOT certified.

## Production cutover wave map (pending work; do not skip)

| Wave | Repository domains requiring real SQL authority | Safety checks |
| --- | --- | --- |
| D6.1 | User/auth/session/token, tenant settings/memberships/roles, support and billing controls | Failed provisioning rollback, role revocation, no platform bypass, tenant RLS as a non-superuser |
| D6.2 | Vehicles, ownership agreements, availability blocks, allocations, pricing plans and rates | No duplicate plates, owner evidence, no overlapping vehicle claims, correct dated pricing |
| D6.3 | Customers/drivers, booking/reservation, contracts, handover, rentals, inspections and returns | Verified deposit gating, first-rental completion, immutable booking price snapshots, safe start/return |
| D6.4 | Payments/attempts/allocations, deposits/refund obligations, invoices/credits, journal entries, expenses | Verified provider events, atomic payment allocation, posted balanced double entry, refunds and reversals |
| D6.5 | Owner settlement/payout/beneficiary authorization, audit/outbox/inbox and idempotency | Signed agreement and beneficiary controls, exactly-once financial effects, durable outbox/replay |
| D6.6 | Subscription/billing, website/media/files, CRM, compliance/maintenance, notifications and analytics | All tenant activity survives process restart, no silent SQLite fallback, no feature loss |
| D6.7 | Real API+worker PostgreSQL and Redis E2E, seven-role browser, backup/restore, security and release | pnpm local:certify success with PG17 as sole authoritative store; negative RLS, crash/restart, balanced ledger, zero double charges |

## Required local configuration for the new PG foundation test

Set up PostgreSQL 17 and Redis. Run pnpm db:migrate against a **dedicated local development database**. Use a separate low-privilege PostgreSQL login with NOBYPASSRLS and required GRANTs to run pnpm test:ux-d6. Keep database admin credentials for schema migrations only; never use admin/superuser for business transactions.

    pnpm install --frozen-lockfile
    pnpm db:migrate
    pnpm typecheck
    pnpm test:ux-d6
    pnpm test:ux-d6:gate
    pnpm test:ux-d5
    pnpm test:phase4
    pnpm test:finance
    pnpm test:payments
    pnpm build

The test suite has a dedicated isolated non-superuser role creation example in .github/workflows/ux-d6-certification.yml. NEVER reuse CI passwords as real credentials. No real customer payments or production financial data are used in these tests.

## Release decision

**Dashboard integration: previously certified at UX-D5 CI scope.**  
**PostgreSQL foundational SQL operations: verified with live PG17.**  
**Native PG authority across all existing domain repositories: NOT IMPLEMENTED.**  
**End-to-end real worker/API financial lifecycle on PG17: NOT CERTIFIED.**  
**Seven-role desktop/mobile browser E2E: NOT EXECUTED.**  
**Production gate closure: NO-GO.**

P0 Issue #33 stays OPEN. Do not change pnpm local:certify to pass, do not mark PgTenantRecords as the default storage backend, and do not merge into main or deploy under a production-ready label until D6.1–D6.7 evidence is available. A green GitHub Actions result means this **foundation** meets its tests, not that the business is running on PostgreSQL.
