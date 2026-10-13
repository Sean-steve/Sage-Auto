# Phase 4.1 — Dual-Repository Product Reconciliation

**Date:** 14 October 2026 · **Stage:** read-only code and documentation audit; no feature migration or runtime changes.
**Canonical engineering repository:** [Sean-steve/Sage-Auto](https://github.com/Sean-steve/Sage-Auto), inspected at baseline `37ff96b57dd7c6232e3c8e6e56eed8d0a5d57996` (subsequent documentation-only commits excluded).
**Experience reference:** [Sean-steve/Sage-Auto-v2](https://github.com/Sean-steve/Sage-Auto-v2), baseline `8e7dd81ad6fcdef948ac6acd89448f01cff3b693`.

## 1. Executive decision

**Do not overwrite the original application with V2, and do not treat either application's feature list as exhaustive.** `Sage-Auto` already has a React/TypeScript application, Express-style API controllers, database/domain packages, workers, tenant boundaries, integrations and payments infrastructure. `Sage-Auto-v2` is a polished multi-portal static JavaScript prototype with local browser state. Migrate the *experience architecture and missing interactions*, not the mock data as a new source of truth. Reconcile retained original capabilities into the resulting design.

### Verified source inventory
| Attribute | Canonical Sage-Auto | V2 design/prototype |
|---|---|---|
| Files in full repo tree | 780 | 67 |
| Product frontend | React/Vite/TypeScript; `src/App.tsx` plus 51 `src/components/*.tsx` files | `index.html` and layered static JS/CSS renderers |
| Back end | 36 controller-backed bounded-context directories, 47 controller files under `apps/api/src/modules` | No API server |
| State | `src/lib/store.tsx` React context and `src/lib/api-client.ts` (REST and fallback behaviors requiring audit) | Browser-local sample records, hash navigation |
| Integration state | Previously inventoried 492 unique endpoints / 93 client methods / 71 structural matches; **as of September 23, not re-executed** | No authoritative API bindings |
| Screens | Existing React operational, marketing and account components; not one-to-one with V2 screens | 215 design contracts: 129 `interactive_mock`, 86 `visual_or_partial` in previous ledger |
| Cross-role scope | Platform/tenant/public apps, original React views, API modules | 11 user portals, including owner/driver/agent/corporate/service and future marketplace |
| Persistence | Database packages and infrastructure present; live environment not verified | Browser localStorage only |
| CI (latest checked) | Lint and strict typecheck pass; 51/59 regression suites pass; 8 fail | Pages and visual QA passed at V2 `8e7dd81` |

**Evidence limits:** File existence does not certify that an endpoint's payload, tenancy, authorization, service behavior, production deployment or frontend wiring works. A prior Sprint 47 document claims live production closure and 99.98% uptime, but these claims are **not independently corroborated** here, while the most recent executable CI is red. Treat that document as historical architecture context rather than current release evidence.

## 2. Required five-way preservation classification
- **PRESERVE:** existing capability that is not shown in V2: retain the domain, backend and workflow; design a new placement without cutting functionality.
- **MERGE:** existing backend + existing/new V2 UI: map state/DTO, choose one authoritative data source, migrate functional UX with regression gates.
- **ENHANCE:** both exist, but V2 offers clearer workflows, states or analytics: retain all fields and enhance the view.
- **BUILD:** V2-only working interaction without backend: define full domain/permission/event/audit contract first; make no false success.
- **RECONSTRUCT:** both have gaps, broken paths or incompatible assumptions: implement a fully tested vertical slice using the product blueprint.

The 215-row mapping in [PHASE4_1_215_SCREEN_DUAL_REPO_MATRIX.csv](PHASE4_1_215_SCREEN_DUAL_REPO_MATRIX.csv) is a **candidate-matching inventory**, not confirmed integration. Its classes reflect heuristic matching by screen title to existing files and controller directories: 149 MERGE/ADAPT, 32 frontend candidate awaiting API confirmation, 10 backend candidate needing UI, 24 requiring discovery/build. Reclassify after source-level DTO/action tracing and testing; these figures must not be interpreted as completed features.

## 3. Domain-wide feature reconciliation and ownership

| Domain / journey | Canonical implementation evidence | V2 experience | Final implementation obligation | Disposition |
|---|---|---|---|---|
| Public marketing and sign-up | `MarketingSite.tsx`, `AuthModal.tsx`, auth controller/services | Marketing, tour, verified-email *example*, plan onboarding | Bring V2 visual journey to React; real validation, registration, session, email delivery; no example OTP in production | MERGE |
| Tenant provisioning, SaaS subscriptions | Platform, billing and entitlement controllers, SaaSControlPlane/PlatformTenantControls | Tenant approvals, revenue, subscription recovery, governance | Preserve all tenant states, feature entitlements, usage and enforcement; replace indicative numbers with platform-metric queries | MERGE |
| Identity & RBAC | Auth and authorization services, guards, `AccessApp`, `TeamWorkspaceView` | Role selector/permissions preview | Server sessions, membership-derived route access, forbidden states, actual permission contracts | PRESERVE + ENHANCE |
| Company and branches | Workspace/settings + tenant/domain services | Company/locations, branch workspace | Keep branch rules, owners, staffing, audit trails and settings not present in V2 | MERGE |
| Fleet asset lifecycle | Fleet/vehicle owner/domain and React FleetExperience/FleetView | Fleet gallery, asset profiles, owner links | Reconcile all original asset fields, lifecycle actions, ownership and schedules; V2 presentation only | MERGE |
| Compliance/maintenance | Compliance and maintenance controllers/state machines | Readiness, service-hold, document states | Enforce legal/operational blocks in backend; preserve work orders and maintenance history | PRESERVE + ENHANCE |
| Media and files | Secure files/media upload, access, reconciliation and image processors | URL/reference or chosen filename demo | Implement both actual uploads and verified external links; access control, scanning, preview, storage retention and audit | MERGE + BUILD |
| Customer & drivers | Customer/driver API + React CustomersDriversExperienceView | Customer profiles, verification, driver journey | Preserve document and identity checks, corporate relationships, consent and permissions | MERGE |
| Pricing/rates/offers | Pricing domain, rate calculation and API | Quote lab, offer controls | Canonical server-side quote; no client-side price authority; test duration discounts, tax and snapshot | MERGE + FIX CI |
| Availability/holds | Availability engine and controller | Dense vehicle/date planner, alternative suggestions | Transactional allocation locks, overlap prevention, server timezones and role policies | MERGE |
| Booking/cancellation/amendment | Booking state machine/controller and React BookingExperience | Pipeline, amendment comparison, checkout enquiry | Full booking DTOs, quote snapshot, payment state, mutual confirmation, allocation source and idempotence | MERGE + FIX CI |
| Contracts & handover | Contract and handover API state machines; React ContractHandoverExperience | Condition checklist, no-defect signoff, possession workbench | Preserve legally signed documents, identity, checklist, evidence and conditional state gate | MERGE |
| Rental, return, damage | Rental/inspection state machines; ReturnFinalCalculationView | Active possession/return review | Split physical return from final finance, repair/claim/deposit steps and renter updates | MERGE + FIX CI |
| Tenant payments/invoices/ledger | Finance/payments/ledger controllers and M-Pesa/Stripe modules | Receipts/allocations, invoice-review, deposit status cards | Single balanced ledger and canonical payment reconciliation; no simulated receipts in production | PRESERVE + ENHANCE + FIX CI |
| Owner settlements | Payout waterfall, settlement state machine/service | Stage progression, owner-facing summary and illustrations | Agreement share/deductions, payable provenance, transfer confirmation and dispute workflows | MERGE + FIX CI |
| Marketing & tenant website studio | Domains/public-booking/website modules and React website views | Website Studio, branded checkout and quote preview | Per-tenant host isolation, legal publication, media, pricing and booking integration | MERGE |
| Platform analytics | Platform analytics/MRR/worker/read models | Revenue workbench, admin dashboard | Source-tagged MRR, churn, subscription snapshots, tenant boundaries and exports | ENHANCE |
| Events/jobs/notifications | BullMQ worker, outbox and notifications modules/providers | Notification settings, messages, operational alerts | Real event subscriptions, retry/dead-letter/idempotence and email/SMS/WhatsApp delivery | PRESERVE + BUILD |
| Corporate & agents | Corporate accounts, agents, CRM controllers | Corporate approvals, agent referral/commission workspaces | Connect existing domain services; reconstruct missing React portals | PRESERVE + BUILD |
| Service partners | Maintenance/jobs/notification modules | Work-order acknowledgement, evidence, service updates | Reuse existing work orders, document storage, permissions and service status; create portal | BUILD + MERGE |
| Incidents / SOS | Original notifications/ops capabilities need targeted verification | Incident/assistance UI and triage | Define safety escalation, SLA, consented alerts, evidence and emergency ownership | RECONSTRUCT |
| Marketplace | No verified dedicated production marketplace backend | Clearly identified future marketplace preview | Keep as guarded future concept, separate rental vs marketplace inventory; no false bookability | PRESERVE CONCEPT |

**No item may be declared absent** merely because this static scan did not find a match. A negative claim requires scoped code and tests review.

## 4. Source-backed architectural constraints

1. **Do not introduce a second authoritative state store.** React frontend adapters should call canonical API clients/typed domain contracts; demo adapters are separate and visibly labeled.
2. **Maintain tenant and resource ownership.** Existing authorization guards and backend tenant context must be enforced for every new read/write; role selection in V2 is not authorization.
3. **State-machine authority stays server-side.** Bookings, allocations, handovers, rental returns, invoice posting and payouts must not be advanced by UI-only conditions.
4. **Financial separation is mandatory.** Platform subscription billing, rental charges, deposit liabilities, refunds, payouts and double-entry ledger remain different sources and state machines.
5. **Do not transplant localStorage financial records.** Only intentionally migrated, validated user preferences (e.g., visual density) are eligible for browser persistence.
6. **Do not silently consolidate old-only features.** Build explicit feature parity checklists before deprecating any original React screen.
7. **Avoid copying V2's layered DOM event dispatcher into React.** Build shared components + routed feature modules and adapters; preserve visual rules as tokens, not duplicated CSS overrides.
8. **Keep both repositories**. Canonical app receives integration work on feature branches. V2 continues as immutable/read-only comparison baseline during migration; deliberate V2 fixes may be cherry-picked via curated changes.
9. **Preserve existing API contracts** unless an explicit versioned migration plan and consumer tests prove compatibility.
10. **Fail closed** for unsupported or unauthorized actions: explain missing backend functionality rather than showing invented saved/paid/verified success.

## 5. Current verification and risk register

**Original Sage-Auto CI:** [run 38304115430](https://github.com/Sean-steve/Sage-Auto/actions/runs/38304115430), Oct 12.
- Lint and strict TypeScript: PASS.
- Full regression matrix: **51 passed / 8 failed out of 59**; build and staging/production promotion SKIPPED.
- Failed suites: `bookings-and-reservations`, `bullmq-background-platform`, `execution1-operational-repairs`, `operational-finance-and-invoicing`, `pricing-experience-contract`, `public-booking-and-checkout`, `rentals-and-return-lifecycle`, `stripe-card-provider-and-lifecycle`.
- Known failure examples from actual logs: security-deposit escrow mismatch; BullMQ invariant mismatch; stale exception/message contracts; pricing duration discount mismatch; rental already completed guard; missing payout/payable in Stripe test. Do not assume all eight are trivial test-assertion updates: review source business rules first.

**V2:** [Pages run 38474879556](https://github.com/Sean-steve/Sage-Auto-v2/actions/runs/38474879556) and [accessibility/browser job 38474520682](https://github.com/Sean-steve/Sage-Auto-v2/actions/runs/38474520682) pass. Those results do not verify production backend.

**Historic inventory:** `docs/audits/2026-09-23-integration-inventory.md` says 492 unique endpoints, 93 client methods, 71 structurally matched methods, 22 unmatched methods, 74 endpoints consumed. This is historical and requires rerun at the frozen base commits. Structural method matching alone does not prove API integration.

## 6. Binding-contract and feature acceptance process

For each mapping row, produce evidence in this order:

1. V2 screenshot/route + interaction list; original React route/view + form/fields list.
2. Compare complete *union* of fields, actions, states, permissions, errors, empty/loading views, data scopes and history.
3. Identify original REST method, URL, DTO/schema, actor permissions, tenancy guard, service, persistence table and domain event.
4. Identify absent backend contracts or original-only capabilities; never suppress them from UI solely because the new layout omits them.
5. Define final React component set, design tokens, query/mutation hook and compatibility adapter.
6. Implement one end-to-end path with real persisted reload and non-demo identity; verify pessimistic updates, concurrency, denied roles, network errors, and retry/idempotency.
7. Update feature ledger to VERIFIED only after recorded test evidence; remove/shadow old UI only after parity is proven.
8. Review with representative company owner, operational staff, renter, driver and independent vehicle owner flows.

## 7. Delivery waves, dependencies and acceptance

| Wave | Goal | Entry/exit gate |
|---|---|---|
| W0 | CI stabilization & integration contract freeze | Fix eight red suites, rerun full 59-suite matrix, typecheck, verify migrations and fixtures |
| W1 | Auth, tenant isolation and RBAC | Session, forbidden access, expiry, membership switches verified with real API |
| W2 | Company profile, branches, team | Saved/reloaded company data and per-branch permissions |
| W3 | Fleet, ownership, documents, compliance & maintenance | All original asset fields and actions preserved; signed URLs/authorized upload and readiness verified |
| W4 | Customers, drivers, pricing | Verified customer records and server quote snapshot/price invariants |
| W5 | Availability | Real concurrency-safe allocation lock and conflict alternatives |
| W6 | Booking/checkout/amendment | Idempotent booking/charge flow and non-binding inquiry boundary |
| W7 | Contracts, inspection, handover | Signature/evidence and state-machine-authorized transfer |
| W8 | Rental and returns | Possession timeline, inspection, charges and dispute lifecycle |
| W9 | Invoices, payments, deposits & refunds | Reconciled provider refs, ledger postings and no double-counting |
| W10 | Owner settlements | Verified payable calculation, approval, transfer and payout failure handling |
| W11 | Renter/owner/driver/corporate/agent/service portals | Real role-specific data, notifications, isolation, end-to-end sync |
| W12 | Website studio, SaaS control plane, analytics and remaining 86 partials | Full entitlement, public URLs, analytic provenance and 22 cross-role journeys |

**Definition of complete:** not a rendered screen or mocked success. Every feature requires persisted backend action, permission and tenancy enforcement, restored capabilities, negative-state handling, browser exercise, applicable tests, and release evidence.

## 8. Phase 4.1 outcome / open items

**Delivered:** source-inventory comparison; original-only/new-only feature risk register; dual-repo architecture decision; 215-row screen-to-candidate-component/API matrix; wave-ordered migration and CI dependency plan.

**Still unverified:** full method-level endpoint/DTO trace for all 215 screens; table-by-table schema migration compatibility; 22 individually executed journeys; 86 partial designs individually closed; every role permission applied to live endpoints; live payment-provider/environment staging; server integration tests after migration.

**Status:** Phase 4.1 **inventory and architectural reconciliation completed at code-candidate confidence**. Detailed source-level contract binding and parity testing are the mandatory next subphase before production implementation. No user workflow was removed and no application logic was modified in this audit.
