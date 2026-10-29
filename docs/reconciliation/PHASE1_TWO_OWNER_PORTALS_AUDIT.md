# Phase 1 — SaaS Platform Owner + Independent Vehicle Owner Reconciliation

**Audit date:** 2026-10-29  
**Canonical repository:** `Sean-steve/Sage-Auto`, `main` at `b8d64411bd6228fd5629ae32673891170810e693` before this documentation branch.  
**UI reference repository:** `Sean-steve/Sage-Auto-v2`, `main` at `8e7dd81ad6fcdef948ac6acd89448f01cff3b693`.  
**Audit type:** Source and GitHub CI review only. No application code changed, no user accounts or databases touched, no staging sign-off, no browser login performed.

## Executive decision

**Retain the existing React/TypeScript application, server-enforced access control, tenancy, owners, subscriptions, billing, settlements, payments, and worker state. Integrate the V2 visual language and workflows; never migrate V2's localStorage/sample data as authority.**

Both portals exist as roles and authenticated entry points, but they are **not yet complete**. The active platform-owner route largely shows a generic saved-record shell; the owner-personal route offers basic scoped vehicle/settlement tables. V2 contains substantially richer visual screens and *mock* interactions.

The companion [33-row screen-to-API matrix](PHASE1_TWO_OWNER_PORTALS_SCREEN_API_MATRIX.csv) defines the Phase 2 and Phase 3 preservation and build contracts for **20 platform screens (S02-01…S02-20)** and **13 vehicle-owner screens (S06-01…S06-13)**. The V2 audit marks 22 as `interactive_mock` and 11 as `visual_or_partial`, **none certified as production integrated**. This is a deliberately focused subset of the existing 215-screen, 11-experience product ledger.

Classifications in this focused matrix: **19 MERGE, 3 ENHANCE, 9 BUILD, 2 RECONSTRUCT**. These are planned engineering dispositions, not claims of completed features.

## 1. Source inventory and current route reality

| Boundary | Verified code evidence | Current state / implication |
| --- | --- | --- |
| Login / portal choice | `src/components/AccessApp.tsx`; `apps/api/src/modules/access/access.service.ts`; `packages/constants/src/access.ts` | Server creates `platform` and per-tenant portal memberships with sections/permissions. Supports role-specific entry. |
| Active React entry | `src/App.tsx` | Default authenticated path opens `AccessApp`, not a standalone V2 role switcher or legacy `SaaSControlPlaneView`. |
| Platform-owner screen | `AccessApp.tsx` → platform branch of generic `Records` / `Team` / `Support` | `companies` has a saved-data read and team/support have functionality; many other platform sections return “This workflow is next” on `/access/records`. The dedicated control-plane React components exist but are not the active platform route. |
| Company operator vehicle-owner management | `src/components/VehicleOwnersView.tsx`, `src/components/RestoredWorkspace.tsx` | Operator/admin management UI, **not** the independent owner's personal portal. It may consume tenant-wide owner APIs and fallback local state; must never be offered to external owners. |
| External Vehicle Owner portal | `ACCESS_SECTIONS.myVehicles/mySettlements`; `AccessApp.tsx`; `GET /api/v1/access/records` | `VEHICLE_OWNER` sees `My vehicles` and `My settlements`. Response is explicitly scoped using `linkedRecordId`; details are limited to table fields. |
| V2 references | V2 `app.js`, `external-portals.js`, `docs/PHASE3D_SCREEN_COVERAGE.csv` | `#platform/…` and `#owner/…` are static, browser-local demonstrations. Not authenticated API routes. |
| Backend mounting | `apps/api/src/app.module.ts` | Platform tenants/operations, subscriptions, billing, entitlements, analytics and owner settlements are mounted beneath `/api/v1`; endpoint existence is **not** proof of successful runtime calls in deployment. |
| Last known main CI | GitHub Actions [run 38584081638](https://github.com/Sean-steve/Sage-Auto/actions/runs/38584081638), commit `b8d6441` | Static/type/lint, canonical 38 suites, performance and images **passed**. Staging promotion **failed closed** (environment not configured); production was skipped. Earlier 8-failing-suite baseline in Phase 4.1 is outdated. |

**Backend route note:** This document uses route paths from router mounting and controller definitions, not guessed marketing labels. For unmatched policies, incident management, notifications, owner-safe media and owner-specific analytics, the matrix explicitly says `candidate` or `TBD` and requires contract discovery before development.

## 2. Platform Owner contract — Phase 2

### Existing modules to preserve

- `/api/v1/platform/tenants` (+ `/:id`, `/provision`, `/:id/suspend`, `/:id/reactivate`, `/:id/offboard`) — `platform-admin` tenant lifecycle.
- `/api/v1/platform/subscriptions` and `/api/v1/platform/plans` — plan and status workflows, version and lifecycle rules.
- `/api/v1/platform/billing/invoices`, `/payments`, `/invoices/:id/record-payment` — platform **subscription** invoices and receipts; not rental charges.
- `/api/v1/platform/features`, `/plans/:planId/features`, `/tenants/:tenantId/overrides` — feature entitlements.
- `/api/v1/platform/analytics/overview`, `/mrr-movements`, `/cohorts`, `/billing-health` — SaaS performance and reporting.
- `/api/v1/platform/operations/providers`, `/jobs/queues`, `/jobs/dlq`, `/audit`, `/config` — platform operations.
- `/api/v1/access/team?scope=platform`, `/access/invitations` and `/api/v1/platform/support/sessions` — invitations, member roles and time-boxed support access.

**Integration gap:** `AccessApp` does not mount the rich `apps/platform-admin/src/*` components as a secure navigable platform workspace. `src/components/SaaSControlPlaneView.tsx` contains local subscription transition and mock state, so it must **not** become the source of subscription truth. The V2 platform pages must be rebuilt as secure React components connected to these authoritative API contracts.

**Required platform screens:** health; company directory/profile/provisioning; plans; billing/receipts; entitlements/review; integrations; jobs; incidents; staff/roles; support cases/grants; audit; policies; SaaS revenue; config; notifications. Exact names/routes in the CSV.

**Critical platform safeguards:**
1. Always derive access from authenticated platform membership + granular permission on the server. Visual V2 role selection must never grant privileges.
2. Keep SaaS revenue, tenant subscription invoice balances and platform cash receipts distinct from tenant rental invoices, renter deposits, owner payables and ledger entries.
3. No static KPI totals, synthetic subscription upgrades, “paid” labels, or successful overrides without persisted canonical state.
4. Destructive tenant actions require reason, actor, audit trail and compensating/irreversible-state handling. Platform support access must be explicit, read-only where specified, time-limited and logged.
5. Do not expose secret material in platform configuration responses. Platform incident, policy and notification features with unverified endpoints remain disabled or visibly unavailable until source and tests exist.

## 3. Independent Vehicle Owner contract — Phase 3

### Existing owner data to preserve

- `GET /api/v1/access/records?portal=<tenantId>&section=myVehicles` loads only the named linked vehicle owner’s cars, returning registration, name, status, owner share, agreement-effective date, allowed deductions and terms snapshot summary.
- `GET /api/v1/access/records?portal=<tenantId>&section=mySettlements` loads only that linked owner’s settlement rows, status, gross revenue, owner share, deductions, net payable and payment status.
- `GET /api/v1/owner-settlements/mine`, `/mine/:id/statement`, `POST /mine/:id/dispute` exist in the settlement router and are guarded by `settlement.self.read` / `settlement.self.dispute`.
- `src/components/VehicleOwnersView.tsx` and `/api/v1/vehicle-owners` are **company-operator** management views/commands, with tenant-wide permissions; do not transfer them into the owner login.
- Ownership history and settlement engines already model effective agreement dates, frozen terms, finance-sourced eligible revenue, approved expenses, disputes, independent approval and payout via Payments. Preserve source-of-truth behavior from `docs/product-experience/OWNER_SETTLEMENTS_PRODUCT_EXPERIENCE_BLUEPRINT.md`.

### P0 findings requiring reconciliation before owner UI API wiring

**OWNER-01 — Global middleware blocks direct self-service router.** `apps/api/src/app.module.ts` rejects general `/api/v1` requests with tenant header when the tenant member has `DRIVER` or `VEHICLE_OWNER` role, directing them to the personal portal. This sits upstream of `/api/v1/owner-settlements/mine` registration. The `/api/v1/access/records` route is registered earlier and works through its own checks. Do **not** remove the general block to solve this. Create an explicit, narrowly scoped owner self-service API path under access or carve out only guarded self routes, and confirm no tenant-wide reads/mutations become accessible.

**OWNER-02 — Two owner identity sources disagree.** `AccessService` links each user to a tenant-specific `VehicleOwner` record via `linkedRecordId` and reads those via `/access/records`. `OwnerSettlementsService.resolveOwnerSelf` instead resolves the owner via `actor.email` / `findByEmail`. Records may not match the invitation-linked identity, and links revoked/changed must invalidate access immediately. Consolidate under an authoritative `(userId, tenantId, ownerRecordId)` self-access resolver, with existence/status checks and no email-only authority.

**OWNER-03 — Owner screens lack data contracts.** Role navigation only exposes `myVehicles` and `mySettlements`. Performance, inspections/condition, owner agreement signatures, earnings/paid payouts, owner disputes, documents, payout methods, and connected operator invitation history need explicitly scoped endpoints and authenticated pages. Never use `GET /vehicle-owners/:id`, `GET /fleet`, tenant finance/settlement list, or raw file storage in owner code without equivalent resource-scoped authorization.

**OWNER-04 — Multi-operator boundaries.** A user may be invited to multiple rental companies; the current context has one tenant portal per membership. All widgets, earnings, documents and settlement detail must be tenant+owner bound. Cross-company aggregate view is optional and only valid after independent verification for every included operator; never silently sum currencies.

### Required owner screens

Dashboard; vehicles; performance; condition/inspections; agreements; signature/details; earnings; statements; payout history; requests/disputes; documents; profile/payout methods; invitations/connected operators. Exact V2 routes and scope are in the CSV.

**Owner payout truth:** `APPROVED` is an obligation, not a disbursement. Only a provider-verified payout through Payments can mark `PAID`; a failed/ambiguous provider outcome remains reviewable. Four-eyes approval and historical agreement terms must not be diluted to make the interface work.

## 4. Reconciliation decisions and preservation rules

| Concern | Source of truth | Decision |
| --- | --- | --- |
| Identity, verification, portal membership | Auth + Access + Authorization | PRESERVE; add dedicated owner self-policy, not frontend role switches. |
| Platform companies, plans, billing, entitlements | Platform modules + canonical DB | MERGE into premium V2-style React workspace; never use local data mutations as authority. |
| SaaS MRR/ARR, jobs, audit | Platform analytics/ops source records | MERGE with real data provenance/currency; mark unsupported analytics unavailable. |
| Owner cars, ownership agreements | Tenant fleet + vehicle-owner + ownership-history DB | MERGE through owner-scoped read model; maintain effective dates/history. |
| Owner revenue and statements | Finance-settled revenue → Owner Settlements | MERGE and ENHANCE; prohibit client-side revenue inference. |
| Outbound payouts | Owner payable → Payments provider → Ledger | PRESERVE money movement controls; do not expose unrestricted owner payout commands. |
| Inspections, maintenance, files | Existing bounded-context services | BUILD **owner-safe projections**; do not hand out tenant admin APIs. |
| Visuals | V2 typography, card system, navigation and patterns | Reimplement with reusable React components; match states and responsive behavior, not copied JS/localStorage. |
| Existing original-only features | Existing React/back end/code contracts | PRESERVE; no deletion due to missing V2 representation. |

## 5. Phase 2 and Phase 3 execution backlog (ordered, with exits)

| Priority | Phase | Task | Required evidence to close |
| --- | --- | --- | --- |
| P0 | 2 | Secure platform React router/shell from server-provided portal context | Owner/staff/guest role tests and platform vs tenant denial |
| P0 | 2 | Platform companies, tenant provisioning, subscriptions, plan catalog, entitlements | Real CRUD/transition flows, audit trail, no fabricated success |
| P0 | 2 | SaaS billing and finance truth, revenue analytics | Invoice/payment source reconciliation, per-currency metrics, paid state proof |
| P1 | 2 | Staff, support access, audit, providers, queues, configuration | Grant TTL, worker retry safety, permission and audit tests |
| P1 | 2 | Incident, policy, platform notification screens | Verified endpoints or disabled/no-data contracts; no mock claims |
| P0 | 3 | Unify owner self identity and fix owner-specific API gate (OWNER-01/02) | Cross-tenant and cross-owner 403 tests, role change invalidation |
| P0 | 3 | Personal owner dashboard, cars, effective agreements, earnings | Verified fleet/ownership/settlement data per owner, currency-safe |
| P0 | 3 | Owner statements, payable state, disputes and payout proof | No self-approval/pay; four-eyes/provider and fail/retry tests |
| P1 | 3 | Condition/maintenance, files, profile/payment destination, invitations | Owner-scoped file access, destination verification, privacy tests |
| P0 | 4 | Multi-user browser and API certification of both portals | Complete 33-screen matrix, negative auth, web/mobile/a11y and no mock state |

## 6. Acceptance gates and test cases (mandatory)

1. **Platform isolation:** Company owner, renter, driver, vehicle owner, uninvited user and suspended platform admin cannot access any platform subscription or company detail route (403; no data leak).
2. **Platform action auditing:** A platform-only action succeeds only with a server permission, visible actor/reason/version and a durable audit entry; replay has expected behavior.
3. **SaaS finance:** Platform invoice, subscription receipts and MRR are reconciled to actual platform records; no tenant rental charge, deposit or owner settlement is blended in.
4. **Owner resource security:** Owner A cannot list, retrieve or dispute Owner B's cars, statements or documents, even when they share a tenant and guess an ID. Removing the named owner link immediately denies further access.
5. **Owner self-route resolution:** Authorized linked owner can read `/mine` under the expected tenant context after OWNER-01/02 fix; broader `/owner-settlements` tenant-admin routes remain forbidden.
6. **Owner multiple operators:** Operator 1 and Operator 2 data are isolated; switching context does not leak previous owner records; currency totals are not cross-added.
7. **Settlement integrity:** Only financially settled rental lines and period-effective agreement versions contribute; no mixed-currency aggregation; dispute blocks payout; approval and payout actors differ; only verified provider success marks PAID.
8. **No demo source:** Network-backed pages never read V2 `db` / `localStorage` as business truth; empty/loading/error/forbidden states are truthful; no dummy cars or sample earnings.
9. **Functional UX:** All 33 contract rows reach dedicated or intentionally reconciled pages; every permitted action has success/failure handling, an explicit return path and mobile responsive support.
10. **Release gate:** Lint, strict typecheck, API/unit/integration, isolated owner/platform authorization, end-to-end browser, mobile/a11y and configured staging smoke pass before merge or production claim. A green unit suite with red staging is not deployment approval.

## 7. Evidence and next-phase boundary

**Examined:**
- V2: `docs/PHASE3D_SCREEN_COVERAGE.csv`, `docs/PHASE_3C_EXTERNAL_USER_EXPERIENCES.md`, `app.js`, `external-portals.js`.
- Canonical UI: `src/App.tsx`, `src/components/AccessApp.tsx`, `src/components/RestoredWorkspace.tsx`, `src/components/SaaSControlPlaneView.tsx`, `src/components/VehicleOwnersView.tsx`, `apps/platform-admin/src/*`.
- Authorization: `packages/constants/src/access.ts`, `packages/constants/src/roles.ts`, `packages/constants/src/permissions.ts`, `apps/api/src/modules/access/*`, `apps/api/src/app.module.ts`.
- Platform: `apps/api/src/modules/platform-admin/*`, `subscriptions`, `billing`, `entitlements`, `platform-analytics`, `authorization`.
- Owners: `apps/api/src/modules/vehicle-owners/*`, `owner-settlements/*`, `apps/api/src/modules/access/access.controller.ts`.
- CI source: run 38584081638; staging failed closed; no deployment verification.

**Phase 1 exit:** All 33 V2 screen contracts classified with a canonical candidate, access/scope requirement, concrete gap and acceptance target. **No backend/frontend wiring has been performed in this documentation phase.**

**Phase 2 starts next:** Build a server-authorized Platform Owner React workspace, mounting real platform contracts in the reconciled V2 design. Phase 3 then resolves owner self-access and completes the Independent Vehicle Owner portal. Phase 4 certifies cross-portal behavior. Do not merge application changes without the required acceptance evidence.
