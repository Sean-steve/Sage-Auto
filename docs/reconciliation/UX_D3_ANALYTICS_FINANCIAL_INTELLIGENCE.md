# Phase UX-D3 — Analytics Backend Integration & Financial Intelligence

**Date:** 22 November 2026  
**Repository:** Sean-steve/Sage-Auto  
**Branch:** feature/ux-d3-authoritative-analytics-financial-intelligence-20261122  
**Stacked on:** feature/ux-d2-smart-onboarding-first-rental-20261121  
**Status:** Implementation committed; TypeScript, automated tests, runtime finance reconciliation, browser checks and production persistence certification remain unverified.

## Objective and delivered contracts

Provide truthful, tenant-scoped, permission-protected datasets for the new Company Owner Overview planned in UX-D4. Use existing finance, ledger, fleet, booking, rental, CRM and analytics repositories; no new browser-based accounting authority.

### GET /api/v1/analytics/dashboard

Returns **{ data: TenantDashboardOverviewDto }**, consistent with the shared ApiClient ApiResponse data envelope. This intentionally fixes legacy DashboardView expecting res.data from a formerly top-level payload.

The response adds additive, typed fields:

- revenueChart: posted GL revenue by **journal postedAt**, grouped by tenant-local calendar date; not invoice gross.
- cashCollectionsChart: verified **inbound** payment amounts by verifiedAt, including any refundable deposit funds. Gross verified receipts are not revenue; refund outflows are separate.
- grossInvoicedChart: valid invoices by invoice issueDate; invoice totals are not posted GL revenue.
- bookingVolumeChart: booking creation counts using complete tenant pagination, not just first page.
- utilizationChart: **[]** while historical eligible-fleet-day denominators remain unverified. chartAvailability.utilization is **UNAVAILABLE** with a reason; it is intentionally NOT a flat line copied from today's utilization.
- financialSummary.netInvoicedRevenue: explicit alias of existing netRevenue invoice-based measure; postedRevenue and cashReceipts remain separate.
- chartAvailability: VERIFIED or UNAVAILABLE metadata for each dataset.

Live **fleet utilization snapshot** remains available from active / on-rent current vehicle states. It must not be relabeled historical utilization.

The selected currency is applied to every monetary chart and as-of receivable total. No addition of different currencies into one financial total. Financial chart series are calculated from full tenant-scoped data. A posted revenue journal missing its authoritative postedAt fails closed with error instead of inventing a date/value.

### Period logic

TemporalWindowResolver now calculates tenant-local calendar windows using Intl and returns UTC **half-open [from,to)** instants. Supports presets and explicit inclusive local calendar end dates, with equal-duration prior comparison windows. Previous period is not calculated for CURRENT_SNAPSHOT metrics, which cannot honestly be compared using today's snapshot.

### Metrics and reconciliation

- FINANCE_POSTED_REVENUE: joins revenue account entries to POSTED / REVERSED journal headers; dated by header.postedAt, currency by header.currency. Original entries and posted reversal events remain in their distinct posting periods.
- FINANCE_CASH_RECEIPTS: verified inbound Payment records by verifiedAt; excludes pending, voided/disputed and outbound amounts, preserves gross cash vs refund distinction.
- Booking count/value/rate metrics: fetch all tenant pages; no default 50-record truncation.
- General ledger / receivable / cash / owner-liability reconciliation removes prior fallback substitutions that could falsely claim a zero-balance account matched external totals. The existing analytics fixture now expects an actual AR discrepancy when invoices are open but no receivable GL balance is posted.
- The registry's cash-receipts and posted-revenue descriptions now match authoritative semantics.

### Permissions and security

The dashboard endpoint is a full executive view and deliberately **requires all** relevant permissions: analytics.read, vehicle.read, booking.read, rental.read, invoice.read, payment.read, ledger.read, lead.read, quote.read. This is more restrictive than a segmented operational dashboard and prevents exposing financial/CRM fields to staff with only operational access. D4 may add a separately permission-redacted operations overview; it must never replace denial with zeroes.

Each individual metric uses an explicit domain-to-tenant-permission mapping. Definitions and report catalogues are filtered. A batch metric call checks **all keys** before invoking any source service (no partial unauthorized response). Unknown metrics/reports fail closed.

Report queries, exports, download artifacts, saved reports and schedules require a relevant report.read + domain permission; exports additionally require report.export. The report registry's legacy labels such as reports:view are not treated as authoritative permissions. Tenant identity comes only from authenticated tenantContext (never an untrusted query or body).

### UI integration and scope

- src/lib/api-client.ts now has a typed dashboard response.
- Legacy DashboardView now consumes the data envelope and displays **Unavailable** if financial data cannot load, instead of calculating revenue from browser payments. This legacy view is not the current company runtime route.
- Current CompanyOverviewView remains operationally intact; **UX-D4** will build the KPI/chart panels against the verified contract and replace old summary/count calculations.
- The screenshot's unmerged local first-rental grid remains an acknowledged UX-D0/UX-D2 source-parity task.
- No changes to the vehicle-owner or SaaS platform-owner dashboards.

## Files changed

- apps/api/src/modules/analytics/domain/dashboard-intelligence.ts (new)
- apps/api/src/modules/analytics/domain/temporal-window.ts
- apps/api/src/modules/analytics/application/dashboard.service.ts
- apps/api/src/modules/analytics/application/metrics.service.ts
- apps/api/src/modules/analytics/application/reconciliation.service.ts
- apps/api/src/modules/analytics/domain/metric-registry.ts
- apps/api/src/modules/analytics/presentation/analytics-access.ts (new)
- apps/api/src/modules/analytics/presentation/analytics.controller.ts
- apps/api/src/modules/analytics/presentation/reports.controller.ts
- packages/types/src/analytics.ts
- src/lib/api-client.ts
- src/components/DashboardView.tsx
- packages/database/test/ux-d3-financial-intelligence.test.ts (new)
- packages/database/test/analytics-and-reporting.test.ts (reconciliation fixture corrected)
- package.json
- .github/workflows/ux-d3-review.yml

## Verification / certification gate

Run from repository root with dependencies installed:

    pnpm install --frozen-lockfile
    pnpm lint
    pnpm typecheck
    pnpm test:ux-d3
    pnpm test:analytics
    pnpm test:finance
    pnpm test:tenancy

Manual API and browser evidence required before completing D3:

1. Company Owner with full permissions can request the dashboard. Confirm { data } envelope.
2. Restricted operational staff cannot read finance, payment, ledger or CRM figures through full dashboard or report exports (HTTP 403) even if tenant membership is valid.
3. Two companies with overlapping vehicle/payment IDs never leak one another's data.
4. Seed two currencies and verify reports never sum them in one series; verify currency-specific receivables.
5. Seed invoices without payments, verified payments without invoices and journals with independent posting dates; confirm distinct series and periods.
6. Create a reversed journal and matching posted reversal in a later window; verify the original and reversal are shown in their own periods.
7. Seed a posted revenue journal without postedAt; verify no fabricated zero / missing-date value is shown.
8. Seed 300+ bookings; verify metrics and trend series are not truncated by repository default pagination.
9. Verify local calendar boundary (Africa/Nairobi) and leap/DST custom cases.
10. Check reconciliation: equal GL debits/credits is not the same as AR/payments/owner liability reconciliation; differences fail the relevant check.
11. Verify incomplete historic fleet capacity yields empty utilizationChart and UNAVAILABLE metadata, never today's rate repeated for past days.
12. Confirm Finance OS-style deposit handling is not imported; this tenant's payment/deposit ledger remains authoritative.

## Limitations / dependencies

**PostgreSQL data authority:** Issue #33 is still open. Current business repositories remain dependent on the application's existing durable SQLite record-store configuration. None of these changes certify PostgreSQL cross-process state, workers, staging, or production.

**Historical utilization:** Existing rental intervals and current vehicle lifecycle statuses are insufficient to reconstruct trustworthy historical eligible fleet days, especially for retired vehicles, temporary downtime, varying capacity and ownership changes. D3 intentionally exposes unavailable data and does not certify a utilization time series. A vehicle-day/history projection and verified backfill are required before D4 can render a true utilization trend.

**Financial audit scope:** The existing reconciliation report is a tenant-total GL/payment/AR comparison and is not a complete multi-currency general ledger audit. Cross-currency reconciliation and ledger-account attribution require dedicated finance certification before a green production-grade trial balance badge is trusted.

**Live browser/UI:** D3 prepares API datasets; it does NOT deliver UX-D4's chart design, date filters or automated live refresh. The current Overview still contains old direct domain summary calculations. D4 must explicitly switch to these authoritative analytics contracts.

**No certification claims:** Source changes and tests were committed via GitHub connector; no completed CI/typecheck/local backend/browser execution was available at authoring time. This PR must stay draft until these checks pass, local source divergence is reconciled and its parent UX-D0/D1/D2 PRs are reviewed.
