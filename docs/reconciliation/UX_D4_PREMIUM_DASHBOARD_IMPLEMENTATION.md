# UX-D4 — Premium Company Dashboard Reconstruction & Visual Analytics

**Date:** 22 November 2026  
**Repository:** Sean-steve/Sage-Auto  
**Implementation branch:** feature/ux-d4-premium-dashboard-visual-analytics-20261122  
**Base branch:** feature/ux-d3-authoritative-analytics-financial-intelligence-20261122  
**Status:** Frontend implementation committed, certification pending. Not deployed or merged.

## Result

Replaced the current **CompanyOverviewView** (the actual Company Owner workspace screen routed through **RestoredWorkspace**) with a responsive executive command center. This supersedes its previous shallow domain-list dashboard, eliminates the user's unwanted manual Refresh control, and preserves working operational navigation and UX-D2's one-time first-rental setup guide.

### Premium visual system

- Deep-navy editorial header with restrained emerald/blue ambient treatment, company-oriented title, status badges, a date-range selector and immediate booking route.
- Six responsive KPI cards with consistent typography, monochrome icons, status/caption hierarchy, actual period or snapshot labelling, and conditional source-backed percentage deltas.
- Responsive SVG line chart with metric switcher for ledger-posted revenue, gross verified receipts, and gross invoices. Hover/focus to reveal actual period values, accessible data table for assistive technologies, and automatic weekly/monthly aggregation for long ranges.
- SVG bar chart of booking volumes from verified booking creation dates.
- SVG doughnut with actual fleet status distribution (available, on rent, reserved, maintenance, blocked, and other active).
- Compact verified attention panel prioritizing overdue rentals, unpaid receivables, pending handovers and zero vehicle availability.
- Recent bookings list opening the selected booking's existing authorized dossier. The shared navigation event accepts a typed record focus validated against its destination section.
- Dedicated quick actions to availability, returns, fleet, finance, settlements and bookings.
- Mobile/tablet/desktop responsive layouts, no additional charting dependencies.

### Live and honest data rules

1. Primary executive dataset: **GET /api/v1/analytics/dashboard** provided by UX-D3. The frontend verifies the returned **tenantId** matches the current portal before rendering.
2. Every revenue chart uses **posted journal revenue**, not invoice or payment totals. Gross invoicing and verified incoming payments remain separate selectable series.
3. Dashboard is finance-aware but deliberately **fail-closed**: a missing data response, unauthorized role or unavailable series shows *Unavailable*, never a computed browser-store balance, zero fallback, or synthetic trend.
4. Financial KPI period matches the selected reporting period. **Receivables and fleet status** are *current snapshots*, not period totals.
5. Booking trend uses UX-D3's complete source-backed period buckets. Recent booking rows come from the existing server-backed Booking list endpoint, not mock data.
6. Current overdue count comes from the rental **filtered total** at the authoritative Rental API. The API's top-level \`total\` as well as \`meta.total\` envelopes are supported. The dashboard never extrapolates from a limited subset of rentals.
7. Historical utilization is intentionally **UNAVAILABLE** until reliable vehicle-day denominators and backfill are certified. The live utilization percentage and fleet-status chart remain valid snapshot metrics.
8. Company Owner role must have analytics.read + the relevant source-domain permissions (fleet, bookings, rentals, invoices, payments, ledger and CRM). No restricted finance data is fetched on a role without those complete permissions. Bookings and overdue rentals can still be loaded independently if the respective operational permissions exist.
9. Date presets include Today, This Week, This Month, Last Month, This Quarter, This Year and Custom (max 366 days). For custom ranges the server receives user-entered local calendar dates and chooses the authenticated tenant's timezone. Financial series never combine currencies.
10. No unconditional green *everything is clear*: attention status is positive only when all required live domains have been loaded; partial failures show an incomplete status warning.
11. Auto-refresh is triggered while the page is visible every 90 seconds and on focus. Request sequence tokens discard stale results during period/tenant switches.
12. UX-D2's persistent first-rental guide is retained immediately after KPI cards; it disappears from Overview once the company completes its first handover, but remains reviewable in Company Settings. No manual onboarding ticks or booking guard overrides.

### Important parent-branch defect fixed

UX-D3 initially used \`lead.read\` and \`quote.read\` which are not Sage Auto's tenant CRM permission codes. UX-D4 corrects the backend dashboard and metric/report guards **and** the frontend authorization gate to \`crm.lead.read\` and \`crm.quote.read\`. Without this fix, even a Company Owner with all real permissions would have received a 403.

### Files

- \`src/lib/dashboard-presentation.ts\` (new: permission and chart aggregation functions)
- \`src/components/dashboard/ExecutiveCharts.tsx\` (new: three accessible chart views and unavailable state)
- \`src/components/CompanyOverviewView.tsx\` (reconstruction)
- \`src/components/RestoredWorkspace.tsx\` (permission-scoped booking record focus via navigation events)
- \`apps/api/src/modules/analytics/presentation/analytics-access.ts\` (CRM permission correction)
- \`packages/database/test/ux-d4-dashboard-presentation.test.ts\` (new tests)
- \`package.json\` (register \`pnpm test:ux-d4\`)
- \`.github/workflows/ux-d4-review.yml\` (non-deploying validation workflow)

## Verification required

Run in the UX-D4 branch:

    pnpm install --frozen-lockfile
    pnpm typecheck
    pnpm test:ux-d4
    pnpm test:ux-d3
    pnpm test:analytics
    pnpm test:access
    pnpm build

### Manual browser test matrix

1. Company Owner with seeded real data: headline currencies, booking numbers, finance chart series and fleet chart show values matching the authoritative API.
2. Switch company/tenant: stale responses cannot leak previous tenant data or records; the page resets and refetches.
3. Restrict a user's ledger.read or invoice.read permission while leaving booking.read: finance remains unavailable, recent bookings remain accessible, no hidden financial amounts are displayed.
4. Create and verify incoming payments that are deposits, record invoices separately, post revenue journals on different dates: the three trend selections must show their distinct values. Refunds must not be mislabelled as new revenue.
5. Select Today, Month, Quarter, Year and Custom; check inclusive local date boundaries, long-period bucket grouping, no mixed currencies.
6. Operate with 0 records: true zero is displayed only where the authoritative backend returns verified zero; blank data becomes Unavailable.
7. Fail the analytics API while Booking API still works: show an amber analytic warning and available booking content; do not substitute local payment figures.
8. Add overdue rental and confirmed open invoices: correct attention cards appear with navigation and no partial-list false totals.
9. Complete a first handover and revisit: onboarding guide stays hidden in Overview; Company Settings remains available.
10. Recent booking row selects the exact booking dossier, including browser back/forward-like navigation changes and permission checks.
11. Responsive 375px / 768px / 1280px / 1600px; keyboard focus, tab order, hover/focus data points, contrast, text overflow and table screen-reader descriptions.
12. Historical utilization chart remains unavailable until a certified capacity-history backfill exists.
13. Compare selected current fleet active totals to status donut. Report discrepancies rather than treating retired assets as active.
14. Run TypeScript, contract, analytics and frontend build gates before removing draft PR status.

## Open blockers

- **All GitHub PRs D0–D4 are stacked, not certified/merged/deployed.** Parent UX-D3 and upstream changes must be reviewed before final release.
- **Issue #33 PostgreSQL persistence** remains open; current backend business-data authority and workers require dedicated staging and cross-process certification.
- UX-D4 is primarily a Company Owner dashboard experience. Platform SaaS Owner and Independent Vehicle Owner portals will need separate analytics experiences, not an unreviewed copy of company finance figures.
- UX-D4 does not create reliable historical fleet-eligible capacity; do not turn current utilization into a fake trend.
- Visual browser screenshots and end-to-end evidence cannot be asserted from source commits alone; CI/browser tests are needed before describing the dashboard as production-certified.
