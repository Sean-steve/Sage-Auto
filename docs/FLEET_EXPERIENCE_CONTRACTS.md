# Sage-Auto — Fleet Experience Contracts

**Status:** Authoritative implementation contract for Fleet V1 completion  
**Parent:** `docs/SAGE_AUTO_PRODUCT_EXPERIENCE_MASTER_BLUEPRINT.md`  
**Rule:** Fleet is not complete because a vehicle table renders. It is complete only when the contracts below are server-backed, permission-safe, Tenant-safe, persistent and regression-tested.

---

## FLEET-001 — Fleet List

### User objective
Know which vehicles the selected company controls and whether each is operationally usable.

### Primary roles
COMPANY_OWNER, TENANT_ADMIN, MANAGER, FLEET_MANAGER. Read-only access may be available to other roles with `vehicle.read`.

### Server authority
`GET /api/v1/fleet/vehicles`

### Required filters
- search
- lifecycle status
- availability status
- category
- owner
- published-to-website state when useful

### Required row/card fields
- primary image
- registration plate
- make/model/year
- category
- lifecycle status
- availability status
- ownership indicator
- current location
- odometer
- fuel level
- daily-rate reference only as stored Fleet metadata
- website-publication state
- maintenance/compliance warning indicators where available

### Actions
- **Register Vehicle** → FLEET-002, permission `vehicle.create`
- **Open Asset Profile** → FLEET-003, permission `vehicle.read`
- filter/search are read-only client/server query actions

### States
Loading, empty, error, permission denied, Tenant switched, stale-request cancellation.

### Acceptance
- no mock vehicle becomes visible in restoration mode;
- no vehicle from another Tenant can be retrieved;
- filters never change canonical data;
- list refreshes after successful Fleet mutation;
- mobile converts dense rows into readable cards without dropping data/actions.

---

## FLEET-002 — Register Vehicle

### Server authority
`POST /api/v1/fleet/vehicles`

### Permission
`vehicle.create`

### Entitlement
Fleet vehicle quota remains server authoritative.

### Required input
- registrationPlate
- make
- model
- year
- category
- dailyRate

### Supported optional input preserved from existing UI/backend
- VIN/chassis
- color
- odometer
- fuel level
- transmission
- seats
- fuel type
- features
- image URL / primary image reference
- current location
- website publication
- allowed daily km
- excess km rate
- insurance expiry
- inspection expiry
- owner
- ownership type
- revenue share

### Server effects
- Vehicle created;
- initial lifecycle/availability state established by FleetService;
- optional ownership agreement created;
- status history genesis recorded;
- audit recorded;
- outbox event emitted.

### UX
Use one guided form with sections:
1. Identity
2. Commercial/operational details
3. Ownership
4. Compliance dates
5. Media/publishing

Do not ask the UI to set canonical lifecycle state during creation.

### Acceptance
- duplicate/invalid registration errors are shown truthfully;
- failed create never inserts optimistic fake row;
- success persists after reload/re-login;
- wrong role receives server denial;
- Tenant quota failure is shown as a server business restriction.

---

## FLEET-003 — Vehicle Asset Profile

### Server authority
`GET /api/v1/fleet/vehicles/:id/digital-twin`

### Purpose
One operational home for a vehicle.

### Header
- image
- make/model
- registration
- year/category
- lifecycle badge
- availability badge
- ownership summary
- current location
- public/private website state

### Tabs
1. Overview
2. Ownership
3. Availability & status
4. Compliance & documents
5. Maintenance
6. Inspections & damage/history
7. Media
8. Activity/history

### Overview
- VIN
- transmission
- seats
- fuel type
- odometer
- fuel
- allowed daily km
- excess km rate
- service mileage
- website publication
- Fleet-stored daily-rate reference
- only server-derived operational statistics

### Mutation actions
- edit vehicle → `PATCH /fleet/vehicles/:id`, `vehicle.update`
- lifecycle transition → `POST /fleet/vehicles/:id/lifecycle-status`, `vehicle.status_override`
- availability override → `POST /fleet/vehicles/:id/availability-status`, `vehicle.status_override`
- mileage → `POST /fleet/vehicles/:id/mileage`, `vehicle.update`
- fuel → `POST /fleet/vehicles/:id/fuel`, `vehicle.update`

All mutable aggregate commands carry `expectedVersion` when supported.

---

## FLEET-004 — Ownership

### Read authority
Digital twin currentOwnership/ownershipHistory plus `GET /vehicle-owners`.

### Permissions
- read: `vehicle_owner.read`
- manage: `vehicle_ownership.manage`

### Actions
- assign initial/new agreement → `POST /vehicle-owners/ownerships/assign`
- transfer ownership → `POST /vehicle-owners/ownerships/transfer`
- renegotiate terms → `POST /vehicle-owners/ownerships/change-terms`

### Required data
- owner
- ownership type
- start/end
- revenue share
- fixed payout if used
- deductible-expense rule
- terms snapshot
- current/historical flag

### Invariant
Existing history remains immutable evidence. Changing terms creates a new effective agreement, not an in-place rewrite of historical economics.

---

## FLEET-005 — Availability & Status

### Purpose
Explain whether the asset itself is eligible/available, while leaving reservation interval conflict truth to the Availability engine.

### Lifecycle
DRAFT → PENDING_VERIFICATION → ACTIVE → SUSPENDED / INACTIVE / SOLD / RETIRED according to domain rules.

### Availability
AVAILABLE / RESERVED / ON_RENT / MAINTENANCE / BLOCKED.

### Rule
Lifecycle and availability are separate.

### Mutation authority
Fleet status endpoints above.

### UX
- status cards;
- reason required where operationally meaningful;
- manual override clearly labelled;
- direct link to Availability workspace for interval timeline/holds/blocks/substitution.

Fleet UI must not create local allocation records.

---

## FLEET-006 — Compliance & Fleet Documents

### Fleet document authority
- `GET /fleet/vehicles/:id/documents`
- `POST /fleet/vehicles/:id/documents`

### Regulatory compliance authority
- `GET /compliance/records?subjectType=VEHICLE&subjectId=:id`
- `GET /compliance/readiness/vehicle/:id`

### Permissions
`vehicle.read`, `vehicle.update`, `compliance.read`, and specific compliance mutation permissions.

### UX
Distinguish:
- Fleet attachment/document metadata,
- regulatory ComplianceRecord,
- readiness blocker.

An uploaded/attached file is not itself proof of compliance.

---

## FLEET-007 — Maintenance

### Read authority
`GET /maintenance/work-orders?vehicleId=:id`
and maintenance schedule/due APIs where required.

### Permissions
`maintenance.read`, `maintenance.create`, `maintenance.manage`, `maintenance.verify`.

### Asset Profile behavior
Show:
- active work orders first,
- scheduled/in-progress/completed state,
- priority/type,
- provider,
- dates,
- costs when permitted.

Provide contextual **Open Maintenance** action instead of reproducing the entire Maintenance module.

### Invariant
Active maintenance controls vehicle availability through canonical business logic; Fleet must not fake this in local state.

---

## FLEET-008 — Inspection / Damage / History

### Read authority
- `GET /inspections?vehicleId=:id`
- `GET /inspections/damage-cases/list?vehicleId=:id`
- digital-twin status history
- digital-twin mileage/fuel history

### Permissions
`inspection.read`, damage permissions where applicable.

### UX
Show:
- recent pre-rental/return/ad-hoc inspections,
- status/date,
- damage case summary,
- mileage history,
- fuel history,
- Fleet lifecycle/availability history.

Provide contextual **Open Inspections** action.

Damage observations do not automatically become financial liability.

---

## FLEET-009 — Media

### Current authoritative capability
- Vehicle primary `imageUrl` is persisted by Fleet create/update.
- Fleet documents may reference secure File identities/URLs through Fleet document metadata.

### Current V1 Fleet UX
- primary image preview;
- permission-gated primary image update;
- document attachment list;
- do not invent a client-only gallery.

### Future secure gallery
When the File/Media association contract is exposed to Fleet, multiple images/derivatives move here without changing Vehicle identity.

---

## FLEET-010 — Permissions

UI visibility is convenience only. Server remains authority.

| Capability | Permission |
|---|---|
| View Fleet/List/Profile | `vehicle.read` |
| Register Vehicle | `vehicle.create` |
| Edit Vehicle | `vehicle.update` |
| Delete Vehicle | `vehicle.delete` |
| Lifecycle/Availability override | `vehicle.status_override` |
| Read Owners | `vehicle_owner.read` |
| Manage Ownership | `vehicle_ownership.manage` |
| Read Maintenance | `maintenance.read` |
| Create Maintenance | `maintenance.create` |
| Read Compliance | `compliance.read` |
| Read Inspections | `inspection.read` |

A denied secondary dataset must not make the Fleet profile unusable; show that tab/section as unavailable rather than failing the entire vehicle profile.

---

## FLEET-011 — Responsive UX

### Desktop
- KPI/attention strip
- filter toolbar
- dense but readable list
- large detail drawer/profile

### Tablet
- reduced columns
- critical statuses retained
- detail becomes near-full-width drawer

### Mobile
- Fleet list becomes cards
- registration + vehicle identity + statuses never disappear
- primary action remains reachable
- detail becomes full-screen sheet/page
- tab row scrolls horizontally
- forms use one column
- no horizontal table required for primary work

---

## FLEET-012 — Persistence & concurrency

### Persistence
Every successful write must survive:
- refresh,
- logout/login,
- workspace switch away/back.

### Tenant isolation
Every request carries verified selected Tenant context. No local fallback may mutate another Tenant.

### Optimistic concurrency
Use aggregate `version` / `expectedVersion` where the endpoint supports it.

### Failure
- do not report success before server response;
- keep form state on recoverable failure;
- 409/version conflict tells the user the record changed and must be refreshed.

### Data preservation
No reseed/reset/import during Fleet implementation. Existing vehicle IDs/registrations remain intact except explicit authorized business mutations.

---

# Fleet V1 acceptance gate

Fleet can move from restoration `READ_VERIFIED` to `PARTIAL/FULLY_CONNECTED` only when:

1. list is server-backed;
2. registration is server-backed;
3. Asset Profile uses digital twin;
4. edit/status/mileage/fuel actions are server-backed;
5. ownership reads and permitted commands are server-backed;
6. compliance/readiness loads independently and permission-safely;
7. maintenance loads independently and permission-safely;
8. inspections/damage loads independently and permission-safely;
9. media uses persisted Fleet fields/File references only;
10. every button is permission-gated in UI and protected by API;
11. cross-Tenant access tests pass;
12. writes persist after reload/re-login;
13. stale workspace responses cannot populate another Tenant;
14. desktop/mobile/keyboard states are usable;
15. loading/empty/error/denied/version-conflict states exist;
16. existing useful Fleet capabilities remain represented;
17. targeted Fleet regression passes;
18. canonical full matrix remains green.
