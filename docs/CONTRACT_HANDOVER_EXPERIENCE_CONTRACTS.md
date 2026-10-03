# Sage-Auto — Contract & Handover Experience Contracts

**Status:** Authoritative V1 Contract & Physical Handover experience contract  
**Parent:** \`docs/SAGE_AUTO_PRODUCT_EXPERIENCE_MASTER_BLUEPRINT.md\`  
**Upstream:** Booking, Pricing, Availability, Customers/Drivers, Fleet  
**Downstream:** Rental  
**Principle:** Contract and Handover are explicit, auditable gates between a confirmed commercial reservation and physical dispatch. Neither the browser nor a later Rental command may bypass these gates.

---

## CONTRACT-HANDOVER-001 — Workspace Purpose

The Contract & Handover workspace owns the operational experience for:

1. generating the legal Contract from a CONFIRMED Booking;
2. preserving an immutable commercial/terms snapshot;
3. dispatching the Contract to the customer through configured channels;
4. capturing version-bound signatures;
5. versioning amendments instead of mutating signed evidence;
6. scheduling physical Handover;
7. executing the mandatory sequential Handover checkpoints;
8. proving the Booking is ready to cross into Rental.

Canonical progression:

**Booking → Contract → Handover → Rental**

The workspace does not start a Rental.

---

## CONTRACT-HANDOVER-002 — Bounded Context Separation

- Booking owns the commercial reservation.
- Pricing owns price calculation and PricingSnapshot.
- Availability owns the Vehicle allocation.
- Contract owns legal terms, Contract versioning and signatures.
- Inspection owns physical inspection records/evidence.
- Handover owns physical dispatch checkpoints.
- Rental owns on-road execution after Handover.

The Contract/Handover UI orchestrates verified records from these domains but does not recreate their authority locally.

---

## CONTRACT-HANDOVER-003 — Permissions

### Contract
- list/detail/send: \`contract.read\`
- generate/amend: \`contract.generate\`
- sign / Handover signature checkpoint: \`contract.sign\`

### Handover
- list/detail: \`rental.read\`
- schedule/arrival/document verification/key handover/completion: \`rental.start\`
- inspection checkpoint: \`inspection.create\`

### Supporting reads
- Booking: \`booking.read\`
- Vehicle: \`vehicle.read\`
- Customer: \`customer.read\`
- Driver: \`driver.read\`
- Inspection: \`inspection.read\`

Client permissions are affordances only. API guards remain authority.

---

## CONTRACT-HANDOVER-004 — Contract Register

### Authority
\`GET /api/v1/contracts\`

Supported server filters:
- status
- bookingId
- customerId
- vehicleId
- search
- limit
- offset

Each row/card must show:
- Contract number
- status
- Contract version
- linked Booking
- customer
- Vehicle
- generated/sent/signed timestamps
- current price/term summary
- current optimistic-concurrency version

No browser/local Contract store is authoritative.

---

## CONTRACT-HANDOVER-005 — Contract Dossier

### Authority
\`GET /api/v1/contracts/:id\`

Dossier exposes:
- Contract identity and number
- Booking / Rental references
- Customer / Corporate / Driver / Vehicle references
- status
- template version
- Contract version
- terms snapshot
- PricingSnapshot
- signatures
- Contract version history
- status history
- generated/sent/signed/activated/completed/archive timestamps
- optimistic-concurrency version

---

## CONTRACT-HANDOVER-006 — Contract Generation Eligibility

### Authority
\`POST /api/v1/contracts/generate\`

Generation is accepted only when:
- Booking exists in the same Tenant;
- Booking status is exactly CONFIRMED;
- Booking has a frozen PricingSnapshot;
- Booking pickup/return interval is valid;
- Booking has a confirmed assigned Vehicle;
- Customer and Vehicle records exist;
- no current non-ARCHIVED Contract already exists for the Booking.

If a current Contract exists, the operator must amend/version it rather than generate a parallel legal instrument.

---

## CONTRACT-HANDOVER-007 — Idempotent Contract Generation

Generation accepts \`idempotencyKey\`.

The UI keeps one idempotency key for one submission/retry attempt.

Network retry of the same command must not create duplicate Contracts.

---

## CONTRACT-HANDOVER-008 — Terms Snapshot Integrity

Contract generation snapshots Booking/Vehicle/Customer/Driver facts that must remain historically explainable.

Terms include:
- Contract template/version
- Vehicle identity
- customer identity
- primary Driver identity
- pickup/return interval and locations
- commercial totals
- deposit
- tax
- mileage allowance/excess-km rate where present
- special terms
- governing law as configured by the current implementation

The UI may display the snapshot but must not calculate or silently rewrite it.

---

## CONTRACT-HANDOVER-009 — PricingSnapshot Integrity

Contract Pricing is copied from the Booking's frozen canonical PricingSnapshot.

Do not:
- recalculate Contract pricing in the browser;
- replace the Booking snapshot with current Pricing configuration;
- treat a \`securityDeposit\` object as a scalar amount;
- hardcode mileage/late-fee values as substitutes for missing snapshot data.

A Contract is historical evidence of what was agreed at that version.

---

## CONTRACT-HANDOVER-010 — One Current Contract Per Booking

A Booking must not accumulate multiple simultaneously current non-archived Contracts.

Commercial/legal changes after Contract generation use Contract amendment/versioning.

Historical versions remain available.

---

## CONTRACT-HANDOVER-011 — Contract Dispatch

### Authority
\`POST /api/v1/contracts/:id/send\`

Supported methods:
- EMAIL
- SMS
- WHATSAPP
- IN_PERSON

Sending a GENERATED Contract may transition it to SENT.

The command records:
- status history where applicable;
- audit evidence;
- outbox event;
- recipient/method intent.

**Truth boundary:** recording the dispatch command/event is not proof that an external email/SMS/WhatsApp provider delivered the message. UI wording must say “dispatch recorded/requested” unless a downstream delivery record proves delivery.

---

## CONTRACT-HANDOVER-012 — Contract Signatures

### Authority
\`POST /api/v1/contracts/:id/sign\`

Supported signer types:
- CUSTOMER
- PRIMARY_DRIVER
- OPERATOR
- CORPORATE_REP
- GUARANTOR

Supported methods:
- ELECTRONIC_OTP
- DRAWN_CANVAS
- BIOMETRIC
- MANUAL_UPLOAD

Each signature is bound to:
- Contract ID
- current Contract version
- signer identity/name/type
- method
- signature reference
- signed time
- request metadata where available

The UI must never create a local signature record.

---

## CONTRACT-HANDOVER-013 — Signature Concurrency

Signature commands carry \`expectedVersion\`.

The server verifies the optimistic version before writing signature evidence.

A stale signature attempt must fail without leaving orphan signature evidence.

---

## CONTRACT-HANDOVER-014 — Contract Amendment & Versioning

### Authority
\`POST /api/v1/contracts/:id/amend\`

An amendment:
- requires a non-empty changeReason;
- requires expectedVersion where supplied by the UI;
- creates a new ContractVersionRecord;
- preserves old version history;
- updates the current terms snapshot;
- increments Contract version;
- returns the current Contract to GENERATED when prior status was SENT/SIGNED;
- clears current sent/signed timestamps;
- requires the new version to be dispatched/signed again.

ACTIVE, COMPLETED and ARCHIVED Contracts cannot be materially amended.

---

## CONTRACT-HANDOVER-015 — Current-Version Signature Rule

A signature on Contract version N does not authorize version N+1.

The Handover signature checkpoint requires:
- current Contract status SIGNED; and
- at least one signature whose \`contractVersion\` equals current \`contractVersion\`.

---

## CONTRACT-HANDOVER-016 — Contract State Machine

Canonical state model:

DRAFT → GENERATED → SENT → SIGNED → ACTIVE → COMPLETED → ARCHIVED

Permitted alternatives are defined by \`ContractStateMachine\`.

The UI never exposes a direct status selector.

ACTIVE is entered by Rental start, not by Contract UI.

COMPLETED is entered by Rental completion, not by Contract UI.

---

## CONTRACT-HANDOVER-017 — Handover Register

### Authority
\`GET /api/v1/handovers\`

Filters:
- status
- bookingId
- vehicleId
- customerId
- scheduledDate
- search
- limit
- offset

Each Handover shows:
- Handover number
- status
- Booking
- Contract
- Vehicle
- Customer / Driver
- scheduled time
- physical checkpoints
- odometer/fuel snapshot
- version

---

## CONTRACT-HANDOVER-018 — Schedule Handover

### Authority
\`POST /api/v1/handovers/schedule\`

Requirements:
- Booking is CONFIRMED;
- Booking has confirmed assigned Vehicle;
- current non-terminal Contract exists;
- Contract Vehicle matches Booking assigned Vehicle;
- no other active non-completed Handover exists for the Booking;
- Vehicle exists.

Scheduling is idempotent when an idempotencyKey is supplied.

---

## CONTRACT-HANDOVER-019 — Sequential Handover State Machine

Canonical sequence:

SCHEDULED  
→ CUSTOMER_ARRIVED  
→ DOCUMENT_VERIFIED  
→ PRE_RENTAL_INSPECTION  
→ SIGNATURE  
→ KEY_HANDOVER  
→ HANDOVER_COMPLETED

No checkpoint may be skipped through the UI or API.

---

## CONTRACT-HANDOVER-020 — Customer Arrival

### Authority
\`POST /api/v1/handovers/:id/arrive\`

Records:
- arrival timestamp
- notes
- expectedVersion

Only SCHEDULED may advance to CUSTOMER_ARRIVED.

---

## CONTRACT-HANDOVER-021 — Document Verification & Compliance

### Authority
\`POST /api/v1/handovers/:id/verify-documents\`

Both must be affirmatively verified:
- Driver licence
- identity document/passport

When Compliance readiness is configured, Vehicle and Driver readiness are authoritative blockers.

The UI must not render unchecked documents as verified.

---

## CONTRACT-HANDOVER-022 — Pre-Rental Inspection Boundary

The Handover workspace does not fabricate physical inspection evidence.

A Handover can advance from DOCUMENT_VERIFIED only by referencing a real PRE_RENTAL Inspection.

The full Inspection workflow remains its own blueprint/domain.

---

## CONTRACT-HANDOVER-023 — Inspection Checkpoint Validation

### Authority
\`POST /api/v1/handovers/:id/inspection\`

Server verifies the referenced Inspection:
- exists in same Tenant;
- status is COMPLETED;
- type is PRE_RENTAL;
- Vehicle equals Handover Vehicle;
- Booking equals Handover Booking when linked;
- Handover equals current Handover when linked;
- odometer/fuel values are valid.

Handover stores the Inspection's actual server readings. Browser-provided odometer/fuel are not authority.

---

## CONTRACT-HANDOVER-024 — Contract Signature Checkpoint

### Authority
\`POST /api/v1/handovers/:id/confirm-signature\`

Server verifies:
- Handover has a Contract;
- Contract belongs to same Booking;
- Contract Vehicle matches Handover;
- Contract status is SIGNED;
- current Contract version has a recorded signature.

A checkbox alone can never prove signature completion.

---

## CONTRACT-HANDOVER-025 — Key Handover

### Authority
\`POST /api/v1/handovers/:id/handover-keys\`

Requires:
- exact prior checkpoint SIGNATURE;
- checkout odometer is finite and not below verified Inspection reading;
- fuel is within 0–100;
- recipient name is present.

Records:
- odometer
- fuel
- recipient
- optional key tag
- timestamp
- notes/history

---

## CONTRACT-HANDOVER-026 — Complete Handover

### Authority
\`POST /api/v1/handovers/:id/complete\`

Only KEY_HANDOVER may advance to HANDOVER_COMPLETED.

Completion records final dispatch snapshot and emits audit/outbox evidence.

Completion does **not** itself create/start a Rental.

---

## CONTRACT-HANDOVER-027 — Rental Start Boundary

Rental start must independently require:
- Booking still CONFIRMED;
- current Contract exists and is SIGNED;
- selected Contract belongs to Booking;
- Handover belongs to Booking;
- Handover is linked to selected Contract;
- Handover status is HANDOVER_COMPLETED;
- Booking/Contract/Handover Vehicle IDs agree;
- Vehicle is operational;
- a real Booking Vehicle allocation exists in CONFIRMED or ACTIVE status;
- Compliance conditions where configured.

The Rental API remains authoritative even if the UI appears ready.

---

## CONTRACT-HANDOVER-028 — No Direct Browser Rental Start

Contract & Handover may navigate the user to Rentals when Handover is complete.

It must not:
- call \`startRental\`;
- create a local Rental;
- set Booking status ACTIVE;
- set Vehicle ON_RENT;
- mark Contract ACTIVE.

Those transitions belong to the Rental bounded context.

---

## CONTRACT-HANDOVER-029 — Optimistic Concurrency

Contract and Handover mutation commands carry \`expectedVersion\` where supported.

After every mutation:
- refetch the canonical record;
- refresh registers;
- show version conflicts;
- never overwrite a newer record silently.

Tenant switching invalidates outstanding responses.

---

## CONTRACT-HANDOVER-030 — Responsive Operational UX

### Desktop
- Contract/Handover tabs
- register with high-signal summaries
- dossier side panel
- lifecycle stepper
- action area
- terms/signature/version history

### Mobile
- horizontally reachable tabs/stepper
- stacked cards
- full-width action forms
- no hover-only controls
- key checkpoint status visible without horizontal data-table dependence

---

## CONTRACT-HANDOVER-031 — Persistence, Errors & Acceptance

All reachable mutations must use canonical REST APIs.

Explicit failures include:
- Booking not CONFIRMED
- missing PricingSnapshot
- missing assigned Vehicle
- duplicate current Contract
- stale Contract/Handover version
- immutable Contract
- no current Contract
- duplicate active Handover
- failed Compliance readiness
- incomplete/unverified documents
- missing/incomplete/wrong Inspection
- unsigned/stale-version Contract
- invalid odometer/fuel
- invalid Handover transition
- missing active Booking allocation
- Tenant/permission denial
- network failure

Failed mutations never report success.

### V1 acceptance gate

Contract & Handover is reconstructed only when:
1. Contract list/detail are server-backed;
2. Contract generation requires confirmed Booking and frozen PricingSnapshot;
3. generation is idempotent;
4. duplicate current Contract generation is blocked;
5. Contract terms/pricing snapshot integrity is preserved;
6. Contract dispatch is auditable and UI does not overclaim external delivery;
7. signatures are server records tied to current version;
8. stale signature cannot leave orphan evidence;
9. amendments are versioned and require re-signature;
10. Contract immutable states are protected;
11. Handover list/detail are server-backed;
12. scheduling requires confirmed Booking/current Contract/assigned Vehicle;
13. duplicate active Handover is blocked;
14. checkpoints are strictly sequential;
15. documents require explicit verification;
16. PRE_RENTAL Inspection is a real completed same-context Inspection;
17. signature checkpoint verifies actual current signed Contract;
18. key handover validates physical readings/recipient;
19. Handover completion is server-backed;
20. Rental readiness requires HANDOVER_COMPLETED;
21. Rental readiness checks real Booking allocation;
22. selected Booking/Contract/Handover/Vehicle relationships are consistent;
23. no direct browser Rental start remains reachable;
24. permissions are action-specific;
25. optimistic concurrency is enforced;
26. Tenant switching/stale responses are safe;
27. responsive UX preserves all critical actions;
28. targeted Contract & Handover regression passes;
29. Booking/Rental/Inspection/Availability canonical regressions remain green;
30. all 20-role access regression remains green;
31. full Sage-Auto matrix remains green.
