# Phase 4.2 — CI Repair Evidence & Financial Invariant Decisions

**Status:** Proposed repairs on draft PR #17; NOT approved for merge until CI and domain review pass.
**Baseline:** Original `Sage-Auto` CI run 38304115430 had 51/59 suites passing.
**Verified intermediate run:** 38483014724 had 57/59 suites passing with `lint` and `typecheck` successful; failed booking-amendment rate lookup and legacy owner-settlement worker expectation.

| Legacy CI failure | Reconciled behavior / change | Evidence status |
|---|---|---|
| Pricing UI source contract | V2-like UI now makes canonical server quote authority explicit, preserving original Workbench and responsive design | Passed in run 38482153772 |
| Availability UX source contract | Expired holds explicitly cease blocking after TTL; no allocation algorithm weakened | Passed in run 38482153772 |
| Invoice lifecycle wording | Error retains authoritative final-calculation requirement AND states required Return & Final Calculation lifecycle | Passed in run 38482153772 |
| Rental final calculation replay | A sealed immutable calculation can be read back after terminal rental state without mutating charges | First failure resolved; subsequent completion regression discovered |
| Rental completion | Validate explicit vehicle disposition BEFORE writing rental/booking/contract or releasing fleet; rejected requests remain safely retryable | Passed in run 38483014724 |
| Booking escrow/deposit | Test's historical Oct 1 date was before a newly created October rate plan; fix fixture effectiveFrom, preserving effective-plan validation | First escrow mismatch resolved; explicit category alias discovered |
| Public 3-day discount | Resolve historic `SUV` category rate lines against canonical category ID, retaining tenant and published plan selection | Passed in run 38483014724 |
| Stripe payout | Seed APPROVED real settlement backing payable; preserve state, separation-of-duties and provider checks | Passed in run 38483014724 |
| Booking explicit rate plan | Same canonical ID / old category CODE compatibility when a plan is explicitly selected and effective | New patch awaiting full run |
| BullMQ owner settlement worker | Legacy test expected a draft orphan settlement to generate a batch event despite no period/settled revenue. Worker is intentionally period-driven and demands verified tenant finance. Revised fixture is now a *negative safety test*: zero payout, no fabricated event, draft remains draft and repeat is idempotent. No production worker guard removed. | Patch awaiting full run |

## Crucial boundary

The worker regression was not a simple off-by-one implementation bug: the legacy test fixture bypassed **period, owner and paid/settled revenue** requirements. Fabricating a paid owner statement to satisfy it would violate the product blueprint. The negative test should be accompanied by a separate positive integration test that seeds real settled rental finance facts and a valid period, before Phase 4 reaches payout release.

### Outstanding before merging

1. Full 59-suite matrix must be green on the actual PR head, not an earlier commit.
2. Restoration acceptance and TypeScript must pass.
3. Review categories `SUV` and canonical IDs across import paths, and migration rules for old snapshots.
4. Add positive period-based settlement-worker test backed by settled tenant-finance records; do not turn an orphan draft into paid without commercial lineage.
5. Check all 215 screens and 22 journeys against real DTO/permissions as integrated modules are migrated.
6. Payout provider tests use simulators: they do not prove real banking/money movement.

No V2 frontend features were removed. No V2 browser-local invoice, payout or booking state was promoted to real authority.
