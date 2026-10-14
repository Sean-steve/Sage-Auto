# Sage Auto — Stage 6 Cross-Workflow Integration Acceptance

**Date:** 14 October 2026  
**Original repo:** `Sean-steve/Sage-Auto` (NOT `Sage-Auto-v2`)  
**Branch:** `fix/return-finance-closure-20261014`  
**PR:** [#20](https://github.com/Sean-steve/Sage-Auto/pull/20) — draft; `main` unchanged.

## Verified automated results

- [Real authenticated Stage 6 end-to-end API run](https://github.com/Sean-steve/Sage-Auto/actions/runs/38543358806) — **PASS (61 assertions)**.
- Read-only audit of the disposable integrated scenario: **zero findings**.
- Stage 4 and Stage 5 checks also run in the same workflow: 31 six-role browser checks, 16 live zero-balance API closure checks, 11 true Chromium handoff/approval clicks.
- Explicit HTTP boundary checks: genuine availability conflict = **409**, not-found Contract = **404**, unexpected fault = **500**.

## Cross-domain acceptance matrix

| Entry point / handoff | Authenticated operation | Persisted/negative invariant |
|---|---|---|
| Booking → Availability | Company Owner confirms an isolated pre-quoted zero-charge booking | Exclusive confirmed Booking allocation references the correct Vehicle; Booking Agent denied `booking.confirm`. |
| Availability → Booking conflict | Another renter tries to confirm the same Vehicle/time | Server returns 409; competing Booking remains unconfirmed. |
| Booking → Contract | Generate and sign Contract via HTTP | Unconfirmed Booking cannot create a Contract; Contract links the correct Booking/Vehicle, records signing; Renter cannot sign arbitrary tenant Contract. |
| Contract → Handover | Schedule and complete sequential checkpoints | Arrival → verified documents → completed pre-rental inspection → verified signature → key handover → final Handover. Premature Rental dispatch rejected. |
| Handover → Rental | Evaluate dispatch readiness and POST Rental start | Readiness clears only after prerequisites; Rental has the correct `bookingId`, `contractId`, **`handoverId`** and vehicle; Booking/Contract become ACTIVE; Vehicle ON_RENT; Booking allocation ACTIVE; idempotent Rental start. |
| Rental → Return | Schedule return and receive vehicle | Return odometer/fuel recorded; customer/vehicle links retained. |
| Return → Inspection | Create, start, complete and acknowledge RETURN inspection | Sealed inspection is required for return processing and damage assessment. |
| Return → Finance | Generate authoritative final calculation, seal zero-balance deposit | Finance Manager performs settlement; Booking Agent denied settlement mutation; Finance Manager denied vehicle release. No fabricated payment event. |
| Finance → Fleet | Company Owner completes Rental | Booking/Contract completed, Vehicle AVAILABLE and updated mileage, Allocation RELEASED, Return record completed, fresh login sees saved Rental completion. |
| Owner Settlements | Read owner-settlement module as Company Owner | This **does not** prove an actual payout; no sandbox/provider funds moved. |
| Tenant/Renter isolation | Renter tries internal Rental/Contract endpoints; wrong tenant tries Rental read | Access denied without leaking records. |
| Historical integrity | Read-only record scanner after scenario | Zero synthetic Booking/Contract/Rental/Vehicle/Allocation/Return divergence flags. |

The booking fixture is an explicitly **complimentary KES 0** pre-quoted Booking with zero deposit requirement. Customer, driver, vehicle and quote fixture are created directly inside the disposable test database. Booking **confirmation onward uses the real HTTP API**. No real or fake payment-provider success is asserted. This is **not** a completed customer checkout or M-Pesa/card payment test.

## Repairs prompted by the integration gate

1. `apps/api/src/common/filters/http-exception.filter.ts` — classify older operational database exceptions by canonical code when they inherit a misleading 500, returning 409 for availability conflicts and 404 for missing records, while preserving 500 for unexpected failures.
2. `packages/types/src/index.ts` and `packages/database/src/repositories/rental.repository.ts` — preserve the authoritative `handoverId` on a started Rental.
3. `packages/database/test/stage6-http-boundary.test.ts` — regression coverage of 409 / 404 / 500.
4. `scripts/stage6-cross-workflow.ts` — isolated authenticated integration chain with 61 assertions.
5. `.github/workflows/stage4-browser-acceptance.yml` — CI gate executes the new assertions and read-only integrity audit; local Chrome cleanup also hardened.

## Running the test locally

Requires **Node 24+, pnpm 9.15.9** and the original `Sage-Auto` repository. Use a clean separate checkout. The review harness provisions twenty separate test accounts and a disposable SQLite file:

```bash
git fetch origin
git switch fix/return-finance-closure-20261014
pnpm install --frozen-lockfile

# Terminal 1: isolated review API (port 3511)
pnpm review:api

# Terminal 2: isolated Vite UI (port 3510)
pnpm review:web

# Terminal 3: ensure no global SQLITE_PATH is inherited
pnpm exec tsx packages/database/test/stage6-http-boundary.test.ts
NODE_ENV=test APP_ENV=test SQLITE_PATH=.review/access/review.sqlite \
  pnpm exec tsx scripts/stage6-cross-workflow.ts
SQLITE_PATH=.review/access/review.sqlite pnpm audit:closure -- --all-tenants
```

**Never set the Stage 6 scripts against a production/business database.** The integrated runner explicitly rejects any `SQLITE_PATH` outside the isolated review SQLite database. Test user credentials in `.review/access` are local only and must not be committed/shared.

## Open release gates — NOT VERIFIED

- Real user-facing browser clicks for the **entire** availability/quote/paid booking/contract/inspection chain. Stage 6 exercises the actual HTTP and repository boundaries; Stage 5 specifically exercises real Return → Finance → Fleet browser clicks.
- Provider sandbox flows: legitimate paid invoice, deposit hold, M-Pesa/card callback verification, double callbacks, refunds, invoice allocation and owner payout/dispute settlement. Zero-charge test runs do not prove monetary correctness.
- Existing business database integrity scan, approved data remediation and full owner/fleet/Finance sign-off.
- Actual staging/production hosts, immutable image registry publishing, environment adapters, backup/restore and exercised rollback. Fail-closed deployment gate remains intentionally active.

**Release status:** Stage 6 cross-workflow isolated integration **PASS**; PR remains **draft and unmerged** pending real money, full UI, business data and deployment readiness.
