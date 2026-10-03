# Sage-Auto — Availability & Dispatch Experience Contracts

**Status:** Authoritative V1 Availability / Allocation experience contract  
**Parent:** \`docs/SAGE_AUTO_PRODUCT_EXPERIENCE_MASTER_BLUEPRINT.md\`  
**Principle:** Vehicle availability is a server-side interval/concurrency decision. A Vehicle showing AVAILABLE in Fleet is not, by itself, proof that a requested rental interval is available.

---

## AVAILABILITY-001 — Availability Workspace

### Purpose
Give operations users an authoritative place to answer:
1. Which vehicles can serve this requested interval?
2. What currently blocks a vehicle?
3. Which allocations and temporary holds exist?
4. Can an allocation be released or substituted safely?

### Primary surfaces
1. Dispatch Timeline
2. Candidate Search
3. Allocations
4. Temporary Holds
5. Vehicle Blocks
6. Vehicle Calendar / Conflict Check
7. Substitution

### Core permissions
- read/search/calendar: \`availability.read\`
- create allocation/hold/confirm/release hold: \`allocation.create\`
- release/substitute allocation: \`allocation.manage\`
- create Vehicle Block: \`vehicle_block.create\`
- release Vehicle Block: \`vehicle_block.manage\`

API guards remain authority.

---

## AVAILABILITY-002 — Interval Semantics

All Availability decisions use half-open intervals:

\`[startsAt, endsAt)\`

Therefore:
- an allocation ending exactly when another begins does not overlap;
- \`endsAt\` must be strictly later than \`startsAt\`;
- persisted timestamps are ISO8601 instants;
- browser local datetime controls are converted to ISO instants before submission.

The UI must not independently decide conflicts.

---

## AVAILABILITY-003 — Turnaround Buffer

Availability checks/search may include \`turnaroundMinutes\`.

The server expands the effective interval around the requested rental interval according to canonical Availability Engine rules.

The UI must render:
- requested interval;
- effective interval when returned;
- configured turnaround buffer.

A visually empty requested slot does not imply availability if its effective interval conflicts.

---

## AVAILABILITY-004 — Direct Availability Check

### Authority
\`POST /api/v1/availability/check\`

### Permission
\`availability.read\`

### Inputs
- pickupAt;
- returnAt;
- optional Vehicle;
- optional Vehicle Category;
- optional branch/location context;
- optional excluded allocation;
- turnaround minutes.

### Result
- available true/false;
- result code;
- explanation;
- requested interval;
- effective interval;
- conflicting allocation ID/type when available;
- alternative Vehicle IDs where applicable.

No local overlap algorithm is authoritative.

---

## AVAILABILITY-005 — Candidate Search

### Authority
\`POST /api/v1/availability/search\`

### Permission
\`availability.read\`

### Inputs
- pickupAt;
- returnAt;
- optional Vehicle Category;
- optional branch;
- optional required features;
- turnaround minutes;
- pagination.

### Server eligibility
Candidates must survive:
- Fleet lifecycle/operability rules;
- overlapping blocking allocations;
- unexpired HELD allocations;
- active/scheduled Vehicle Blocks;
- requested feature constraints.

### Result
Displays:
- registration;
- make/model/year;
- Category;
- operational/availability status;
- daily reference rate when returned;
- fuel/transmission/features.

A returned candidate is a point-in-time result, not a lock. A Hold/Allocation is required to reserve it.

---

## AVAILABILITY-006 — Allocation Registry

### Read
\`GET /api/v1/availability/allocations\`

### Create
\`POST /api/v1/availability/allocations\`

### Release
\`POST /api/v1/availability/allocations/:id/release\`

### Substitute
\`POST /api/v1/availability/allocations/:id/substitute\`

### Allocation types
BOOKING, RENTAL, MAINTENANCE, MANUAL_BLOCK, TEMPORARY_HOLD, EXCLUSIVE_RESERVATION, EXCLUSIVE_HOLD.

### Blocking statuses
HELD, CONFIRMED, ACTIVE.

### Nonblocking historical statuses
RELEASED, EXPIRED, CANCELLED.

### Required create fields
- Vehicle;
- allocation type;
- startsAt;
- endsAt.

Optional:
- source type/id;
- turnaround;
- reason;
- notes.

### Rule
Manual allocations are explicit operational commands; they do not create a Booking or Rental.

---

## AVAILABILITY-007 — Temporary Holds

### Read
\`GET /api/v1/availability/holds\`

### Create
\`POST /api/v1/availability/holds\`

### Confirm
\`POST /api/v1/availability/holds/confirm\`

### Release
\`POST /api/v1/availability/holds/:idOrToken/release\`

### Fields
- Vehicle;
- interval;
- TTL minutes;
- optional Customer;
- optional Booking draft reference;
- reason.

### Hold truth
A Hold has its own:
- ID;
- token;
- status;
- expiry;
- linked allocation.

Pending unexpired holds block the interval.

### Expiry
Stale holds are expired server-side and their HELD allocations cease blocking.

### Confirm
Confirmation converts the held allocation to a CONFIRMED BOOKING allocation with explicit source type/id.

The Availability UI must not fabricate a Booking ID. Until Booking reconstruction is complete, confirmation is an advanced operation requiring a real canonical source reference.

---

## AVAILABILITY-008 — Vehicle Blocks

### Read
\`GET /api/v1/availability/blocks\`

### Create
\`POST /api/v1/availability/blocks\`

### Release
\`POST /api/v1/availability/blocks/:id/release\`

### Block types
MAINTENANCE, ACCIDENT, IMPOUND, COMPLIANCE, OPERATIONAL, PRIVATE_USE, CLEANING, ADMINISTRATIVE.

### Status
ACTIVE, RELEASED, SCHEDULED.

### Required
- Vehicle;
- block type;
- interval;
- reason.

### Server behavior
Creation also creates the backing allocation used by the exclusion ledger.

Release must release both the block and its associated backing allocation where present.

---

## AVAILABILITY-009 — Vehicle Calendar

### Authority
\`GET /api/v1/availability/calendar/:vehicleId?start=...&end=...\`

### Permission
\`availability.read\`

### Entry types
- ALLOCATION
- HOLD
- BLOCK

Each entry contains:
- ID;
- subtype;
- status;
- startsAt;
- endsAt;
- blocking flag;
- source reference;
- summary.

### UX
Calendar/timeline color and placement are presentation only. \`isBlocking\` and server interval results are authoritative.

---

## AVAILABILITY-010 — Dispatch Timeline

The multi-Vehicle Dispatch Timeline is composed from server allocation/hold/block records for a selected window.

### Desktop
- Vehicle rows;
- selected date/window controls;
- compact event bands/cards;
- filters by status/type;
- event details/actions.

### Mobile
- Vehicle cards;
- chronological event list;
- no unusable horizontal Gantt dependency;
- all release/substitute/block actions remain reachable.

Empty timeline space is not labelled “available” unless a server check/search says so.

---

## AVAILABILITY-011 — Atomic Vehicle Substitution

### Authority
\`POST /availability/allocations/:id/substitute\`

### Permission
\`allocation.manage\`

### Required
- source allocation ID;
- replacement Vehicle ID.

### Server order
1. validate replacement Vehicle;
2. create replacement allocation for the exact same interval/source;
3. release original allocation;
4. return both records.

The UI must not implement substitution by editing \`vehicleId\` locally.

---

## AVAILABILITY-012 — Release Semantics

### Allocation release
Requires a reason in the operational UI.

### Hold release
Releases the Hold and its HELD allocation.

### Block release
Requires a reason in the operational UI and releases its backing allocation.

History is retained. Release is not deletion.

---

## AVAILABILITY-013 — Subscription Enforcement

Commercial write operations that create new allocations/holds are subject to canonical Subscription enforcement.

If the Tenant is SUSPENDED:
- reads remain available where authorized;
- blocked mutations show the server reason;
- the UI does not emulate subscription logic.

---

## AVAILABILITY-014 — Conflict & Concurrency UX

The UI must explicitly handle:
- interval conflict;
- Vehicle non-operational;
- block conflict;
- hold expired;
- hold no longer pending;
- missing allocation/hold/block;
- cross-Tenant denial;
- permission denial;
- subscription restriction;
- network failure.

A 409/conflict-style response is not shown as success.

Search results are refreshed after any Hold, Allocation, Block, release or substitution that can change availability.

---

## AVAILABILITY-015 — Related Data

Vehicle data comes from Fleet only when \`vehicle.read\` is permitted.

Customer selection for Holds is loaded only when \`customer.read\` is permitted.

Availability itself does not mutate Fleet Vehicle lifecycle state.

---

## AVAILABILITY-016 — Pricing Boundary

Availability may display a Vehicle's reference daily rate returned by candidate search.

It must not:
- calculate the rental quote;
- modify a PricingSnapshot;
- infer that a cheap/expensive Vehicle should be selected.

Pricing remains the Pricing Engine's responsibility.

---

## AVAILABILITY-017 — Booking Boundary

Availability precedes Booking.

The experience may:
- search candidates;
- create a temporary Hold;
- create an explicit operational allocation;
- display source references;
- navigate to Bookings.

Until Booking is reconstructed it must not:
- invent a Booking draft;
- silently confirm a Hold against a fake Booking ID;
- claim that a Hold is a Booking;
- persist browser-only handoff state as Booking truth.

---

## AVAILABILITY-018 — Persistence & Tenant Safety

- all Availability state is server-backed;
- no local allocation/hold/block arrays are business truth;
- no \`Math.random()\` hold tokens/IDs are generated by the browser;
- Tenant switch invalidates in-flight reads/search/check results;
- mutations refresh affected server state;
- IDs and source references remain server-issued;
- no reseed/reset/import behavior.

---

## AVAILABILITY-019 — Existing Capability Preservation

The reconstructed experience preserves the useful intent of the legacy Availability screen:
- Dispatch timeline;
- 7/14/30-day windows;
- Candidate Search;
- Category filtering;
- turnaround buffer;
- quick Hold from a candidate;
- temporary Holds registry;
- Hold release/confirmation;
- Vehicle Blocks;
- direct conflict check;
- explicit Allocation creation;
- Allocation release;
- Vehicle substitution;
- per-Vehicle calendar;
- status summaries.

All previous local-only conflict simulation, fabricated IDs/tokens and local mutation success are removed.

---

## AVAILABILITY-020 — Responsive & Accessible UX

- tab navigation is keyboard reachable;
- forms have labels;
- loading/error/empty states are explicit;
- tables have mobile card/list alternatives;
- event status is not conveyed by color alone;
- destructive release commands require a reason/confirmation affordance;
- focus remains usable in dialogs;
- critical actions do not require hover.

---

# Availability V1 acceptance gate

Availability is reconstructed only when:

1. direct check calls \`POST /availability/check\`;
2. candidate search calls \`POST /availability/search\`;
3. allocation list/create/release/substitute are server-backed;
4. Hold list/create/confirm/release are server-backed;
5. Block list/create/release are server-backed;
6. Vehicle calendar is server-backed;
7. Dispatch timeline is rendered only from server records;
8. no browser overlap algorithm is authoritative;
9. no browser-generated Hold token/Allocation ID remains reachable;
10. half-open interval/turnaround semantics are preserved;
11. write permissions are action-specific;
12. subscription write denial remains server-authoritative;
13. Tenant-switch stale responses are discarded;
14. Booking/Pricing boundaries remain truthful;
15. responsive desktop/mobile flows preserve critical operations;
16. targeted Availability experience regression passes;
17. canonical Availability concurrency tests remain green;
18. full Sage-Auto test matrix remains green.
