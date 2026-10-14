# Sage Auto — Stage 5 Cross-Portal Acceptance & Release Hardening

**Date:** 14 October 2026  
**Repository:** `Sean-steve/Sage-Auto` (original repository; NOT `Sage-Auto-v2`)  
**Branch:** `fix/return-finance-closure-20261014`  
**PR:** [#20](https://github.com/Sean-steve/Sage-Auto/pull/20) — draft, not merged.

## Evidence

[Passing Stage 5 end-to-end browser workflow](https://github.com/Sean-steve/Sage-Auto/actions/runs/38539840581).

The CI workflow `.github/workflows/stage4-browser-acceptance.yml` starts the authentic Vite website and Express API on separate ports, provisions twenty isolated role accounts, and runs:

1. Stage 4 tenant role/regression acceptance (31 headless Chromium assertions over six user roles).
2. Stage 4 running-API zero-balance settlement, complete and retry checks (16 assertions).
3. Stage 5 preparation of a real persisted unsealed return fixture in a **disposable** review SQLite database.
4. **Real Chromium clicks**: Company Owner opens Return dossier → Continue in Finance & Payments → selected rental context survives navigation.
5. Finance Manager selects that rental → clicks Review & finalize settlement → clicks Seal final settlement. API confirms the immutable `SETTLED` calculation. Finance Manager can return to the workflow **but cannot** release the vehicle (RBAC).
6. Company Owner reauthenticates → clicks Complete & release vehicle → confirms `AVAILABLE` disposition → submits completion. API confirms `COMPLETED` and the completed return record; browser reload then Returns screen re-entry displays saved completion.
7. Read-only integrity scan **after** the browser mutation: zero divergence findings in the synthetic dataset.

Stage 5 contributes 11 real browser/API handoff assertions. None of these steps initiate a payment provider or fake a provider response. The scenario covers **zero incremental balance**, not the positive-balance money paths.

The repository also runs the full domain regression matrix, restoration acceptance, closure/injection checks, TypeScript and OCI package builds in separate workflows. Use the latest specific `head_sha` CI result for current promotion decisions.

## Reproduce locally

A **clean, separate checkout** of the repair branch is strongly advised. Do not set `SQLITE_PATH` globally; `pnpm review:api` creates its own disposable review DB and refuses staging/production or a caller-supplied database path.

```bash
git fetch origin
git switch fix/return-finance-closure-20261014
pnpm install --frozen-lockfile
# Terminal 1
pnpm review:api
# Terminal 2
pnpm review:web
# Terminal 3 — Node.js 24+ and local Chromium/Chrome required
NODE_ENV=test APP_ENV=test SQLITE_PATH=.review/access/review.sqlite \
  STAGE5_PREPARE_ONLY=1 pnpm exec tsx scripts/stage4-live-closure-acceptance.ts
node scripts/stage5-browser-journey.mjs
SQLITE_PATH=.review/access/review.sqlite pnpm audit:closure -- --all-tenants
```

The review setup creates an owner-only `.review/access/ACCESS.md` containing local, temporary test credentials. **Never commit, transmit or reuse them**, and do not point the test scripts at a business database. Stop both test servers afterward. These scripts create and mutate ONLY the isolated `.review/access/review.sqlite` file.

For an existing real business database, the **only permitted preliminary operation** is a separately invoked read-only audit appropriate to the actual storage engine, following a verified backup. The bundled `audit:closure` reads the repository's SQLite record-store format. It is not a PostgreSQL migration or repair tool.

## Payment/refund sandbox acceptance — STILL REQUIRED

**Do not use real card, M-Pesa or customer funds.** A Finance approver must verify all of the following using authorized provider **sandbox** accounts:

- M-Pesa STK initiation: request alone must never mark an invoice paid; only authenticated, verified callbacks/reconciliation may create and allocate a payment.
- Card provider success, pending, cancellation, duplicate callback, replay, and late callback: each must preserve the canonical payment and invoice truth, including safe idempotency and no cross-tenant allocations.
- Refund: refundable deposit obligation → refund request → authorized approval → provider execution → **COMPLETED** status → bound rental/deposit obligation → `REFUNDED` finalization. Test wrong rental, amount mismatch, failed provider refund, and double request.
- Charge: additional balance → actual paid invoice → `CHARGED` settlement. Test partially paid, voided and unrelated invoices; these must not pass completion.
- Waiver: documented reason + authorized role + audit event. No implied fake money or provider disbursement.
- Owner payout: backed approved settlement and four-eyes approval; no release of phantom revenue.

Do not assert provider-sandbox readiness without transaction/ledger traces, credential-safe logs, and evidence uploaded by an authorized operator.

## Deployment and rollback are NOT release-ready

Inspection of `.github/workflows/ci.yml` and `.github/workflows/rollback.yml` found earlier echo-only staging/production/rollback commands. Stage 5 replaces them with **fail-closed preflight checks** and invokes required adapters at:

- `infrastructure/deployment/adapters/staging.sh` — `migrate`, `deploy`, `verify`
- `infrastructure/deployment/adapters/production.sh` — `migrate`, `deploy`, `verify`
- `infrastructure/deployment/adapters/rollback.sh` — `validate`, `traffic`, `workers`, `verify`

Those scripts are **not supplied**: current host, deployment method, secrets and provider credentials have not been connected or established. As a result, deployment and rollback intentionally **fail**, rather than falsely reporting success. `node scripts/release-preflight.test.mjs` verifies the fail-closed wiring.

The CI container builder currently uses `push: false`, and the declared `image_digest` output is not populated; successful container packaging is not an actual registry promotion. Provision immutable, addressable images with digests, secrets, database backup/migration strategy and environment-specific deployment before production sign-off.

## Final release blockers

**Do not merge into `main` or deploy to production without:**

1. Authentic full path through Availability → Booking → deposit/payment → Contract & Handover → Active Rental → Return receipt/Inspection → Final Calculation → Finance → Fleet release. Stage 5 presently automates the **Return → Finance → Fleet** click path and prior tests cover other states separately.
2. The provider-sandbox positive-balance charge/refund and payout controls above, with evidence.
3. Read-only integrity scan and human review of **existing business data** (not only the disposable test fixture); no automatic historical repair.
4. Actual configured staging/production adapters and proven rollback drill, immutable image registry publishing, health probes and restored worker state.
5. Business Owner, Finance and Operations approval; latest branch-head tests/CI all green after final changes.

**Status:** Automated Stage 5 zero-balance multi-actor UI acceptance **PASS**. Full business-data/payment-provider/release certification **BLOCKED** pending real environments and human acceptance.
