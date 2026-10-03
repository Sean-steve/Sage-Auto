# Sage-Auto — Pricing Experience Contracts

**Status:** Authoritative V1 Pricing & Rate Engine experience contract  
**Parent:** \`docs/SAGE_AUTO_PRODUCT_EXPERIENCE_MASTER_BLUEPRINT.md\`  
**Principle:** Pricing configuration and quote calculation are server-authoritative. The browser may collect inputs and render explanations; it must never reproduce authoritative rental-price mathematics.

---

## PRICING-001 — Pricing Workspace

### Purpose
Give authorized commercial/operations users one workspace to configure how rentals are priced and to verify the exact result the Pricing Engine will produce.

### Primary surfaces
1. Rate Plans
2. Rate Matrix & Assignments
3. Seasonal Rules
4. Duration Tiers
5. Fees & Add-ons
6. Promotions
7. Quote Workbench

### Core permissions
- read configuration: \`pricing.read\`
- calculate: \`pricing.calculate\`
- manage plans/rates/rules/fees: \`pricing.rate_plan.manage\`
- manage promotions: \`pricing.promo.manage\`

Navigation/action visibility is convenience only; API permission guards remain authority.

---

## PRICING-002 — Rate Plan Catalogue

### Read
\`GET /api/v1/pricing/rate-plans\`

### Visible fields
- code;
- name;
- description;
- status;
- currency;
- priority;
- default flag;
- effective from/to;
- tax-inclusive flag;
- version.

### Commands
- create: \`POST /pricing/rate-plans\`;
- update: \`PATCH /pricing/rate-plans/:id\`;
- activate: \`POST /pricing/rate-plans/:id/activate\`;
- archive: \`POST /pricing/rate-plans/:id/archive\`.

### Concurrency
Plan update sends \`expectedVersion\`.

### Invariant
Archiving a plan does not mutate historical Booking/PricingSnapshots.

---

## PRICING-003 — Rate Matrix

### Read
\`GET /pricing/rate-plans/:id/rates\`

### Write
\`POST /pricing/rate-plans/:id/rates\`

### Supported targeting
- Vehicle Category
- specific Vehicle

### Rate fields
- hourly rate when used;
- daily rate;
- weekend daily rate;
- weekly daily rate;
- monthly daily rate;
- mileage allowance model;
- included km/day;
- included km total;
- excess km rate;
- security deposit;
- deposit model;
- deposit percent where applicable.

### UX
Rate rows are edited deliberately and submitted to the backend as a matrix. No browser-calculated quote is inferred merely from this table.

---

## PRICING-004 — Rate Plan Assignments

### Read
\`GET /pricing/rate-plans/:id/assignments\`

### Create
\`POST /pricing/rate-plans/:id/assignments\`

### Supported targets
- CATEGORY
- VEHICLE
- CORPORATE_ACCOUNT
- CUSTOMER
- AGENT

### Required
- target type;
- target ID;
- priority.

### Purpose
Assignments participate in effective-plan resolution. They do not mutate the target entity.

---

## PRICING-005 — Seasonal Rules

### Read
\`GET /pricing/rate-plans/:id/seasonal-rules\`

### Create
\`POST /pricing/rate-plans/:id/seasonal-rules\`

### Remove
\`DELETE /pricing/seasonal-rules/:id\`

### Fields
- name;
- start/end dates;
- multiplier;
- optional Vehicle Category target;
- priority;
- active state.

### Invariant
Seasonal rules are interpreted by the Pricing Engine. UI does not pre-apply multiplier arithmetic as source of truth.

---

## PRICING-006 — Duration Tiers

### Read
\`GET /pricing/rate-plans/:id/duration-tiers\`

### Create
\`POST /pricing/rate-plans/:id/duration-tiers\`

### Remove
\`DELETE /pricing/duration-tiers/:id\`

### Fields
- minimum days;
- maximum days;
- discount percentage and/or custom daily rate.

### Validation
The backend remains responsible for interpreting matching tiers. The UI prevents obviously invalid min/max input but does not determine quote authority.

---

## PRICING-007 — Fees & Add-ons

### Read
\`GET /pricing/fees\`

### Create
\`POST /pricing/fees\`

### Remove
\`DELETE /pricing/fees/:id\`

### Fields
- code;
- name;
- optional Rate Plan scope;
- fee type;
- calculation type;
- amount;
- taxable flag;
- active state.

### Supported fee types
MANDATORY, OPTIONAL, LOCATION_BASED, DRIVER_BASED, EQUIPMENT, DRIVER_SERVICE, INSURANCE_WAIVER.

### Supported calculation types
FLAT_PER_RENTAL, DAILY, PERCENTAGE_OF_BASE, PER_KM.

---

## PRICING-008 — Promotions

### Read
\`GET /pricing/promo-codes\`

### Create
\`POST /pricing/promo-codes\`

### Status control
\`PATCH /pricing/promo-codes/:id/status\`

### Fields
- code;
- description;
- discount type;
- discount value;
- applies-to target;
- minimum rental days;
- minimum subtotal;
- maximum discount;
- valid from/to;
- usage limit/count;
- category restrictions;
- stackability;
- status.

### Status rule
Operational enable/disable uses explicit server status. The UI does not alter usage counters.

---

## PRICING-009 — Quote Workbench

### Authority
\`POST /api/v1/pricing/calculate\`

### Permission
\`pricing.calculate\`

### Inputs
- Vehicle / Vehicle Category;
- pickup and return timestamps;
- optional Customer;
- optional Corporate Account;
- optional Agent;
- primary Driver age;
- additional Driver count;
- chauffeur/driver service;
- delivery/collection inputs;
- selected fee codes;
- promo code;
- permitted manual discount;
- currency.

### Preconditions
A matching effective Rate Plan/Rate must exist, or a selected Vehicle must have a valid fallback daily rate.

### Result must display
- matched plan code/name/version;
- duration and billable days;
- standard/applied rate;
- day-by-day rate breakdown;
- base rental;
- driver charges;
- location charges;
- itemized fees;
- applied discounts;
- tax;
- gross rental total;
- security deposit;
- mileage allowance;
- applied rule trace;
- immutable PricingSnapshot identity/time.

### Critical rule
The workbench is a server call, not a React \`useMemo\` pricing calculator.

---

## PRICING-010 — Pricing Snapshot

A successful quote returns an immutable \`PricingSnapshot\`.

The UI may:
- display it;
- copy/download its JSON representation for debugging/review;
- hand it to the later Booking experience.

The UI may not:
- edit snapshot totals;
- recalculate it locally;
- treat a changed Plan as rewriting an old snapshot.

Booking will persist its own canonical PricingSnapshot when reconstructed.

---

## PRICING-011 — Related Data Loading

Only load supporting data when the role can access it.

- Vehicle/Category selectors require \`vehicle.read\`;
- Customer selector requires \`customer.read\`;
- Corporate Account selector requires \`customer.read\`;
- Agent target may remain explicit ID if no permitted Agent catalogue is available.

A denied supporting-data request must not make the entire Pricing workspace unusable.

---

## PRICING-012 — Money & Currency UX

- Render the currency returned by the Plan/Quote.
- Preserve backend monetary values; do not round and write them back.
- Formatting is presentation-only.
- Do not infer Tenant currency when the selected Plan/Quote provides a currency.
- No floating-point business calculation is performed in the UI.

---

## PRICING-013 — Error & Conflict UX

Must explicitly handle:
- no matching Plan/rate;
- invalid interval;
- invalid/expired Promo;
- missing Vehicle rate fallback;
- permission denied;
- version conflict;
- duplicate Plan/Promo code;
- invalid date/range;
- network/server error.

A failed quote must clear or label stale results; stale price must never look current.

---

## PRICING-014 — Responsive UX

### Desktop
- tabbed workspace;
- plan selector and configuration overview;
- rate matrix table;
- rule/fee/promo cards or tables;
- two-column Quote Workbench with sticky/result summary when useful.

### Mobile
- horizontally scrollable tabs;
- rate matrix converts to manageable row cards/editor;
- forms are single-column;
- quote result sections stack;
- no critical data exists only in hover state.

---

## PRICING-015 — Persistence & Tenant Safety

- all writes use the Pricing API;
- no local store is Pricing business truth;
- successful mutation refreshes affected server data;
- Tenant switch discards stale Pricing requests/results;
- Plan updates use optimistic concurrency;
- IDs remain stable;
- no seed/reset/import occurs as feature behavior.

---

## PRICING-016 — Existing Capability Preservation

The reconstructed experience must preserve useful concepts from the legacy Pricing screen:
- Plan selector;
- create Plan;
- activate/archive;
- editable rate matrix;
- seasonal rule creation/removal;
- duration tier creation/removal;
- fee catalogue creation/removal;
- Promo creation/status toggle;
- Instant Quote Workbench;
- corporate discount input through Corporate Account selection;
- Driver/additional-driver inputs;
- delivery/collection inputs;
- optional fees;
- Promo code;
- manual discount input;
- itemized result;
- PricingSnapshot inspection/copy.

No capability is removed merely to make the page visually simpler.

---

## PRICING-017 — Booking Handoff

Pricing precedes Availability/Booking in the blueprint.

The Pricing screen may expose a **Continue to Availability** or **Continue to Booking** affordance only when that destination is permitted.

Until those experiences are reconstructed:
- do not fake persisted draft transfer;
- label the handoff truthfully;
- PricingSnapshot shown in the Workbench is not itself a Booking.

---

# Pricing V1 acceptance gate

Pricing is reconstructed only when:

1. Rate Plans are read/create/update/activate/archive server-backed;
2. Rate matrix read/write is server-backed;
3. assignments read/create are server-backed;
4. seasonal rules read/create/delete are server-backed;
5. duration tiers read/create/delete are server-backed;
6. fees read/create/delete are server-backed;
7. Promo list/create/status control is server-backed;
8. quote Workbench calls \`/pricing/calculate\`;
9. no local quote engine is reachable;
10. result renders the backend breakdown and PricingSnapshot;
11. Plan writes preserve version concurrency;
12. supporting Fleet/Customer datasets are permission-scoped;
13. stale Tenant/quote responses cannot overwrite current state;
14. desktop/mobile layouts preserve critical actions;
15. targeted Pricing experience regression passes;
16. canonical Pricing tests remain green;
17. full Sage-Auto test matrix remains green.
