# Phase 4.2 — Component ↔ API ↔ Data Contract Reconciliation

**Date:** 14 October 2026  
**Implementation branch:** `feat/phase4-contract-reconciliation-ci-repairs` · **Draft PR:** [#16](https://github.com/Sean-steve/Sage-Auto/pull/16)  
**Engineering source:** `Sean-steve/Sage-Auto` · **Design source:** `Sean-steve/Sage-Auto-v2`, baseline `8e7dd81`.

## Decision and scope

Keep `Sage-Auto` as the canonical React/TypeScript + API + backend application. Keep V2 available as visual/interaction and missing-product-feature reference. **Do not copy V2's demo localStorage business state or replace the existing React production views until a feature-by-feature parity proof exists.** Every existing field, state transition, permission, document attachment and backend-only route remains preserved.

This is **source-level contract discovery and selective CI repair**, NOT a claim that V2 and the backend have already been integrated. Each mapping remains an implementation contract with explicit verification status.

## Deliverables (machine-readable, committed with this report)

| Artifact | Contents | Evidence grade |
|---|---|---|
| [Original 215-screen matrix](PHASE4_1_215_SCREEN_DUAL_REPO_MATRIX.csv) | V2 route, original-component/API candidates, integrate/build/preserve categorization | Heuristic candidates |
| [React component preservation](PHASE4_2_REACT_COMPONENT_PRESERVATION.csv) | 59 original React views/modals from tree, V2 matching screen contracts, original-only safety modules | Source-file existence verified; title matching heuristic |
| [Client binding inventory](PHASE4_2_API_CLIENT_BINDING_REGISTER.csv) | 93 prior client methods, recorded route match, frontend consumer, V2 experience and verification gates | September 23 structural report, current client checked lexically |
| [Full backend endpoint preservation](PHASE4_2_FULL_BACKEND_ENDPOINT_PRESERVATION.csv) | 487 historical /api/v1 routes (of 492 unique paths including non-v1 routes), old client consumers and candidate V2 areas | September 23 route inventory, not rerun on today's runtime |
| [Canonical field inventory](PHASE4_2_CANONICAL_DATA_FIELD_REGISTER.csv) | 456 source-declared TypeScript *interfaces* and their property names; Prisma model presence; V2 domain candidates | Text declarations verified, database/DTO fidelity not yet certified |
| [22-journey dependencies](PHASE4_1_22_JOURNEY_BINDINGS.csv) | Cross-portal journeys and full-chain exits | Source-candidate, not executed |
| [Original release blockers](PHASE4_1_BACKLOG_AND_RELEASE_BLOCKERS.md) | Eight CI failures and no-deletion integration roadmap | CI log evidenced |

**Counting rules:** "456 interfaces" means interfaces from six TypeScript source files, NOT 456 live tables. "487 endpoints" covers entries beginning with /api/v1 from a prior inventory, not all 492 registered paths. "59 React components" counts .tsx source files in application/component areas; reusable elements from third-party packages are not exhaustively included.

## Source-backed backend persistence architecture

- `infrastructure/database/schema.prisma` currently defines **13 Prisma models**: User, AuthSession, PasswordResetToken, EmailVerificationToken, Tenant, TenantSetting, TenantMembership, IdempotencyKey, OutboxEvent, EventConsumption, WebhookEvent, AuditLog, SystemHealth.
- `packages/database/src/record-store.ts` supports `node:sqlite` durable namespace/key/value storage when `SQLITE_PATH` is configured, otherwise an in-memory Map in tests. It supports staged transactions, WAL mode and row serialization. Most domain repositories use `createRecordStore`.
- Therefore do **not** assume every rental/finance/owner domain currently maps to a dedicated Prisma/PostgreSQL table. Validate the deployed persistence adapter, concurrency semantics, tenant guards, indices, migration strategy and transactional consistency before integration.
- Prior architecture docs claiming final PostgreSQL RLS production go-live are not proof this checkout runs with PostgreSQL as its domain authority; runtime/test evidence takes priority.

## Core integrated product contracts — primary sources and gates

| Experience in V2 | Original React frontend | Canonical API/controller capability (relative endpoints) | Canonical data/authority | Must preserve & implement |
|---|---|---|---|---|
| Marketing signup, onboarding and recovery | `MarketingSite.tsx`, `AuthModal.tsx`, `AccessApp.tsx` | auth `/register`, `/verify-email`, `/login`, `/sessions`, `/forgot-password`, `/reset-password` | User/session/membership/token services; email verification | Actual OTP/email and expiry; server session; tenant provisioning and recovery; remove sample-only success |
| Company/branches, membership and support | `WorkspaceSettingsView.tsx`, `TeamWorkspaceView.tsx` | tenancy, roles, memberships, authorization/support | TenantContext, Role/Permission, Membership | Branch scopes, permission expiry, cross-tenant 403, audit and restricted subscription status |
| Fleet, ownership, digital twin | `FleetExperienceView.tsx`, `VehicleOwnersView.tsx`, modals | fleet vehicle CRUD, statuses, mileage/fuel, owner agreements | Vehicle, VehicleOwner, VehicleOwnership, fleet repo | Original full field union, documents/photos, ownership, history, readiness, status enforcement |
| Attach media and external references | Fleet asset/media/inspection views | secure files/media intent, finalize, access, media processing | MediaAsset/File, upload intent + external URL metadata | Preserve BOTH verified upload and validated reference, signed access, scanner, audit |
| Pricing Centre / quote lab | `PricingExperienceView.tsx` | pricing rate plans, rates, duration tiers, promos, `/calculate` | RatePlan/RatePlanRate, pricing snapshot, discount engine | All rate fields, date-effective rate, server quote source, optimistic version and discount/deposit correctness |
| Availability planner and holds | `AvailabilityExperienceView.tsx` | availability `POST /check`, `/search`, `GET/POST /holds`, `GET/POST /allocations`, `GET /calendar/:vehicleId` | VehicleAllocation and hold locks + tenant policies | Grid/list modes, full fleet by default, overlap/hold expiry and concurrency tests; human readable errors |
| Bookings and booking changes | `BookingExperienceView.tsx`, `BookingsView.tsx` | bookings `POST /quote`, `GET/POST /`, `PATCH /:id`, `/confirm`, `/cancel`, `/amend-dates` | Booking DTO, pricingSnapshot, statuses, allocationId | Original vs proposed comparison, customer/driver, server repricing, booking source, idempotency |
| Branded checkout | `TenantPublicSite.tsx`, `PublicBookingExperience.tsx` | public-booking quote, availability, checkout and payment intent | PublicCheckoutRequestDto, PaymentAttempt, Booking | Quote/identity/terms, enquiry vs confirmed, callback verification; no mock booking success |
| Contract & handover | `ContractHandoverExperienceView.tsx` | contracts `/generate`, `/:id/sign`; handovers `/schedule`, `/:id/inspection`, `/:id/confirm-signature`, `/:id/handover-keys`, `/:id/complete` | Contract, Handover, Inspection evidence, state machines | No-defect pass ONLY after mandatory checks; signed agreement; possession event; renter/driver updates |
| Inspection, damage and disputes | `InspectionsView.tsx`, `InspectionModal.tsx` | inspections `/templates`, `/:id/responses`, `/:id/damages`, `/:id/evidence`, `/:id/complete`, `/damage-cases` | VehicleInspection, DamageCase, evidence | All original checklist sections, damage history, uploads, signed validation, disputes |
| Active rentals and final return | `RentalsView.tsx`, `ReturnFinalCalculationView.tsx` | rentals `/start`, `/:id/extensions`, `/:id/receive`, `/:id/return-inspection`, `/:id/calculate-final`, `/:id/deposit-settlement`, `/:id/complete` | RentalStateMachine, immutable final, deposit state, ReturnRecord | Possession truth, extension conflict policy, separate physical/finance closeout, explicit disposition before mutation |
| Finance, invoices, deposits, refunds | `FinanceView.tsx` and operational modals | finance `/invoices`, `/invoices/:id/issue`, `/invoices/generate-from-rental`, `/deposits/:id/apply`, `/refunds/:id/approve` | OperationalInvoice, CreditNote, DepositPosition, RefundObligation, balanced ledger | Platform subscription money SEPARATE from tenant rental payments, no negative invoice, provider reconciliation and double entry |
| Owner settlements and statements | `SettlementsView.tsx` | owner settlements `/periods`, `/batches`, `/calculate`, `/:id/approve`, `/:id/payout`, `/:id/statement` | Period, Batch, Statement, Payable, independent approval | Real paid finance facts only; deductions and tax provenance; owner scope and bank verification |
| SaaS analytics and subscriptions | `SaaSControlPlaneView.tsx`, platform views | platform metrics, billing, entitlements, tenant operations | Platform metrics and subscription movement ledger | Real subscription MRR, explicit unavailable facts, no fabricated tenant finance revenue |
| External portals incl corporate/agents/service | RenterAccount; backend corporate/accounts/agents/CRM/service modules | existing company-domain endpoints to be mapped per role | Tenant/member-scoped views and event projections | Reconstruct V2 experiences without exposing tenant/owner/renter private records |
| Original-only governance/operations | `DisasterRecoveryView.tsx`, `ObservabilityConsoleView.tsx`, `ProductionReadinessView.tsx`, `AccessApp.tsx` | telemetry, DR, health, audit and permission gates | Operational and security control plane | **Must NOT delete** because V2 lacks an equivalent screen |

The original APIs above are *relative router paths*; mounted bases, actor guards, DTO parse logic and HTTP response shape must be verified independently. A matching route is not an integration pass.

## No-deletion migration contract (component level)

Before replacing any original React screen or modal, create a parity test covering:
1. ALL user-visible data fields (including infrequently used, conditional, mobile and disabled-only fields).
2. ALL original actions, permissions, data scopes and rejected transitions; historical records.
3. ALL new V2 components/actions; backend contracts for new requirements, never silently disable or remove them.
4. Empty/loading/authorization/error/retry/duplicate-submission/concurrency behavior.
5. File reference + binary upload dual path; document compliance retention.
6. Persisted refresh and role-switch read consistency.
7. Accessibility and responsive testing with existing visual baseline.
8. Audit/event/ledger reconciliation for every state mutation.

No UI-only role switch, browser-local cash ledger or illustrative "Paid" status may be promoted into a real permission or finance state. Unimplemented functionality gets a clearly labeled gated placeholder with a backlog item; it remains in the capability ledger.

## CI repair design decisions on PR #16

| Original failing suite | Evidence-based change on branch | Integrity constraint |
|---|---|---|
| `execution1-operational-repairs` | Clarified expiry copy to match existing TTL semantics | Hold should cease blocking after TTL, backend still authoritative |
| `pricing-experience-contract` | Explicit server-source quote note | Browser cannot override Pricing Engine |
| `operational-finance-and-invoicing` | Error names the mandatory Return & Final Calculation lifecycle | No legal invoice before authoritative closeout |
| `bookings-and-reservations` | Fixture rate plan date precedes rental; pricing resolution supports rate by canonical category ID OR approved category code | Never silently zero out security deposit due to mismatched identifiers |
| `public-booking-and-checkout` | Same pricing fix restores tenant-specific rate lines/duration tier rules | Never substitute vehicle base price for a valid active configured plan |
| `rentals-and-return-lifecycle` | Validate required vehicle disposition **before** mutating rental, booking or contract | A rejected return must leave rental uncompleted |
| `stripe-card-provider-and-lifecycle` | Seed a real, independently approved settlement for payout test | No payout against non-existent settlement; no same-user approval and transfer |
| `bullmq-background-platform` | Change obsolete orphan draft expectation: without authorized period and settled revenue, worker must skip, not emit settlement | Never create owner liability from unsupported DRAFT records |

**Status is not PASS until the latest CI explicitly passes the full test matrix.** If the eight tests expose subsequent failures, fix actual domain behaviors rather than relaxing financial checks.

## Remaining Phase 4.2 verification obligations

- Rerun/replace the September 23 **492-route** runtime inventory at current exact base commit; route mount order can shadow handlers.
- Trace all 215 screens down to **exact component, handler, API method, Zod DTO, actor guard, service, repository, SQLite/Prisma table or namespace and event**. The current matrices are explicit candidate mappings, not finished binding proofs.
- Resolve backend data-model divergence: SQLite serialized record-store namespace vs Prisma/PostgreSQL foundational tables; plan migration with compatibility and rollback before production.
- Record snapshots of high-priority V2 and original React screens with per-field and per-action parity.
- Run all 22 journeys and negative paths on an actual API+database stack; no mocked revenue, identities or payment outcomes.
- Keep both repositories intact and keep PR draft until CI green and review complete.

## Practical next implementation checkpoint

**Phase 4.2 exit gate =** full strict TypeScript and regression CI green; 215-screen coverage still preserved; the first canonical vertical contract slices (auth + fleet/availability/booking/return/finance) have exact DTO/guard/storage path and proof tests. This branch is the beginning of that work, not approval for a bulk visual merge.
