# Sage Auto — Rental Product Experience Blueprint

Status: Implemented on `blueprint/rental-experience`

## 1. Purpose

Rental is the authoritative on-road operations workspace. It begins only after Booking, Contract, Handover, Inspection, allocation and compliance gates have passed. It owns dispatch and the live rental period, then hands the vehicle into the Return & Final Calculation experience without bypassing return inspection, damage assessment, final calculation or deposit settlement.

The Rental experience must never manufacture canonical rental identifiers, states, pricing, mileage, fuel readings or lifecycle completion in the browser.

## 2. Experience Boundary

### Rental owns
- dispatch readiness and start
- immutable rental start snapshot visibility
- active on-road rental dossier
- scheduled end / overdue operational attention
- extension request, approval and rejection
- incident recording and incident history
- return scheduling / handoff

### Return & Final Calculation owns
- physical vehicle receipt
- return odometer and fuel capture
- return inspection
- damage assessment
- final calculation
- deposit settlement
- final completion
- release of vehicle back to Fleet

A Rental action must therefore never jump directly from `ACTIVE_ON_ROAD` to `COMPLETED`.

## 3. Rental Operations Home

The default workspace shows:
- Active on road
- Overdue
- Returns due within 24 hours
- Pending extension requests
- Open incidents
- search across rental number, registration plate, vehicle, customer and driver
- lifecycle filters
- server-backed refresh

Each rental row shows:
- authoritative rental number
- current lifecycle state
- assigned vehicle
- customer
- driver
- booking reference
- scheduled return
- immutable dispatch odometer/fuel baseline
- extension count / pending count
- incident count / open count
- operational attention state

## 4. Rental Dossier

Opening a Rental exposes one authoritative workspace containing:
- rental identity and state
- Booking reference
- Vehicle
- Customer
- Driver
- scheduled start/end
- actual start
- immutable checkout odometer
- immutable checkout fuel
- start snapshot
- Contract version
- deposit requirement
- captured pricing snapshot
- extensions
- incidents
- lifecycle position
- return handoff state

## 5. Dispatch Contract

Canonical dispatch sequence:

`Booking CONFIRMED -> Vehicle allocated -> Contract SIGNED/ACTIVE -> Handover HANDOVER_COMPLETED -> Documents verified -> Pre-rental inspection completed -> Vehicle/driver compliance ready -> Rental ACTIVE_ON_ROAD`

Server endpoint:

`POST /api/v1/rentals/start`

The browser submits the Booking reference and optional explicit contract/handover/start readings. When identifiers are omitted, the Rental service resolves the authoritative current Booking-linked Contract and Handover.

Server requirements:
- tenant ownership
- Booking exists and is confirmed
- no active Rental already exists for Booking
- assigned Vehicle exists
- current Contract exists and is signed/active
- Handover exists and is completed
- documents verified
- pre-rental inspection completed
- Vehicle operational
- allocation valid
- compliance readiness passes
- start odometer/fuel resolved server-side
- idempotent dispatch
- Rental number generated server-side
- Booking -> ACTIVE
- Contract -> ACTIVE
- Handover -> HANDOVER_COMPLETED
- Vehicle -> ON_RENT
- allocation -> ACTIVE
- start snapshot persisted
- audit and outbox facts emitted

## 6. Extension Contract

Extension is a controlled approval workflow, not an immediate client-side date mutation.

1. Operator/customer request:
   `POST /rentals/:id/extensions`
2. Server calculates:
   - additional days
   - authoritative daily rate
   - net additional cost
   - tax
   - gross additional total
3. Extension remains `REQUESTED`.
4. Authorized operator approves or rejects.
5. Approval re-checks availability/compliance.
6. Only successful approval updates Rental and Booking return dates.

Routes:
- `POST /rentals/:id/extensions`
- `GET /rentals/:id/extensions`
- `POST /rentals/:id/extensions/:extensionId/approve`
- `POST /rentals/:id/extensions/:extensionId/reject`

Permission: `rental.extend`.

## 7. Incident Contract

Rental incidents are persisted against the authoritative Rental aggregate.

Supported incident types:
- ACCIDENT
- MECHANICAL_BREAKDOWN
- TRAFFIC_FINE
- THEFT
- OTHER

Minimum capture:
- incident type
- description
- location
- report timestamp
- police/reference number when applicable
- estimated financial exposure
- resolution state

Routes:
- `POST /rentals/:id/incidents`
- `GET /rentals/:id/incidents`

Incident creation:
- rejects terminal Rentals
- persists into Rental aggregate
- records audit entry
- emits `rental.incident_recorded`

Permission: `rental.incident_report`.

## 8. Return Handoff Contract

From `ACTIVE_ON_ROAD` or `OVERDUE`, the Rental workspace exposes **Schedule Return**, not **Complete Rental**.

Route:
`POST /rentals/:id/return-schedule`

Successful scheduling:
- transitions Rental -> `RETURN_SCHEDULED`
- persists return record
- appends status history
- audits action
- emits return-scheduled domain event

No vehicle availability release happens here.

## 9. State Model

Supported Rental lifecycle:
- SCHEDULED_HANDOVER
- ACTIVE_ON_ROAD
- OVERDUE
- RETURN_SCHEDULED
- VEHICLE_RECEIVED
- RETURN_INSPECTION_PENDING
- INSPECTION
- DAMAGE_ASSESSMENT
- FINAL_CALCULATION
- FINAL_SETTLEMENT_PENDING
- DEPOSIT_PROCESSING
- COMPLETED
- RETURN_COMPLETED
- TERMINATED_EARLY

Terminal Rental states cannot accept extension or incident mutations.

## 10. Authority & Persistence Invariants

- Backend owns canonical IDs and rental numbers.
- Backend owns state transitions.
- Start snapshot is immutable.
- Pricing used for on-road operations comes from the persisted snapshot.
- Browser must not mutate Booking, Rental or Vehicle into success states before server success.
- Every mutation is tenant-scoped.
- Idempotency is required where duplicate network submission can create duplicate business effects.
- Audit/outbox facts accompany material lifecycle actions.
- A Rental cannot complete from the on-road workspace.

## 11. Permissions

- `rental.read` — list/dossier/readiness
- `rental.start` — dispatch
- `rental.extend` — extension request/decision
- `rental.incident_report` — incident reporting
- `rental.update` — operational return scheduling
- `rental.complete` — final completion in the downstream Return experience

## 12. Responsive UX

Desktop:
- KPI command bar
- filter bar
- wide operational rental cards
- right-side dossier drawer
- action dialogs

Tablet/mobile:
- KPI cards wrap
- rental rows collapse into stacked information
- dossier becomes full-width
- action dialogs remain touch-safe
- no horizontal dependency for critical data or actions

No operational action uses `window.prompt`.

## 13. Failure UX

The interface must surface backend failure without pretending success.

Examples:
- dispatch blocker -> show first actionable readiness blocker
- extension conflict -> keep original return date
- incident persistence failure -> do not add local incident
- return scheduling failure -> remain in current Rental state
- network failure -> cached Rental data may be displayed, but mutations are not represented as successful

## 14. Acceptance Criteria

Rental is accepted when:
- dispatch creates no client-generated Rental IDs/numbers
- dispatch is blocked until Handover is fully completed
- zero-value odometer/fuel readings are preserved through nullish resolution
- extension request does not immediately alter scheduled end
- approval/rejection use real extension endpoints
- incident reporting is backed by persistence, audit and event emission
- on-road UI never directly completes a Rental
- Schedule Return transitions to RETURN_SCHEDULED
- immutable start snapshot is visible in dossier
- permission gates are respected
- Rental workflow remains tenant-isolated
- existing Rental/Return backend capabilities remain intact
- regression tests cover extension, incident, return and completion invariants
