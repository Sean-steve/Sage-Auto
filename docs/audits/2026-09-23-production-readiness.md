# Production readiness and frontend/backend gap audit

Date: 23 September 2026 (Africa/Nairobi)  
Project: Car Hire OS / auto-spec-sage  
Repository directory: `/home/jenny/Downloads/auto-spec-sage`

**Decision: NOT READY for production or real customer/payment data.**

The project contains substantial domain logic and a working frontend build, but the screens and server do not share an authoritative, durable state. There are also confirmed tenant-isolation and platform-permission failures. Existing production-readiness and closure documents are not sufficient release evidence: the current executable code contradicts important claims in them.

This is an assessment, not an implementation of the fixes. No application source changes were made. Temporary compiler outputs created during verification were removed. The supplied `.git` directory is empty, so a commit identity and tracked-file diff could not be established.

## Scope and measured coverage

- Enumerated the assembled Express application: **495 route registrations, representing 492 unique HTTP method/path pairs**.
- Inspected all **93 domain API-client methods**. **71** have matching registered routes; **22** do not. Of those 22, **10** are referenced through store actions consumed by reachable frontend components.
- Those wrappers represent **74 unique backend endpoints**, including branches in the maintenance and suspension helpers. **418 endpoints have no domain wrapper in the current client**. This is a coverage inventory, not a claim that every endpoint needs a screen: health probes, provider callbacks, public media, and automation are legitimate non-screen consumers.
- Traced imports from `src/main.tsx`, store callbacks, component context bindings, API-client calls, mounted routers, important services/repositories, worker wiring, migrations, Dockerfiles and CI.
- Queried the codebase graph and checked coverage/freshness. JSX had partial graph coverage; frontend mappings were additionally derived from the TypeScript source, import resolution and repository-wide HTTP-call searches. Runtime enumeration was used for backend routing.
- Ran isolated local HTTP checks using synthetic in-memory fixtures, including a normal non-platform user. No external payment, notification or customer system was exercised.

Companion inventory: [all backend endpoints, client methods and frontend store actions](/home/jenny/Downloads/auto-spec-sage/docs/audits/2026-09-23-integration-inventory.md). Machine-readable evidence: [audit data](/home/jenny/Downloads/auto-spec-sage/docs/audits/2026-09-23-audit-data.json).

**A matching route is not proof of a working integration.** Response shape, identifiers, authorization, persistence and lifecycle transitions still matter. Several matching methods fail those requirements.

## Critical findings

### G01 — P0: A client header grants cross-tenant access

`tenant.guard.ts` accepts `X-Platform-Bypass: true` from the request. The resolver grants `PLATFORM_ADMIN` and wildcard permissions when the user has no tenant membership. This branch does not verify platform staff or an approved support session.

**Reproduced:** the same locally signed normal-user token, targeting a synthetic tenant with no membership, received **403** from `GET /api/v1/fleet/vehicles` without the header and **200** with it. This is an authorization failure, not a frontend-only display problem.

Evidence: [header handling](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/tenancy/presentation/tenant.guard.ts:49), [wildcard grant](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/tenancy/application/context/tenant-context-resolver.service.ts:122).

**Required:** remove the client-controlled bypass; resolve any support privilege from authenticated server-side platform membership and a scoped, expiring, audited support session. Add assembled-API tests for a non-member, suspended tenant and unrelated support session.

### G02 — P0: Platform analytics lack platform authorization

The platform analytics module is mounted with authentication but no platform permission guard; its controllers return platform-wide metrics. Earlier broad tenant middleware happens to require a tenant context, but does not establish platform privilege.

**Reproduced:** an ordinary tenant member with no platform membership received **200** from `/api/v1/platform/analytics/overview`. The response contained platform revenue, tenant counts and billing metrics. Tenant analytics/report routes also lack the explicit per-action permission middleware used by many other modules; review their read/export/backfill policy.

Evidence: [mount](/home/jenny/Downloads/auto-spec-sage/apps/api/src/app.module.ts:273), [analytics routes](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/platform-analytics/platform-analytics.module.ts:178), [controller](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/platform-analytics/presentation/platform-analytics.controller.ts:31).

**Required:** apply platform permissions to every platform analytics route, including reports, reconciliation and backfill. Test ordinary tenant roles against the full application.

### G03 — P0: Payments can be represented as paid without verified money

The frontend `processMpesaPayment` awaits the request but does not inspect its result. It then creates a random receipt, marks the attempt `SUCCEEDED`, adds a payment marked `postedToLedger: true`, and updates the booking's paid balance/deposit state. This occurs even when the client returns an API or network error. The wrapper also declares `CUSTOMER_INVOICE` while sending a **booking ID** as `targetId`; the backend treats that ID as an invoice for allocation.

Separately, the mounted backend `POST /bookings/:id/simulate-payment` route modifies paid amount/payment status directly. It is guarded by booking-update permission, but has no production-environment exclusion and does not require verified provider evidence. Manual payment recording should be a governed finance flow, not this simulation shortcut.

Evidence: [frontend fabricated success](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3291), [payment wrapper](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:300), [backend simulation route](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/bookings/presentation/booking.controller.ts:343), [simulation mutation](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/bookings/application/booking.service.ts:1410), [invoice allocation](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/payments/application/payment.service.ts:263).

**Required:** remove fabricated success and production payment simulation. Keep attempts pending until server verification; use the correct invoice/deposit obligation ID, an idempotency key, and server-returned receipt/allocation/ledger state. Verify callback, polling, retry and reconciliation paths together.

## Launch blockers

### G04 — P1: Operational persistence and transactions are simulated

Runtime repositories such as vehicles, tenants, bookings and payments store records in process-local maps. The shared `TransactionManager` returns an empty query result and a constant execute result instead of using a database connection. Consequently, there is no actual database commit/rollback or transaction-scoped PostgreSQL RLS behind those operations. Restarting or scaling API/worker processes cannot preserve/share this state reliably.

The migration engine likewise maintains an in-memory migration registry and simulates SQL execution. Its command reports success without applying the SQL to PostgreSQL. The command scans `infrastructure/database/migrations`, while later domain migrations also live in `packages/database/migrations`.

Evidence: [vehicle repository](/home/jenny/Downloads/auto-spec-sage/packages/database/src/repositories/vehicle.repository.ts:76), [transaction executor](/home/jenny/Downloads/auto-spec-sage/packages/database/src/transaction-manager.ts:21), [migration simulation](/home/jenny/Downloads/auto-spec-sage/packages/database/src/migration-engine.ts:151), [migration directory](/home/jenny/Downloads/auto-spec-sage/scripts/db-migrate.sh:10).

**Required:** implement one real PostgreSQL persistence path and transaction executor, consolidate/version the migration chain, and verify a fresh database, restart durability, tenant isolation, concurrent allocation, rollback and outbox atomicity. SQL files and a PostgreSQL container alone do not provide persistence.

### G05 — P1: The browser and backend maintain independent records

Business screens read demo/localStorage arrays. Most list/get wrappers are not called to hydrate the store. Mutations typically update those arrays first, issue an unawaited API call and report success. The API client returns `{ error }` rather than rejecting, so `.catch(() => null)` does not detect HTTP failures.

For example, creating a vehicle locally generates `veh-...`; the backend generates a UUID. The returned backend vehicle is discarded. Later update/delete/ownership/booking actions use the browser ID, which does not identify the server record. Similar patterns exist for customers, owners, bookings, rentals and inspections. This breaks integration even where the HTTP method/path matches.

Evidence: [local persistence](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:458), [vehicle create and ignored result](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:1467), [server-generated ID](/home/jenny/Downloads/auto-spec-sage/packages/database/src/repositories/vehicle.repository.ts:210), [error-return contract](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:83).

**Required:** load tenant-scoped server data after login/switch, await mutations, check errors and replace local records with server responses. Use rollback if optimistic updates are retained. Restrict demo data to an explicit demo mode.

### G06 — P1: Public storefront and callback routes are behind login middleware

The application mounts authentication and tenant guards broadly on `/api/v1` before the public routes. Express runs those guards even when the following role router has no matching route.

**Reproduced:** unauthenticated requests to public booking, public website, domain resolution, public files, payment webhooks and notification webhooks all returned **401** before their intended handlers. The payment callback must authenticate its provider signature, not require a customer JWT.

Evidence: [broad mounts](/home/jenny/Downloads/auto-spec-sage/apps/api/src/app.module.ts:264), [later public mounts](/home/jenny/Downloads/auto-spec-sage/apps/api/src/app.module.ts:344).

**Required:** scope guards to protected routers; mount public endpoints appropriately; preserve provider signature validation. Also remove the public booking controller's unrestricted tenant-header/query fallback before exposing it publicly: failed host resolution currently falls back to caller-selected tenant IDs. Verify trusted proxy/host behavior explicitly.

### G07 — P1: API-client paths and verbs do not match backend contracts

The following 22 client methods do not have a matching registered method/path. Paths below omit `/api/v1`. “Screen” means a reachable component consumes the calling store action; “Unused wrapper” means no such call was found in the inspected frontend source.

| Client method | Current request | Existing backend route / required decision | Usage |
|---|---|---|---|
| tenancy.getTenant | GET /tenants/:id | GET /tenant/details with verified tenant header | Unused wrapper |
| tenancy.switchTenant | POST /switch | Resolve GET /tenant/context; no switch endpoint exists | Screen |
| tenancy.provisionTenant | POST /provision | POST /tenants | Unused wrapper; UI provisioning is local |
| bookings.rescheduleBooking | POST /bookings/:id/reschedule | POST /bookings/:id/amend-dates; adapt DTO | Screen |
| bookings.substituteVehicle | POST /bookings/:id/substitute | POST /bookings/:id/substitute-vehicle; adapt DTO | Screen |
| availability.checkAvailability | GET /availability/check | POST /availability/check with request body | Unused wrapper |
| availability.getTimeline | GET /availability/timeline | GET /availability/calendar/:vehicleId?start=…&end=… | Unused wrapper |
| rentals.extendRental | POST /rentals/:id/extend | POST /rentals/:id/extensions, then approval lifecycle | Screen |
| rentals.recordIncident | POST /rentals/:id/incidents | No matching incident route; implement or remove promise | Screen |
| customers.updateCustomer | PATCH /customers/:id | PUT /customers/:id | Unused wrapper; UI update is local |
| customers.verifyCustomer | POST /customers/:id/verify | PATCH /customers/:id/verify | Unused wrapper |
| customers.blockCustomer | POST /customers/:id/block | PATCH /customers/:id/status with validated status DTO | Unused wrapper |
| pricing.calculateQuote | POST /pricing/quote | POST /pricing/calculate | Unused wrapper; UI calculates locally |
| finance.getInvoices | GET /finance/invoices | No list route at this path; backend exposes creation and other views | Unused wrapper |
| finance.getExpenses | GET /finance/expenses | No list route at this path; backend exposes creation and other views | Unused wrapper |
| finance.recordPayment | POST /finance/payments | Governed POST /payments/manual or invoice-specific finance payment flow; adapt DTO | Screen |
| finance.getLedgerTransactions | GET /ledger/transactions | GET /ledger/journals | Unused wrapper |
| ownerSettlements.paySettlement | POST /owner-settlements/:id/pay | POST /owner-settlements/:id/payout; adapt payout schema | Screen |
| compliance.listDocuments | GET /compliance/documents | GET /compliance/records | Unused wrapper |
| compliance.addDocument | POST /compliance/documents | POST /compliance/records; adapt record schema | Screen |
| compliance.overrideHold | POST /compliance/documents/:id/override-hold | POST /compliance/overrides with correct scope/subject DTO | Screen |
| platform.changeTenantPlan | POST /platform/tenants/:id/change-plan | No dedicated matching route; define governed subscription/plan change contract | Screen |

Evidence: [API client](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:186), plus every corresponding mounted route in the companion inventory. Dynamic maintenance `schedule/start/complete` and tenant `suspend/reactivate` paths were expanded and **do match**; they are not included in the 22.

Additional contract issues: availability parameters and payment-attempt filters are passed as **headers** to `get()`, not URL query parameters. `startRental(rentalId)` passes a rental ID to a helper that sends `{ bookingId }`. Creating a local scheduled rental already calls the backend start/dispatch endpoint, conflating two lifecycle stages. Settlement approval/calculation and other DTOs need shared-schema checks, not only URL renaming.

### G08 — P1: Successful analytics responses are discarded

The dashboard and reports controllers return raw JSON objects. The frontend reads `res.data`, which is absent because the API client returns the JSON body unchanged. A successful response therefore falls back to browser calculations; report catalogue/execution access can throw on `data.error` and fall back to seed data.

**Reproduced:** dashboard returned **200** with `headlineKpis` and other fields at the top level, no `data`; report catalogue returned **200** with top-level `reports`, no `data`. Vite additionally intercepts catalogue/execution requests and returns empty lists, preventing those requests from reaching the backend during development.

Evidence: [dashboard consumer](/home/jenny/Downloads/auto-spec-sage/src/components/DashboardView.tsx:81), [reports consumer](/home/jenny/Downloads/auto-spec-sage/src/components/analytics/ReportsHubModal.tsx:79), [dashboard response](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/analytics/presentation/analytics.controller.ts:31), [development stubs](/home/jenny/Downloads/auto-spec-sage/vite.config.ts:6).

**Required:** standardize the response envelope or explicitly adapt these clients. Remove silent production/demo fallback; show loading, empty and error states honestly. Remove the development interceptors for integrated testing.

### G09 — P1: Important workflows have UI but no server integration

Local-only operations include tenant provisioning, tenant settings, support-access state, website/domain verification, many pricing mutations, driver creation, customer updates, maintenance task/part/cost/verification/cancellation/schedule/provider operations and local ledger posting. Matching backend functionality frequently exists but is never called by those actions.

Tenant switching changes local state even after the wrong endpoint returns an error. The UI initializes the active tenant to `tenant-nairobi`, while the API client separately restores a saved tenant ID; reloads can therefore display one workspace while targeting another. Memberships, subscriptions, plans and platform membership are seeded rather than hydrated from authorization/billing APIs.

Evidence: [tenant initialization](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:409), [client tenant initialization](/home/jenny/Downloads/auto-spec-sage/src/lib/api-client.ts:27), [switch/provision](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3704), [pricing local state](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3841), [settings](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3429).

**Required:** use one server-validated tenant context; bootstrap authorization, membership, subscription and domain data; connect actions to their lifecycle APIs and only report confirmed success.

### G10 — P1: “Public booking” is an internal demonstration flow

The reachable `src/components/PublicWebsiteView.tsx` chooses the first local customer, uses hard-coded pricing and invokes the tenant-admin `createBooking` action. It does not invoke public discovery, availability, quote, guest checkout or verification APIs. Its success banner claims confirmation and SMS/email delivery without evidence from those systems. The separate `apps/public-web` booking component is not imported by the active application; it also contains a fixed confirmation reference.

Website/domain changes and DNS status in the active screen are local. This is not a deployed customer storefront or verified custom-domain setup.

Evidence: [reachable public preview](/home/jenny/Downloads/auto-spec-sage/src/components/PublicWebsiteView.tsx:70), [unused booking component](/home/jenny/Downloads/auto-spec-sage/apps/public-web/src/PublicBookingExperience.tsx:54), [public backend routes](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/public-booking/presentation/public-booking.controller.ts:56).

**Required:** connect a real public entrypoint to host-resolved public APIs and server quotes. Collect the actual guest's details, complete provider verification, and show only server-confirmed reservation/notification states.

### G11 — P1: Production startup is blocked by incompatible dependency wiring

Safety checks correctly reject development adapters, but the composition root still selects them:

- `PaymentsModule` unconditionally asks its registry for `FAKE_PROVIDER`; the production registry refuses that request.
- `IdentityModule` unconditionally constructs `DevelopmentEmailDeliveryAdapter`; its constructor refuses production/staging.
- `FilesModule` requires a real scanner in production, but `createApiApp` supplies none. The repository contains a mock scanner/interface rather than a wired production adapter.

These three failures were reproduced independently with production-mode constructors and isolated dependency setup. A full production-mode startup without provider credentials failed earlier at payment configuration, so this audit does not claim a successful production boot.

Evidence: [payment wiring](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/payments/payments.module.ts:63), [identity wiring](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/identity/identity.module.ts:44), [scanner requirement](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/files/files.module.ts:96), [composition root](/home/jenny/Downloads/auto-spec-sage/apps/api/src/app.module.ts:211).

**Required:** wire explicit real adapters/providers and startup checks. Do not disable the safety checks to make the application boot.

### G12 — P1: Build/deployment definitions do not deliver a runnable production system

- Root frontend build and root typecheck pass, but **worker compilation fails**, including `TS6059` sources outside `rootDir` and `TS2307` unresolved package aliases.
- The web Dockerfile copies package manifests, `apps` and `packages`, then runs the root Vite build without copying the root `index.html`, `src` and Vite configuration.
- The supplied Nginx config has no `/api` proxy, while the browser client uses same-origin `/api/v1`. Without an additional deployment-level route not supplied here, API requests reach the SPA fallback.
- Shared packages publish TypeScript source via `main`; API/worker images run plain Node 20. Compilation does not rewrite package aliases to the emitted shared-package JavaScript. The runtime packaging strategy needs validation, not merely a TypeScript build.
- CI builds images with `push: false`, does not build the web image, and uses `echo` for deployment and smoke checks. Promotion jobs do not perform the package-manager/dependency setup used in earlier isolated jobs. The declared image digest is not produced by the provenance step. Tag production promotion also depends on a staging job whose condition excludes tags.

Evidence: [worker config](/home/jenny/Downloads/auto-spec-sage/apps/worker/tsconfig.json:1), [web Dockerfile](/home/jenny/Downloads/auto-spec-sage/infrastructure/docker/Dockerfile.web:9), [API Dockerfile](/home/jenny/Downloads/auto-spec-sage/infrastructure/docker/Dockerfile.api:53), [database package entry](/home/jenny/Downloads/auto-spec-sage/packages/database/package.json:5), [CI](/home/jenny/Downloads/auto-spec-sage/.github/workflows/ci.yml:110).

**Required:** fix package build/runtime resolution; build and start all final images; configure frontend/API ingress; publish immutable image digests; replace deployment placeholders with real promotion and smoke checks. Container execution, actual cloud deployment and rollback were not verified in this audit.

### G13 — P1: Readiness can report healthy without working infrastructure

`DatabaseHealthService` returns `isReady: true` without a database query. The local HTTP probe reported database `UP` despite that implementation. Redis connection errors unconditionally allow a simulated queue fallback; the worker readiness endpoint accepts `simulated` as ready. Comments describing test/dev behavior are not environment guards.

Evidence: [database probe](/home/jenny/Downloads/auto-spec-sage/packages/database/src/health.ts:18), [Redis fallback](/home/jenny/Downloads/auto-spec-sage/apps/worker/src/infrastructure/redis/redis-client.ts:74), [worker readiness](/home/jenny/Downloads/auto-spec-sage/apps/worker/src/main.ts:35).

**Required:** probe real required dependencies and fail readiness closed in production. Permit simulation only in explicitly selected tests/development. Verify API-produced events reach the separately running worker through durable storage/queues.

### G14 — P1: Backup/restore status does not establish recoverability

The backup engine keeps catalogues and archives in process memory, seeds a supposedly verified production backup, and records S3/KMS/WORM metadata without performing those infrastructure operations. Its generated encryption key is not persisted/wrapped in the archive, preventing later decryption of that generated payload. The restore engine is not evidence of a real PostgreSQL/WAL/object-storage restore. The UI's operational/readiness screens likewise include fixture status and client-side state rather than proof from a running deployment.

Evidence: [backup implementation](/home/jenny/Downloads/auto-spec-sage/packages/database/src/backup-and-dr/backup-engine.ts:21), [encryption/key handling](/home/jenny/Downloads/auto-spec-sage/packages/database/src/backup-and-dr/backup-engine.ts:101), [restore implementation](/home/jenny/Downloads/auto-spec-sage/packages/database/src/backup-and-dr/restore-engine.ts:31).

**Required:** create durable backups through the actual database/object-store tooling, retain recoverable encryption keys, and restore into a clean isolated environment. Measure recovery time and recovered business/financial invariants.

### G15 — P1: Authentication recovery and UI authorization are incomplete

Login/registration check API errors, which is a useful foundation. However, password reset and email verification ignore returned errors and report success; email verification also changes local user state. Resending verification only returns `Boolean(email)`. Session revocation updates the UI without checking the response. The protected-route JWT guard verifies signatures/claims but does not check the referenced session against server revocation state; an otherwise valid signed token with an unregistered session was accepted in the isolated checks.

Local business caches are not scoped to the authenticated user or cleared as part of logout, and membership/platform/entitlement presentation is based on seed/local state. These UI controls cannot be treated as security controls.

Evidence: [recovery handlers](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:3652), [JWT guard](/home/jenny/Downloads/auto-spec-sage/apps/api/src/modules/identity/presentation/auth.guard.ts:46), [seed membership state](/home/jenny/Downloads/auto-spec-sage/src/lib/store.tsx:471).

**Required:** check every auth result, implement resend through the server, define/enforce session invalidation semantics, hydrate effective permissions, and clear or safely scope user/tenant caches.

## Frontend-to-backend capability map

| User area | Current connection | Missing end-to-end work |
|---|---|---|
| Login/register | Real auth calls; results checked | Production email/session persistence, effective authorization bootstrap |
| Tenant creation/switch/settings | Mostly local; switch calls absent route | Real provisioning/context/settings, unified selected tenant |
| Fleet | Create/update/delete attempts; reads from browser data | Server IDs, hydration, error handling, ownership/media/document contracts |
| Vehicle owners | Create/assign attempts | Server records/IDs; full ownership transfer and terms workflows |
| Customers/drivers/corporate accounts/agents | Customer create attempt; many local/read-only fixtures | Update/verify/block wiring, drivers/corporate/agent management |
| Bookings | Create/confirm/cancel attempts; bad amend/substitute routes | Server availability/pricing, identifiers, state and errors |
| Availability | Browser calculation/calendar | Backend check/search/holds/allocations/calendar integration |
| Rentals | Start/complete attempts; bad extension/incident mapping | Readiness, contract/handover, extension approval, receive/inspect/finalize/deposit lifecycle |
| Contracts/handovers | Server APIs exist | No dedicated client workflows for signature/dispatch readiness |
| Inspections/damage | Local inspection plus create attempt | Server templates, inspection lifecycle, damage comparison/evidence/upload |
| Maintenance | Create/schedule/start/complete attempts | Task/parts/costs/verify/cancel/schedules/providers remain local |
| Compliance | Local documents; wrong API paths | Records, verification/renewal, issues, readiness and governed overrides |
| Pricing | Create-plan attempt; local rules/quotes | Server rates/seasonal tiers/fees/promos, authoritative quotes |
| Finance/ledger | Local invoices/payment ledger; partial mutations | List/read models, governed manual payments, real journal posting/reconciliation |
| Owner settlements | Calculate/approve attempts; wrong payout path | Server schema/period/batch/dispute/payout/statement state |
| M-Pesa/cards/refunds | Fabricated frontend M-Pesa success; backend providers exist | Verified attempts/callbacks, correct obligations, card/refund UI and reconciliation |
| Files/documents/media | Rich backend routes | Client upload/finalize/scan/evidence/document/media workflows |
| Website/domains/public checkout | Internal preview/local settings | Host-resolved real public entrypoint, DNS verification, guest quote/checkout |
| Notifications/CRM | Backend modules exist | CRM pipeline/quotes/tasks and communication preferences/status UI; real provider wiring |
| Tenant dashboard/reports | Real requests, wrong response envelope | Consume server response and exports; remove silent fixture fallback |
| SaaS subscriptions/billing/entitlements | Predominantly seeded/local controls | Tenant/platform APIs, permissions, plan transitions and server audit |
| Platform analytics/admin | Server APIs; some separate app components unused | Mount intended screens and enforce platform guards |
| Observability/DR/readiness | UI simulations/fixture status | Actual operational APIs and external deployment/restore evidence |
| Background jobs/provider callbacks | Normally non-screen consumers | Durable API/worker integration, public callback routing, real health and retry checks |

The full inventory includes all endpoints, including those without a screen, and all 91 `useCallback` store functions. Those callbacks include UI helpers; the local-only count should not be interpreted as a count of missing business features. Import reachability means a component is in the active entrypoint's dependency graph, not proof a user can execute every action under every role.

## Verification results and limits

| Check | Result | Meaning |
|---|---|---|
| Root TypeScript check | Passed | Static types compile; extensive `any` still permits contract drift |
| Root Vite production build | Passed | Main JS bundle approximately 1.11 MB before gzip; chunk-size warning |
| API TypeScript compilation to temporary directory | Passed | Does not prove plain-Node/container runtime packaging |
| Worker TypeScript compilation | Failed | Root directory and module alias errors; production build blocker |
| Standard full test-matrix command | Did not finish | Stalled at worker suite; isolated retry printed all assertions passed but exited via 45-second timeout (124) |
| Individual suites with `REDIS_SIMULATED=true`, 40-second per-suite limit | **43/43 passed** | 42 database/domain suites plus observability; simulated dependency mode |
| Assembled local HTTP security/contract checks | Confirmed failures | Public callbacks 401; cross-tenant bypass 200; tenant user gets platform analytics 200; dashboard/report envelopes differ |
| Production adapter constructor checks | Confirmed blockers | Fake payment accessor, development email and missing real scanner rejected |

### G16 — P1: The test suite does not validate the product integration it claims

The passing suites primarily test services/repositories, fakes and model invariants. For example, the cross-domain “E2E” suite directly creates repository records and uses fake payment/notification providers; it does not drive the browser through the assembled API. The five API-contract tests did not catch the 22 client route mismatches or the middleware/authorization failures reproduced here. The default root `test` script runs a smaller subset; CI's matrix is broader but still does not establish production integration. The matrix discovers database tests, while observability was run separately in this audit.

Evidence: [cross-domain test](/home/jenny/Downloads/auto-spec-sage/packages/database/test/e2e-cross-domain-lifecycle.test.ts:9), [matrix runner](/home/jenny/Downloads/auto-spec-sage/packages/database/test/run-full-test-matrix.ts:77), [scripts](/home/jenny/Downloads/auto-spec-sage/package.json:15).

**Required:** browser-to-assembled-API tests, real PostgreSQL/Redis integration tests, production-mode boot/container smoke tests, and negative tenant/platform authorization checks. Passing simulation tests should remain useful domain evidence, not a release approval.

No live provider credentials, production infrastructure, deployed DNS/TLS, real PostgreSQL migration/restore, load test, dependency-advisory scan, accessibility audit or browser interaction suite was verified. Financial correctness under a real concurrent database also remains unverified. The audit does not claim the unexercised endpoints are functionally correct merely because they are registered.

## Recommended release sequence

1. **Secure the boundaries:** eliminate the tenant bypass, add platform permissions, disable production payment simulation, and correctly scope public/callback routes.
2. **Establish durable backend state:** real PostgreSQL repositories/transactions/migrations, durable events, real adapters, truthful health, recoverable backups.
3. **Repair one complete operating flow:** login → tenant context → customer/vehicle → server quote → booking → verified payment → contract/handover → rental → return inspection → final invoice/deposit → ledger/settlement. Persist server IDs and state at every step.
4. **Complete the remaining mappings:** fix all 22 route/verb mismatches, response envelopes and DTOs, then replace local-only workflows or explicitly remove/defer unsupported features from the launch UI.
5. **Prove the actual release:** build/start final images; deploy a representative staging environment; run browser/HTTP/permission/concurrency/provider/restore checks; require evidence before production promotion.

Release acceptance should require no fabricated payment/operational success, no silent mutation failures, no cross-tenant or platform-role bypass, durable state after restart, verified worker/provider delivery, all launch-screen contracts tested, and a successful production-mode deployment/rollback/restore rehearsal.
