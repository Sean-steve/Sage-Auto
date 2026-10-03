# Sage-Auto — Booking Experience Contracts

**Status:** Authoritative V1 Booking / Reservation experience contract  
**Parent:** \`docs/SAGE_AUTO_PRODUCT_EXPERIENCE_MASTER_BLUEPRINT.md\`  
**Principle:** A Booking is a durable commercial reservation aggregate. Pricing, Availability, Payments and Handover remain separate bounded contexts; Booking orchestrates their verified outputs without duplicating their authority.

---

## BOOKING-001 — Booking Workspace

### Purpose
Give authorized operations/commercial users one place to:
1. create and manage Booking dossiers;
2. freeze commercial PricingSnapshots;
3. move the Booking through the canonical state machine;
4. confirm only against real Availability;
5. amend/substitute safely;
6. understand payment/deposit state;
7. assess readiness for Handover.

### Primary surfaces
- Booking register
- Create Booking
- Booking dossier
- Pricing snapshot/history
- Lifecycle actions
- Dates/Vehicle amendment
- Handover readiness
- status/assignment/substitution history

---

## BOOKING-002 — Canonical Booking State Machine

States:

DRAFT  
PENDING  
PENDING_CONFIRMATION  
QUOTED  
AWAITING_PAYMENT  
CONFIRMED  
ACTIVE  
COMPLETED  
CANCELLED  
REJECTED  
EXPIRED  
NO_SHOW

Canonical adjacency:

- DRAFT → PENDING | PENDING_CONFIRMATION | QUOTED | CANCELLED
- PENDING → QUOTED | REJECTED | CANCELLED | PENDING_CONFIRMATION
- PENDING_CONFIRMATION → CONFIRMED | AWAITING_PAYMENT | REJECTED | CANCELLED | EXPIRED
- QUOTED → AWAITING_PAYMENT | CONFIRMED | EXPIRED | CANCELLED | REJECTED
- AWAITING_PAYMENT → CONFIRMED | PENDING_CONFIRMATION | EXPIRED | CANCELLED | REJECTED
- CONFIRMED → ACTIVE | CANCELLED | NO_SHOW
- ACTIVE → COMPLETED | CANCELLED
- terminal: COMPLETED, CANCELLED, REJECTED, EXPIRED, NO_SHOW

The UI must never invent transitions outside the server state machine.

---

## BOOKING-003 — Permissions

- read/list/detail/readiness: \`booking.read\`
- create: \`booking.create\`
- draft update / quote / request payment / reject / expire / no-show / amend dates: \`booking.update\`
- confirm: \`booking.confirm\`
- cancel: \`booking.cancel\`
- substitute Vehicle: \`booking.substitute_vehicle\`

Related datasets are loaded only when separately permitted:
- Customers: \`customer.read\`
- Drivers: \`driver.read\`
- Vehicles/Categories: \`vehicle.read\`
- Agents: \`agent.read\`
- Pricing configuration: \`pricing.read\`

UI permission checks are affordances only; API guards remain authority.

---

## BOOKING-004 — Booking Register

### Authority
\`GET /api/v1/bookings\`

### Filters
- status
- Customer
- Corporate Account
- Vehicle
- Driver
- Agent
- source
- pickup/return date ranges
- search
- pagination
- sort field/order

### Required summary
- Booking number
- status
- source
- Customer
- assigned/requested Vehicle
- pickup/return
- gross total/currency
- amount paid
- payment status
- deposit status
- version/update time

No local store is Booking truth.

---

## BOOKING-005 — Booking Dossier

### Authority
\`GET /api/v1/bookings/:id\`

Dossier must expose where available:
- core Booking identity;
- Customer / Corporate / Driver / Agent references;
- requested and assigned Vehicle;
- interval and locations;
- source;
- current PricingSnapshot;
- pricing snapshot version;
- totals;
- payment/deposit states;
- notes/instructions;
- allocation ID / Hold token reference;
- active Rental ID;
- lifecycle timestamps;
- status history;
- Vehicle assignment history;
- pricing history;
- substitution history.

---

## BOOKING-006 — Create Booking

### Authority
\`POST /api/v1/bookings\`

### Required
- Customer
- pickupAt
- returnAt

### Supported context
- Corporate Account
- Primary Driver
- additional Drivers
- Agent
- requested Vehicle
- requested Vehicle Category
- assigned Vehicle
- pickup/return locations
- source
- explicit Rate Plan
- Promo
- requested fee codes
- Hold token
- special/customer/internal notes
- idempotency key
- autoQuote

### Rules
The server validates:
- Tenant ownership
- Customer eligibility
- Corporate Account eligibility
- Driver eligibility
- Vehicle operability
- interval correctness
- Pricing

The browser must not generate Booking numbers.

---

## BOOKING-007 — Idempotent Creation

Create Booking supports an \`idempotencyKey\`.

The reconstructed UI generates a per-submit idempotency key and retains it for retry of the same submission until the request definitively succeeds/fails.

Repeated retries must not create duplicate Bookings.

---

## BOOKING-008 — Draft Editing

### Authority
\`PATCH /api/v1/bookings/:id\`

Only DRAFT Booking aggregates are editable through the draft editor.

Supported changes include:
- Customer
- Corporate Account
- Driver
- Agent
- requested/assigned Vehicle
- dates
- locations
- Promo / requested fees
- notes/instructions

Changes that affect price cause server-side repricing and a new PricingSnapshot version.

Non-DRAFT records are not silently edited.

---

## BOOKING-009 — Stateless Quote Preview

### Authority
\`POST /api/v1/bookings/quote\`

Purpose:
- preview the Booking-compatible server price before persistence.

Inputs:
- dates
- Vehicle/Category
- Customer/Corporate/Agent
- explicit Rate Plan
- Promo
- selected fee codes
- currency

Output is a PricingResult/PricingSnapshot from the canonical Pricing Engine.

This preview is not yet a Booking.

---

## BOOKING-010 — Formal Booking Quote

### Authority
\`POST /api/v1/bookings/:id/quote\`

Valid state transition is server-authoritative.

Formal quote:
- recalculates through Pricing Engine;
- appends immutable BookingPricingSnapshot history;
- increments PricingSnapshot version;
- moves Booking to QUOTED;
- preserves audit/outbox trace.

The UI never edits a frozen snapshot.

---

## BOOKING-011 — Pricing Handoff Integrity

Booking → Pricing must preserve:
- explicit \`ratePlanId\`
- Vehicle / Category
- Customer
- Corporate Account
- Agent
- selected fee codes
- Promo
- currency
- interval

Pricing Engine must honor an explicitly selected active/effective Rate Plan and matching rate line.

No Booking UI calculation may replace the Pricing Engine.

---

## BOOKING-012 — Request Payment

### Authority
\`POST /api/v1/bookings/:id/request-payment\`

Moves a legal Booking state to AWAITING_PAYMENT.

This command does not fabricate a Payment.

Actual Payment initiation/verification remains the Payments bounded context.

---

## BOOKING-013 — Payment & Deposit Presentation

Booking may display:
- gross total
- amount paid
- UNPAID / PARTIALLY_PAID / FULLY_PAID
- deposit required
- NOT_REQUIRED / REQUESTED / HELD / RELEASE_PENDING / RELEASED / DEDUCTED

Booking does not infer a successful Payment from a browser callback.

M-Pesa/Card payment operations remain provider/payment APIs.

---

## BOOKING-014 — Confirmation

### Authority
\`POST /api/v1/bookings/:id/confirm\`

### Required server invariants
- legal state transition;
- assigned/requested Vehicle exists and is operable;
- frozen PricingSnapshot exists;
- subscription permits write;
- Vehicle interval can be authoritatively allocated.

### Availability interaction
If a Hold token exists:
- convert the real Hold into Booking allocation.

Otherwise:
- create an EXCLUSIVE_RESERVATION allocation.

The returned Allocation ID becomes Booking state.

Browser success is never allowed without server allocation success.

---

## BOOKING-015 — Cancellation

### Authority
\`POST /api/v1/bookings/:id/cancel\`

Requires:
- reason
- optional cancellation fee metadata
- expectedVersion where supported

Server:
- validates transition;
- releases Booking allocation;
- appends status history;
- retains Booking history.

Cancellation is not deletion.

---

## BOOKING-016 — Rejection / Expiry / No-show

### Reject
\`POST /bookings/:id/reject\`

### Expire
\`POST /bookings/:id/expire\`

### No-show
\`POST /bookings/:id/no-show\`

Each command:
- obeys state machine;
- uses expectedVersion where supported;
- records reason/history;
- releases allocation where domain logic requires.

No-show is only valid from CONFIRMED.

---

## BOOKING-017 — Date Amendment

### Authority
\`POST /bookings/:id/amend-dates\`

Inputs:
- pickupAt
- returnAt
- reason
- recalculatePricing
- expectedVersion

For CONFIRMED Bookings:
1. allocate the same Vehicle against the new interval;
2. only after successful replacement allocation, release old allocation;
3. optionally recalculate and version PricingSnapshot.

A local date edit is never sufficient.

---

## BOOKING-018 — Vehicle Substitution

### Authority
\`POST /bookings/:id/substitute-vehicle\`

Inputs:
- replacementVehicleId
- reason
- preservePricing flag where supported
- expectedVersion

For CONFIRMED/ACTIVE:
1. allocate replacement first;
2. release old allocation;
3. append Vehicle assignment;
4. append substitution history;
5. update Booking.

The UI must not directly mutate \`assignedVehicleId\`.

---

## BOOKING-019 — Handover Readiness

### Authority
\`GET /bookings/:id/handover-readiness\`

Readiness exposes:
- isReady
- blockers
- warnings
- Customer eligibility
- Driver eligibility
- Vehicle operability
- deposit secured
- allocation active

This is the Booking-to-Handover boundary.

The Booking UI may navigate to Handover/Contracts but must not start Rental directly.

---

## BOOKING-020 — Booking != Rental

Canonical lifecycle remains:

Booking → Contract → Handover → Rental

A CONFIRMED Booking is not an active Rental.

The reconstructed Booking experience removes any legacy browser command that directly creates a Rental from a Booking.

---

## BOOKING-021 — Search / Operational UX

The register must support:
- text search
- status filter
- source filter
- date filtering
- server refresh
- loading/error/empty states

A denied auxiliary dataset must not make Booking read unusable.

---

## BOOKING-022 — Responsive UX

### Desktop
- register/table or rich dossier cards
- split dossier summary/actions
- Pricing/status/history sections

### Mobile
- card register
- stacked dossier
- horizontally reachable status filters/tabs
- full-width action sheets/forms
- critical actions visible without hover.

---

## BOOKING-023 — Concurrency & Stale State

Lifecycle mutation DTOs carry \`expectedVersion\` when supported.

After every mutation:
- refetch Booking;
- refetch register;
- discard stale Tenant/request responses.

A version conflict must be shown, not overwritten.

---

## BOOKING-024 — Tenant Safety

- no Booking is read or mutated outside selected Tenant context;
- supporting Customer/Driver/Vehicle/Agent data is Tenant-scoped;
- Tenant switch clears open Booking dossier/forms/results;
- no local Booking import/reset/reseed occurs;
- IDs remain server-issued.

---

## BOOKING-025 — Existing Capability Preservation

Preserve useful legacy intent:
- status-filtered Booking register
- search
- create Quote/Booking
- Customer/Vehicle/date/location context
- frozen pricing summary
- amount-paid/deposit visibility
- Confirm
- Cancel
- Reject
- payment-request handoff
- Vehicle substitution
- date amendment
- Handover readiness
- status history
- pricing snapshot/history
- responsive dossier

Remove legacy local-store commands that:
- mutate Booking state locally;
- create Rental directly;
- treat M-Pesa modal/browser success as payment truth.

---

## BOOKING-026 — Error UX

Handle explicitly:
- Customer/Driver/Corporate ineligible
- Vehicle not operational
- Pricing configuration missing
- Rate Plan inactive/no matching rate
- Availability conflict
- Hold expired/conflicted
- invalid transition
- terminal Booking mutation
- version conflict
- subscription suspended
- permission denied
- network failure

Failed mutations must never show success.

---

## BOOKING-027 — Persistence

All reachable Booking mutations use REST APIs.

The reconstructed screen must not use:
- \`useApp().confirmBooking\`
- \`useApp().cancelBooking\`
- \`useApp().rejectBooking\`
- \`createRentalFromBooking\`
- browser-local Booking mutation helpers.

---

# Booking V1 acceptance gate

Booking is reconstructed only when:

1. Booking list/detail are server-backed;
2. Create Booking is server-backed and idempotent;
3. Draft update is server-backed;
4. stateless quote preview uses Booking/Pricing server authority;
5. formal quote freezes/version-controls PricingSnapshot;
6. explicit Rate Plan and requested fees survive Booking → Pricing;
7. request-payment is server-backed;
8. confirm allocates/converts Hold through Availability;
9. cancel/reject/expire/no-show use canonical state machine;
10. date amendment is server-backed and concurrency-safe;
11. Vehicle substitution is server-backed and allocation-safe;
12. Handover readiness is server-backed;
13. no direct browser Booking → Rental creation remains reachable;
14. no local Booking lifecycle mutation remains reachable;
15. permissions are action-specific;
16. stale Tenant/request results are discarded;
17. responsive register/dossier preserve critical actions;
18. targeted Booking experience regression passes;
19. canonical Booking/Availability/Pricing tests remain green;
20. public Booking regression remains green;
21. full Sage-Auto matrix remains green.
