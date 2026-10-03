# Sage-Auto Product Experience Master Blueprint

**Document status:** Authoritative product-experience baseline for V1 restoration and completion  
**Scope:** Public experience, company workspace, personal portals, company administration, platform operations, design/interaction system, workflow priority and definition of done  
**Implementation rule:** Preserve capability first → improve placement second → improve visual treatment third. No feature is removed merely to make the UI cleaner.

---

## 1. Product experience objective

Sage-Auto must feel like one connected rental operating system, not a collection of independent modules.

Every screen must answer five questions immediately:

1. **Where am I?**
2. **What needs my attention?**
3. **What can I do here?**
4. **What happens next?**
5. **What is the current business truth?**

The experience is organized around real rental outcomes:

**Acquire demand → qualify customer → price correctly → confirm availability → create booking → collect/verify payment → prepare vehicle → hand over → manage active rental → return/inspect → finalize finance → settle owners → maintain/compliance → report and improve.**

The system must never imply that a workflow is complete simply because a screen exists.

---

## 2. Product experience principles

### 2.1 Operational truth over visual theatre
No fabricated totals, mock transactions, local-only success states or simulated subscription/permission decisions may appear as authoritative production data.

### 2.2 One action, one next step
Primary actions must move the user forward in a business workflow. Examples:

- **Create Booking** → quote/availability/customer → booking state.
- **Confirm Booking** → reservation becomes operationally committed.
- **Dispatch Handover** → inspection/contract/key release.
- **Process Return** → inspection/final calculation/deposit handling.
- **Approve Settlement** → payout-ready obligation.

### 2.3 Progressive disclosure
Sage-Auto is feature-rich. Sleekness comes from hierarchy, not feature removal.

Show:
- urgent information first,
- primary action second,
- secondary actions contextually,
- advanced details in tabs/drawers/expanded panels,
- audit/history when requested.

### 2.4 Server authority
Permissions, Tenant context, Entitlements, financial state, Payment verification and lifecycle transitions remain server-authoritative.

### 2.5 Role relevance
A user should not see a broad menu of inaccessible modules. Navigation should reflect their actual responsibilities.

### 2.6 Cross-module continuity
A user should not have to manually rediscover the same business object.

Examples:
- Booking → Customer → Vehicle → Payment → Rental should retain context.
- Vehicle → Maintenance → Compliance → Availability should remain connected.
- Owner → Vehicles → Revenue → Settlement should remain connected.

### 2.7 Mobile where work happens
Handover, inspection, vehicle lookup, return processing and customer lookup must work cleanly on phones/tablets.

---

# PART I — ENTRY, LANDING & ACCOUNT EXPERIENCE

## 3. Sage-Auto platform landing page

### Purpose
Explain what Sage-Auto is and convert a rental-business visitor into an account/workspace.

### Primary audience
Rental-business owner, manager or operator evaluating the product.

### Expected above-the-fold content

**Hero**
- Sage-Auto brand.
- Clear proposition: fleet, bookings, rentals, finance and customer operations in one workspace.
- Primary CTA: **Start / Create workspace**.
- Secondary CTA: **Sign in**.
- Optional tertiary: **View how it works / Explore features**.

**Trust / operating proof**
- Multi-tenant security.
- Booking and availability control.
- Payments and finance.
- Fleet/maintenance/compliance.
- Public booking website.
- Owner settlements.

Do not publish fabricated performance numbers or testimonials as factual customer proof.

### Expected landing sections

1. Hero.
2. Core operating workflow visual.
3. Feature groups:
   - Fleet Operations
   - Reservations & Rentals
   - Payments & Finance
   - Maintenance & Compliance
   - Website & CRM
   - Owners & Settlements
4. Role-based explanation: Owner / Operations / Booking / Finance / Fleet.
5. Public booking website capability.
6. Security / data isolation / audit.
7. Plans or “contact/start” path if commercial plans are not finalized.
8. FAQ.
9. Footer: legal, privacy, support/contact.

### Design direction
Premium B2B mobility SaaS:
- strong whitespace,
- dark/neutral shell with restrained emerald accent,
- real product UI previews rather than generic illustrations,
- no invented statistics,
- responsive hero,
- focused CTAs.

### Completion
Landing → account creation/sign-in → verification → onboarding → workspace.

**Priority: P1 — important for acquisition, but not ahead of core rental operations.**

---

## 4. Authentication

### Required flows
- Sign in
- Register
- Verify email
- Resend verification
- Forgot password
- Reset password
- Invitation acceptance
- Session expiry
- Logout

### Expected experience
- Specific error messages when safe.
- Generic credential failure for authentication security.
- Loading/busy state prevents double submission.
- Successful login never guesses a workspace.
- Returning users continue from saved account state.
- Session expiry clears selected Tenant/workspace and private cached data.

**Priority: P0**

---

## 5. Onboarding

### Company user
**Register → verify → company name → create workspace → owner membership → workspace**

Expected:
- short setup,
- progress saved,
- no fake seed business records,
- default Plan/Entitlements/settings created canonically,
- clear first-run empty state.

### Renter
**Register → verify → renter profile → renter portal**

### Invitee
**Invitation → account/sign-in → verify → accept role → relevant workspace/personal portal**

### Platform owner
One-time controlled bootstrap only. Public signup must never grant Platform ownership.

**Priority: P0**

---

## 6. Workspace chooser

A user with more than one accessible workspace sees:

- workspace/company name,
- role(s),
- optionally status,
- clear personal portal entries if applicable,
- Platform workspace separately from Tenant workspaces.

Switching must clear:
- Tenant ID,
- loaded Tenant datasets,
- open dialogs,
- selected records,
- pending Tenant requests.

**Priority: P0**

---

# PART II — PUBLIC RENTAL-CUSTOMER EXPERIENCE

## 7. Tenant public website

Every rental company may have its own branded public site.

### Home page expected
- Tenant branding/logo/business name.
- Clear search/booking CTA.
- Pickup/return dates and location where supported.
- Featured/published vehicles.
- Why rent with us.
- Rental terms highlights.
- Contact information.
- Active CMS content.
- Account link.
- Mobile-first CTA.

### Public navigation
Typical:
- Home
- Fleet
- About
- Contact
- FAQ / Terms where configured
- My account
- Book a car

CMS controls which pages are actually published.

---

## 8. Public vehicle discovery

### User objective
Find a suitable available vehicle quickly.

### Must show
- image,
- make/model/category,
- seats,
- transmission,
- key rental-relevant attributes,
- visible rate indication only when authoritative,
- availability relative to selected dates,
- clear **View / Select / Get quote** action.

### Filters expected as system matures
- dates,
- category,
- transmission,
- capacity,
- price range,
- optional location.

Do not expose:
- owner financial terms,
- VIN/internal notes,
- maintenance internals,
- private File references,
- Tenant financial data.

**Priority: P0 for public-booking Tenants.**

---

## 9. Vehicle detail

Expected:
- image gallery,
- vehicle marketing title,
- specifications,
- included mileage/rental terms where applicable,
- price basis,
- availability for selected dates,
- fees/deposit disclosure,
- CTA to quote/book.

The public presentation layer may change marketing content/order but must never mutate canonical Fleet truth.

---

## 10. Quote

**Dates + vehicle/category + optional promo/context → Pricing Engine → immutable quote result**

Must show:
- rental duration,
- base rental,
- fees/add-ons,
- discount,
- tax,
- security deposit,
- gross total,
- currency,
- quote validity where applicable.

Never calculate authoritative totals only in the browser.

**Priority: P0**

---

## 11. Public booking checkout

Expected stages:

1. Vehicle/date summary.
2. Quote.
3. Renter details.
4. Driver/licence identity information required by Tenant policy.
5. Terms acknowledgement.
6. Payment method / pay-later according to policy.
7. Submission.
8. Booking reference and state.

### Success
Must distinguish:
- request received,
- awaiting payment,
- confirmed,
- awaiting manual approval.

Never show “Paid” merely because browser/payment redirect succeeded.

**Priority: P0**

---

## 12. Renter portal

Primary outcomes:

### My bookings
- upcoming,
- active,
- history,
- status,
- vehicle,
- dates,
- amount/payment status,
- booking reference.

### Booking detail
- timeline,
- quote/financial summary,
- documents,
- payment status,
- pickup instructions,
- permitted actions.

### Guest booking claim
Verified renter may claim a booking only when ownership criteria match.

### Profile
- contact information,
- driver/licence information where permitted,
- account security.

Future self-service actions must be added only after backend workflow acceptance.

**Priority: P1 after core company workflow.**

---

# PART III — COMPANY OPERATING EXPERIENCE

## 13. Company dashboard — Operations Command Center

The dashboard must answer:

**What needs attention today?**

### Required information hierarchy

**Top operational KPIs**
- available vehicles,
- reserved vehicles,
- active rentals,
- pickups/handover due,
- returns due,
- maintenance-blocked vehicles,
- overdue/attention bookings,
- unpaid/partially paid operational obligations where permission allows.

KPIs must be server-backed and permission-scoped.

### Action queue
Examples:
- bookings awaiting confirmation,
- handovers due,
- returns due,
- expiring compliance,
- maintenance due,
- unresolved payment reconciliation,
- owner settlements awaiting approval.

### Quick actions
Permission-aware:
- New Booking
- New Customer
- Register Vehicle
- Start Inspection
- Record Payment

### Operational views
Current interface concepts worth preserving/refining:
- CRM pipeline,
- ready-for-handover queue,
- fleet availability matrix,
- event/outbox operations where appropriate for technical/admin users.

Technical internals such as outbox state should not dominate ordinary staff dashboards.

**Priority: P0**

---

## 14. Fleet

### Objective
Know exactly which vehicles the company controls and whether each can be rented.

### Fleet list must show
- registration,
- make/model/year,
- category,
- lifecycle state,
- availability state,
- ownership type,
- current/next booking indicator,
- maintenance/compliance warning,
- branch/location when supported.

### Primary actions
- Register Vehicle
- Open Asset Profile

### Asset Profile should consolidate
**Identity**
registration, VIN, specs, photos.

**Ownership**
company/third-party/leased/managed/partnership, owner, effective agreement.

**Operational status**
lifecycle and availability kept distinct.

**Booking/rental history**

**Maintenance**
due/current/history.

**Compliance**
requirements/expiry/readiness.

**Inspection & damage history**

**Financial/analytics**
only for authorized roles.

### Critical workflow
**Register vehicle → verify → active → available → booking → rental → return → available/maintenance**

**Priority: P0 — first operational module to complete.**

---

## 15. Vehicle Owners

### Objective
Manage external asset owners and the commercial relationship.

Expected:
- owner identity/contact,
- company if applicable,
- payout details with masking,
- attached vehicles,
- active agreement,
- revenue share,
- deductible expense rules,
- agreement history.

Actions:
- Add Owner
- Assign Vehicle
- Manage Terms
- Generate Statement

Historical settlement calculations must use historical terms snapshots.

**Priority: P1**

---

## 16. Customers, Drivers & Corporate Accounts

### Customer registry
Show:
- customer name,
- contact,
- verification/risk status,
- booking/rental history,
- balance/finance summary where permitted,
- notes,
- linked drivers.

Actions:
- Onboard Customer
- Edit permitted details
- Verify
- Block/Reinstate with reason/audit
- Start Booking

### Drivers
Separate driver identity from Customer/User.

Expected:
- licence details,
- expiry,
- verification,
- assigned/rental history,
- eligibility.

### Corporate accounts
Expected:
- company identity,
- contacts,
- billing terms,
- negotiated pricing relationship,
- credit rules where implemented,
- bookings/users/drivers.

### Critical workflow
**Customer → Driver eligibility → Quote → Booking**

**Priority: P0 — second operational module.**

---

## 17. Pricing & Rate Engine

### Objective
Let authorized users define pricing once and rely on the same engine everywhere.

### Required sections
Preserve/refine existing:
- Rate Plans & Matrices
- Category/Vehicle rates
- Seasonal Rules
- Duration Tiers
- Ancillary Fees
- Promo Codes
- Instant Quote Simulator

### Rate plan experience
Must show:
- code/name,
- currency,
- effective period,
- priority,
- active/draft/archive state,
- version,
- target assignment.

### Quote simulator
Must explain the result:
- matched plan,
- base rate,
- day breakdown,
- fees,
- discounts,
- tax,
- deposit,
- total,
- applied rules.

### Critical rule
Booking stores immutable PricingSnapshot.

**Priority: P0 before Booking completion.**

---

## 18. Availability

### Objective
Answer: **Can this vehicle be committed for this interval?**

Preserve/refine:
- Dispatch Gantt/timeline
- Candidate Search
- Temporary Holds
- Operational Blocks
- Vehicle Substitution

### Candidate search
Inputs:
- pickup,
- return,
- category/vehicle requirements.

Results:
- available candidates,
- relevant status,
- rate/fit context where appropriate,
- hold/select action.

### Holds
Show:
- Vehicle,
- source,
- interval,
- expiry countdown,
- state,
- confirm/release.

### Blocks
Reasons:
- maintenance,
- operational,
- compliance,
- internal block.

### Substitution
Original vehicle → replacement with availability verification and audit.

### Critical rule
Half-open intervals and transactional conflict prevention remain server authoritative.

**Priority: P0 before Booking completion.**

---

## 19. Bookings

### Objective
Move a commercial request into a controlled reservation.

### Booking list
Must show:
- booking number,
- customer,
- vehicle/category,
- pickup/return,
- status,
- payment status,
- amount,
- source,
- attention flag.

Filters:
- status,
- date,
- customer,
- vehicle,
- source,
- payment.

### Booking detail
Tabs/sections:
- Overview
- Customer/Driver
- Vehicle/Availability
- Pricing Snapshot
- Payments
- Contract/Documents
- Timeline/Audit

### Permitted contextual actions
According to state/permission:
- Edit Draft
- Quote
- Confirm
- Record/Initiate Payment
- Substitute Vehicle
- Cancel
- Reject
- Mark No-show
- Dispatch Handover

### Canonical lifecycle
DRAFT → PENDING → QUOTED → AWAITING_PAYMENT → CONFIRMED → ACTIVE → COMPLETED

with CANCELLED / REJECTED / EXPIRED / NO_SHOW branches.

Booking must never be silently transformed into Rental.

**Priority: P0 — central revenue workflow.**

---

## 20. Contract & pre-handover readiness

Even if presented inside Booking/Rental rather than a top-level menu, the experience must exist.

Expected:
- booking details,
- customer/driver,
- vehicle,
- pricing/deposit,
- rental terms,
- generated contract,
- signature state,
- compliance/readiness blockers.

Contract states:
DRAFT → GENERATED → SENT → SIGNED → ACTIVE → COMPLETED → ARCHIVED.

**Priority: P0 before Rental start.**

---

## 21. Handover

### Objective
Safely release the vehicle.

Expected guided sequence:

1. Customer arrived.
2. Identity/document verification.
3. Pre-rental inspection.
4. Fuel/odometer/evidence.
5. Damage acknowledgement.
6. Contract/signature.
7. Payment/deposit readiness.
8. Key handover.
9. Rental start.

User should see blockers and reason, not merely a disabled button.

**Priority: P0**

---

## 22. Rentals

### Objective
Manage the vehicle while it is actually on hire.

### Rental list
- rental/reference,
- customer,
- vehicle,
- start/end,
- status,
- current duration,
- return due/overdue,
- incident flag.

### Rental detail
- linked Booking,
- Customer/Driver,
- vehicle,
- contract,
- handover snapshot,
- payment/deposit,
- extensions,
- incidents,
- return readiness.

Actions:
- Confirm Key Handover / Start Rental
- Extend Trip
- Log Incident
- Process Return

**Priority: P0**

---

## 23. Inspections & damage

### Objective
Create defensible vehicle-condition evidence.

Expected:
- inspection type: pre-rental / return / ad-hoc,
- vehicle,
- odometer,
- fuel,
- checklist,
- photos/files,
- damage observations,
- signatures,
- completion certificate.

Damage observation is not automatically financial liability.

Preserve/refine current:
- Launch Inspection Audit
- View Certificate

Mobile-first capture is mandatory.

**Priority: P0 for handover/return.**

---

## 24. Return & completion

Guided return:

1. Vehicle received.
2. Return inspection.
3. Fuel/odometer.
4. Damage assessment.
5. extra charges/adjustments through canonical finance.
6. FinalCalculation.
7. deposit processing.
8. return completed.
9. Rental completed.
10. Vehicle returns to AVAILABLE or MAINTENANCE/BLOCKED.

**Priority: P0**

---

## 25. Maintenance

### Objective
Keep vehicles serviceable without losing availability truth.

Preserve/refine:
- Work Orders
- Preventive Maintenance Plans
- Due Matrix
- Garages / Service Vendors

### Work order
Show:
- vehicle,
- reason/source,
- provider,
- scheduled dates,
- status,
- cost estimate/actual,
- parts/notes/evidence,
- completion/verification.

### Critical interaction
Active maintenance must block availability.

**Priority: P1 immediately after core rental flow.**

---

## 26. Compliance

### Objective
Prevent non-compliant vehicles/drivers from entering restricted operations.

Expected:
- requirement,
- record/document,
- subject,
- issue/expiry,
- verification,
- readiness impact,
- warnings.

Actions:
- Register Compliance Document
- Verify
- Override Hold only with permission + reason + audit.

Expiry warnings should become attention items before actual blockage.

**Priority: P1**

---

# PART IV — FINANCE & OWNER ECONOMICS

## 27. Finance

### Objective
Give authorized staff a truthful operational-finance workspace.

Preserve/refine tabs:
- Customer Invoices
- Payments & Attempts
- Operating Expenses
- Double-Entry Ledger

### Invoices
Show:
- invoice number,
- customer/source,
- total,
- credited,
- paid,
- outstanding,
- status,
- dates.

Actions must follow canonical create/void/credit rules.

### Payments
Show:
- Payment vs PaymentAttempt distinctly,
- provider,
- amount/currency,
- state,
- allocation,
- provider reference,
- reconciliation state.

Never use browser success as Payment truth.

### Expenses
- category,
- vendor,
- amount,
- receipt/evidence,
- approval where required,
- associated vehicle/rental where relevant.

### Ledger
- chart of accounts,
- journal transactions,
- source,
- debit/credit totals,
- status.

POSTED Journals are immutable.

**Priority: P0 around Booking/Return payment truth; full finance workspace P1.**

---

## 28. Owner settlements

### Objective
Calculate and pay third-party vehicle owners transparently.

Expected:
- settlement period,
- owner,
- vehicles,
- gross rental revenue,
- owner share,
- operator share,
- allowable deductions,
- net payout,
- calculation snapshot,
- status/history.

Lifecycle:
PENDING/CALCULATED → APPROVED → PAYMENT_PENDING → PAID
or DISPUTED.

Actions:
- Generate Statement
- Review
- Approve
- Record/Execute Payout
- Export Statement

OwnerSettlement is not itself Payment.

**Priority: P1**

---

# PART V — SALES, WEBSITE & GROWTH

## 29. Leads & CRM

### Objective
Turn enquiries into Bookings without losing customer context.

Expected pipeline:
Lead → qualification → Quote → Sent → Viewed → Accepted → Booking.

Lead list:
- name/company,
- source,
- stage/status,
- requested dates/vehicle,
- estimated value,
- assignee,
- next action.

Quote:
- version,
- line items,
- totals,
- validity,
- public token/link,
- acceptance state.

Accepted commercial terms must be frozen into Booking pricing truth.

**Priority: P1**

---

## 30. Tenant website CMS

### Objective
Let a rental company manage its public storefront without deploying separate code.

Expected:
- website status,
- branding,
- pages,
- navigation,
- page blocks,
- published revision,
- domain status.

Actions:
- Create website
- Edit page
- Preview
- Publish
- Unpublish

Published revision is a coherent snapshot.

**Priority: P1 after core operations.**

---

# PART VI — COMPANY ADMINISTRATION

## 31. Team & invitations

Expected:
- active members,
- role,
- status,
- linked personal record where relevant,
- invitation list,
- delivery/status/expiry.

Actions:
- Invite
- Resend
- Revoke
- Change role
- Link/unlink Driver/Owner record
- Suspend/restore member

Last-owner protection applies.

**Priority: P0 account foundation.**

---

## 32. Company settings

Recommended information architecture:

### Company profile
- legal/trading name,
- contact,
- address,
- timezone,
- currency,
- tax identifiers/config where applicable.

### Subscription
- Plan,
- state,
- effective limits,
- billing invoices,
- restricted-mode explanation.

### Payments/integrations
- M-Pesa configuration status,
- provider state,
- callback readiness.
Never display secrets after save.

### Team & RBAC
Link to authoritative Team experience instead of creating competing access models.

### Audit
Search/filter high-risk business/security actions.

**Priority: P1**

---

# PART VII — PERSONAL WORKSPACES

## 33. Driver portal

### My Trips
- assigned upcoming/active trips,
- customer/vehicle only to permitted extent,
- schedule/location,
- status,
- required actions.

### My Inspections
- assigned inspection tasks,
- completed inspection history,
- evidence capture when authorized.

No broad company data loader.

**Priority: P1/P2 depending operational driver model.**

---

## 34. Vehicle Owner portal

### My Vehicles
- only linked vehicles,
- operational status,
- utilization summary where approved,
- maintenance/compliance visibility appropriate to owner.

### My Settlements
- statements,
- revenue,
- deductions,
- payout state,
- downloadable statement.

No other owners/company-wide finance.

**Priority: P1**

---

# PART VIII — PLATFORM / SAAS OPERATIONS

## 35. Platform workspace

Platform access is separate from Tenant administration.

### Platform Owner / Admin
Primary surfaces:
- Overview
- Companies
- Platform Team
- Plans & Subscriptions
- SaaS Billing
- Support Access
- Platform Analytics
- Platform Compliance
- Platform Settings where authorized.

### Overview
Should answer:
- platform operational health,
- active Tenants,
- Subscription states,
- billing issues,
- provider/queue incidents,
- critical support/operational issues.

Do not expose arbitrary Tenant business records.

### Companies
- Tenant name,
- status,
- Plan,
- Subscription state,
- high-level usage/health,
- permitted administrative commands.

### Plans & Subscriptions
- plan definitions,
- features/limits,
- subscriptions,
- overrides,
- lifecycle.

### SaaS Billing
Separate from Tenant Operational Finance.

### Support Access
Explicit:
reason → target Tenant → duration/scope → audited session → expiry/end.

Never global silent Tenant superuser.

### Platform Analytics
MRR/ARR/bridge/subscriptions/trials/churn/adoption based on canonical SaaS definitions.

### Platform Compliance / Settings
Only where actual platform governance functions exist.

**Priority: P1 after company core workflows; support access/account controls already P0 foundation.**

---

# PART IX — ROLE-CENTRIC PRIORITY WORKFLOWS

## 36. Twenty-role experience map

### PLATFORM_OWNER
**Most important:** platform health → companies → plans/billing → support → governance.

### PLATFORM_ADMIN
**Most important:** Tenant operations → subscription state → support → platform analytics/compliance.

### BILLING_ADMIN
**Most important:** SaaS invoices → subscriptions → billing exceptions → companies.

### SUPPORT_ADMIN
**Most important:** company lookup → audited SupportAccessSession → diagnosis → session closure.

### ANALYTICS_ADMIN
**Most important:** platform KPI definitions → trends → drill-down without Tenant operational overreach.

### COMPLIANCE_ADMIN
**Most important:** platform compliance posture and required governance actions.

### COMPANY_OWNER
**Most important:** today dashboard → bookings/rentals → fleet → finance → team → business settings.

### TENANT_ADMIN
**Most important:** operations → fleet → booking/rental → people → website/team/config.

### MANAGER
**Most important:** attention queue → booking/rental → fleet availability → maintenance/compliance.

### FLEET_MANAGER
**Most important:** Fleet → inspections → maintenance → compliance → owners.

### BOOKING_MANAGER
**Most important:** Leads/quotes → Availability → Customer → Booking → Payment readiness → Handover.

### BOOKING_AGENT
**Most important:** Customer lookup/create → Availability → Quote/Booking → Payment → pickup preparation.

### FINANCE_MANAGER
**Most important:** Payment reconciliation → invoices → ledger → expenses → settlements.

### ACCOUNTANT
**Most important:** payments/invoices → expenses → reconciliation → draft settlement work.

### SALES_AGENT
**Most important:** Leads → Quote → Customer → Booking conversion.

### DRIVER_MANAGER
**Most important:** drivers → assigned Rentals → compliance/readiness → exceptions.

### DRIVER
**Most important:** My Trips → required inspection/action.

### CUSTOMER_SERVICE
**Most important:** Customer → Booking → Rental → payment status visibility → issue resolution.

### VEHICLE_OWNER
**Most important:** My Vehicles → earnings/settlements.

### RENTER
**Most important:** My Bookings → payment/pickup/status → history/profile.

---

# PART X — DESIGN & INTERACTION ARCHITECTURE

## 37. Visual direction

Sage-Auto should remain sleek, dense enough for operators, and calm.

### Core style
- neutral slate/graphite foundations,
- emerald as primary operational accent,
- strong typography hierarchy,
- restrained status color use,
- 12–16px radius cards/controls,
- crisp tables,
- soft borders rather than excessive shadows,
- dark mode may remain but must not compromise readability.

### Page structure

Every operational screen:

**Page title + purpose**
→ **primary action**
→ **attention/KPI strip only when useful**
→ **filters/search**
→ **main work surface**
→ **detail drawer/modal**
→ **audit/history secondary**

### Tables
Use for:
- Bookings,
- Customers,
- Finance,
- Rentals,
- compliance lists,
- operational queues.

Support:
- search,
- filters,
- sorting where useful,
- sticky key columns where needed,
- empty/loading/error states,
- responsive card fallback on small screens.

### Detail views
Use drawer/full detail page when an object has:
- timeline,
- multiple workflows,
- finance,
- audit,
- documents.

Avoid oversized modal chains for complex business processes.

### Forms
- logical sections,
- defaults from existing context,
- inline validation,
- server error next to relevant operation,
- never clear entered data unnecessarily after server failure.

### Status
Use human-readable labels with canonical state underneath.
Do not use color alone.

### Destructive/high-risk actions
- clear language,
- reason where required,
- confirmation,
- audit,
- permission enforcement.

---

## 38. Global states required on every feature

Every screen/action must deliberately support:

- Loading
- Empty
- Success
- Validation error
- Server error
- Permission denied
- Entitlement/Subscription restricted
- Record not found
- Concurrent/version conflict
- Session expired
- Tenant switched
- Network retry
- Partial provider failure where applicable

A blank table or generic “unexpected error” is not a finished state.

---

## 39. Navigation architecture

### Company workspace recommended groups

**Operate**
- Overview
- Bookings
- Availability
- Rentals

**Fleet**
- Fleet
- Inspections
- Maintenance
- Compliance
- Vehicle Owners

**Customers & Sales**
- Customers
- Leads & Quotes
- Drivers where relevant

**Commercial**
- Pricing
- Finance
- Settlements

**Presence**
- Public Website

**Administration**
- Team
- Settings

Navigation remains permission-filtered.

On smaller screens, use collapsible navigation rather than hiding modules.

---

# PART XI — DELIVERY PRIORITY

## 40. Critical workflow graph

The V1 completion order must follow dependency and business value:

**ACCOUNT FOUNDATION**
↓
**FLEET**
↓
**CUSTOMERS / DRIVERS**
↓
**PRICING**
↓
**AVAILABILITY**
↓
**BOOKING**
↓
**PAYMENT READINESS / CONTRACT**
↓
**HANDOVER / INSPECTION**
↓
**RENTAL**
↓
**RETURN / FINAL CALCULATION**
↓
**FINANCE / PAYMENT RECONCILIATION**
↓
**OWNER SETTLEMENTS**

Supporting after the central chain:
- Maintenance
- Compliance
- CRM
- Public Website/CMS
- Personal portals
- Analytics/reporting
- advanced administration/platform refinements.

---

## 41. Recommended execution waves

### Wave 0 — Experience foundation
Already underway:
- account/access foundation,
- workspace selection,
- restoration matrix,
- mutation gates,
- role navigation,
- Tenant isolation.

### Wave 1 — Fleet
Complete Fleet list + Asset Profile + create/edit/status/ownership + server persistence.

### Wave 2 — Customers
Customers + Drivers + Corporate Accounts + eligibility/verification.

### Wave 3 — Pricing & Availability
Make quotation and allocation trustworthy before Booking mutations.

### Wave 4 — Booking
Complete state machine and end-to-end Booking detail.

### Wave 5 — Handover & Rental
Contract/readiness → inspection → key release → active rental.

### Wave 6 — Return & Finance
Return → FinalCalculation → payments/invoice/deposit/ledger.

### Wave 7 — Owner Economics
Owners → agreements → settlements → payout truth.

### Wave 8 — Fleet Continuity
Maintenance + Compliance + damage lifecycle.

### Wave 9 — Demand
CRM + public Website + public Booking refinement.

### Wave 10 — Portals & Intelligence
Renter/Driver/Owner refinement + reporting/analytics.

### Wave 11 — Platform operations refinement
Platform command center, SaaS billing/analytics and governance UX.

---

# PART XII — SCREEN CONTRACT & DEFINITION OF DONE

## 42. Screen contract template

Before implementing/refining any screen, record:

1. Screen name.
2. Primary user/roles.
3. User objective.
4. Entry points.
5. Required visible data.
6. Primary action.
7. Secondary actions.
8. Server endpoint/command for each action.
9. Permission.
10. Entitlement requirement.
11. Business-state prerequisites.
12. Success state.
13. Failure states.
14. Empty state.
15. Loading state.
16. Mobile behavior.
17. Next workflow destination.
18. Audit/event effect.
19. Acceptance tests.
20. Current restoration status.

---

## 43. Feature definition of done

A feature is complete only when:

- the correct user can find it;
- the wrong user cannot access it;
- data shown is authoritative;
- all primary actions are server-backed;
- writes survive reload and re-login;
- failures never display success;
- Tenant switching cannot leak stale state;
- canonical state-machine rules are enforced;
- permissions are enforced server-side;
- Entitlements are separate from RBAC;
- loading/empty/error/restricted states exist;
- desktop and mobile are usable for relevant workflows;
- accessibility basics pass;
- audit/events are emitted where required;
- regression tests exist;
- screen/action connection ledger is updated;
- the next workflow transition works.

---

# PART XIII — PRODUCT TRUTH FOR THE NEXT DEVELOPMENT PHASE

## 44. Immediate product-development rule

Do not implement modules because they appear in the sidebar.

For each wave:

**Blueprint → detailed screen contract → existing UI audit → preserve all useful capability → redesign/refine → connect reads → connect gated mutations → cross-module transition → permission/security tests → mobile/browser acceptance → mark complete.**

The current restored UI is the reference for capability, not the final UX.

---

## 45. Immediate next recommended module

**Fleet**

Why:

- Booking depends on rentable inventory.
- Availability depends on Fleet truth.
- Maintenance/compliance affect Fleet eligibility.
- Vehicle-owner economics attach to Fleet.
- Public discovery ultimately publishes Fleet.

The Fleet completion package should include:

1. Fleet list contract.
2. Register Vehicle flow.
3. Vehicle Asset Profile.
4. lifecycle vs availability controls.
5. ownership linkage.
6. media.
7. maintenance/compliance status.
8. permission matrix.
9. Tenant isolation.
10. server-backed persistence.
11. mobile/responsive refinement.
12. restoration-ledger transition from READ_VERIFIED to fully connected only when mutation gates pass.

---

## 46. Final experience principle

Sage-Auto should feel like one continuous operating story:

> **A customer finds a car → the company can actually supply it → the correct price is quoted → the booking is secured → money is handled truthfully → the vehicle is safely handed over → the rental is monitored → the vehicle is returned and assessed → finance is finalized → the owner/operator is paid correctly → the vehicle becomes ready for its next rental.**

Every page exists to support some part of that story.

If a page does not clearly contribute to an operational, administrative, personal or platform outcome, its purpose must be reconsidered before implementation.
