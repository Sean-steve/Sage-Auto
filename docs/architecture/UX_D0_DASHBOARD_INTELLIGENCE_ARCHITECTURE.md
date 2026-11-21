# UX-D0 — Sage Auto Dashboard Intelligence Architecture

**Status:** Approved target design proposal; implementation and runtime certification are future phases.  
**Applies to:** Authenticated Company Owner / authorized tenant staff Overview.  
**Baseline:** Sean-steve/Sage-Auto main @ c690a5520486a970e97d9e3391d9faca52e33b4d, 21 November 2026.  
**Related:** [UX-D0 evidence audit](../reconciliation/UX_D0_DASHBOARD_RECONCILIATION.md); [Phase 5 backend blocker](../reconciliation/PHASE5_LOCAL_BACKEND_CERTIFICATION.md); GitHub Issue #33.

## ADR UX-D0-001 — One company dashboard, existing domain authority

**Decision:** Keep **CompanyOverviewView** as the runtime view inside **RestoredWorkspace**; migrate useful visual and metric contracts from **DashboardView**; keep existing analytics, finance, fleet, booking, rental, payment, maintenance, compliance and settlement bounded contexts as the only business-data authorities. New endpoints, if necessary, are **read-only aggregators or search projections**, never separate sources of truth.

**Rejected:** Replacing working business APIs with V2/localStorage numbers; reusing legacy client-store revenue fallbacks; maintaining separate company dashboards; showing platform MRR as company revenue; presenting fake historical chart points.

**Consequences:** The implementation must adapt the legacy analytics JSON shape and prove per-role authorization before shipping real financial figures. New UI can be built while database issue #33 remains open, but no full real-time or finance durability certification is possible until resolved.

## 1. User experience contract

### Desktop hierarchy

1. **Sticky topbar:** workspace title (left); centrally prominent universal search (middle); theme, appropriately meaningful verification, and interactive profile avatar (right). Remove topbar density control.
2. **Compact personalized greeting:** current tenant/operator context, selected reporting period (today/7 days/30 days/90 days/custom, where supported), and prominent permitted **New booking** action.
3. **Six KPI cards:** posted revenue, verified collections, active rentals, fleet utilization, available vehicles, outstanding receivables. Role-sensitive cards may be hidden or replaced by allowed operational cards; never leak suppressed data through tooltips or trends.
4. **Performance row:** period posted-revenue-vs-collections time series (distinct series and legend), plus present fleet-status donut.
5. **Operating trends row:** period utilization area chart plus booking volume bar chart; optional later vehicle revenue ranking if historical attribution is verified.
6. **Today's operations and needs attention:** two lists of actionable pickup/return/handover/payment/compliance items, sorted by impact and due time.
7. **Recent activity:** concise events with direct record links; zero unnecessary navigational card duplication.
8. **Onboarding overlay/card:** displayed only for a new tenant with an active setup checklist, in a compact, dismissible state. It must not permanently displace metrics; on completion it disappears across sessions and devices.

### Mobile hierarchy

Search becomes full-width modal; avatar remains reachable; KPI cards stack or run two-column when space permits; charts fit widths without horizontal overflow; attention items precede deep analytics if the viewport requires prioritization.

### Visual rules

Reuse Sage Auto navy/white/emerald tokens and existing reusable MetricCard/EmptyState primitives. Provide legible numeric typography, chart labels/units, focus rings, keyboard access, loading skeletons, dark-mode contrast, and accessible alternatives to color-only status. Do not use icon-only controls with ambiguous actions.

## 2. Component map

| Proposed unit | Canonical placement | Implementation boundary |
| --- | --- | --- |
| CompanyOverviewPage | Existing src/components/CompanyOverviewView.tsx | Composition only; no finance calculations in JSX |
| OverviewDashboardQuery | New hook/service in src/lib or a dedicated overview folder | Typed client adapter and query cache keyed by tenant, permission context, period and currency |
| CommandSearch | Extract from src/components/RestoredWorkspace.tsx | Ctrl/Cmd+K, grouped module + authorized record hits, keyboard navigation |
| AccountDropdown | RestoredWorkspace topbar | Reads context.user, authenticated session and account/portal actions; no hardcoded role |
| SetupChecklist | Company Overview or a reusable onboarding component | Tenant-persisted readiness, independent from account provisioning |
| KpiGrid / ChartPanels / AttentionQueue | Reuse packages/ui display primitives | Pure presentation, receives verified DTOs and states |
| BusinessAnalyticsAdapter | Existing apiClient.analytics + validated response adapter | Consumes existing /api/v1/analytics/dashboard |
| SearchService | New tenant-scoped API composition when domain search gaps confirmed | Index/query existing entities, no writes, strong role filtering |
| AttentionReadModel | Prefer existing domain reads; add dedicated aggregate only when necessary | No local counting from capped lists |
| PerRecordNavigation | Authorized record route or selected entity state | Link directly to matching booking, customer, vehicle, rental or invoice |

**Preservation rule:** No removal of original functional capabilities from legacy DashboardView or other modules without explicit mapping in the delivery matrix and regression evidence.

## 3. Data flow and response contracts

### Canonical read path

Authenticated browser session -> selected authorized tenant portal -> typed API client / query cache -> existing analytics/domain controllers -> tenant + permission guards -> business repositories / verified projections -> validated DTO -> KPI/graph/alert components.

All query caches must be cleared or partitioned on **tenant switch**, **user change**, and **permission change**; never reuse another tenant's analytics.

### Existing endpoint to reuse

**GET /api/v1/analytics/dashboard**

Inputs: permitted window presets and/or from/to, declared currency and tenant timezone. Verify the current raw top-level JSON response, then introduce one backwards-compatible typed adapter. Do not assume the endpoint returns an ApiResponse.data envelope. Preserve the existing TenantDashboardOverviewDto until any versioned DTO is accepted.

**Recommended new contracts, only if existing domain APIs cannot provide them:**

- **GET /api/v1/search?q=...&limit=...** — unified permitted record search with type, stable record ID, title, minimal subtitle, workflow destination, and a next-page cursor. Strict query length, rate limiting, per-domain permission checks and tenant scope. Do not return raw record bodies or customer-sensitive data.
- **GET /api/v1/tenant/setup-status** and optionally an authenticated dismissal/update endpoint — tenant-specific readiness projection and persisted completion/dismissal. This is a new contract, not the existing user-level /access/complete account-provisioning action.
- **GET /api/v1/operations/attention** — optional validated due-soon/overdue/exception aggregate, scoped and permission aware; first inspect existing booking/rental/finance/compliance endpoints before introducing it.

All **new** endpoints are proposals for D1/D2/D3, not deployed APIs.

### Universal search result (proposed)

- type: VEHICLE | CUSTOMER | DRIVER | BOOKING | RENTAL | INVOICE | PAYMENT | OWNER | MODULE
- id: stable record identifier, or module section ID
- title: registration, customer name, booking reference, etc. (according to permissions)
- subtitle: minimal safe context; no private payout accounts, identity document images or unrelated personal data
- target: server/permission validated module plus selected-record state
- matching fields: vehicle plate/VIN/model, customer name/contact, booking/rental/invoice/payment reference, owner and module labels

Search UX: debounce ~250ms; no request for empty/very short arbitrary terms except an exact allowed reference; show skeleton/empty/error states; group results with keyboard arrows, enter and escape; preserve Ctrl/Cmd+K; hard cap results and support a scoped view-all route. Search must never fetch all tenants or pull all customer records into the browser.

## 4. KPI and analytics semantics

| Card/chart | Source contract | Time basis and rule |
| --- | --- | --- |
| Posted revenue | FINANCE_POSTED_REVENUE | Recognized/posted revenue in selected window; never booking face value |
| Cash collected | FINANCE_CASH_RECEIPTS | Verified receipts in selected window; refunds and reversals handled according to financial policy |
| Active rentals | RENTAL_ACTIVE_COUNT | Current valid rental state count, not first 100 rows |
| Fleet utilization | FLEET_UTILIZATION_RATE for snapshot; historical series separately | Distinguish snapshot on-rent/eligible active fleet from historical occupied vehicle-days/eligible active vehicle-days |
| Available vehicles | FLEET_AVAILABLE_VEHICLES | Current snapshot at asOf; never period total |
| Receivables | FINANCE_OUTSTANDING_RECEIVABLES | Unpaid invoiced balance as of snapshot, excluding deposit liabilities |
| Booking volume | BOOKING_TOTAL_COUNT / CONFIRMED_COUNT | Creation/confirmation basis labelled explicitly; date buckets checked |
| Fleet status donut | Tenant vehicle status lifecycle | Current mutually-exclusive statuses, ensure sum reconciles to eligible fleet total |
| Revenue by vehicle (optional) | VEHICLE_REVENUE / attributed ledger | Defer if attribution, currency or ownership allocations cannot be verified |

**Historical utilization:** Select a documented eligible-fleet denominator (prefer all active leasable vehicle-days, including downtime, to avoid overstating performance), reconstruct occupancy from actual rental intervals and state transitions per Nairobi-local reporting day, handle partial days consistently, and compare with snapshots/projections. Where history is unavailable, show **Historical utilization unavailable**, not a flat synthetic line.

**Historical revenue:** Use posted journal/revenue events by posting date. A separate invoices-issued chart may use issueDate; label it **Gross invoiced**. Do not label an invoice-issued bucket **Earned revenue**.

**Currency:** Respect tenant ledger currency; if transactions span multiple currencies, return byCurrency or reject mixed-currency total unless a documented authoritative FX conversion basis is present. Never label USD sums as KSh.

**Progress and comparison:** Period-filter only period metrics. Current availability and current open receivables remain as-of figures. Previous-period percentages must be comparable windows, with null when prior zero makes change undefined. Provide metric timestamp and data source/status.

## 5. Error, freshness and automatic update policy

- Initial load: fetch authorized grouped aggregates, avoid unauthenticated operations.
- After booking, rental, payment, maintenance, and settlement mutations: invalidate only affected cache keys on confirmed server success.
- Cross-tab sync: browser visibility/focus revalidation and optional BroadcastChannel after authorized events; never treat localStorage writes as confirmed business state.
- Background refresh: configurable moderate interval while focused (e.g., 60 seconds), not constant heavy polling. Prefer server event/outbox notifications later when issue #33 data durability and event delivery are proven.
- Loading: maintain last-known result with visible as-of/status, not a false zero.
- Permission denied: omit or mask the specific card/list; never show finance error as a company-wide error or leak data.
- Partial outage: preserve unaffected charts and show per-card errors; never say **Operations look clear** when exception inputs are missing.
- Reconciliation state: display **unavailable** or **reconciliation required** when GL and summary disagree; do not show a success badge simply because the page rendered.

## 6. Company onboarding behaviour

Two separate concepts must remain distinct:

1. **Account / workspace provisioning:** existing /access/profile and /access/complete flow, authenticated user-level state and company creation. Preserve.
2. **Operational first-rental setup:** a NEW company-level read model with steps vehicle registration, customer/driver readiness, pricing, availability, first booking, and contract/handover readiness.

For operational setup define states **NOT_STARTED**, **IN_PROGRESS**, **COMPLETED**, **DISMISSED** with tenantId, completedSteps, completedAt/dismissedAt, and lastCalculatedAt. Server computes factual step completion from authoritative records; dismissals are explicitly persisted and audited. Completion should not be keyed to one browser. A fresh staff login must not restart an already completed company checklist.

If only optional checklist steps remain, users may dismiss it while required workflow blockers continue to be enforced inside the relevant booking/handover flows. Provide **Workspace setup** in Help/Settings for reopening the guide. In the main dashboard, do not render the full six-card grid indefinitely.

## 7. Security, privacy and cross-portal boundaries

- Server derives effective tenant from authenticated tenantGuard context; a client-supplied tenantId is not proof of authorization.
- Each search type and analytics field requires domain permission; membership alone does not grant financial visibility. Explicitly regression-test Company Owner, Tenant Admin, Operations, Finance Manager, limited staff and unrelated tenants.
- Never surface platform MRR, tenant subscription PII or other operator data in Company Overview.
- Independent owner performance must only show owned vehicles and authorized settlement data, separate from company customer details.
- Reject cross-tenant ID deep links and avoid leaking target records through search suggestions, cache, event streams or chart tooltips.
- Profile menu: name/email/role from authenticated context; account/session security actions from supported auth endpoints. Implement any missing profile update/security flow explicitly rather than presenting dead buttons.
- Only display a **Verified** badge when the relevant verification condition and scope are actually represented; identity email verification is not the same as company compliance approval.

## 8. Phase delivery gates

### UX-D1 — Topbar and account experience
- [ ] Search all scoped modules and authorized vehicle/customer/booking/rental references.
- [ ] Results open exact records, not only a module.
- [ ] Permission and foreign-tenant search denial tested.
- [ ] Remove density button; keep theme and keyboard shortcut.
- [ ] Avatar opens an account menu and uses authenticated user.
- [ ] Session/profile actions only appear when supported and authorized.
- [ ] Verified badge semantics confirmed.

### UX-D2 — Tenant first-rental onboarding
- [ ] Confirm screenshot/local branch source and reconcile missing component.
- [ ] Distinguish user signup completion from tenant business setup.
- [ ] Persist steps, completion and dismissal per tenant.
- [ ] Stop showing setup section on repeat logins after completion/dismissal; guide remains accessible.
- [ ] Existing bookings/handovers remain guarded by their authoritative lifecycle.

### UX-D3 — Analytics truth and API adapter
- [ ] Fix legacy response-shape mismatch, remove browser financial fallbacks.
- [ ] Define authoritative aggregation service with permission-filtered fields.
- [ ] Reconcile financial semantics, as-of and period filters.
- [ ] Replace synthetic flat utilization history with validated time buckets.
- [ ] Make dashboard counts complete, not capped by pagination.
- [ ] Add unit, contract, tenant isolation, GL reconciliation, zero/empty/missing data and multiple-currency tests.

### UX-D4 — Premium Overview implementation
- [ ] Compose KPI row and accessible charts using existing design system.
- [ ] Replace large welcome card with compact greeting and actionable attention.
- [ ] Remove manual refresh button; use query revalidation.
- [ ] Contextual attention items and recent activity have authorized deep links.
- [ ] Loading, no-data, stale, denied, error, and mobile behaviours verified.
- [ ] Company Overview remains the single active tenant dashboard.

### UX-D5 — Runtime certification
- [ ] pnpm lint / pnpm typecheck and analytics/auth/tenancy/finance tests pass.
- [ ] Real data cross-process tests only after P0 issue #33 PostgreSQL authority closure.
- [ ] Multi-role browser journey and mobile keyboard/screen-reader smoke tests pass.
- [ ] New booking/payment/rental changes propagate safely after server confirmation.
- [ ] No mock totals, silent financial fallbacks, cross-tenant leaks, or fabricated histories.
- [ ] CI and local evidence recorded. No staging or production claims without separate deployment gates.

## 9. Implementation order and review guard

1. First reconcile screenshot/local work with main; determine whether the six onboarding cards are unmerged, stale, or sourced from another entrypoint.
2. Implement D1 and D2 without changing accounting semantics.
3. Stabilize the existing backend analytics contract, permission envelope and historical series in D3.
4. Implement the new visuals in D4 only after data checks establish truth.
5. Run D5 release gate after issue #33 and the full local cross-process certification dependencies close.

**UX-D0 intentionally contains documentation and design contracts only; no UI alterations, new API endpoints, migration, deployment, CI run, or financial correctness certification.**
