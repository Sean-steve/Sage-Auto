# Sage Auto — Rental & Return Authorization Matrix

Status: Canonical authorization reconciliation
Applies to:
- Rental Product Experience
- Return & Final Calculation Product Experience

## 1. Governing Rule

Persona is not authority.

Default roles are convenience bundles only. Effective authority is derived from:

`Authentication -> active Tenant Membership -> RBAC permission -> resource policy -> entitlement -> business rule`

Frontend visibility mirrors this decision but never replaces API enforcement.

No operational role receives sensitive finance authority merely because it can operate a Rental or Return.

## 2. Granular Rental / Return Permissions

| Permission | Purpose | Risk |
| --- | --- | --- |
| `rental.read` | Tenant operational Rental visibility | LOW |
| `rental.start` | Dispatch/start Rental after readiness gates | HIGH |
| `rental.extend` | Request/approve/reject Rental extensions | MEDIUM |
| `rental.incident_report` | Report active Rental incidents | MEDIUM |
| `rental.return_schedule` | Move active/overdue Rental into Return workflow | MEDIUM |
| `rental.return_receive` | Physically receive Vehicle and capture return facts | MEDIUM |
| `rental.return_inspection_link` | Link sealed RETURN inspection and advance to damage assessment | HIGH |
| `rental.final_calculate` | Generate authoritative final Rental charges | HIGH |
| `rental.final_settle` | Seal deposit refund/additional balance/zero-balance result | CRITICAL |
| `rental.final_complete` | Close Rental/Booking/Contract and apply vehicle disposition | HIGH |

`rental.complete` remains only as a legacy compatibility permission. It must not authorize the staged Return workflow.

## 3. Default Role Matrix

Legend:
- **A** = action authority
- **R** = read/support visibility
- **Scoped** = only through linked-record/resource policy
- **—** = not granted by default

| Role | Rental read | Start | Extend | Incident | Schedule return | Receive | Inspection advance | Final calculate | Final settle | Final complete |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Company Owner | A | A | A | A | A | A | A | A | A | A |
| Tenant Admin | A | A | A | A | A | A | A | A | A | A |
| General Operations Manager | R | A | A | A | A | A | A | A | — | A |
| Fleet Manager | R | — | — | — | — | A | A | — | — | — |
| Booking Manager | R | A | A | — | A | A | — | — | — | — |
| Booking Agent | R | — | — | — | — | A | — | — | — | — |
| Finance Manager | R | — | — | — | — | — | — | A | A | — |
| Accountant | R | — | — | — | — | — | — | A | — | — |
| Driver Manager | R | — | — | — | — | — | — | — | — | — |
| Driver / Chauffeur | Scoped | — | — | Scoped | — | — | signature only | — | — | — |
| Customer Service | R | — | — | — | — | — | — | — | — | — |
| Vehicle Owner | — | — | — | — | — | — | — | — | — | — |

Custom Tenant roles may combine granular permissions without changing this canonical default-role model.

## 4. Separation of Duties

### Booking / Front Desk
Booking Manager and Booking Agent may handle customer-facing return intake where granted.

They do not receive:
- damage assessment authority
- final settlement authority
- ledger/refund approval authority
- final lifecycle closure authority

### Fleet
Fleet Manager owns physical asset evidence:
- vehicle receipt where operationally needed
- return inspection
- damage observation/assessment
- maintenance/compliance follow-up

Fleet authority does not imply:
- refund approval
- customer balance settlement
- financial sealing

### General Operations
General Operations Manager coordinates the cross-functional workflow:
- Rental dispatch
- extensions
- incident operations
- return scheduling
- vehicle receipt
- return evidence progression
- final charge calculation
- final operational closure after finance has sealed settlement

General Operations Manager does **not** receive `rental.final_settle` by default.

### Finance
Finance Manager owns the sensitive financial checkpoint:
- review authoritative final calculation
- reconcile deposit
- approve/record refund or additional balance according to finance permissions
- seal final settlement

Staff Accountant may prepare/reconcile the calculation but cannot seal final settlement by default.

### Driver
Driver is a self-service actor, not a tenant-wide operational role.

Assigned-trip visibility is delivered through the linked Driver-record self-service portal. The Driver default role does not receive tenant-wide `rental.read`.

Driver permissions remain limited to assigned-trip actions such as:
- required inspection acknowledgement/signature
- incident reporting

## 5. Return Workflow Authority

`ACTIVE_ON_ROAD / OVERDUE`
→ **Schedule Return** — `rental.return_schedule`

`RETURN_SCHEDULED`
→ **Receive Vehicle** — `rental.return_receive`

`VEHICLE_RECEIVED`
→ **Create/sign canonical RETURN inspection** — Inspection permissions
→ **Advance Rental from sealed inspection** — `rental.return_inspection_link`

`DAMAGE_ASSESSMENT`
→ **Final calculation** — `rental.final_calculate`

`FINAL_CALCULATION`
→ **Financial settlement sealing** — `rental.final_settle`

`DEPOSIT_PROCESSING`
→ **Final operational closure** — `rental.final_complete`

No single broad permission authorizes all of these stages.

## 6. Sensitive Financial Rule

A user who can receive, inspect, calculate or close a Rental must not thereby gain refund/settlement authority.

`rental.final_settle` is a CRITICAL permission and is separate from:
- `rental.final_calculate`
- `rental.final_complete`
- `payment.record`
- `refund.create`
- `refund.approve`
- `deposit.apply`

Finance & Payments may layer additional transaction-specific approval rules over this workflow.

## 7. Frontend Rule

UI sections may be visible for read/support use while mutation controls are hidden or disabled by the granular permission.

Examples:
- Finance can open Return dossiers without receiving vehicles.
- Fleet can inspect returns without settling balances.
- Booking staff can receive vehicles without editing final financial outcomes.
- Customer Service can assist from read-only Rental/Return dossiers.

API guards remain authoritative even when a UI control is hidden.

## 8. Self-Service Resource Policy

Self-service identities never inherit tenant-wide visibility merely from a persona label.

Driver:
- uses linked Driver record
- sees assigned trips through `myTrips`
- sees assigned inspections through `myInspections`
- does not receive tenant-wide `rental.read` by default

Vehicle Owner and renter/customer self-service remain similarly resource-constrained in their own portals.

## 9. Acceptance Criteria

Authorization reconciliation is accepted when:
- staged Rental/Return endpoints use granular permissions
- `rental.complete` no longer gates the entire Return lifecycle
- Manager cannot seal settlement by default
- Finance Manager cannot perform physical return intake by default
- Accountant cannot seal final settlement by default
- Fleet Manager can access Return workspace for authorized physical return work
- Booking Agent can receive but cannot calculate/settle/complete
- Driver lacks tenant-wide Rental read permission
- UI action visibility matches permissions
- backend guards remain authoritative
- Company Owner/Tenant Admin retain full configured authority
- custom roles can compose the same granular permissions
