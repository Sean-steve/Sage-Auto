# PHASE 4.1 — SAGE AUTO COMPLETE DUAL-REPOSITORY RECONCILIATION
**Review baseline:** 14 October 2026 (Africa/Nairobi)  
**Status:** SOURCE-INVENTORIED / REQUIREMENT-RECONCILED / NOT YET RUNTIME CERTIFIED  
**Repository of record:** [Sage-Auto](https://github.com/Sean-steve/Sage-Auto) (baseline `37ff96b57dd7c6232e3c8e6e56eed8d0a5d57996`)  
**Visual prototype:** [Sage-Auto-v2](https://github.com/Sean-steve/Sage-Auto-v2) (baseline `8e7dd81ad6fcdef948ac6acd89448f01cff3b693`)  
**Audit branch:** `audit/phase4-1-dual-repo-reconciliation` in Sage-Auto. No application code was changed.

## 1. Objective and non-loss contract

Merge BOTH feature sets, not repositories by file overwrite. Preserve all viable old-system business/domain capabilities and all V2 design, navigation, interaction and cross-role journeys. No feature can disappear simply because its opposite repository lacks a matching screen or backend endpoint. The disposition for each feature is **PRESERVE / MERGE / ENHANCE / BUILD / RECONSTRUCT / FUTURE-CONTRACT**. A retirement requires a separate, explicit reviewed change record with replacement evidence. **Absence of a UI is not permission to delete a backend capability; absence of an API is not permission to remove an approved V2 capability.**

The final implementation should live in the existing **Sage-Auto monorepo** (React + TS apps, Express domain APIs, workers, domain packages). Keep **Sage-Auto-v2** as a frozen/traceable design benchmark while porting the V2 experience into typed React modules. No raw copying of prototype `localStorage` business state, fake receipts, or simulated permission controls.

## 2. Evidence and scope

| Measure | Confirmed source scope | Interpretation |
|---|---:|---|
| Original repository source blobs | **780** | Complete recursive git-tree manifest, not an execution scan |
| V2 repository source blobs | **67** | Complete recursive git-tree manifest |
| Original assembled API controller files | **48** | Code-present, behavior not certified |
| Original domain-service files | **87** | API service implementations of varying maturity |
| Original TS domain unit-test files | **59** | Counted from files; latest CI ran 59 suites |
| Planned V2 screen contracts | **215** | **129 interactive mock, 86 partial** in prior full ledger |
| Planned cross-user journeys | **22** | Prior ledger; integration status is separate |
| Function-level feature groups reconciled | **71** | Includes explicit old-only, V2-only, conflicting features |
| Legacy domain API-client methods | **93** | From Sept 23 audited inventory |
| Earlier client route mismatches | **22** | Historical count; current runtime must be reenumerated |
| Earlier reported unique backend endpoints | **492** | 2026-09-23 runtime audit |
| Endpoints extracted into current CSV | **487** | Strict `/api/v1/` line parser; **5 of the 492 not reproduced** — do not conflate |
| Earlier backend registrations | **495** | Historical scan, not repeated against today's code |
| Legacy store callbacks catalogued | **91** | Includes UI-only helpers; not all need API methods |

**Evidence grades:** `GIT_TREE_INVENTORY` proves path presence; `CODE_REFERENCED` proves static code but not runtime behavior; `2026-09-23_AUDIT` is historical executable evidence and may be stale; `CURRENT_CI` proves stated tests on a specific commit; `RUNTIME_VERIFIED` requires current API interaction with verified auth/persistence; `PRODUCTION_VERIFIED` requires independent staging + runtime evidence, not declarations in documents.

### Source files / traceable datasets

- [Every source file](PHASE4_1_FILE_MANIFEST.csv): 847 original + V2 files, content hash and classification.
- [Every V2 screen contract](PHASE4_1_SCREEN_RECONCILIATION.csv): 215 IDs, portal, existing route/status, old candidate components, backend bounded contexts, intended disposition and runtime verification flags.
- [Every cross-role journey](PHASE4_1_JOURNEY_GATES.csv): J01–J22 with unfinished integration gates.
- [71 feature differences and retention decisions](PHASE4_1_FEATURE_DELTA_REGISTER.csv): no-deletion preservation ledger.
- [Original API-client surface](PHASE4_1_LEGACY_API_CLIENT_MAPPING.csv): 93 methods and historical route-match results.
- [Backend endpoint candidates](PHASE4_1_BACKEND_ENDPOINT_REGISTER.csv): 487 parsed method/path pairs; distinguish system endpoint from a missing screen.
- [Legacy store callback register](PHASE4_1_LEGACY_STORE_CALLBACKS.csv): 91 callback-to-UI references; identifies client-local mutation risks.

**Limits:** The 215-screen crosswalk uses domain/title heuristics to find candidate original components, not AST-level proof of exact DTO/action compatibility; the precise server contract and field mapping are deliverables of Phase 4.2. The prior 2026-09-23 route catalogue is not proof the current API exposes identical 492 routes.

## 3. Repository architecture — observed code

### Sage-Auto (canonical code candidate)

```text
src/App.tsx                        -> pathname dispatch: public marketing / site / renter / AccessApp
src/components/AccessApp.tsx       -> login and portal selection
src/components/RestoredWorkspace  -> role/section shell and many lazy domain views
src/components/*ExperienceView    -> Fleet / Booking / Pricing / Availability / Contract Handover
src/components/FinanceView        -> invoices, deposits, payments, reconciliation, ledger
src/components/ReturnFinalCalculationView -> physical return -> charge calculation
src/components/VehicleOwnersView  -> owner profiles and terms
src/lib/store.tsx                  -> mixed React state + API client callbacks
src/lib/api-client.ts              -> domain REST wrapper (93 audited methods)
apps/api/src/modules/*             -> 35+ bounded API modules / 48 controllers
packages/database/src/repositories -> numerous domain repositories
packages/database/src/record-store.ts -> SQLite-backed KV record store when SQLITE_PATH set; fallback Map without configuration
packages/database/src/transaction-manager.ts -> PostgreSQL transaction facade STILL contains placeholder query=[] and execute=1
infrastructure/database/schema.prisma -> **13 models**, primarily identity/tenancy/foundation
packages/database/migrations/      -> additional domain SQL migrations
apps/worker/                       -> jobs and event handling
```

This is **not one verified PostgreSQL production state**. A durable SQLite record-store path exists in current code but the PostgreSQL transaction-manager shown in the same repository remains a stub; the 13-model Prisma base schema alone does not represent all domain entities. Determine actual runtime storage per repository/module and tenant enforcement before any mutation migration.

### Sage-Auto-v2 (visual source of truth)

- `app.js`: 11 persona/experience portals with hash routing; public, platform, company, branded rental, renter, owner, driver, corporate, agent, service and future marketplace.
- `company-detail.js`: fleet/owners/people/inspections/maintenance/pricing/availability/contracts/returns/finance/settlements browser-local operations.
- `external-portals.js`: cross-role portal-specific views and demo records.
- `gap-closure.js`: signup, checkout, amendment, refund, SaaS operations and other gap experiences.
- `rental-core.js`, `rental-journey.js`: explicit client-side lifecycle demonstrations and safe finance/payout distinctions.
- `motion-studio.css`, `experience-foundation.css`, `rental-journey.css`: visual language and reusable patterns.
- 215 screen contracts are **not 215 finished production screens**. Prior full inventory: 129 interactive mocks, 86 partial.

The V2 GitHub Pages preview is a successful static deployment, **not** a production app or backend integration.

## 4. Material conflicts / mandatory design decisions

| ID | Conflict | Decision / acceptance needed |
|---|---|---|
| ARC-01 | Two separate frontend routing/states: V2 hash routes / vanilla JS vs original React/TS pathname and AccessApp | Port design to a typed React route manifest/feature shell; keep route aliases until verified |
| ARC-02 | V2 demo `localStorage` arrays vs old React local-first state vs REST/DB | **Server is the only business source of truth**; localStorage may hold non-sensitive presentation preferences only |
| ARC-03 | Browser-generated synthetic IDs vs server UUIDs | Canonical backend IDs, typed DTOs and request correlation; no speculative success toast |
| ARC-04 | SQLite record-store vs PostgreSQL Prisma foundation vs placeholder transaction manager | Choose and prove production persistence/transaction/RLS model, then test migration/backups |
| ARC-05 | Inferred permissions, platform previews and approved support sessions | Authentication and tenant/branch scope strictly server enforced; no client bypass |
| ARC-06 | V2 illustrative price and payment vs backend pricing and ledger | Server-only pricing snapshot; provider-verified receipts and double-entry allocation |
| ARC-07 | V2 demo booking/rental/return status vs old multi-step state machines | One versioned booking/handover/rental/return contract; reject invalid transitions atomically |
| ARC-08 | Owner demo `Paid` vs financial payout approval, sent and settlement | Distinct review, approved, pending transfer, bank confirmed and failed outcomes |
| ARC-09 | Two UX designs, overlapping controls and old components omitted from V2 | Preserve all fields/actions in final design even where composition changes |
| ARC-10 | Static screenshots/Axe pass vs server functional correctness | Independently gate component, API, DB, authorization, E2E and cross-role readbacks |
| ARC-11 | Historical docs claim production live; latest executable CI fails | Source/runtime/CI evidence outranks aspirational release reports |
| ARC-12 | V2 marketplace is a concept, original public catalogue exists | Preserve concept, do not silently turn on cross-tenant booking |
| ARC-13 | Migrations in different locations; current TypeScript façade does not commit PostgreSQL transactions | Normalize migration source + transactional outbox boundary, test upgrades/rollbacks |
| ARC-14 | Card/M-Pesa provider simulations and unverified manual receipts | Provider signatures, idempotency, refund authority and reconciled money mandatory |
| ARC-15 | Different data shapes, currency/date, role flags and form defaults | Versioned DTO/validation adapters and explicit source/provenance on every KPI |

### Historical audit vs current-code remediation

The older [23 Sept 2026 critical-readiness audit](../audits/2026-09-23-production-readiness.md) documented unauthorized tenant bypass, platform analytics access, fabricated payment success, local/remote state divergence and more. **Not all findings should be assumed still present.**

Current inspection shows:
- `tenant.guard.ts` now passes `platformBypass: false` and no longer contains an `X-Platform-Bypass` reference. Historical G01 is **apparently patched in code, but requires new non-member + forged-header tests**.
- `src/lib/store.tsx` now refuses `processMpesaPayment` when online payments are not configured. The earlier automatic STK-payment claim is **changed in that path**; separate manual-payment and ledger callbacks still optimistically append browser state and fire an unawaited API request.
- `packages/database/src/record-store.ts` now provides SQLite persistence when `SQLITE_PATH` is set, superseding the earlier blanket "process-only Map" description for some runtime paths. But `TransactionManager` still has stub `query/execute`; migrations and true distributed tenant isolation require proof.
- Platform analytics authorization, webhook/public routing, production provider adapters, worker readiness and API-contract mismatches **must be re-tested; docs/comments alone do not establish their current safety**.

## 5. Production blocker — current CI reality

On `Sage-Auto` commit `37ff96b57dd7c6232e3c8e6e56eed8d0a5d57996`, GitHub Actions [run 38304115430](https://github.com/Sean-steve/Sage-Auto/actions/runs/38304115430) reported:
- Lint and strict TypeScript typecheck **PASS**.
- Full 59-suite matrix: **51 PASS, 8 FAIL**.
- Failing suites: booking/reservation; BullMQ background processing; operational repairs; finance/invoicing; pricing experience; public booking/checkout; rentals/returns; Stripe lifecycle.
- Image build, staging and production promotions **SKIPPED** after the test gate failure.
- These are concrete test failures, not proof that all 8 domains lack implementation. Freeze their acceptance contracts before changing assertions or loosening logic.

On `Sage-Auto-v2` commit `8e7dd81...`, the latest GitHub Pages workflow and earlier audit-led browser/accessible UI checks **PASS**, verifying its static prototype scope only.

## 6. Final component approach

Use **React/TypeScript + shared design tokens** in the canonical monorepo. Port V2 layout/layout patterns as composable React components; **do not iframe static prototype or duplicate a second business store**. Build reusable `WorkspaceShell`, `PersonaNavigation`, `ActionBoard`, `EntityList/Table`, `EntityDrawer`, `InspectionChecklist`, `DateAvailabilityBoard`, `BookingDossier`, `FinancialBreakdown`, `PayoutTimeline`, `EvidenceUploader`, `AuditTimeline`, `AsyncState`, `PermissionBoundary`, `StatusLabel` and `FormField` with purpose-specific variants. Retain the original special-purpose tables/forms (fleet digital twin, full pricing matrices, journal/ledger, state-machine history, media processing) behind appropriate progressive disclosure.

For every feature:
1. Old component + field/action inventory.
2. V2 component, interaction, accessibility/response states.
3. Canonical entity/DTO/state machine and permissions.
4. Exact API endpoint/request/response/error/side-effect mapping.
5. Original + V2 capability parity assertions.
6. Demo behavior removed only **after** real behavior passes tests and the migration ledger signs off.

## 7. Phased rollout gates

**Wave 0 (must clear before real integration):** CI baseline, security authorization/tenant bypass tests, storage/transaction semantics, duplicate-receipt and money integrity, accurate health/readiness, end-to-end staging contract.

**Wave 1:** identity, tenancy, branches, team/RBAC, SaaS entitlements.

**Wave 2:** fleet, owners, media, compliance, maintenance.

**Wave 3:** customers, drivers, pricing/quote, availability/allocations.

**Wave 4:** booking, branded checkout, contracts, inspections, handover.

**Wave 5:** active rental, extension, return and canonical final calculation.

**Wave 6:** invoice, payments, deposits, refunds, ledger and settlement.

**Wave 7:** renter/owner/driver/corporate/agent/service portals, website studio, platform operations and analytics.

**Wave 8:** complete original+V2 parity acceptance, all 22 user journeys, 215 screen dispositions, security, mobile/a11y, load tests, DR, staging promotion and rollback.

The detailed order, owners-by-component and exit evidence are in [Phase 4.1 Integration Backlog](PHASE4_1_INTEGRATION_BACKLOG.md).

## 8. Gate to Phase 4.2

Phase 4.1 is complete as a **source-level reconciliation and preservation register**, not as proof of full UI or backend behavior. To begin actual migration, accept the proposed canonical repository, make explicit decisions on storage and auth trust boundaries, and reconcile all 22 historical client endpoint mismatches. Re-run actual tests on exact commits. Do not directly merge either codebase into the other by overwriting files.

**No application components, APIs, permissions, migrations or runtime data have been modified by Phase 4.1.**
