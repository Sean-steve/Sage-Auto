# Steps 2–3 checkpoint — 10 November 2026

> Update: the V4 paid-rental UI proof subsequently passed, including refund, closure and restart persistence. See [11 November local certification report](STEPS_2_3_LOCAL_CERTIFICATION_2026_11_11.md). Original architecture-hardening gates remain explicitly open.

Status: NOT CERTIFIED. This supersedes the migration status in the November 8 checkpoint; it does not certify the whole product.

## Implemented locally

Application repositories and consumers now use an asynchronous PostgreSQL record-store adapter; legacy SQLite remains for compatibility tests and explicit import. API mutations commit before success responses; failed requests roll back. Worker tenant context is asynchronous-context scoped. The importer previews by default and applies only into an empty target with byte verification. These are compatibility records, not normalized domain tables with tenant RLS.

The paid UI test exposed and prompted fixes for double-added invoice tax, unintended deposit application, missing offline-refund confirmation, fabricated inspection identities, and stale inspection vehicle choices. Finance now associates deposit refunds using the payment's original booking or rental, and the API rejects deposit payments misclassified as invoice refunds. Vite ignores private review artifacts to prevent evidence capture from reloading the application.

## Verified UI evidence

Dedicated PostgreSQL database: sage_paid_ui_20261109. No manual database repair of business records.

The first company exposed an incorrect KES 4,709.60 invoice; it remains unchanged as failure evidence.

Paid UI Certification V2 20261110 was created through registration/company setup. Through UI only: vehicle CERT 1110, verified customer, pricing, booking, KES 4,060 rental receipt plus KES 1,000 deposit, contract test-reference signature, handover inspection, dispatch, return receipt, no-damage return inspection, final calculation, invoice and allocation.

V2 invoice total: KES 4,060; paid: KES 4,060; receivable: zero; unallocated rental payment: zero. Deposit stayed separate. A second finance manager registered, verified and accepted an invitation through UI. This manager confirmed the simulated KES 1,000 offline refund. However, the refund was incorrectly classified as an invoice refund, so settlement correctly refused it. V2 is retained as failure evidence and is not a passing lifecycle.

A V3 company rerun has been prepared but fresh registration is not yet confirmed. Resume by inspecting the browser and .review/paid-ui/v3-setup.log before running scripts again.

## Validation and artifacts

- PostgreSQL payment/provider-contract suite including offline confirmation, separation of duties, replay, and rejection of deposit misclassification: passed; .review/paid-ui/refund-classification-regression.log.
- Earlier corrected gross-tax/deposit finance regression: passed; .review/paid-ui/finance-regression.log.
- Earlier PostgreSQL transaction/import/repository regressions are described in the development handover; do not confuse those with UI certification.
- Latest typecheck log contains no diagnostics, but process completion must be reconfirmed after interruptions.
- git diff --check passed after removing two trailing-whitespace lines.
- Desktop invoice screenshot visually inspected; current responsive and keyboard checks remain open.
- Private evidence and browser scripts: .review/paid-ui/. Credentials and mailbox are private and must not be published.
- Test signature references are not actual signed-document/provider-signature verification. Recorded money is simulated local cash/bank evidence; no real transfer was initiated.

## Remaining gates

1. Complete V3 fresh-company paid rental including correctly classified deposit refund, final settlement, closure and vehicle availability; verify after API restart.
2. Add durable numbering for repositories using process-local counters; check multi-process uniqueness and restart behavior.
3. Review compatibility-store tenant isolation, missing domain constraints/RLS, and external-provider side effects inside HTTP transactions. Do not label provider operations certified.
4. Run final typecheck/build and targeted regressions; validate desktop/mobile/error/keyboard workflows.
5. Owner settlement and broad cross-portal/security/failure/operations graduation gates remain separate and unproven by this internal-vehicle rental.

Services: web 3520, API 3521, Chromium CDP 3522, PostgreSQL 55436. Process ownership is recorded in .review/paid-ui/processes.json. API restart encountered a transient database connection timeout and subsequently started. Host responsiveness has been intermittent; do not infer a product failure from a browser-control timeout alone.

Obsidian MCP is unavailable, so shared-vault checkpoint saving remains pending. Daily usage snapshot already saved privately as .review/paid-ui/usage-20261110.json; it includes concurrent sessions and is not an invoice.
