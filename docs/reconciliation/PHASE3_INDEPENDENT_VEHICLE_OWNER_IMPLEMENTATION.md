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
| S06-06 | Agreement details | Historical terms and owner-signed SHA-256 terms-bound acceptance evidence |
| S06-07 | Earnings | Canonical settlement periods and owner net obligations |
| S06-08 | Statements | Owner-scoped statement/detail, balances and expense breakdown |
| S06-09 | Payouts | Distinguishes true payable PAID from merely APPROVED |
| S06-10 | Disputes | Existing settlement engine, guarded owner-only written disputes |
| S06-11 | Documents | Verified, scanned private vehicle files; owner-bound signed URLs valid for 60 seconds |
| S06-12 | Profile | Identity/contact, payout setup status and email-verified encrypted beneficiary update |
| S06-13 | Operator connections | Current authorized operator and invitation status; no unauthorized cross-company rollup |

## Remaining Phase 3 release blocks

1. Full multi-owner browser end-to-end test with independently provisioned live tenant records and legal/compliance sign-off; isolated review browser tests and negative API tests pass.
2. Additional owner-visible maintenance evidence and operator-countersigned agreement PDF workflows remain a separate product milestone; document downloads, owner signatures and encrypted verified payout editing are implemented.
3. Historical owner-only rental pagination is complete functionally (>1000 regression) using record-store filtering; dedicated indexed SQL pagination remains a scalability/performance enhancement.
4. Individual currency-aware payout summaries and provider payout evidence validation still need backend QA; there are no mocked payout actions.
5. Parent Phase 2 staging configuration is deferred by user request; merging code is not deploying or certifying the product.

## Phase 3 completion — secure owner operations (2026-10-30)

### Secure documents
- The owner documents index uses `VehicleDocumentRepository` metadata for **currently assigned** owner vehicles and only permits verified documents with `fileId` pointing to an `ACTIVE`, malware-scanned `CLEAN`, private file in the same tenant.
- The private document download route reauthorizes the exact owner-to-vehicle link and delegates to the canonical `FileAccessService` audit plus object storage driver. Download URLs expire in **60 seconds**. Arbitrary file URLs, storage keys, unverified/quarantined/restricted files and other owners' records are never published.
- Operator upload and malware scanning continue using the existing Files module. No separate owner-side unscanned upload bypass has been added.

### E-signature for vehicle ownership agreements
- Owner signs the **exact existing** contract snapshot and version using explicit electronic-consent checkbox and typed legal name. The server verifies name, current owner, active historical agreement, nonempty terms, SHA-256 terms digest and the logged-in owner membership.
- Consent receipt is stored durably with actor, time, hash and agreement version; replay is idempotent, signature cannot be modified through the owner API, and altered/stale terms are refused. Existing agreements are not re-priced or modified by signing.
- This is owner acceptance evidence, **not** a claim that a counterpart operator e-signature or regulator-qualified signature platform has been implemented.

### Verified payout destination changes
- `POST /api/v1/access/owner/payout/request-change` stores an encrypted pending beneficiary change and sends an out-of-band six-digit email challenge to the **verified login account**, never to a client-provided address.
- `POST .../payout/verify-change` is bound to the same current owner/tenant/user, has **10-minute expiry**, maximum **five** attempts, an atomic one-time commit and a non-sensitive audit trail. It does not create a payment, mark obligations PAID or release a payout.
- Configure `OWNER_PAYOUT_ENCRYPTION_KEY` with a **unique, random, 32+ character secret** in the runtime environment. A missing or unsuitable key fails closed. The pending payload is AES-256-GCM encrypted; the OTP is SHA-256 hashed. Postmark and SendGrid send real verification emails outside review mode.
- Bank and M-Pesa destinations are never returned in the API response; account details in a statement are redacted.

### Historical rental pagination
- New repository `findOwnerHistory` applies **tenant and owner-specific historical vehicle agreement windows before pagination**. It returns `{items,total,offset,limit,hasMore}` at the owner API boundary with max page size 100.
- A former owner must not see rentals after an agreement ended; a current owner must not see another owner's earlier rentals just because the vehicle was reassigned. No hidden 1000-rental limit.
- The owner UI has previous/next controls; inspections are requested in owner-authorized rental-page batches.

### Automated acceptance
- `packages/database/test/access-onboarding.test.ts` verifies legitimate owner access and negative other-owner/tenant access, masked payout details, agreement signing and tamper replay, payout email challenge, secure file authorization, and a >1000-rental paginated history.
- CI pipelines include Phase 3 tests, restoration regressions, SaaS owner regression, Stage 4–7 browser/integration gates, finance safety and the main canonical suite. Staging and production remain intentionally undeployed.

### Future production obligations
- Production encryption key, actual mailbox delivery, legal policy acceptance/countersign options and private S3/MinIO/malware scanner must be configured and verified before production release; do **not** treat the merge to main as production deployment certification.
