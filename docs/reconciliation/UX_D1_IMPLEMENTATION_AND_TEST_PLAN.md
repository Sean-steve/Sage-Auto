# UX-D1 — Universal Search, Topbar and Authenticated Account Experience

**Date:** 21 November 2026  
**Branch:** feature/ux-d1-universal-search-topbar-account-20261121  
**Stacked baseline:** feature/ux-d0-dashboard-reconciliation-20261121  
**Scope:** Company workspace only (the current RestoredWorkspace). Platform Owner and Independent Vehicle Owner portals remain unchanged.

## Implementation summary

| Requirement | Implementation |
| --- | --- |
| Strategically positioned search | Centered, responsive search trigger in Sage Auto topbar |
| Search vehicles | Existing GET /api/v1/fleet/vehicles with server-side search and permission vehicle.read |
| Search customers/drivers | Existing GET /api/v1/customers and /api/v1/drivers using server-side search, customer.read/driver.read |
| Search bookings/rentals | Existing GET /api/v1/bookings and /api/v1/rentals using server-side search, booking.read/rental.read |
| Search invoices and payments | Extended existing tenant-scoped, per-domain-guarded GET /api/v1/finance/invoices and GET /api/v1/payments with optional search and limit |
| Search modules | Preserves permission-scoped section suggestions and Ctrl/Cmd+K |
| Record open | Opens a selected record's existing Fleet, Booking, Customer/Driver or Rental dossier; Finance opens the selected reference context |
| Density button | Removed from topbar; comfortable layout and responsive rules remain |
| Theme | Existing saved light/dark control retained |
| User avatar | Interactive dropdown with authenticated full name, email, role and identity verification |
| Account details | Read-only profile sourced from access-context identity (no fabricated edit action) |
| Account security | Existing /auth/sessions and session revocation endpoint; can revoke other sessions |
| Company settings | Navigates to the existing settings section only when authorized |
| Switch workspace / sign out | Reuse AccessApp's existing controlled actions |
| Verified label | Conditionally shows **Email verified**, never generic unsubstantiated company verification |

## Design and data boundaries

- Searches run via **existing server-filtered endpoints** guarded by authenticated tenant context and domain-specific authorization. No unrestricted all-record browser downloads, duplicate backend search store, or cross-tenant search override.
- Results display only a stable record identifier, label and minimal status/number. Customer identity numbers, driver license numbers, payment source references and private finance facts are not shown in suggestions.
- Search requests debounce (275ms), enforce query length 2–100, hard-cap each category to 6 results and discard stale responses. Partial outages are distinguished from zero matches.
- A defensive tenantId mismatch filter prevents a foreign-tenant record from appearing even if an upstream response violates the contract.
- Financial list search filters are optional and preserve existing unfiltered list semantics for current consumers. A limit is applied only when explicitly requested.
- Clicking record results uses existing permission-guarded record detail endpoints. These do not mutate bookings, payments or rental states.
- Search and account dialogs render via React DOM portals to avoid sticky topbar/backdrop-filter stacking constraints.
- The legacy Header.tsx and DashboardView.tsx are intentionally untouched because RestoredWorkspace provides the current company experience; reconciliation/disposition remains in UX-D0 docs.

## Source changes

- src/lib/workspace-search.ts — typed tenant/permission-aware federated search adapter.
- src/components/WorkspaceSearch.tsx — central search trigger, keyboard palette, record groups and error states.
- src/components/WorkspaceAccountMenu.tsx — user menu, profile, session visibility and session revocation.
- src/components/RestoredWorkspace.tsx — topbar replacement, search result focus routing, removal of density toggle.
- src/components/FleetExperienceView.tsx — direct vehicle dossier selection.
- src/components/BookingExperienceView.tsx — direct booking detail loading.
- src/components/CustomersDriversExperienceView.tsx — direct customer/driver profile selection.
- src/components/RentalsView.tsx — direct authoritative rental selection with fallback to targeted fetched record.
- src/components/FinanceView.tsx — direct invoice/payment context.
- packages/database/src/repositories/operational-invoice.repository.ts and payment.repository.ts — optional tenant-filtered search parameters.
- packages/types/src/payments.ts and apps/api/src/modules/finance/presentation/finance.controller.ts — request contracts.
- packages/database/test/workspace-search-contract.test.ts — search isolation/permission/partial failure tests.
- package.json — pnpm test:ux-d1.

## Verification

**Static verification:** Files were committed and read back from GitHub.  
**Automated execution:** Must run via CI/local checkout; do not infer PASS from repository file creation.  
**No staging, server or production deployment.**

Run in a clean checkout of the UX-D1 branch:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:ux-d1
pnpm test:access
pnpm test:tenancy
```

Manual browser checks (authenticated tenant company workspace):
1. Search by registration/vehicle model/VIN, customer/driver name, booking or rental reference, invoice/payment number.
2. Press Ctrl+K and navigate with arrow/Enter/Escape, including at mobile width.
3. Switch between two tenants and verify no cross-tenant results or stale open record.
4. Compare Company Owner with staff lacking customer or finance permissions. Restricted categories must never request those APIs.
5. Click search hit and verify an exact existing record opens without changing its workflow state.
6. Open avatar, view identity/role, load security sessions, revoke a non-current session, navigate authorized company settings, switch company, sign out.
7. Confirm density button absent, theme toggle retained and Email verified only on identity-verified user.
8. Test slow/offline domain responses and verify partial errors, no fabricated results.

## Explicit follow-up and non-goals

- **UX-D1 does not implement a dedicated indexed SQL search service.** It federates existing server filters. Once PostgreSQL Issue #33 is completed, a dedicated indexed aggregate can be considered if necessary for performance.
- No standalone Account Settings editor or MFA enrollment is claimed; existing identity/profile fields are read-only, while session management is interactive.
- D2 tenant-first-rental onboarding and D3–D5 analytics correctness/dashboard redesign are separate phases. The original screenshot's onboarding section remains unresolved against the version inspected on main.
- No change to SaaS Platform Owner or Independent Owner dashboards, no production data backfill, no financial logic change, no deployment.
