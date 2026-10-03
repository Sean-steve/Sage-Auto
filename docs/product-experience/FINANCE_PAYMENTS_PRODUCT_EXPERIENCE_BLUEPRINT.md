# Sage Auto — Finance & Payments Product Experience Blueprint

Status: Implemented on `blueprint/finance-payments`

## 1. Purpose

Finance & Payments is the authoritative tenant-money workspace for customer invoicing, verified collections, payment allocation, deposits, refunds, expenses, receivables, reconciliation and ledger visibility.

It begins where operational domains produce billable or refundable facts. Rental/Return, Booking, Maintenance and Owner Settlement may publish financial source facts, but they do not directly rewrite Finance or provider truth.

## 2. Governing Architecture

The Car Hire OS financial constitution applies:

- tenant Finance and SaaS Platform Billing are separate bounded contexts
- completed payments, issued/paid invoices, posted journals and completed refunds are append-oriented
- corrections use credit, refund, reversal, void or adjustment workflows
- PaymentAttempt is historical and separate from Payment
- provider callbacks are inputs, not payment truth
- provider effects are authenticated, persisted, deduplicated and verified
- business money uses explicit currency and governed decimal precision
- verified money is allocated to an obligation; it is never inferred from UI success
- reconciliation exceptions are visible operational work
- high-risk financial actions are permission-gated, audited and separation-of-duties aware

## 3. Experience Boundary

### Finance owns
- operational invoices and invoice lines
- invoice issue/void lifecycle
- credit notes
- receivables
- security deposit positions
- refund obligations
- operational expenses
- finance summary/read models

### Payments owns
- payment attempts
- M-Pesa / card / provider initiation
- provider verification
- verified Payment records
- payment allocation
- provider refund execution
- outbound payment execution
- reconciliation issues

### Ledger owns
- chart of accounts
- balanced journals
- immutable posted entries
- reversals
- trial balance

### Upstream domains own source facts
- Booking: reservation/pricing obligation facts
- Rental/Return: final rental calculation and deposit settlement requirement
- Maintenance: completed service cost facts
- Owner Settlement: approved payout obligations

Finance consumes those facts without mutating their historical source records.

## 4. Finance Command Center

The workspace exposes:
- gross invoiced
- collected
- outstanding receivables
- overdue receivables
- deposits held
- refunds due
- unallocated verified money
- unresolved reconciliation exceptions

Primary tabs:
- Invoices & receivables
- Payments
- Deposits & refunds
- Expenses
- Reconciliation
- Ledger

Every tab is permission-sensitive; read access does not imply mutation authority.

## 5. Invoice Contract

An invoice is authoritative only after creation in Finance.

Supported flows:
- create manual draft
- generate from completed Rental/Return facts
- issue
- record payment allocation
- credit/adjust
- void according to lifecycle policy
- inspect immutable history

Rental invoice generation must consume the completed Return calculation and historical pricing/tax facts rather than re-price the Rental in the browser.

Issued/paid invoices cannot be silently edited.

## 6. Payment Attempt Contract

A collection attempt is not a Payment.

Flow:
`Obligation -> PaymentAttempt -> provider interaction -> provider verification -> Payment -> allocation`

Attempt states remain historical after failure/success.

Supported providers include configured M-Pesa/card adapters. Provider-specific details terminate at integration boundaries.

The UI must never show an invoice as paid merely because an STK push or card redirect was initiated.

## 7. Manual Payment Contract

Manual/offline payment recording represents money already received outside the integrated provider channel.

Requirements:
- explicit amount/currency
- unique external/receipt reference
- authenticated actor
- audit record
- canonical Payment created as verified manual record
- allocation attempted against the declared obligation
- allocation failure must not erase the genuine Payment fact
- unallocated remainder becomes reconciliation work

Permission: `payment.record`.

## 8. Payment Allocation Contract

A verified Payment may be allocated to supported obligations such as:
- customer invoice
- rental deposit

Allocation validates:
- tenant ownership
- currency equality
- available unallocated balance
- target outstanding/required balance
- duplicate/idempotency protections
- resulting invoice/deposit state

Allocation produces posting contracts/events for the Ledger.

Permission: `payment.allocate`.

## 9. Security Deposit Contract

DepositPosition is a liability record separate from ordinary rental revenue.

Lifecycle may include:
`REQUIRED -> HELD -> APPLIED / REFUND_DUE / PARTIALLY_REFUNDED / REFUNDED / FORFEITED`

Rules:
- read uses `deposit.read`
- creation/recording uses `deposit.record`
- application to an invoice uses `deposit.apply`
- held deposit cannot be treated as earned revenue merely because cash was received
- application/refund consequences remain reconstructable
- deposit settlement from Return feeds Finance; Return does not directly execute provider money movement

## 10. Refund Contract

There are two distinct concepts:

1. **Refund obligation** — Finance liability/approval fact.
2. **Provider refund** — actual outbound money movement owned by Payments.

Provider refund flow:
`Payment -> Refund request -> independent approval -> provider execution -> Payment refund balance update -> ledger posting event`

Rules:
- refund references original Payment
- cumulative refund cannot exceed refundable balance
- requester is persisted
- requester cannot approve/execute the same refund
- liability approval requires `refund.approve`
- provider disbursement requires `refund.execute`
- provider execution is idempotent
- completed refund is immutable except through explicit corrective workflow
- audit and ledger/outbox facts are mandatory

This is a four-eyes control.

## 11. Expense Contract

Expense flow:
`DRAFT -> SUBMITTED -> APPROVED / REJECTED -> posted/void lifecycle`

Rules:
- creator may prepare
- submission is separate
- approval requires `expense.approve`
- four-eyes controls prevent self-approval where configured
- maintenance costs may be ingested as source facts rather than re-keyed
- approved/posted expense history is not silently rewritten

## 12. Reconciliation Contract

Finance must make mismatches visible rather than hiding them.

Examples:
- verified but unallocated Payment
- stale pending PaymentAttempt
- provider/internal status mismatch
- allocation exception
- duplicate/ambiguous external reference

Permissions:
- `payment.reconciliation.read`
- `payment.reconciliation.run`
- `payment.reconciliation.resolve`

Resolving an issue records that the exception was reviewed; it does not fabricate or mutate provider truth.

## 13. Ledger Contract

Ledger is the accounting evidence layer.

Invariants:
- debits equal credits before posting
- posted journals are immutable
- corrections use reversals/adjusting journals
- source reference is retained
- finance/payment events feed posting contracts
- UI ledger balances are server-derived
- no browser-authored journal truth

Read permissions are separate from journal creation/posting/approval.

## 14. Role / Permission Allocation

Default roles remain seed bundles; effective authority comes from membership permissions plus resource/business policies.

### Company Owner / Tenant Admin
Configured full tenant Finance authority.

### General Operations Manager
May:
- read Finance
- record/initiate ordinary customer collections where configured
- read deposits/receivables
- create operational invoice/expense drafts

Does not receive sensitive refund approval, ledger approval or reconciliation resolution merely from being Operations Manager.

### Booking Manager / Booking Agent
May:
- see customer invoice/payment information required for desk operations
- initiate collection
- record approved/manual collection where configured
- read/record deposit receipt facts

They do not approve refunds, void financial history or post privileged ledger journals by default.

### Finance Manager
Primary finance authority:
- invoice lifecycle
- payment verification/allocation
- deposits
- refund request, liability approval and provider execution capability
- expenses and approvals
- reconciliation
- ledger controls
- reporting/audit

Domain four-eyes rules still apply even when the role contains both request and approval permissions.

### Accountant
Preparation/reconciliation role:
- invoices
- payment recording/initiation/allocation
- deposit handling
- refund requests
- expense creation/submission
- reconciliation read/run
- ledger read/manual draft
- reports

No refund approval or expense approval by default.

### Customer Service
Read/support visibility only for invoice/payment information needed to assist customers.

## 15. Return -> Finance Handoff

Return & Final Calculation stops at authoritative operational calculation.

When a Rental reaches final-calculation/settlement-required state:
- Return displays the calculation
- operator selects **Continue in Finance & Payments**
- Finance creates/issues the invoice or recognizes deposit/refund obligations
- Payments executes actual inbound/outbound money movement
- sealed financial outcome allows Rental final closure according to Rental permissions/business rules

This keeps operational evidence and money movement separated.

## 16. Failure UX

The UI never represents financial success before backend/provider confirmation.

Examples:
- STK initiated -> pending, not paid
- callback received but not verified -> pending verification
- verified Payment but allocation failed -> Payment exists, unallocated exception shown
- refund provider failure -> refund not completed
- invoice issue failure -> remains draft
- reconciliation failure -> exception remains open
- network failure -> cached data may be shown, mutation is not represented as successful

## 17. Responsive UX

Desktop:
- finance KPI command bar
- tabbed operational workspaces
- dense but scannable financial rows
- contextual action dialogs
- reconciliation attention states

Mobile/tablet:
- KPIs wrap
- financial records stack
- primary amounts/status remain visible
- action forms are touch-safe
- no critical action depends on hover
- permission-restricted controls are absent/disabled

## 18. Acceptance Criteria

Finance & Payments is accepted when:
- Finance UI reads authoritative backend data instead of prototype store totals
- completed Rental/Return facts generate invoices without client re-pricing
- provider initiation never equals payment success
- PaymentAttempt and Payment remain separate
- verified payments allocate through server rules
- unallocated money remains visible
- deposits are treated as liabilities
- deposit read permission differs from deposit record permission
- refund request and approval/execution are separate, with requester != approver
- cumulative refund caps are enforced
- expenses support submit/approve separation
- reconciliation exceptions are visible and auditable
- posted financial history remains immutable
- tenant operational Finance remains separate from SaaS billing
- role permissions match the canonical responsibility model
- API guards remain authoritative
- all existing Finance/Payment provider and ledger capabilities are preserved
