# Sage Auto — Phase 5: Local Activation, E2E Verification and Backend Certification

**Scope:** Local Ubuntu and isolated GitHub Actions services only. **Not** hosting, staging or deployment.  
**Phase 5 status:** In progress — **PostgreSQL application authority is P0-blocked**. A passing schema migration, Redis smoke or SQLite workflow does not imply PostgreSQL-backed application data.

## Verified architecture audit

| Component | Repository source | Current truth |
|---|---|---|
| API/worker record persistence | `packages/database/src/record-store.ts`, `apps/api/src/runtime-env.ts` | **SQLite** (`SQLITE_PATH`) with in-memory fallback only for isolated tests; all main domain repositories use synchronous Map-like adapter. |
| PostgreSQL schema | `infrastructure/database/migrations/*.sql` | Four real SQL files (users, tenant, auth, RLS, outbox); previously `migration-engine.ts` only simulated application. `pnpm db:migrate` **now executes SQL against PostgreSQL** with checksum ledger, transactions and advisory locks. |
| PostgreSQL business-data repository adapter | No implementation wired to `createRecordStore` | **P0 missing.** No claim of PostgreSQL persistence for real vehicle/booking/finance transactions. |
| Redis/BullMQ | `apps/worker/src/infrastructure/redis`, `apps/worker/src/worker.module.ts` | Functional queue infrastructure; previously silently fell back to simulated mode. `REDIS_REQUIRE_LIVE=true` now fails closed. |
| Local fake-money worker | `apps/worker/src/jobs/local-payment-simulation.job.ts` | Development-only opt-in, uses verified fake provider, actual Payment allocation and deposit positions **in the current SQLite record store**. Not real customer money. |
| Seeder/reset | `scripts/db-seed.sh`, `scripts/db-reset.sh` | Previous scripts only printed success. Now both fail closed; no demo records or silent database deletion. |
| Tenant roles and portals | Phase 2–4 integrated API + view workflows | Permission and cross-portal tests available; isolated review accounts, no deployment. |

## Ubuntu 26 local-first prerequisites

Use an existing **dedicated** local PostgreSQL database and Redis service. Do not stop unrelated databases such as Deetoo. Do not bind a second PostgreSQL container to an occupied port.

1. Install Node 24+, pnpm 9.15.9, PostgreSQL client `psql`, Redis, and optionally Chromium for browser tests.
2. If PostgreSQL is installed but no Sage Auto role/database exists, create one using your preferred GUI or native commands. In terminal:
   ```bash
   sudo -u postgres createuser --pwprompt carhire
   sudo -u postgres createdb --owner=carhire carhire_platform
   ```
   Skip either command if already created. Never commit credentials.
3. `cp .env.example .env` and edit **locally**:
   ```dotenv
   NODE_ENV=development
   APP_ENV=development
   DATABASE_URL=postgresql://carhire:YOUR_PRIVATE_LOCAL_PASSWORD@127.0.0.1:5432/carhire_platform
   REDIS_URL=redis://127.0.0.1:6379
   REDIS_REQUIRE_LIVE=true
   REDIS_SIMULATED=false
   LOCAL_CERTIFICATION_MODE=true
   SQLITE_PATH=.data/carhire.sqlite
   APP_PUBLIC_URL=http://localhost:3000
   ACCESS_REVIEW_MODE=false
   LOCAL_PAYMENT_WORKER_ENABLED=false
   ```
   If the native PostgreSQL port is not 5432, use your actual port. `DATABASE_URL` must not contain `?schema=public` because the migration CLI uses libpq/psql.
4. Run:
   ```bash
   pnpm install --frozen-lockfile
   pnpm db:migrate                 # actual SQL applied, transactional, checksum protected
   pnpm local:doctor               # live PG schema ledger and Redis PING (discloses SQLite runtime)
   pnpm local:worker:smoke         # real worker scheduler/BullMQ readiness, no fake Redis
   pnpm test:phase5               # durable SQLite, API, booking/payment and owner permission tests
   ```
   `pnpm local:check` runs these together. `pnpm local:certify` intentionally exits nonzero until the API's business-data authority is migrated to and verified on PostgreSQL.
5. In separate terminals to inspect the app:
   ```bash
   pnpm dev:api
   pnpm dev:worker                 # defaults to real queue mode when REDIS_REQUIRE_LIVE=true
   pnpm dev                        # Vite frontend at http://localhost:3000
   ```
   Use `pnpm dev:workers` **only for isolated fake-money development exercises**. It sets `LOCAL_PAYMENT_WORKER_ENABLED=true`; never run against real customer/business records.

## Test evidence and expected outcomes

| Test | Command | What passes |
|---|---|---|
| SQL migration | `pnpm db:migrate` (twice) | PostgreSQL ledger has four versioned checksums; rerun is idempotent; SQL errors roll back |
| PostgreSQL RLS bootstrap | CI `psql` assertions | 3 tenant-scoped tables have RLS enabled + forced |
| Live Redis | `pnpm local:worker:smoke` | `redisStatus=connected`, running worker registry and scheduler |
| Process-restart durability | `pnpm test:durable` | User, refresh session, vehicle persisted in SQLite across processes |
| Public checkout | `pnpm test:runtime` | Auth, fleet create, website, quote, checkout idempotency and admin projection on SQLite |
| Local provider and deposit allocation | `packages/database/test/local-payment-dispatch.test.ts` | Fake payment verification, funded deposit gate and safe local confirmation |
| Cross-portal authorization | `pnpm test:phase4` | Operator / independent-owner state parity, suspension, role isolation |
| Full regression suite | `pnpm test:matrix` | Repository canonical suites, without claiming live-money or PostgreSQL authority |
| Browser UI | `node scripts/stage4-browser-acceptance.mjs` inside configured isolated review workflow | Seven-role login, navigation and permission-gated sections |
| True production-backend gate | `pnpm local:certify` | **Must fail** until PostgreSQL business record persistence, transactions and RLS are proven |

## Phase 5 remaining P0 work (do not certify prematurely)

1. **True PostgreSQL adapter and domain migrations:** Replace `node:sqlite` `createRecordStore` authority with a transaction-safe PostgreSQL repository implementation for identity, tenant, fleet, bookings, rentals, finance, payables, signatures and outbox. Cross-process concurrency, optimistic locking, unique constraints and transaction isolation must be tested with real PostgreSQL. A migration ledger **alone is not this**.
2. **Schema parity:** Existing four SQL migrations do **not** yet cover all business domains. Add versioned tables, constraints, indexes and verified RLS policies; test non-superuser tenant isolation, including positive read within tenant and cross-tenant negative access.
3. **Real worker/API sharing:** Prove separate API and BullMQ worker processes observe the same PostgreSQL payment positions, status events, deposit state and outbox.
4. **Complete booking lifecycle:** Verify availability → quote → booking → fake provider allocation → deposit HELD → confirmation → contract/handover → rental → return calculation → refund/dispute → settlement → owner views. Persist state across process restarts.
5. **Failure scenarios:** Double callback, missing allocation, duplicate request, unauthorized actor, foreign tenant, expired agreement, worker restart, Redis outage, transaction rollback and backup restore. Do not mark a simulated PAID status as a verified real payout.
6. **Release evidence:** Maintain passing regression + local browser matrix; produce a signed local certification record. External provider and staging/production verification are **deferred by user direction**.

**Acceptance:** Phase 5 is complete only when all P0 tests use live PostgreSQL as the authoritative business database and live Redis, and the previous fail-closed `local:certify` gate becomes valid on actual evidence.

## Existing local launch caveat

The `scripts/access-review.ts` review setup uses a disposable **SQLite** review database and in-app captured verification mail; it is useful to inspect the UI but does **not** represent an authoritative PostgreSQL acceptance or production-like mailbox.
