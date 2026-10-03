# Sage-Auto — Customers & Drivers Experience Contracts

**Status:** Authoritative implementation contract for V1 People & Accounts completion  
**Parent:** \`docs/SAGE_AUTO_PRODUCT_EXPERIENCE_MASTER_BLUEPRINT.md\`  
**Rule:** Customer, Driver and Corporate Account remain separate domain identities. A person may appear in more than one role, but the UI must not collapse those records into one mutable object.

---

## PEOPLE-001 — Registry Home

### Purpose
Give operational staff one place to find the customer, driver or corporate account involved in a rental workflow.

### Primary users
COMPANY_OWNER, TENANT_ADMIN, MANAGER, BOOKING_MANAGER, BOOKING_AGENT, SALES_AGENT, DRIVER_MANAGER, CUSTOMER_SERVICE and other roles according to permissions.

### Surfaces
1. Customers
2. Drivers
3. Corporate Accounts

### Global behaviors
- server-backed search/filter;
- role-aware counts;
- no broad fetch for datasets the role cannot read;
- each list has loading, empty, filtered-empty and error states;
- desktop table + mobile cards;
- open server-backed detail profile.

---

## PEOPLE-002 — Customer List

### Read authority
\`GET /api/v1/customers\`

### Permission
\`customer.read\`

### Filters
- search;
- status;
- verification status;
- customer type;
- corporate account when useful.

### Required visible fields
- customer number;
- full name;
- customer type;
- email / phone;
- ID/passport reference;
- licence number / expiry;
- status;
- KYC verification state;
- completed-rental count where canonical.

### Primary actions
- Onboard Customer → PEOPLE-003, \`customer.create\`
- Open Customer Profile → PEOPLE-004
- Begin booking handoff when Booking section is available.

---

## PEOPLE-003 — Onboard Customer

### Command
\`POST /api/v1/customers\`

### Permission
\`customer.create\`

### Required
- full name;
- email;
- phone;
- ID/passport;
- driving licence number;
- driving licence expiry.

### Optional
- customer type;
- tax PIN;
- nationality;
- address/city/country;
- corporate account;
- emergency contact;
- tags;
- notes.

### Server effects
- duplicate identity check scoped to Tenant;
- customer number generated;
- status starts ACTIVE;
- verification starts UNVERIFIED;
- status genesis history recorded;
- audit and outbox event recorded.

### Acceptance
No optimistic fake Customer is inserted. Server failure keeps entered form data and never reports success.

---

## PEOPLE-004 — Customer Profile

### Read authority
\`GET /api/v1/customers/:id\`

### Profile sections
1. Overview
2. KYC & licence
3. Linked Drivers
4. Corporate relationship
5. Documents
6. Status history
7. Booking handoff

### Overview
- customer number;
- customer type;
- contact;
- ID/passport;
- tax PIN;
- nationality/address;
- tags/notes;
- emergency contact;
- canonical rental count.

### Mutations
- edit → \`PUT /customers/:id\`, \`customer.update\`;
- status → \`PATCH /customers/:id/status\`, \`customer.block\`;
- KYC → \`PATCH /customers/:id/verify\`, \`customer.verify\`.

All versioned writes carry \`expectedVersion\`.

### Blocking
BLOCKED customer must be visibly distinct and cannot be presented as booking-ready.

---

## PEOPLE-005 — Customer KYC & Licence Readiness

### Purpose
Answer: “Is this Customer identity ready to continue toward a Booking?”

### Customer truth
- Customer status;
- verification status;
- licence number and expiry;
- required document metadata currently available in Customer details.

### UX
Show:
- VERIFIED / UNVERIFIED / PENDING / REJECTED;
- licence expiry;
- missing/expired signals;
- reason/status history where available.

### Rule
The browser must not invent a pass/fail compliance decision. When a later Booking/Rental-start policy requires full Compliance evaluation, that server policy remains authoritative.

---

## PEOPLE-006 — Driver List

### Read authority
\`GET /api/v1/drivers\`

### Permission
\`driver.read\`

### Filters
- search;
- status;
- verification state.

### Required visible fields
- driver number;
- full name;
- phone/email;
- licence number/classes/expiry;
- PSV/commercial badge where present;
- medical expiry where present;
- verification state;
- operational status;
- rating where canonical.

### Actions
- Add Driver → PEOPLE-007, \`driver.create\`
- Open Driver Profile → PEOPLE-008.

---

## PEOPLE-007 — Add Driver

### Command
\`POST /api/v1/drivers\`

### Permission
\`driver.create\`

### Required
- full name;
- phone;
- licence number;
- licence expiry.

### Optional
- email;
- national ID;
- licence classes;
- badge;
- medical expiry;
- emergency contact;
- notes.

### Server effects
- duplicate licence check scoped to Tenant;
- Driver number generated;
- ACTIVE + UNVERIFIED defaults;
- status history/audit/outbox.

---

## PEOPLE-008 — Driver Profile & Eligibility

### Read authority
\`GET /api/v1/drivers/:id\`

### Optional readiness authority
\`GET /api/v1/compliance/readiness/driver/:id\` when the role has \`compliance.read\`.

### Sections
1. Identity
2. Licence / badge / medical
3. Verification
4. Customer relationships
5. Documents
6. Status history
7. Compliance readiness

### Mutations
- update → \`PUT /drivers/:id\`, \`driver.update\`;
- status → \`PATCH /drivers/:id/status\`, \`driver.update\`;
- verification → \`PATCH /drivers/:id/verify\`, \`driver.update\`.

### Eligibility display
Sage-Auto may show obvious recorded facts such as expired licence dates, but must label canonical Compliance readiness separately and never replace it with browser inference.

---

## PEOPLE-009 — Customer ↔ Driver Relationships

### Purpose
Represent designated drivers/chauffeurs/family/corporate relationships without merging Customer and Driver identities.

### Read
\`GET /api/v1/drivers/relationships/customer/:customerId\`

### Link
\`POST /api/v1/drivers/relationships\`

### Unlink
\`DELETE /api/v1/drivers/relationships/:relationshipId\`

### Permission
- read: \`driver.read\`
- manage: \`driver.assign\`

### Relationship types
- PERSONAL_CHAUFFEUR
- FAMILY_MEMBER
- CORPORATE_DESIGNATED
- OTHER

### Invariant
A relationship points to existing Tenant-scoped Customer and Driver records. It does not copy their identity fields.

---

## PEOPLE-010 — Corporate Account List

### Read authority
\`GET /api/v1/corporate-accounts\`

### Permission
\`customer.read\`

### Required visible fields
- account number;
- company name;
- registration number;
- contact person;
- email/phone;
- status;
- credit limit;
- payment terms;
- discount rate.

### Actions
- Create Corporate Account → \`POST /corporate-accounts\`, \`customer.create\`
- Open Account → PEOPLE-011.

---

## PEOPLE-011 — Corporate Account Profile

### Read authority
\`GET /api/v1/corporate-accounts/:id\`

Includes authorized driver entries.

### Update
\`PUT /api/v1/corporate-accounts/:id\`, \`customer.update\`.

### Authorized drivers
- authorize → \`POST /corporate-accounts/:id/authorized-drivers\`;
- revoke → \`DELETE /corporate-accounts/:id/authorized-drivers/:authId\`;
- permission: \`customer.update\`.

### Display
- commercial identity;
- billing contact;
- credit limit;
- payment terms;
- negotiated discount reference;
- status;
- authorized Driver/Customer identities;
- notes.

### Invariant
Corporate credit/discount fields are relationship/commercial inputs. Authoritative Booking pricing still comes from the Pricing Engine and PricingSnapshot.

---

## PEOPLE-012 — Documents

Customer and Driver detail APIs currently expose PartyDocument metadata/history.

The People experience may display:
- document type;
- document number;
- expiry;
- verification state;
- safe file link when provided.

No browser-only upload is to be invented. Binary upload/verification must use the secure File/Party-document workflow once its HTTP contract is exposed.

---

## PEOPLE-013 — Booking Handoff

Customer/Driver completion must prepare, not duplicate, Booking.

A Customer Profile may show **Continue to Booking** when the user also has Booking access.

Before handoff, surface:
- Customer status;
- Customer verification;
- licence expiry;
- linked/default Driver where relevant;
- Driver status/verification/readiness if selected;
- Corporate Account relationship if applicable.

The Booking module remains responsible for:
- requested dates;
- Vehicle/Category;
- PricingSnapshot;
- Availability;
- Booking lifecycle.

---

## PEOPLE-014 — Permissions

| Capability | Permission |
|---|---|
| View Customers | \`customer.read\` |
| Create Customer | \`customer.create\` |
| Update Customer | \`customer.update\` |
| Verify Customer | \`customer.verify\` |
| Block/reinstate Customer | \`customer.block\` |
| View Drivers | \`driver.read\` |
| Create Driver | \`driver.create\` |
| Update/verify Driver | \`driver.update\` |
| Link Customer ↔ Driver | \`driver.assign\` |
| View Corporate Accounts | \`customer.read\` |
| Create Corporate Account | \`customer.create\` |
| Update/authorize Corporate Account | \`customer.update\` |
| View Compliance readiness | \`compliance.read\` |

UI hiding is convenience; API guards remain authority.

---

## PEOPLE-015 — Responsive UX

### Desktop
- tabbed People registry;
- compact filter toolbar;
- table lists;
- right-side/full-width profile drawer.

### Mobile
- tabs horizontally scroll;
- tables become cards;
- identity/status remain visible;
- profiles become full-screen;
- forms one-column;
- critical actions remain reachable without hover.

---

## PEOPLE-016 — Persistence & Concurrency

- every mutation goes through API;
- no localStorage/local store is People domain truth;
- successful write is re-read from server;
- \`expectedVersion\` used on versioned update/status/verify commands;
- 409 conflict is shown as refresh/review;
- reload/logout-login preserve results;
- Tenant switch discards stale responses;
- no cross-Tenant Customer/Driver/Corporate record is rendered or mutated;
- no automatic reseed/import.

---

# Customers & Drivers V1 acceptance gate

The experience can be marked reconstructed only when:

1. Customer list/profile/create/edit/status/KYC are server-backed;
2. Driver list/profile/create/edit/status/verification are server-backed;
3. Customer↔Driver relationship API and UI are Tenant/permission safe;
4. Corporate Account list/profile/create/edit/authorized-driver workflow is server-backed;
5. Compliance readiness is fetched only when permitted and does not block basic profile use if denied;
6. Party document metadata/history are shown truthfully;
7. Booking handoff is contextual but does not fake Booking creation;
8. mobile/desktop experiences retain critical information/actions;
9. stale Tenant responses are discarded;
10. versioned writes use optimistic concurrency;
11. old local CustomersView mutations are no longer reachable;
12. targeted experience regression passes;
13. full canonical test matrix remains green.
