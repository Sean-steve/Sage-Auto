# UX-D0 — Company Dashboard Reconciliation and Evidence Audit

**Date:** 21 November 2026  
**Canonical repository / baseline:** Sean-steve/Sage-Auto, main @ c690a5520486a970e97d9e3391d9faca52e33b4d  
**Purpose:** Decide what to preserve, merge, correct, reconstruct and defer before implementing the improved Company Owner Overview.  
**Evidence standard:** Static source inspection and the supplied UI screenshot only; no runtime, database, browser, CI, or local-working-tree certification was performed for UX-D0.

## 1. Product decision

Keep ONE company operations dashboard as the runtime entry: **src/components/CompanyOverviewView.tsx**, mounted by **src/components/RestoredWorkspace.tsx** at the permitted section **overview**. Reconcile the richer business intelligence features from **src/components/DashboardView.tsx** and the analytics backend into this experience. Do not delete historical screens or features to simplify the redesign.

Keep Company Owner, Independent Vehicle Owner and SaaS Platform Owner data separate. Each portal may share design tokens, but it has its own route, permission boundary, records and performance questions.

## 2. Confirmed execution path

- **src/components/AccessApp.tsx** authenticates, retrieves **GET /api/v1/access/context**, selects an authorized portal and hands a tenant portal to **RestoredWorkspace**.
- **RestoredWorkspace.WorkspaceScreen** renders **CompanyOverviewView** for **overview**; the Company Owner sidebar maps the same section.
- **src/components/DashboardView.tsx** is an older executive implementation used by legacy application wiring, not by this current RestoredWorkspace Overview. It contains richer KPI/reports interactions and consumes **apiClient.analytics.getDashboard**. Avoid two operational dashboard authorities.
- **apps/api/src/app.module.ts** registers **/api/v1/analytics** behind authGuard and tenantGuard, using **apps/api/src/modules/analytics/analytics.module.ts**. Its **GET /dashboard** handler delegates to **DashboardService.getDashboardOverview**.
- The **TenantDashboardOverviewDto** contract exists in **packages/types/src/analytics.ts**, with headline KPIs, fleet breakdown, financial summary, revenue and utilization series, CRM funnel and activity.
- Metric definitions exist in **apps/api/src/modules/analytics/domain/metric-registry.ts**. Reporting and reconciliation capabilities are also present.
- **packages/ui/src/components/DataDisplay.tsx** already provides reusable MetricCard, EmptyState, and related display primitives. Prefer extending these over duplicating UI primitives.

## 3. Reconciliation matrix

| Capability | Verified current state | Disposition | Owning next phase |
| --- | --- | --- | --- |
| Company Overview navigation and workspace structure | RestoredWorkspace renders CompanyOverviewView | PRESERVE | D4 |
| Company KPI cards, recent bookings and attention items | CompanyOverviewView calls multiple domain endpoints and renders four KPIs | ENHANCE | D3-D4 |
| Executive KPIs, reports and filter patterns | Legacy DashboardView and analytics module offer richer capability | MERGE, no duplicate runtime | D3-D4 |
| Topbar search | Filters authorized section labels/descriptions only; not record search | RECONSTRUCT | D1 |
| Ctrl/Cmd+K palette | Existing keyboard binding and section command overlay | PRESERVE and ENHANCE | D1 |
| Density toggle | localStorage sage_density; topbar Gauge button | REMOVE FROM TOPBAR, keep responsive design | D1 |
| Light/dark theme | localStorage sage_theme; topbar Sun/Moon | PRESERVE | D1 |
| User avatar | Initials from context.user.fullName; not clickable in RestoredWorkspace | BUILD menu using authenticated identity | D1 |
| Verified badge | Unconditional badge in company topbar | CORRECT to verified meaning/state or omit | D1 |
| Manual refresh | CompanyOverviewView button invokes load() | REMOVE UI, add controlled revalidation | D4-D5 |
| First-rental preparation cards | Present in supplied screenshot; exact block not found in current main source | VERIFY LOCAL DIFF; migrate to tenant onboarding if needed | D0 follow-up / D2 |
| Account onboarding | AccessApp + access service support account/company/renter setup and completedAt | PRESERVE; distinct from operating-readiness checklist | D2 |
| Revenue / receipts / receivables | Metrics and dashboard service exist; current CompanyOverview uses finance summary | MERGE + RECONCILE financial definitions | D3 |
| Revenue time series | DashboardService currently buckets invoice issue-date totals into revenueChart | CORRECT labeling/recognition semantics | D3 |
| Utilization time series | DashboardService repeats current utilization into every historical bucket | RECONSTRUCT from historical vehicle-day/rental occupancy | D3 |
| Booking / rental totals | CompanyOverview uses booking limit 8 and rental limit 100 for some counts | CORRECT; use authoritative aggregate endpoints | D3 |
| Per-record deep links | Overview navigate event routes to a module, not necessarily record detail | BUILD authorized record-specific navigation | D1/D4 |
| Role-based view | Portal sections/permissions supplied by access context | PRESERVE + enforce server-side per metric and search result | D1-D5 |
| Company vs owner vs platform dashboards | VehicleOwnerWorkspace and PlatformOwnerWorkspace have independent UIs | PRESERVE separate bounded views | later role-specific phases |

## 4. Risks requiring closure before claiming dashboard accuracy

### P0-A — PostgreSQL data authority remains unproven
Existing **Issue #33** and **docs/reconciliation/PHASE5_LOCAL_BACKEND_CERTIFICATION.md** identify SQLite as the current business-record authority and PostgreSQL business repository migration as unfinished. A passing PostgreSQL schema migration does not mean the application/worker share one durable PostgreSQL business state. D3 may prototype against existing APIs, but D5 cannot certify cross-process real-time correctness until this blocker is closed with evidence.

### P0-B — Endpoint permission coverage is not proven
The analytics router is mounted behind authentication + tenant guards. The inspected **analytics.module.ts** route definitions do not show an additional per-metric/per-field permission guard. The metric registry includes permissionRequired metadata, which is not by itself proof of enforcement at the HTTP boundary. Finance values must be withheld from roles without finance rights, even if the caller belongs to the correct tenant. Add negative authorization tests for every dashboard field, historical series and search group; ensure request-scoped tenant identity is authoritative.

### P1-C — Legacy response envelope mismatch / silent fallback
**analytics.controller.ts** responds with a top-level JSON overview, while **src/lib/api-client.ts** returns successful JSON unchanged and the legacy **DashboardView.tsx** reads **res.data**. The legacy consumer can discard a 200 response and fall back to local calculations. A prior audit documented the same gap. Resolve by a typed, tested client adapter or consistent backward-compatible response contract, and remove false-confidence revenue fallback before reusing legacy logic.

### P1-D — Historical charts are not historical
The current **DashboardService.generateTimeSeriesBuckets** computes daily invoiced amounts but labels the result revenueChart, and supplies **currentUtil** unchanged for every utilization bucket. Do not render these as historical revenue or utilization until corrected. Define invoices vs posted revenue vs verified receipts separately, and reconstruct utilization per past time bucket using valid vehicle/rental intervals.

### P1-E — Incomplete or denied requests can make zero look authoritative
**CompanyOverviewView** pulls fleet counts, bookings (page 1, limit 8), rentals (limit 100) and finance summary in one Promise.all. The visible activeRentalStates count operates on a capped list. A denied or failed domain fetch may fail the whole page; the no-attention state must never imply operational safety when data is absent. Use exact aggregate queries, permission-aware requests, and per-widget errors/stale timestamps.

### P1-F — No persistent operational onboarding contract verified
The account onboarding in **access.service.ts** records user intent/company creation and completedAt. It is not the same as a company-level, six-step first-rental checklist. The screenshot's first-rental block is not present in the inspected main CompanyOverview file. Compare the local working tree before deleting or moving it. D2 must persist completed/dismissed state per tenant, not merely per browser/user.

### P2-G — Portal and role navigation differences
Only the company Overview is being redesigned here. Do not copy company financial figures into the independent vehicle owner portal or the SaaS platform analytics. UX actions must be gated by authorized portal membership and scoped records.

## 5. Data truth and presentation rules

1. **Collected cash** means verified/posted incoming customer funds, with refunds handled under the defined reporting rules; never equate payment attempts with receipts.
2. **Posted revenue** is distinct from **gross invoices**, **booking gross value**, **cash receipts**, **receivables**, **owner payouts**, and **refundable security-deposit liabilities**.
3. **Revenue chart** must state its accounting basis and date basis; never silently render invoice issue-date totals as earned revenue.
4. **Utilization snapshots** and **period utilization** are different measures; historical values require historical occupancy data and an explicit denominator.
5. **Counts** must come from tenant-authoritative aggregates or complete pagination, never one arbitrarily capped page.
6. **No data**, **zero**, **not permitted**, **temporarily unavailable**, and **stale** must have distinct UI states.
7. Trend comparisons require a same-length prior period and a defensible change computation; no misleading percent increase from prior zero.
8. No synthetic/demo numbers, success banners, duplicated aggregation logic, or browser-local accounting fallbacks in operational views.

## 6. Source evidence and limits

**Inspected at baseline:** src/components/RestoredWorkspace.tsx; src/components/CompanyOverviewView.tsx; src/components/DashboardView.tsx; src/components/Header.tsx (legacy header only); src/components/AccessApp.tsx; src/lib/access-context.ts; src/lib/api-client.ts; src/components/WorkspaceSettingsView.tsx; src/components/owner/VehicleOwnerWorkspace.tsx; src/components/platform/PlatformOwnerWorkspace.tsx; apps/api/src/app.module.ts; apps/api/src/modules/analytics/analytics.module.ts; analytics.controller.ts; dashboard.service.ts; metric-registry.ts; apps/api/src/modules/access/access.service.ts and access.controller.ts; packages/types/src/analytics.ts; packages/constants/src/access.ts; packages/ui/src/components/DataDisplay.tsx; packages/database/test/analytics-and-reporting.test.ts; docs/reconciliation/PHASE4_1_MASTER_RECONCILIATION.md; docs/reconciliation/PHASE5_LOCAL_BACKEND_CERTIFICATION.md; GitHub Issue #33.

**Unverified:** user's local changes (including the screenshot's first-rental cards), API response execution on their machine, database/worker health, current test results, runtime chart accuracy, browser behaviour at all viewport widths, and source parity with any unmerged Sage-Auto-v2 updates.

**UX-D0 completion condition:** Evidence inventory and target architecture documented and reviewed; no application behaviour or deployment claimed. Next work begins with UX-D1 only after reconciling the local-only first-rental section and confirming no competing Overview is shipped.
