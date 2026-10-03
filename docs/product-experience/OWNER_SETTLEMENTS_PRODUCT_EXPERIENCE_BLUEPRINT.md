# Sage Auto — Owner Settlements Product Experience Blueprint

Status: Implemented on `blueprint/owner-settlements`

## 1. Purpose

Owner Settlements turns completed, financially settled rental activity into governed obligations payable to third-party vehicle owners.

The experience must preserve historical commercial truth. A settlement is not calculated from today’s vehicle-owner agreement, browser totals, current rate cards or raw rental prices. It is derived from:
- completed Rental facts
- settled Tenant Finance revenue facts
- the ownership/revenue-share agreement that was effective for each rental/expense date
- approved owner-deductible expenses
- governed adjustments

The result becomes an approved payable. Actual money movement is executed only through the Payments provider boundary.

## 2. Experience Boundary

### Owner Settlements owns
- settlement periods
- idempotent settlement batches
- owner settlement calculations
- historical terms snapshots
- rental revenue lines
- expense deduction lines
- adjustments
- approval
- dispute / resolution
- payable obligation creation
- owner statements
- vehicle profitability read models

### Tenant Finance owns
- customer invoices
- paid/settled revenue authority
- approved operating expenses
- finance source facts consumed by Settlement

### Vehicle Ownership owns
- ownership history
- effective agreement dates
- historical revenue-share terms
- allowable owner expense deduction rules

### Payments owns
- outbound provider payout execution
- provider transaction reference
- payout retry/provider integration
- resulting outbound Payment record
- payout ledger event

Owner Settlements never fabricates provider payout success.

## 3. Owner Settlements Command Center

The default workspace shows:
- settlements awaiting approval
- disputed settlements
- approved/payment-pending settlements
- current payable amount
- paid amount
- period and batch status
- payout queue
- vehicle profitability

Primary tabs:
- Settlements
- Periods & batches
- Payout queue
- Vehicle profitability

Vehicle Owner self-service receives a resource-scoped version containing only that owner’s settlements/statements/dispute actions.

## 4. Canonical Lifecycle

`Finance settled revenue + historical ownership terms -> CALCULATED -> APPROVED -> PAYMENT_PENDING -> PAID`

Dispute path:
`CALCULATED / APPROVED -> DISPUTED -> resolved/recalculated -> CALCULATED -> independent re-approval`

No dispute resolution auto-approves a settlement.

A direct browser/manual transition to PAID is prohibited.

## 5. Calculation Contract

Settlement calculation requires:
- owner
- period or explicit period dates
- owner vehicle ownership history
- completed Rental facts
- settled Finance revenue components
- approved expenses
- governed adjustments

The calculation engine:
1. resolves the agreement effective for each Rental event
2. resolves the agreement effective for each deductible expense date
3. rejects missing historical terms
4. rejects unsupported commercial strategies rather than substituting a percentage model
5. consumes Finance revenue components instead of re-pricing Rental
6. includes only paid/settled Finance facts
7. separates shareable rental revenue from non-shareable items
8. applies owner/operator revenue split
9. applies only eligible approved expense deductions
10. applies explicit adjustments
11. produces frozen source lines and terms snapshots

## 6. Historical Ownership Invariant

For each Rental:

`vehicleId + ownerId + rental event date -> exact effective VehicleOwnership agreement`

The system must never:
- use the currently active agreement as a fallback
- use a later renegotiated revenue share retroactively
- rewrite already approved/paid settlement terms
- infer a missing agreement

Missing historical agreement = settlement calculation failure.

Every settlement preserves:
- primary `termsSnapshot`
- complete `termsSnapshots` history represented by the source lines
- ownership IDs
- agreement effective dates
- terms version
- revenue-share percentage
- expense-deduction rule

## 7. Finance Revenue Contract

Owner revenue eligibility is based on Tenant Finance, not raw Rental totals.

Each eligible Rental line records:
- Rental ID / number
- Vehicle
- Booking / Contract references
- Invoice ID / number
- settled Finance source flag
- base rental gross
- extension gross
- excess-mileage gross
- excluded/non-shareable revenue
- owner share
- operator share
- historical ownership ID

A completed Rental with unpaid/unsettled Finance revenue does not enter owner payout eligibility.

## 8. Currency Contract

A settlement is single-currency.

If eligible settled Finance facts contain multiple currencies, calculation fails and requires separate settlement treatment per currency.

Profitability reporting also cannot sum heterogeneous currencies into one number. Multi-currency source data must be filtered/reported separately.

Currency must never be inferred from locale/IP.

## 9. Expense Deduction Contract

Only approved Finance expenses enter Settlement.

For each expense:
- Vehicle association must be explicit
- historical ownership agreement is resolved at the expense date
- owner-deductible flag must be present where applicable
- agreement must permit owner deductions
- allocation is OWNER_BORNE, OPERATOR_BORNE or SHARED
- deduction amounts are frozen into the settlement line

Draft/unapproved expenses are excluded.

## 10. Adjustment Contract

Adjustments are explicit additive records, never silent rewrites.

Examples:
- credit adjustment
- debit adjustment
- dispute settlement
- carryover deduction
- hold

Rules:
- reason required
- actor recorded
- currency preserved
- finalized APPROVED / PAYMENT_PENDING / PAID settlements cannot be directly adjusted
- adjustment triggers recalculation only while mutation is still legal

Permission: `settlement.adjust`.

## 11. Periods & Batches

Periods may be WEEKLY, BI_WEEKLY, MONTHLY or CUSTOM.

Rules:
- periods cannot overlap
- closed periods cannot generate new batches
- batch generation is idempotent
- owner with no settled Finance revenue in the period may be legitimately skipped
- data-integrity failures are not silently skipped
- missing historical ownership, unsupported terms, mixed currency or broken finance lineage fail the batch visibly
- period returns to an operable state on integrity failure
- period closure requires all settlements to be out of mutable/disputed states
- closure records actor and timestamp

## 12. Approval Contract

Calculation and approval are separate duties.

Approval:
- requires `settlement.approve`
- rejects DISPUTED settlement
- rejects already approved settlement
- requires approver != calculator
- freezes financial result
- creates owner payable obligation
- posts settlement liability to Ledger
- fails approval if required ledger posting cannot succeed
- audits the approval

If liability posting fails, payable/approval state is compensated rather than pretending success.

## 13. Dispute Contract

Dispute:
- available to authorized tenant staff
- available to Vehicle Owner through resource-scoped self-service
- cannot target PAID or in-flight PAYMENT_PENDING settlement
- blocks payout
- cancels non-processing payable created by prior approval
- reverses/compensates approval liability where required
- records reason and actor

Resolution:
- records resolution notes
- may add governed adjustment
- recalculates
- returns to CALCULATED
- requires independent approval again

## 14. Payout Contract

Approval creates a payable. It does not send money.

Canonical flow:

`APPROVED Settlement -> Payable PENDING -> Payments.executeOwnerPayout -> Payable PROCESSING -> provider success -> outbound Payment -> Payable PAID -> Settlement PAID`

Rules:
- payout requires `settlement.pay`
- settlement must be APPROVED / PAYMENT_PENDING
- settlement approver cannot execute the same payout
- production/staging cannot use Fake provider
- provider must be certified for outbound payout
- idempotency key required/defaulted from payable
- failure returns settlement to approved/retryable state
- provider transaction reference seals PAID outcome
- outbound Payment and ledger posting event are preserved
- direct OwnerSettlement payout route is disabled as a compatibility boundary; Payments is authoritative

## 15. Role / Permission Model

Default role bundles do not replace resource/business rules.

### Company Owner / Tenant Admin
Full configured settlement authority.

### Finance Manager
May:
- read settlements
- calculate
- approve
- adjust
- manage disputes
- manage periods/batches
- export statements
- execute payout

But domain four-eyes rules still enforce:
- calculator != approver
- approver != payout executor

### Accountant
Preparation role:
- read
- calculate
- prepare/review financial basis

No approval or payout by default.

### Vehicle Owner
Self-service only:
- `settlement.self.read`
- `settlement.self.dispute`

Vehicle Owner does not receive tenant-wide `settlement.read`.

Own records are resolved through linked owner identity/resource policy.

## 16. Owner Statement

The statement exposes:
- settlement number
- period
- owner identity
- historical commercial terms
- all represented terms versions
- eligible revenue
- excluded revenue
- owner/operator split
- deductions
- adjustments
- net payout
- Rental breakdown
- expense breakdown
- per-vehicle contribution
- approval/payment status
- provider payout reference after payment

Statement values are server-derived and reconstructable.

## 17. Vehicle Profitability

Profitability uses settlement-derived revenue/share facts plus Finance expenses.

It displays:
- gross rental revenue
- owner payout
- maintenance expense
- other expense
- operator net profit
- margin
- rental days
- utilization

It does not silently mix currencies.

## 18. Self-Service Security

Vehicle Owner persona is not tenant-wide authority.

Self-service:
- resolves the linked owner record within tenant context
- lists only that owner’s settlements
- returns only statements belonging to that owner
- permits dispute only on that owner’s settlement

Cross-owner access fails closed.

## 19. Failure UX

The UI must not represent success when a domain/provider action failed.

Examples:
- missing settled Finance source -> calculation blocked
- missing historical agreement -> calculation blocked
- calculator tries to approve -> separation-of-duties error
- approver tries to pay -> separation-of-duties error
- ledger approval posting fails -> settlement remains/reverts CALCULATED
- provider payout fails -> payable FAILED and settlement retryable APPROVED
- disputed settlement -> payout hidden/blocked
- batch integrity error -> batch operation fails visibly rather than skipping corrupt data

## 20. Responsive UX

Desktop:
- settlement KPI command bar
- settlement list
- right-side dossier
- period/batch workspace
- payout queue
- profitability report

Mobile/tablet:
- stacked KPI cards
- full-width dossier
- source lines remain readable
- actions remain touch-safe
- no browser prompts
- payout destination and state remain visible before execution

## 21. Acceptance Criteria

Owner Settlements is accepted when:
- calculation uses settled Tenant Finance facts
- calculation uses historical ownership terms per event date
- current terms never substitute missing historical terms
- full terms snapshot history is persisted
- mixed-currency settlement/report aggregation fails safely
- only approved eligible expenses enter deductions
- calculator cannot approve own settlement
- dispute blocks payout and requires re-approval
- approver cannot execute same payout
- actual payout runs through Payments/provider boundary
- provider success seals Payment, payable and settlement
- provider failure does not fabricate PAID state
- period/batch generation is idempotent
- batch integrity errors fail closed
- owner self-service is resource-scoped
- posted/paid settlement history is immutable
- UI uses real backend contracts and contains no prompt-based payout flow
