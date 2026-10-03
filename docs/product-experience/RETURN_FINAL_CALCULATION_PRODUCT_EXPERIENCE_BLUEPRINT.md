# Sage Auto — Return & Final Calculation Product Experience Blueprint

Status: Implemented on `blueprint/return-final-calculation`
Depends on: Rental Product Experience (`blueprint/rental-experience`)

## 1. Purpose

Return & Final Calculation is the authoritative check-in and rental-closure experience. It receives a Rental only after Rental Operations has scheduled its return and carries that Rental through physical vehicle receipt, sealed return evidence, damage assessment, final commercial reconciliation, deposit/balance settlement, and final vehicle disposition.

This experience must never treat a vehicle as returned, financially settled, or available for a new booking merely because a browser action was clicked. Every lifecycle advancement is server-authoritative and persisted.

## 2. Experience Boundary

### Rental Operations owns
- active on-road monitoring
- extensions
- incidents
- overdue handling
- return scheduling

### Return & Final Calculation owns
- physical vehicle receipt
- actual return time and location
- return odometer and fuel capture
- canonical RETURN inspection
- return acknowledgements/signatures
- new/worsened damage evidence
- departure-versus-return inspection comparison
- final charge calculation
- deposit reconciliation
- refund/additional-balance settlement acknowledgement
- final Rental completion
- Booking/Contract closure
- vehicle disposition and allocation release

### Finance & Payments remains the downstream financial system
Return & Final Calculation seals the operational settlement result and transaction/reference evidence. Provider orchestration, invoicing, payment accounting and general-ledger treatment remain within the Finance & Payments experience.

## 3. Canonical Lifecycle

The supported closure sequence is:

`RETURN_SCHEDULED -> VEHICLE_RECEIVED -> RETURN INSPECTION -> DAMAGE_ASSESSMENT -> FINAL_CALCULATION -> DEPOSIT_PROCESSING -> COMPLETED`

The state machine intentionally rejects lifecycle shortcuts.

Examples that are invalid:
- `ACTIVE_ON_ROAD -> VEHICLE_RECEIVED`
- `ACTIVE_ON_ROAD -> FINAL_CALCULATION`
- `DAMAGE_ASSESSMENT -> COMPLETED`
- `FINAL_CALCULATION -> COMPLETED`

A Rental can only complete after the final calculation has been sealed and the deposit/balance outcome has reached a terminal settlement status.

## 4. Return Operations Home

The workspace provides an operational queue with:
- awaiting vehicle receipt
- return inspection pending
- damage review pending
- final calculation pending
- settlement sealed / completion pending
- completed returns
- global search by Rental, registration, vehicle and customer
- lifecycle filters
- server-backed refresh

Each row displays:
- Rental number
- current return state
- Vehicle
- Customer
- contractual/scheduled return
- actual receipt
- checkout odometer baseline
- return odometer

## 5. Return Dossier

Opening a Return dossier exposes:
- Rental identity and lifecycle state
- Vehicle and customer context
- scheduled return
- actual return
- checkout and return odometer
- checkout and return fuel
- canonical return Inspection ID
- mileage charge
- fuel/late charge
- damage charge
- ReturnRecord state
- final calculation
- deposit position
- settlement state
- vehicle disposition

The dossier advances one authoritative action at a time.

## 6. Vehicle Receipt Contract

Endpoint:

`POST /api/v1/rentals/:id/receive`

Required inputs:
- return odometer
- return fuel level

Optional evidence/context:
- receivedAt
- returnLocationId
- conditionNotes
- idempotencyKey

Server invariants:
- Rental exists in tenant
- Rental is not terminal
- current state allows `VEHICLE_RECEIVED`
- return odometer cannot be lower than checkout odometer
- fuel must be 0–100
- actual return time is persisted
- ReturnRecord is merged, not replaced
- scheduled return facts remain preserved
- audit entry is recorded
- `rental.vehicle_received` event is emitted

The vehicle is not released to Fleet at receipt time.

## 7. Return Inspection Contract

The Return experience uses the canonical Inspection bounded context.

Flow:
1. Create Inspection with `inspectionType: RETURN`.
2. Link Vehicle, Rental, Booking, Customer and Driver.
3. Use receipt odometer/fuel as the return evidence baseline.
4. Record observed damage through canonical DamageObservation records.
5. Capture Inspector acknowledgement/signature.
6. Optionally capture Customer/Primary Driver acknowledgement.
7. Seal the Inspection as `COMPLETED`.
8. Link the sealed Inspection to the Rental.

Rental link endpoint:

`POST /api/v1/rentals/:id/return-inspection`

The Rental service verifies:
- Inspection exists in same tenant
- Inspection type is RETURN
- Inspection is COMPLETED
- at least one acknowledgement/signature exists
- Inspection Vehicle matches Rental Vehicle
- Inspection Rental linkage cannot point to another Rental
- odometer does not regress
- fuel is valid

Only then can the Rental advance to `DAMAGE_ASSESSMENT`.

## 8. Damage Assessment

New return damage is stored through the canonical Inspection/Damage context rather than a browser-only list.

Damage capture includes:
- body zone
- damage type
- severity
- description
- estimated repair cost
- attribution
- pre-existing flag
- evidence references where available

New Rental-period observations can create Damage Cases automatically.

Where the immutable Rental start snapshot includes a pre-rental inspection, the experience requests a canonical comparison:

`POST /api/v1/inspections/compare`

The dossier can show:
- new damage
- worsened damage
- unchanged observations
- resolved observations
- odometer delta
- fuel delta

The final calculation reads authoritative Damage Cases for the Rental.

## 9. Final Calculation Contract

Endpoint:

`POST /api/v1/rentals/:id/calculate-final`

Calculation requires:
- a linked completed Return inspection
- Rental at `DAMAGE_ASSESSMENT` for first calculation
- non-terminal Rental

The engine calculates from persisted evidence:
- start odometer
- return odometer
- total distance
- allowed distance
- excess distance
- excess-km charge
- start fuel
- return fuel
- fuel deficit
- refueling service fee
- contractual scheduled return
- actual return
- grace period
- late-return charge
- approved extensions
- customer-attributable Damage Cases
- additional authorized fees
- taxes
- gross/net final totals
- deposit deductions
- deposit refund due
- additional payment due

The browser may provide policy inputs such as fuel price, tank capacity, refueling fee and late-hour rate, but it never calculates the authoritative settlement itself.

The server persists a `RentalFinalCalculation` and advances the Rental to `FINAL_CALCULATION`.

## 10. Deposit & Balance Reconciliation

Endpoint:

`POST /api/v1/rentals/:id/deposit-settlement`

Final settlement accepts only terminal outcomes:
- REFUNDED
- CHARGED
- SETTLED
- WAIVED

Rules:
- refund due > 0 requires REFUNDED unless explicitly WAIVED
- additional payment due > 0 requires CHARGED unless explicitly WAIVED
- submitted amount must match the authoritative calculation
- refund/charge requires a transaction reference
- zero balance can settle as SETTLED
- successful settlement seals the FinalCalculation
- sealed FinalCalculation becomes immutable
- Rental advances to `DEPOSIT_PROCESSING`
- settlement is audited and emits a domain event

Repeated calculation requests after sealing return the sealed calculation rather than rewriting financial history.

## 11. Completion & Vehicle Disposition

Endpoint:

`POST /api/v1/rentals/:id/complete`

Completion requires:
- final calculation exists
- final calculation is immutable
- settlement status is REFUNDED, CHARGED, SETTLED or WAIVED
- state transition from `DEPOSIT_PROCESSING` is valid

Completion atomically closes the operational lifecycle:
- Rental -> COMPLETED
- Booking -> COMPLETED
- Contract -> COMPLETED
- Vehicle odometer updated
- Vehicle fuel updated
- Booking allocation released
- ReturnRecord -> COMPLETED
- audit facts persisted
- Rental/Vehicle return events emitted

Vehicle disposition is explicit:
- AVAILABLE — return to bookable Fleet
- MAINTENANCE — workshop required
- INSPECTION — further inspection required
- GROUNDED — unavailable for allocation

No default assumption may silently release a damaged or unsafe Vehicle if the operator selects a restricted disposition.

## 12. Persistence Invariants

- ReturnRecord is cumulative across schedule, receipt, inspection, calculation, settlement and completion.
- Later stages must never erase earlier return facts.
- Rental start snapshot remains immutable.
- Return Inspection is sealed evidence.
- FinalCalculation remains editable only before settlement sealing.
- A sealed FinalCalculation cannot be replaced.
- Canonical Rental, Inspection, Damage and Vehicle identifiers are server-generated.
- Tenant isolation applies to every fetch and mutation.
- High-impact transitions are permission-gated.
- Audit/outbox records accompany material lifecycle actions.

## 13. Permission Model

Read:
- `rental.read`

Return lifecycle commands:
- `rental.complete`

Inspection:
- `inspection.create`
- `inspection.sign`
- `inspection.read`

Damage:
- `damage.record`
- `damage.assess` where assessment authority is required

The UI hides/disables commands that the current user cannot perform. API permission guards remain authoritative.

Finance, booking and support roles may receive read-only access to Return dossiers when they have `rental.read`, without inheriting completion authority.

## 14. Responsive UX

Desktop:
- operational KPI command bar
- lifecycle filters
- wide return queue
- right-side dossier drawer
- focused action dialogs

Tablet/mobile:
- KPI cards wrap
- Return rows stack
- dossier becomes full-width
- lifecycle indicators wrap without horizontal dependency
- action forms are touch-safe
- critical totals and settlement status remain visible without hover

No return operation uses browser `prompt()`.

## 15. Failure UX

The interface must never optimistically display an authoritative lifecycle success.

Examples:
- receipt validation failure -> remain RETURN_SCHEDULED
- inspection persistence failure -> do not advance Rental
- unsigned/unsealed inspection -> cannot advance to damage assessment
- final calculation failure -> remain in damage assessment
- settlement mismatch -> calculation remains unsealed
- completion failure -> Booking/Contract/Vehicle must not appear closed locally
- network error -> stale cached information may be displayed, but mutation success is never fabricated

## 16. Acceptance Criteria

Return & Final Calculation is accepted when:
- a Rental must be scheduled for return before receipt
- received odometer/fuel are validated server-side
- scheduled ReturnRecord facts survive later receipt/inspection updates
- return inspection is canonical, completed and acknowledged
- inspection cannot belong to another Vehicle/Rental
- damage observations persist through the Damage context
- departure-vs-return comparison is available when a baseline exists
- final calculation cannot run without sealed return evidence
- browser does not author authoritative totals
- deposit reconciliation uses authoritative calculated amounts
- refund/charge requires transaction evidence
- settlement seals FinalCalculation immutable
- recalculation cannot alter a sealed settlement
- completion cannot occur before settlement
- completion closes Rental, Booking and Contract
- vehicle disposition is explicit
- allocation release happens only at final completion
- completed ReturnRecord retains schedule, actual return and inspection facts
- tenant isolation and permission gates remain intact
- existing downstream Finance capabilities are preserved
