# Account and role-access review

Status: implemented foundation available for review; milestone acceptance remains incomplete. This is not a production-readiness sign-off.

Review site: http://localhost:3510/
Private credentials: `.review/access/ACCESS.md` (one separate account per role; do not publish this file).
Review database: `.review/access/review.sqlite`; existing `.data` records are not used or reseeded. One additional isolated identity/blank company was used for onboarding browser checks; its private file is `.review/access/onboarding-check.json`.

## Role-access matrix

The table shows default navigation after canonical permission filtering. The first section is the landing page. Actual access is returned by the server and rechecked on every API call. A visible section does not imply a completed business workflow.

| Role | Code | Landing | Permitted navigation |
| --- | --- | --- | --- |
| Company Owner | COMPANY_OWNER | Overview | Overview, Fleet, Bookings, Customers, Rentals, Inspections, Maintenance, Compliance, Vehicle owners, Finance, Settlements, Pricing, Public website, Team & invitations, Company settings |
| Workspace Administrator | TENANT_ADMIN | Overview | Overview, Fleet, Bookings, Customers, Rentals, Inspections, Maintenance, Compliance, Vehicle owners, Finance, Settlements, Pricing, Public website, Team & invitations |
| General Operations Manager | MANAGER | Overview | Overview, Bookings, Fleet, Customers, Rentals, Inspections, Maintenance, Compliance, Finance, Pricing |
| Fleet & Maintenance Manager | FLEET_MANAGER | Fleet | Fleet, Maintenance, Compliance, Inspections, Vehicle owners |
| Reservations & Booking Manager | BOOKING_MANAGER | Bookings | Bookings, Customers, Rentals, Pricing, Leads & quotes |
| Front Desk & Booking Agent | BOOKING_AGENT | Bookings | Bookings, Customers, Rentals |
| Finance & Accounting Manager | FINANCE_MANAGER | Finance | Finance, Settlements |
| Staff Accountant | ACCOUNTANT | Finance | Finance, Settlements |
| Corporate & Field Sales Agent | SALES_AGENT | Leads & quotes | Leads & quotes, Bookings, Customers |
| Driver & Chauffeur Manager | DRIVER_MANAGER | Drivers | Drivers, Rentals, Compliance |
| Driver / Chauffeur | DRIVER | My trips | My trips, My inspections |
| Customer Support Specialist | CUSTOMER_SERVICE | Customers | Customers, Bookings, Rentals, Finance |
| Vehicle Asset Owner | VEHICLE_OWNER | My vehicles | My vehicles, My settlements |
| Platform Owner | PLATFORM_OWNER | Overview | Overview, Companies, Team & invitations, Plans & subscriptions, SaaS billing, Support access, Platform analytics, Platform compliance, Platform settings |
| Platform Administrator | PLATFORM_ADMIN | Overview | Overview, Companies, Team & invitations, Plans & subscriptions, SaaS billing, Support access, Platform analytics, Platform compliance |
| Platform Billing Administrator | BILLING_ADMIN | SaaS billing | SaaS billing, Plans & subscriptions, Companies |
| Platform Support Administrator | SUPPORT_ADMIN | Support access | Support access, Companies |
| Platform Analytics & Intelligence | ANALYTICS_ADMIN | Platform analytics | Platform analytics |
| Platform Compliance Officer | COMPLIANCE_ADMIN | Platform compliance | Platform compliance |
| Renter | RENTER | My bookings | My bookings, My profile |

## Available in this foundation

- Saved identity, sign-in, email verification, reset, company/renter onboarding and portal selection.
- Platform/company invitations, resend, revoke and acceptance. Team suspension/restoration, role changes and named driver/vehicle-owner record linking are available in the screen. Owner/self protection remains enforced by the server.
- Saved company/fleet/booking/customer summaries and scoped driver trips/inspections, vehicle-owner cars, renter profile/bookings.
- Other operational sections display an unavailable state without fabricated totals or successful actions.

## Verified on 2026-10-02

- Isolated HTTP tests pass for all 20 roles: verified onboarding, normalized duplicate email, owner bootstrap, invitations/revoke/resend/expiry/concurrent acceptance, same-token role downgrade, suspension, logout, password-reset session invalidation and company isolation.
- Linked driver/owner/renter restrictions and verified guest-booking ownership pass positive and negative tests. Role changes clear old personal-record links; foreign-company links are rejected.
- Support access is explicit, read-only and audited. Tests reject another operator, a company owner, expired/ended sessions and suspended support staff. Browser checks exercised start, empty saved fleet and end.
- Atomic onboarding, invitations, bootstrap and team updates roll back failed writes. Fault injection permits safe retry; separate tests cover concurrent-write conflict, process crash and restart persistence. Existing accounts, sessions and cars survive restart.
- Renter onboarding resolves a public website alias distinct from its company slug.
- Typecheck and production build pass. Public-booking suite passes all 12 scenarios. Updated verified-email HTTP regression passes register/login/workspace/car/publish/quote/guest checkout/retry/admin booking list/unpublish.
- Browser sign-in, portal selection, exact landing and navigation match the matrix for all 20 separate review accounts. Desktop and mobile screenshots inspected for the primary portal families; mobile login has no horizontal overflow and keyboard Tab reaches the password with visible focus. Company-team and support screens checked, including honest empty states.
- Additional isolated onboarding identity verified in the browser: saved company-name draft survives reload and the existing account subsequently opens its saved company-owner portal. Keyboard Tab reaches team Save access; Enter submits an unchanged role without errors. This is not an exhaustive accessibility audit.
- Production email adapter tests confirm visible errors for missing settings, rejected delivery and network failure; verification/reset/invitation links pass against a simulated provider. This does not prove inbox delivery.
- Review restart reuses existing accounts. Credentials files are owner-readable only (0600). Real workspace records were not reset or reseeded.

## Remaining acceptance work

- Real verification/reset/invitation email delivery in staging is blocked by missing provider configuration and an HTTPS public application address. No live email was sent during these checks. Configure the settings below and verify receipt and link completion before final acceptance.
- Browser-only legacy car recovery now has an explicit company-targeted owner action, preserves its backup and excludes default sample cars. It has not been exercised against the user's actual browser backup; do not import into the blank review company.
- Unrelated operational workflows remain outside this milestone and display unavailable states where unfinished.

## Real email setup

Configure `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, `SENDGRID_FROM` (a verified sender), and `APP_PUBLIC_URL` (the deployed HTTPS app address) in the staging server environment. Do not put provider secrets in chat or commit them. The local review mail viewer is isolated test capture, not delivery to an inbox. SendGrid acceptance also does not alone prove delivery; check the authorized recipient's inbox and follow the verification/reset links.

## Frontend/API connections

| Screen/action | API |
| --- | --- |
| Sign-in/register/verify/reset | `/api/v1/auth/*` |
| Portal chooser and navigation | `GET /api/v1/access/context` |
| Onboarding draft/finish | `PUT /api/v1/access/profile`, `POST /api/v1/access/complete` |
| One-time platform owner | `POST /api/v1/access/bootstrap` |
| Role picker and team | `GET /api/v1/access/roles`, `GET/PATCH /api/v1/access/team[/id]` |
| Invitation lifecycle | `GET/POST /api/v1/access/invitations`, `POST /api/v1/access/invitations/:id/resend` or `/revoke` |
| Invitation inspection/acceptance | `GET /api/v1/access/invitation`, `POST /api/v1/access/accept` |
| Scoped saved records | `GET /api/v1/access/records?portal=...&section=...` |
| Named driver/owner records | `GET /api/v1/access/link-options?tenantId=...` |
| Audited support sessions | `GET/POST /api/v1/platform/support/sessions`, `POST /api/v1/platform/support/sessions/:id/end`, `GET /api/v1/access/support/:id/records` |
| Verify guest booking ownership | `POST /api/v1/access/claim-booking` |


## Restoration hardening controls added after this review

The original-interface restoration is now governed by `docs/restoration-hardening-controls.md` and `docs/restoration-screen-action-matrix.md`.

Important consequences:

- a Git baseline branch protects the pre-hardening source state;
- a local-only consistent SQLite checkpoint command records counts, stable keys and checksums without reseeding;
- every restored legacy company screen is read-only until its mutation acceptance gate passes;
- Fleet, Bookings and Customers currently have verified saved-data reads; other original operational screens remain layout/reference only unless separately proven;
- leaving a workspace, losing access, session expiry or logout clears the selected tenant context;
- personal Driver, Vehicle Owner and Renter portals remain outside the broad company loader;
- the prototype `SaaSControlPlaneView` is not treated as authoritative merely because its layout exists; platform actions remain governed by the new server-backed access/control-plane foundation;
- real staging email delivery remains an external acceptance dependency.

This hardening does not silently start the subsequent Fleet → Customers → Booking → Rental implementation phase.
