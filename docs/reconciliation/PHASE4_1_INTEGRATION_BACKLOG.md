# PHASE 4.1 — Dependency-aware integration backlog and migration controls

**Source:** [Master Reconciliation](PHASE4_1_MASTER_RECONCILIATION.md) · [215 screens](PHASE4_1_SCREEN_RECONCILIATION.csv) · [71 feature groups](PHASE4_1_FEATURE_DELTA_REGISTER.csv) · [449 component/function rows](PHASE4_1_COMPONENT_CROSSWALK.csv)  
**Status:** DEVELOPMENT BACKLOG / NO CODE MIGRATION YET. **Canonical destination candidate:** Sage-Auto; V2 remains preserved as design reference.

## Unbreakable acceptance rules
1. Nothing in the current V2 or original system is removed for lack of support in the other repository. A component's exact replacement must be recorded and tested.
2. UI design is imported as **typed React components and shared tokens**, not a second untrusted client-side domain engine.
3. Every tenant, branch, customer, vehicle, booking, rental, invoice, deposit, owner and payout is linked by stable server IDs; server-authenticated permissions apply to every write.
4. UI command success means **the server accepted and persisted the correct authorized state**, not that a local array was mutated.
5. Operational money uses reconciled, immutable accounting records and signed payment-provider evidence; no simulated `Paid` may masquerade as a bank transfer.
6. Old-only backend features retain endpoints/tests and gain appropriate V2 screen affordances; V2-only capabilities receive explicit backend/permission/event decisions.
7. Original UI and V2 route/interaction contracts remain traceable until final accepted replacements are shipped and rollback verified.
8. Each wave produces component parity, API/DTO/permission mapping, migration scripts, smoke/e2e tests, screenshots, accessibility and deterministic failure-path evidence.

## Release gates and dependency order

| Wave | Scope | Hard prerequisites | Completion evidence | Priority |
|---|---|---|---|---|
| 0A | Original test baseline and defects | Stable monorepo checkout; frozen failing logs | Re-run 59 suites, fix 8 failing without weakening assertions, record CI SHA | P0 |
| 0B | Tenant/auth security boundary | Wave 0A; platform permission contracts | Ordinary tenant denied cross-tenant reads, forged headers denied, support sessions scoped and audited | P0 |
| 0C | Persistence and migration design | Transaction/persistence decision | Restart/rescale durable records, atomic allocation and ledger, RLS/tenant tests, rollback drill | P0 |
| 0D | Full API contract reconciliation | 93 wrapper / 487 documented endpoint registries | Re-enumerate current routes; resolve 22 historical mismatches; DTO/error/idempotency signatures | P0 |
| 0E | Design tokens/shared React adapter | Source-to-component inventory | Tokens, shell, navigation, accessible states, route aliases; screenshot diff for 11 portals | P0 |
| 1 | Identity/tenants/roles/branches/subscriptions | Waves 0A–0E | Real login/OTP/recovery, tenant creation, branch-team RBAC, subscription entitlement gates | P0 |
| 2 | Fleet/owners/media/compliance/maintenance | Wave 1 + selected persistence | CRUD, ownership, secure evidence, expiry blocks, work-order clearance and original field parity | P0 |
| 3 | Customers/drivers/pricing/availability | Wave 2 + domain engines | Canonical quote/availability, holds/allocations, concurrent overlap test and identity readiness | P0 |
| 4 | Bookings/checkout/contracts/handover | Wave 3 + payments policy | Quoted request → verified booking → signed contract → complete inspection → transfer possession | P0 |
| 5 | Active rental/extension/return/damage | Wave 4 | Renter/driver/operator see single rental timeline, conflict-safe extension, disputed damage, final calculation | P0 |
| 6 | Invoice/ledger/payments/refunds/owner settlements | Waves 4–5 + verified providers/ledger | Accurate double entry, no duplicate provider receipts, reconciliation, payout stages and owner statement | P0 |
| 7 | Renter/owner/driver/corporate/agent/service/public | Waves 1–6 | Cross-role readback with correct data privacy, authorized actions, notifications and records | P1 |
| 8 | Website Studio/platform control/analytics/optional marketplace | Waves 1–7 | Tenant website publication, platform scoping, actual KPIs; marketplace remains future unless separately authorized | P1/P2 |
| 9 | All-product acceptance | All prior waves | 215-screen dispositions, 22 end-to-end journeys, negative cases, role/tenant security, responsive, accessibility, capacity, restore, rollback | P0 |

## Wave 0A: eight failures to resolve first

Latest original repository CI: [run 38304115430](https://github.com/Sean-steve/Sage-Auto/actions/runs/38304115430), commit `37ff96b57dd7c6232e3c8e6e56eed8d0a5d57996`. Typecheck/lint pass, **51/59 tests pass**. Failures:
- `bookings-and-reservations.test.ts` — deposit requirement expected 30,000.
- `bullmq-background-platform.test.ts` — worker/scheduled task assertion.
- `execution1-operational-repairs.test.ts` — TTL/operational contract assertion.
- `operational-finance-and-invoicing.test.ts` — return/final-calculation prerequisite text contract.
- `pricing-experience-contract.test.ts` — server quote authority assertion.
- `public-booking-and-checkout.test.ts` — expected duration discount.
- `rentals-and-return-lifecycle.test.ts` — invalid post-completion mutation.
- `stripe-card-provider-and-lifecycle.test.ts` — missing backing payable in settlement fixture.

Do not merely update expected strings or weaken assertions; decide canonical business invariants and update code/tests together, with explicit ADR when changing business behavior.

## Wave 0B: security and financial threat gates

- Re-test previously reported tenant bypass using a normal tenant token, forged `X-Platform-Bypass`, a suspended account and an unrelated tenant. Current guard source appears patched but must be verified at assembled API.
- Prove platform analytics and SaaS billing cannot be queried by ordinary tenant members; support access expires, is scoped and revocable.
- Test public/no-login pages separately from signed payment-provider webhooks; verify signature and retry protection.
- Reconcile manual payment callback `src/lib/store.tsx` with actual posting endpoint. Its current local-first payment record is not authoritative; an `apiClient.payments.recordManual(...).catch()` after optimistic success cannot be a payment receipt.
- Validate transfer/auth limits on M-Pesa, Stripe, refunds, deposits and payouts; require source timestamp, idempotency key and no bank-success assumption.

## Wave 0C: durable authority / migrations

Current source: `packages/database/src/record-store.ts` offers durable SQLite when `SQLITE_PATH` is configured; absent the variable it falls back to `Map`. `infrastructure/database/schema.prisma` contains 13 foundational models. `packages/database/src/transaction-manager.ts` has placeholder query and execute functions. Multiple later domain SQL migrations exist in `packages/database/migrations`.

**Decision required:** PostgreSQL canonical production persistence with proper domain tables and tenant RLS; or an explicitly justified, proven alternative. Define compatibility/migration from SQLite namespaces and original client-local state. Do not attempt a blind `localStorage` import as business truth. Specify backup, dry run, records count/reconciliation, dual-read comparison, cutover and rollback.

## Wave 0D: API compatibility

Historical [route audit](../audits/2026-09-23-integration-inventory.md): **93 client methods; 71 structural matches; 22 mismatches**. Re-enumerate live routes against current commit and resolve both service-client and screen-binding contracts.

Historical mismatches:
`tenancy.getTenant`, `tenancy.switchTenant`, `tenancy.provisionTenant`, `bookings.rescheduleBooking`, `bookings.substituteVehicle`, `availability.checkAvailability`, `availability.getTimeline`, `rentals.extendRental`, `rentals.recordIncident`, `customers.updateCustomer`, `customers.verifyCustomer`, `customers.blockCustomer`, `pricing.calculateQuote`, `finance.getInvoices`, `finance.getExpenses`, `finance.recordPayment`, `finance.getLedgerTransactions`, `ownerSettlements.paySettlement`, `compliance.listDocuments`, `compliance.addDocument`, `compliance.overrideHold`, `platform.changeTenantPlan`.

Resolve per endpoint:
`contractID | method | path | request DTO | response DTO | error taxonomy | tenant scope | permission | idempotency | persistence | emitted event | owner UI action | V2 counterpart | acceptance test`. A registered route is **not** a functioning endpoint. Separate internal webhooks/health/admin APIs from UI contracts rather than inventing screens for all 492 legacy registered endpoints.

## Screen-by-screen procedure (applies to each of 215 IDs)
1. Open `PHASE4_1_SCREEN_RECONCILIATION.csv` row; confirm legacy frontend field/action inventory and linked source.
2. Review V2 appearance and required interactive states.
3. Link exact backend owner (service, endpoint, DTO, RLS/RBAC, version/state machine).
4. Enumerate old-only commands and V2-only controls. Append both to final acceptance tests.
5. Build shared React components and page-specific composition without deleting either capability.
6. Test loading, empty, partial, offline, duplicate click, invalid transition, failed provider, forbidden tenant/role and stale optimistic response.
7. Test mobile/desktop keyboard accessibility and cross-screen workflow readback.
8. Mark `ACCEPTED` only with source commit/test/screenshot proof and no regressions.

## 22-journey acceptance requirements

All [J01–J22](PHASE4_1_JOURNEY_GATES.csv) must be executed end-to-end after real API integration, including:
- public/tenant signup, platform admin, billing and suspension;
- fleet onboarding/ownership/compliance, pricing, availability and checkout;
- booking confirmation → contract/inspection/handover → rental/extension → return/damage/closeout;
- operational finance → refund/owner payout, genuine provider records;
- renter, owner, driver, corporate, agent and service partner cross-role views;
- company website publishing and delegated support-access security.

**Deferred future marketplace remains in the requirement ledger**; activation requires a separate trust/settlement/tenancy model approval, not silent removal.

## Delivery and merge strategy

- **Sage-Auto** remains integration destination, branch per wave, PR per coherent vertical slice.
- **Sage-Auto-v2** remains unchanged until V2 features are fully migrated and acceptance baselines are captured.
- Maintain `featureID -> old source -> V2 source -> canonical source -> DTO -> backend test -> UI test -> visual evidence -> security evidence -> approval`.
- Merges require strict TypeScript, lint, domain/unit/API integration, 11-portal visual smoke, owner/tenant negative cases, and relevant end-to-end journeys.
- At a release boundary, run the original 59 suites plus new integration suites and post-migration contract parity checks. Do not make any production deployment claim without environment evidence.

## Immediate next actions (not performed in Phase 4.1)

1. Approve the crosswalk and canonical architecture direction.
2. Start Wave 0A to restore CI green on the original system.
3. In parallel, draft field/DTO-level contracts for Wave 1 and route manifests, without mutating production data.
4. Confirm storage/transaction/RLS approach through ADR and test sandbox.
5. Begin incremental adapter/component port only after the relevant security/persistence contracts pass.

**No application code or data was migrated during this audit.**
