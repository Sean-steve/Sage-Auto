# Steps 2–3 local certification report — 11 November 2026

## Result and scope

**PASS: PostgreSQL-backed application repository operation and a fresh-company paid rental completed entirely through the UI.** This certifies the local recorded cash/bank path tested below. It is not certification of every workflow, production operations, external payment settlement, or the entire original Step 2 architecture-hardening plan.

The broader Step 2 items for normalized domain tables, database-enforced domain constraints and application-table tenant RLS remain open. The compatibility record table has application-level tenant authorization; passing the separate SQL executor's RLS tests does not give that table RLS. External provider effects inside request transactions also require separate design and acceptance. These limitations must remain visible rather than being hidden behind a blanket `postgresCertified` flag.

## Subsequent normalized-schema finding

The normalized backfill rejected V4: its saved actual return time precedes its actual rental start by seconds. The return form truncated timestamps to minutes. The financial balances and UI closure described below remain observed evidence, but V4 does **not** pass full chronology/data-integrity certification. Historical records are preserved without SQL repair. The service now rejects invalid or before-start return timestamps at receipt and final calculation; the form preserves milliseconds. The PostgreSQL rental lifecycle regression and typecheck passed after this fix. A fresh V5 UI run subsequently completed and its selected normalized staging backfill passed, including chronology and archive fidelity. See `STEP_2_NORMALIZED_CORE_2026_11_11.md`. V4 remains preserved as failure evidence.

## Fresh-company UI proof

Retained company: **Paid UI Certification V4 20261110**. Dedicated local PostgreSQL database: `sage_paid_ui_20261109`. The company, customer, vehicle and all business records were created through UI forms. No SQL business-record repair, API write shortcuts, waived settlement, or bypassed permission checks were used.

1. Register and verify a new account; create an empty company.
2. Register Toyota Corolla **CERT 1112**; create and verify **Certification V4 Driver**; configure the rental price and deposit.
3. Quote and confirm **BKG-2026-000001**, recording KES 4,060 rental money and KES 1,000 deposit separately.
4. Generate **CTR-2026-000001**, record a clearly identified test signature reference, complete the pre-rental inspection and **HND-2026-000001**, and start **RNT-2026-000001**.
5. Receive the returned vehicle at 10,020 km/full fuel, complete the no-damage return inspection and calculate final charges.
6. Generate **INV-2026-001002** for KES 4,060; allocate the existing receipt without recording a second payment.
7. Request the KES 1,000 deposit refund. Invite a separate finance manager, register/verify that account and accept its invitation through UI. The independent manager records the simulated cash refund **REF-2026-001002**, then seals settlement using its completed deposit evidence.
8. The finance manager does not have rental-close controls. Sign back in as company owner; complete the rental with disposition **AVAILABLE**.
9. Restart the API, reload the browser, and verify the completed rental, paid invoice, saved financial balances and available vehicle with its retained return mileage.

Final balances:

| Item | Verified amount/state |
| --- | --- |
| Rental net / tax / invoice | KES 3,500 / 560 / 4,060 |
| Invoice | PAID; outstanding KES 0 |
| Rental collections | KES 4,060 |
| Deposit refund | KES 1,000, COMPLETED |
| Deposit held / refund due | KES 0 / 0 |
| Unallocated rental money | KES 0 |
| Rental / vehicle | COMPLETED / AVAILABLE |
| Return mileage / fuel | 10,020 km / 100% |

This is simulated local cash/bank evidence, not an actual external transfer. The contract reference verifies the recorded-reference workflow; it is not an uploaded signed-document or electronic-signature-provider acceptance test. The vehicle is internally owned, so this run does not certify independent-owner settlement.

## Repairs and migration work

- Async PostgreSQL record-store access across application repositories and their consumers, with explicit legacy SQLite compatibility/import support.
- API success responses follow commit; failed mutations roll back. Worker record transactions and tenant context are isolated from other jobs.
- Import preview, empty-target protection, transactional copying and byte verification preserve the SQLite source.
- Financial and party business numbers now persist above retained numbers; concurrent standalone allocation retries serialization conflicts, while enclosing business transactions remain atomic. Report identifiers use UUIDs instead of process-local counters.
- Corrected gross/net invoice tax, preserved deposit liability during invoicing and supported separately approved offline refund confirmation.
- Linked booking-origin deposits to the correct refund obligation; API rejects deposit money mislabeled as invoice refunds.
- Completed deposit refunds now reduce held liability and refund due exactly once, including replay.
- Inspections use actual linked identities and refresh records created since workspace entry.
- Mobile navigation now has an accessible name, native modal focus handling, Escape dismissal and desktop-resize recovery. Settled refunds are labeled as refunded.

Earlier V1–V3 companies remain as failure evidence. Their historical incorrect invoice/refund/deposit records were not silently rewritten. Do not use those companies as passing demonstrations.

## Verification

- Fresh isolated PostgreSQL suites: payments, finance, rentals, customers/drivers/corporates/agents, and authorization all passed. Authorization covers role grants, owner protection, support access, tenant boundaries and vehicle-owner resource policies.
- Storage checks passed: commit/rollback, reconnect, concurrent claims, stale-write rejection, ended transaction contexts, real TransactionManager SQL, HTTP commit-before-success, failed-response rollback, import preview/source preservation/refusal/rollback, and numbering across four independent processes/reconnect/rollback.
- Final-source typecheck and production build both passed (exit 0), including the navigation resize handler. Results are recorded in `.review/paid-ui/final-typecheck.exit` and `final-build.exit`. The build retains a chunk-size advisory. `git diff --check` passed.
- Desktop 1440×1000 and mobile 390×844 screens inspected. Mobile fleet/finance fit the viewport. Keyboard Enter opens navigation; Escape closes it and returns focus. Resizing to desktop closes the modal. Reduced-motion preference was enabled during the final checks; a complete motion audit remains outside this evidence.
- Offline overview refresh shows an explicit unavailable state; restoring connectivity and using Retry recovers successfully.

Evidence lives under `.review/paid-ui/` (private/ignored): `v4-run.log`, `v4-complete.log`, `v4-restart-check.log`, `mobile-qa.log`, `final-ux.log`, `recover-overview.log`, `final-regressions.json`, `final-storage.json`, and the matching `v4-*.png` screenshots. Credentials and mailbox contents must remain private.

## Remaining graduation gates

The specific PostgreSQL-backed paid-rental proof is complete. A full original Step 2/whole-product certificate still requires normalized domain schema/constraints/application RLS, external-provider transaction/outbox acceptance, real worker failure/recovery, independent-owner settlement and broader cross-portal tests, backup/restore and deployment recovery. The local review uses simulated Redis/email infrastructure. These are not implied passes from the successful rental.

No commit, push, deployment or live payment was made. Local services use web 3520, API 3521 and dedicated PostgreSQL 55436. Obsidian MCP remains unavailable, so the shared-vault save is pending; this repository report is the durable handover.
