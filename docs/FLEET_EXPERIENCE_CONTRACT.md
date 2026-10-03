# Sage-Auto Fleet Experience Contract

**Status:** Authoritative implementation contract for the first completed operational experience  
**Parent:** `SAGE_AUTO_PRODUCT_EXPERIENCE_MASTER_BLUEPRINT.md`  
**Rule:** Fleet UI is a presentation/orchestration surface over canonical server domains. It does not duplicate Fleet, Availability, Ownership, Compliance, Maintenance, Inspection, File/Media or authorization truth in browser state.

## 1. Fleet List Contract

**Primary users:** Company Owner, Tenant Admin, Manager, Fleet Manager; read-only visibility for any role with `vehicle.read`.

**Purpose:** Answer “what vehicles do we control, what condition/state are they in, and which one needs attention?”

**Server source:** `GET /api/v1/fleet/vehicles`.

**Visible information**
- registration plate;
- make/model/year;
- category;
- lifecycle status;
- availability status;
- ownership indicator;
- location;
- odometer;
- publication state;
- primary image where present.

**Controls**
- search;
- lifecycle filter;
- availability filter;
- category filter;
- clear filters;
- open Asset Profile;
- Register Vehicle when `vehicle.create`.

**States**
- loading skeleton/status;
- empty fleet with role-aware CTA;
- filtered-empty state;
- server error with retry;
- permission denial remains backend-authoritative.

**Responsive**
- desktop/tablet: dense table;
- small screens: vehicle cards retaining the same critical state/action data.

**Done when**
- all reads are server-backed;
- filters are server-backed;
- selecting a vehicle opens its current server Digital Twin;
- no legacy local vehicle mutation can execute.

## 2. Register Vehicle Contract

**Permission:** `vehicle.create`; Entitlement quota is independently enforced by backend.

**Command:** `POST /api/v1/fleet/vehicles`.

**Required**
- registration plate;
- make;
- model;
- year;
- category;
- daily rate.

**Supported optional fields preserved from existing experience**
- color;
- VIN;
- odometer;
- fuel level;
- transmission;
- seats;
- fuel type;
- features;
- image URL;
- current location;
- publish-to-website flag;
- allowed daily kilometres;
- excess-km rate;
- insurance expiry;
- inspection expiry;
- initial owner;
- ownership type;
- revenue share.

**Success**
- server returns canonical Vehicle;
- list reloads from server;
- new Vehicle may be opened immediately;
- reload/login preserves it.

**Failure**
- form stays populated;
- server validation/quota/authorization error displayed;
- no local success is shown.

## 3. Vehicle Asset Profile Contract

**Route/surface:** Fleet → Asset Profile.

**Core source:** `GET /api/v1/fleet/vehicles/:id/digital-twin`.

**Header must show**
- vehicle identity;
- registration;
- lifecycle;
- availability;
- location;
- primary image;
- current ownership summary;
- contextual edit/status controls by permission.

**Tabs**
1. Overview
2. Ownership
3. Availability & telemetry
4. Compliance
5. Maintenance
6. Inspections & damage
7. Media & documents
8. History

**Overview**
- canonical identity/specifications;
- pricing baseline fields currently stored on Vehicle;
- website publication;
- odometer/fuel;
- current owner;
- rental-count/days-on-rent Digital Twin stats where available.
- null analytics remain “not available”, never converted to zero.

**Edit permission:** `vehicle.update`.  
**Command:** `PATCH /fleet/vehicles/:id` with `expectedVersion`.

## 4. Ownership Contract

**Read sources**
- current ownership and ownership history in Digital Twin;
- `GET /vehicle-owners` when `vehicle_owner.read`.

**Write permission:** `vehicle_ownership.manage`.

**Initial/assignment command:** `POST /vehicle-owners/ownerships/assign`.

**Must preserve**
- owner;
- ownership type;
- start/effective date;
- revenue share;
- fixed payout where supported;
- deductible-expense flag;
- terms snapshot;
- history.

Ownership changes are agreements, not edits to historical settlement truth.

## 5. Availability Contract

Fleet shows **current Vehicle availability state** and its status history; the Availability bounded context remains the authority for interval allocation.

**Fleet status command:** `POST /fleet/vehicles/:id/availability-status` with reason + expectedVersion and permission `vehicle.status_override`.

**Lifecycle command:** `POST /fleet/vehicles/:id/lifecycle-status` with reason + expectedVersion.

Fleet must not create fake Booking allocations in browser memory.

When the user has the Availability section, Asset Profile provides a direct transition to the full Availability Engine for interval search, holds, blocks and substitution.

## 6. Compliance Contract

**Read permission:** `compliance.read`.

**Sources**
- `GET /compliance/readiness/vehicle/:id`;
- `GET /compliance/records?subjectType=VEHICLE&subjectId=:id`.

Fleet displays:
- readiness result;
- blocking/warning reasons;
- requirement/record state;
- expiry/verification information.

Compliance creation/verification/override remains in the dedicated Compliance workflow and its own permissions. Fleet links there rather than duplicating policy controls.

## 7. Maintenance Contract

**Read permission:** `maintenance.read`.

**Sources**
- `GET /maintenance/work-orders?vehicleId=:id`;
- `GET /maintenance/schedules?vehicleId=:id`;
- `GET /maintenance/due-evaluations?vehicleId=:id`.

Fleet displays:
- active/recent work orders;
- preventive schedules;
- due signals;
- current maintenance state.

Creation/scheduling/completion/verification stays in Maintenance under its existing permission model. Active maintenance continues to affect Vehicle availability through server business rules.

## 8. Inspection & History Contract

**Read permission:** `inspection.read`.

**Sources**
- `GET /inspections?vehicleId=:id`;
- `GET /inspections/damage-cases/list?vehicleId=:id`;
- Digital Twin Vehicle status history.

Fleet displays:
- inspections by type/status/time;
- linked rental/booking where available;
- damage cases separately from liability;
- status changes;
- mileage/fuel telemetry history.

Inspection creation/completion/signature/evidence remains in the dedicated Inspection workflow.

## 9. Media & Documents Contract

Current Fleet capabilities:
- Vehicle primary `imageUrl`;
- Vehicle document metadata through `/fleet/vehicles/:id/documents`.

Fleet may:
- update the primary image URL using Vehicle update;
- add supported document metadata when `vehicle.update`;
- display documents and verification/expiry state.

Secure binary File/Media upload remains owned by the File/Media bounded contexts and must not be simulated with browser-only blobs. When direct upload/linking is wired later, it must preserve File quarantine/scanning rules.

## 10. Permission Contract

Frontend visibility is convenience only. Backend guards remain authority.

| Capability | Permission |
|---|---|
| List/open Vehicle | `vehicle.read` |
| Register | `vehicle.create` |
| Edit Asset | `vehicle.update` |
| Delete | `vehicle.delete` |
| Lifecycle/availability override | `vehicle.status_override` |
| Read owners | `vehicle_owner.read` |
| Assign/transfer terms | `vehicle_ownership.manage` |
| Read maintenance | `maintenance.read` |
| Read compliance | `compliance.read` |
| Read inspections | `inspection.read` |

No permission → do not fetch unrelated dataset and do not render its action.

## 11. Responsive UX Contract

**Desktop:** fleet table + side/full profile overlay with persistent asset context.

**Tablet:** compact table/card mix, horizontally safe filters.

**Mobile:**
- filters wrap vertically;
- vehicle cards replace wide table;
- Asset Profile becomes full-screen sheet/page;
- tabs horizontally scroll;
- primary actions remain thumb-accessible;
- no critical status exists only in hover state.

## 12. Persistence & Concurrency Contract

- all mutations use API;
- no localStorage/local Map is Fleet business truth;
- mutation success triggers fresh server read;
- Vehicle updates/status changes include `expectedVersion` where supported;
- 409/version conflict is shown as a refresh-and-review condition;
- reload and re-login must show the same state;
- Tenant switch aborts/discards old response and uses new Tenant context;
- create/update/status/ownership are covered by regression tests;
- IDs are preserved;
- no reseed/reset as part of feature use.

## 13. Fleet Definition of Done

Fleet is complete only when:
- Fleet List is server-backed;
- Register Vehicle persists;
- Asset Profile uses Digital Twin;
- edit/status/telemetry/ownership/document actions are permission-gated and server-backed;
- linked Maintenance/Compliance/Inspection reads are scoped and truthful;
- responsive layouts work;
- reload/login persistence is verified;
- negative permission/Tenant tests pass;
- existing useful Fleet capabilities have an explicit home;
- no legacy Fleet local mutation path is reachable from the restored workspace.
