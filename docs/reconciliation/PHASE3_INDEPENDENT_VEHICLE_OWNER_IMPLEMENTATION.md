# Phase 3 — Independent Vehicle Owner Portal

**Branch:** `feature/phase3-independent-vehicle-owner-20261030`  
**Base:** Phase 2 merged `main` at `219d74bf37f889dd7d3659526c69a74cdd3526f6`.  
**Status:** Engineering implementation for review. Not deployed, staged or production-certified.

## Why Phase 3 uses a separate portal

A `COMPANY_OWNER` owns a *rental business*, while a `VEHICLE_OWNER` owns vehicles registered under a rental business. They are distinct principals and have distinct data/security rights. The operator's `/fleet`, `/finance`, `/vehicle-owners`, `/owner-settlements` administration endpoints MUST NOT be given to the independent owner.

## Implemented vertical slices

- 13-role-section authenticated owner workspace, distinct from SaaS Platform Owner and company operations. Dark-green premium visual language, mobile navigation, data-grid states.
- New `AccessService.vehicleOwnerSelf(userId,tenantId)` resolver uses **active tenant membership/role, active currently linked Vehicle Owner record, and tenant-scoped record lookup**. Email matching and request-provided `ownerId` do not establish permission. Tenant/owner status and record link are rechecked on every call.
- Narrow `/api/v1/access/owner/*` read facade mounted **before** tenant-wide middleware:
  - `GET overview?portal=`
  - `GET vehicles?portal=`
  - `GET agreements?portal=`
  - `GET rentals?portal=`
  - `GET condition?portal=`
  - `GET settlements?portal=`
  - `GET settlements/:id/statement?portal=`
  - `POST settlements/:id/dispute` (body: `{portal,reason}`)
  - `GET profile?portal=`
  - `GET operators?portal=`
- Canonical OwnerSettlementsService now accepts an Access-resolved `ownerRecordId`, not a matching email, for owner self-service. The generic `/owner-settlements/mine` remains protected by existing tenant-wide middleware and will reject an email-only self-service request.
- Financial views differentiate `CALCULATED`, `APPROVED`, payable `PROCESSING` and `PAID`; independent owners cannot submit approvals, create payments or mark themselves paid. Financial amounts are read from settlement repository, not inferred from rental price or localStorage.
- Owner statement API removes payout bank details, bank account, tax PIN from response. Sensitive owner payout details cannot be edited.
- Access onboarding integration test checks cross-owner/cross-tenant denial, stale-token link removal, company/renter denial and no email-based owner access.
- Owner workflow is **not** company vehicle-owner management and does not delete or disable existing operator features.

## S06 screen contracts — integration honesty

| ID | Screen | Current integration |
| --- | --- | --- |
| S06-01 | Owner dashboard | Linked vehicle counts, settlement count and payment obligation status |
| S06-02 | Owner vehicle list | Current linked ownership cars only |
| S06-03 | Performance | Owner cars' rental lifecycle status; *not* financial estimate |
| S06-04 | Condition | Owner rental inspection status; media/maintenance details still to scope |
| S06-05 | Agreements | Historical linked terms and effective dates |
| S06-06 | Agreement details | Terms summary, share, fixed payout and deductions; actual signatures/documents not yet connected |
| S06-07 | Earnings | Canonical settlement periods and owner net obligations |
| S06-08 | Statements | Owner-scoped statement/detail, balances and expense breakdown |
| S06-09 | Payouts | Distinguishes true payable PAID from merely APPROVED |
| S06-10 | Disputes | Existing settlement engine, guarded owner-only written disputes |
| S06-11 | Documents | Explicitly unavailable until owner-safe file download policy |
| S06-12 | Profile | Identity/contact and only whether payout method is configured; edits disabled pending verification |
| S06-13 | Operator connections | Current authorized operator and invitation status; no unauthorized cross-company rollup |

## Remaining Phase 3 release blocks

1. Full multi-owner browser end-to-end test with multi-tenant live records, 403/404/409 handling, role changes and suspension.
2. Owner-visible files/maintenance, verified payout-method edit and owner document signature acceptance. Never expose tenant-global file endpoints.
3. Owner rental listing currently caps at 1000 recent company rentals; proper owner-specific indexed pagination is required before claiming full history.
4. Individual currency-aware payout summaries and provider payout evidence validation still need backend QA; there are no mocked payout actions.
5. Parent Phase 2 staging configuration is deferred by user request; merging code is not deploying or certifying the product.
