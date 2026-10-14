# Sage Auto — Stage 7 Financial Integration, Refund and Owner-Payout Safety

**Date:** 14 October 2026  
**Repository:** original `Sean-steve/Sage-Auto` (not `Sage-Auto-v2`)  
**Branch:** `fix/return-finance-closure-20261014`, [draft PR #20](https://github.com/Sean-steve/Sage-Auto/pull/20).  
**Safety boundary:** this stage **never executes a real bank/card/M-Pesa transaction**. All provider outcomes come from the explicit `FakePaymentProvider` in test mode.

## Executed acceptance

- [Isolated Stage 7 financial safety acceptance](https://github.com/Sean-steve/Sage-Auto/actions/runs/38545972078) — **PASS**, 48 integration assertions plus existing Sprint 22 payment-provider contract tests.
- [Cross-workflow Stage 4–7 gate](https://github.com/Sean-steve/Sage-Auto/actions/runs/38545936826) — **PASS** on previous branch head, integrating the browser/HTTP rental acceptance and Stage 7 financial suite. Check the latest head-sha run before promotion.
- [Return and Finance closure acceptance](https://github.com/Sean-steve/Sage-Auto/actions/runs/38545972100) and [Restoration acceptance](https://github.com/Sean-steve/Sage-Auto/actions/runs/38545972015) — **PASS** on the Stage 7 financial-hardening branch head.

### Provider verification, booking and invoice

- Starting a provider payment intent is **not** equivalent to receiving money. An explicit, server-side verified record is required.
- Client/browser-reported success and invalid webhook signatures are rejected.
- A signed fake-provider callback must report the **same numeric amount and currency** as its original payment intent. An underpaid/overpaid or wrong-currency callback cannot create an authoritative Payment or settle an Invoice.
- Valid signed webhook creates a verified Payment and allocates to the correct operational Invoice, changing Invoice status to PAID only when the outstanding amount reaches zero.
- Repeated delivery of the same provider event cannot duplicate its Payment or Invoice allocation.
- A separate provider-verified booking deposit becomes HELD only after a durable `RENTAL_DEPOSIT` Payment allocation, not simply from intent initiation.

### Refund liabilities and final return

- Refund reservation accounts for both completed refunds **and outstanding PENDING/APPROVED/PROCESSING refund requests**; multiple requests cannot over-reserve the same payment.
- `RENTAL_DEPOSIT` refund request requires a real same-tenant deposit position, correct currency, amount within held money and a recorded deposit allocation from **that same verified Payment**. Spoofed or unrelated deposit IDs are rejected.
- Refund requester cannot approve their own transfer. An authorized second actor executes the provider adapter.
- Refund is claimed as PROCESSING **before** the provider call, with optimistic version enforcement. Completed refunds return their stored reference on retry; in-flight and failed refunds cannot silently reissue a transfer. Ambiguous provider/network failures remain PROCESSING for reconciliation.
- A completed provider-simulator deposit refund can seal an isolated saved Rental Final Calculation as REFUNDED only with the correct deposit obligation, amount and completed Refund ID.
- Manual/offline payment refunds remain outside the automatic provider refund path.

### Owner settlement and payouts

- Only a payable tied to an APPROVED OwnerSettlement can cross into the outbound payment provider boundary.
- Payable and approved settlement must match **owner, currency and net disbursement amount** and include an explicit recipient account/phone. Placeholder recipients are forbidden.
- The settlement approver cannot execute the same payout.
- Provider failure restores the settlement to APPROVED and leaves payable FAILED; it does not report paid revenue.
- A simulated success creates one OUTBOUND OwnerSettlement Payment, seals payable PAID and settlement PAID. Repeated execution is rejected; in-flight/cancelled statuses cannot re-disburse.
- Registry blocks `FAKE_PROVIDER` in staging or production.

### Non-regression tests

The Stage 7 workflow also runs the previous payment/provider contracts, which check payment allocation limits, no premature paid invoices, verified webhook rules, manual refund denial and four-eyes owner payout. Stage 4–6 test suites remain in CI.

## Implementation

- `apps/api/src/modules/payments/application/payment.service.ts`: strict provider verification, secure deposit refund source binding, reservation-aware refund limits, refund execution claims/replay safety, and approved-payable/recipient payout validation.
- `packages/database/test/public-booking-and-checkout.test.ts`: keeps the M-Pesa checkout fixture consistent with **the initiated amount**, rather than an unrelated hard-coded value; strict provider checks remain.
- `scripts/stage7-financial-integration.ts`: isolated test-only signed webhook → Invoice, booking deposit → Refund → saved Rental Finance closure, plus Owner payable → provider-simulated payout and deliberate failure probes.
- `.github/workflows/stage7-financial-safety.yml`: independent financial CI gate that does **not** depend on Chromium or external providers.
- `.github/workflows/stage4-browser-acceptance.yml`: also runs Stage 7 after booking-to-release integration and a read-only closure audit.

## Local verification

Use the original repo repair branch and a dedicated, disposable review directory. Requires Node 24+, pnpm 9.15.9:

```bash
git fetch origin
git switch fix/return-finance-closure-20261014
pnpm install --frozen-lockfile

# IMPORTANT: Do this only in a disposable review checkout.
mkdir -p .review/access
NODE_ENV=test APP_ENV=test SQLITE_PATH=.review/access/review.sqlite \
  pnpm exec tsx scripts/stage7-financial-integration.ts

NODE_ENV=test APP_ENV=test SQLITE_PATH=.review/access/legacy-finance.sqlite \
  pnpm exec tsx packages/database/test/payments-and-provider-contracts.test.ts
```

The Stage 7 executable **refuses** any database path except `.review/access/review.sqlite` and requires both runtime environments to be set to `test`. It generates isolated tenant-specific records and provider-simulator references only. Never point any financial mutation script at business/production data.

## Production release blockers — explicit

1. **Real provider sandboxes not yet used.** Test actual M-Pesa Daraja STK/C2B/B2C and Stripe/card sandbox flows with credentials, verified raw-body signatures, callbacks, idempotency keys and provider reconciliation; never call simulation evidence a certified provider transfer.
2. **Ledger posting not end-to-end certified.** The service emits posting contracts/outbox events; verify worker delivery, double-entry postings, bank/PSP totals and ledger balances across refunds and owner payouts under failure injection.
3. **Source earnings calculations not fully exercised here.** Stage 7 seeds an already APPROVED owner settlement/payable to test the payout boundary. Independently test approved rental revenue, ownership terms snapshots, allowable owner expenses, commission and adjustments feeding generated settlement periods and batches.
4. **Durable distributed payout serialization/uncertain outcomes:** this suite checks sequential retries and in-process optimistic claims, not concurrent multi-worker transfers, process crashes, real provider timeout ambiguity or full refund/payout recovery. Those require controlled sandbox and persistence/concurrency fault-injection testing.
5. **Business database integrity + actual deployment:** real existing records, tenant migration behavior, payment credentials, immutable images, staging deployment, rollback drills and Owner/Finance/Operations approval are still unverified. Environment adapters intentionally fail closed until implemented.

**Release decision:** Stage 7 financial **simulator-backed acceptance PASS**; real money movement, accounting and production release **NOT CERTIFIED**. Keep PR #20 draft and `main` unchanged until remaining gates are independently satisfied.
