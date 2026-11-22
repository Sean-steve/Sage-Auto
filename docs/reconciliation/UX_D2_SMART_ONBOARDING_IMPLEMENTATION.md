# UX-D2 — Smart Onboarding and First Rental Experience

**Implementation branch:** feature/ux-d2-smart-onboarding-first-rental-20261121  
**Base branch:** feature/ux-d1-universal-search-topbar-account-20261121  
**Scope:** Company Owner Overview and Company Settings (not renter, vehicle owner or platform portal).
**Date:** 21 November 2026

## Outcome

The canonical Company Overview now includes an optional, company-level **Prepare your first rental** checklist below the operational KPI cards, rather than a permanent six-card section above every business signal.

The checklist's progress comes from actual domain repository evidence and survives browser changes. Once the API observes a completed handover for that company, it permanently records a completed timestamp and hides onboarding from Overview. Company Owners can also choose **Hide guide** earlier; that preference is persisted per tenant with an audit record and can be reversed through **Company Settings → Workspace setup guide** until the first handover is complete.

**This is not user account registration:** existing /access/profile and /access/complete remain unchanged. No booking, deposit, signature, inspection, availability or rental lifecycle guard is bypassed.

## Evidence contracts

| Step | Positive evidence | Workspace |
| --- | --- | --- |
| Register vehicles | At least one tenant-owned vehicle record exists | Fleet |
| Add customer and driver | Tenant has at least one customer AND one driver record | Customers & drivers |
| Configure pricing | An ACTIVE rate plan exists with a positive daily rate | Pricing |
| Confirm availability | A confirmed/active booking-sourced vehicle allocation exists | Availability |
| Create booking | At least one tenant booking exists | Bookings |
| Complete handover | At least one tenant handover has status HANDOVER_COMPLETED | Contract & Handover |

A vehicle being AVAILABLE by itself does **not** prove a date-specific availability check was performed. An inactive rate plan does **not** count as active pricing. A new booking does **not** count as a completed handover.

**Limitation:** Steps are _historical observations_, not guarantees of current booking readiness. Progress is monotonic; if a vehicle or rate plan is later retired, the fact that setup was previously observed is retained. The authoritative operation validators must always be rerun by the real booking/handover flows.

## State and API

- **GET /api/v1/tenant/setup-status** — returns { data: FirstRentalStatus }. A successful GET also idempotently persists newly observed steps / first completed handover.
- **POST /api/v1/tenant/setup-status/visibility** with strict JSON { action: "DISMISS" | "RESTORE" } — updates company-wide visibility; existing owner session and tenant membership required.
- Both endpoints are mounted behind **authGuard + tenantGuard**; only **COMPANY_OWNER** can read or mutate. Tenant context is read from verified req.tenantContext, not request body, query or user-supplied IDs.
- New state is stored under namespace tenant:first-rental-setup:v1 using the existing durable record-store adapter (SQLite in the current local application runtime). Persisted: tenantId, observedSteps, dismissedAt, completedAt, updatedAt.
- Changing visibility is audited as tenant.first_rental_setup.dismissed or tenant.first_rental_setup.restored. Idempotent repeat actions do not produce additional audit writes.
- **COMPLETED** is terminal even if the historical handover record is later removed or the company switches users or devices. RESTORE cannot unset completedAt.
- **DISMISSED** hides the guide but not the workflow. It can be restored through Settings before the first completed handover; the terminal outcome overrides dismissal.

State machine: NOT_STARTED → IN_PROGRESS → COMPLETED; any incomplete state ↔ DISMISSED via owner-only action. Completion overrides any incomplete/dismissed state and is never reversible through the UI.

## UX

- New company: guide visible after KPI cards and before recent bookings.
- Onboarding progress: compact six-card grid, completion indicators, step descriptions, workspace shortcuts.
- Completed company: guide automatically disappears from Overview, regardless of user/browser; no repeated onboarding after login.
- Earlier dismissal: company owner hides the guide; returns via Company Settings to restore or review.
- Company Settings: separate compact **Workspace setup guide**, collapsible and reviewable even when completed.
- Unauthorized staff: guide and API unavailable; no cross-tenant data or permissions leaked.
- Loading/errors: status is read from server, with error/retry states. Failed reads never become false zero or fabricated complete.
- Refresh on page revisit, focus, and an unobtrusive 60s cadence while Overview/Settings is visible.
- Other cards and business modules remain available whether guide is visible, dismissed or completed.

## Changed files

- apps/api/src/modules/tenancy/application/services/first-rental-setup.service.ts
- apps/api/src/modules/tenancy/presentation/first-rental-setup.controller.ts
- apps/api/src/app.module.ts
- src/lib/first-rental-setup.ts
- src/components/WorkspaceSetupGuide.tsx
- src/components/CompanyOverviewView.tsx
- src/components/RestoredWorkspace.tsx
- packages/database/test/first-rental-onboarding.test.ts
- package.json
- .github/workflows/ux-d2-review.yml

## Verification gate (not yet certified)

Run in the checked-out D2 branch:

    pnpm install --frozen-lockfile
    pnpm typecheck
    pnpm test:ux-d2
    pnpm test:tenancy
    pnpm test:access

Browser/HTTP matrix:

1. Newly provisioned Company Owner on Overview sees six pending steps (if zero data).
2. Add a vehicle, customer and driver, activate a rate plan/rate; revisit Overview; progress updates.
3. Confirm a booking-backed availability allocation; availability step updates. Merely registering a vehicle is insufficient.
4. Create a booking; no completion until handover reaches HANDOVER_COMPLETED.
5. Complete handover using real contract/inspection/signature/key sequence; Overview setup disappears; persists after reload/login.
6. Hide before completion; reload and test another company user (with Company Owner access); guide remains hidden. Restore via Settings and verify visibility.
7. Confirm that staff without COMPANY_OWNER cannot read or dismiss via direct HTTP calls.
8. Switch tenants; A completion or dismissal cannot affect B.
9. Simulate one repository failure; setup shows an error, never declares complete.
10. Verify no changes to deposit HELD enforcement, booking confirmation, signed contract/inspection or rental activation.

**Existing blockers:** [Issue #33](https://github.com/Sean-steve/Sage-Auto/issues/33) remains: application business-data authority still uses SQLite; PostgreSQL cross-process certification is unproven. Do not claim PostgreSQL-backed onboarding or production-scale durability.

**Source divergence:** the original screenshot had a different six-card section not present in the inspected main/UX-D1 CompanyOverviewView. This change adds a canonical new component but does not reconcile any unmerged local-only screenshot changes. That must be compared before merging.

**Phase UX-D2 delivery:** Source files and contracts committed to feature branch. TypeScript, automated, browser, and cross-process certifications require actual CI/local runs. Not merged to main; not deployed.
