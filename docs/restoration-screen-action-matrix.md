# Original interface restoration — screen/action connection matrix

Status meanings:

- **READ_VERIFIED** — server-backed read path verified for the restored company screen.
- **PARTIAL** — some controls are connected but the screen is not fully accepted.
- **UNCONNECTED** — layout/reference is preserved; business values/actions are not authoritative.
- **DISABLED** — action must not submit until the mutation activation gate passes.

| Screen | Read state | Authoritative read/API | Mutation state | Permission basis | Current acceptance note |
|---|---|---|---|---|---|
| Overview | UNCONNECTED | No verified dashboard aggregate | DISABLED | server portal/navigation | Preserve layout only; do not treat prototype totals as business truth |
| Fleet | PARTIAL / RECONSTRUCTED | Fleet REST API + digital twin + linked domain reads | ENABLED FOR VERIFIED FLEET COMMANDS | Fleet/ownership permissions per action | New Fleet experience is server-backed for list, register, edit, status, telemetry, ownership and Fleet documents; Maintenance/Compliance/Inspection execution remains in dedicated modules |
| Bookings | PARTIAL / RECONSTRUCTED | Booking REST API: register/detail/quote/lifecycle/amendment/substitution/readiness | ENABLED FOR VERIFIED BOOKING COMMANDS | Booking permissions per action | Server-backed Booking dossier with PricingSnapshot, Availability confirmation, lifecycle history and Handover readiness |
| Contract & Handover | PARTIAL / RECONSTRUCTED | Contracts + Handovers APIs with Booking, Inspection and Rental-readiness boundaries | ENABLED FOR VERIFIED CONTRACT/HANDOVER COMMANDS | Contract/Rental/Inspection permissions per action | Confirmed Booking → versioned Contract → sequential physical Handover; completed PRE_RENTAL Inspection is a real dependency and Rental start remains separate |
| Handover | PARTIAL / RECONSTRUCTED | Contracts + Handovers REST APIs with Inspection and Rental-readiness boundaries | ENABLED FOR VERIFIED CONTRACT/HANDOVER COMMANDS | Contract/Rental/Inspection permissions per action | Server-backed Contract generation/version/signature and sequential physical Handover checkpoints; Rental start remains separate |
| Customers & Drivers | PARTIAL / RECONSTRUCTED | Customers + Drivers + Corporate Accounts APIs | ENABLED FOR VERIFIED PEOPLE COMMANDS | Customer/Driver permissions per action | Server-backed Customer KYC/status, Driver eligibility/status, Customer↔Driver relationships and Corporate authorized-driver workflows |
| Rentals | UNCONNECTED | Not loaded by restored provider | DISABLED | `rental.read` | Layout only |
| Inspections | UNCONNECTED | Not loaded by restored provider | DISABLED | `inspection.read` | Layout only |
| Maintenance | UNCONNECTED | Not loaded by restored provider | DISABLED | `maintenance.read` | Layout only |
| Compliance | UNCONNECTED | Not loaded by restored provider | DISABLED | `compliance.read` | Layout only |
| Vehicle owners | UNCONNECTED | Not loaded by restored provider | DISABLED | `vehicle_owner.read` | Layout only |
| Finance | UNCONNECTED | Not loaded by restored provider | DISABLED | `invoice.read` | No prototype/local financial total is authoritative |
| Settlements | UNCONNECTED | Not loaded by restored provider | DISABLED | `settlement.read` | Layout only |
| Pricing | PARTIAL / RECONSTRUCTED | Pricing REST API: plans, matrices, assignments, rules, fees, promos, `/pricing/calculate` | ENABLED FOR VERIFIED PRICING COMMANDS | Pricing permissions per action | Server-backed Pricing workspace; legacy in-browser quote calculation is no longer reachable |
| Availability | PARTIAL / RECONSTRUCTED | Availability APIs: check/search/allocations/holds/blocks/calendar | ENABLED FOR VERIFIED AVAILABILITY COMMANDS | Availability/allocation/block permissions per action | Server-backed Dispatch experience with candidate search, holds, allocations, blocks, calendar and substitution |
| Public website settings | UNCONNECTED | Not loaded by restored provider | DISABLED | server portal/navigation | Layout only |
| Company settings | UNCONNECTED | Not loaded by restored provider | DISABLED | server portal/navigation | Layout only |
| Team & invitations | CONNECTED FOUNDATION | `/api/v1/access/team`, `/access/invitations` | ENABLED FOUNDATION | server access service | New account foundation, not legacy screen mutation |
| Platform support access | CONNECTED FOUNDATION | `/api/v1/platform/support/sessions` | ENABLED FOUNDATION | `platform.support.access` | Explicit, time-limited, read-only and audited |
| Platform control plane | PARTIAL FOUNDATION | server access/platform APIs | LEGACY VIEW QUARANTINED | platform permissions | Do not re-enable prototype `SaaSControlPlaneView` mutations without action-level verification |
| Driver — My trips | CONNECTED FOUNDATION | `GET /api/v1/access/records` | read-only | linked Driver record | Must return only linked driver records |
| Driver — My inspections | CONNECTED FOUNDATION | `GET /api/v1/access/records` | read-only | linked Driver record | Must return only linked inspections |
| Vehicle Owner — My vehicles | CONNECTED FOUNDATION | `GET /api/v1/access/records` | read-only | linked Vehicle Owner | Must return only linked owner vehicles |
| Vehicle Owner — My settlements | foundation navigation only | server-scoped section | read-only/unavailable until data connection | linked Vehicle Owner | No broad company loader |
| Renter — My bookings | CONNECTED FOUNDATION | `GET /api/v1/access/records` + claim endpoint | claim only | verified renter ownership | Guest claim must match verified email/company |
| Renter — My profile | foundation navigation only | server account context | read-only/unavailable until data connection | self | No broad company loader |

## Action-level rule

Every button/form inside an unreconstructed legacy screen inherits **DISABLED** until explicit action evidence exists. Fleet, Customers/Drivers, Pricing, Availability, Bookings and Contract/Handover are no longer served by their legacy/local placeholder screens in the restored company workspace; their reachable actions are governed by their experience contracts and targeted regression tests. Enabling an entire legacy screen because one read endpoint works remains prohibited.

## Restoration acceptance evidence required per writable action

Record: screen, action, permission, endpoint/command, request/response contract, persistence proof, negative authorization proof, company-isolation proof, error-state proof, retry/concurrency proof where relevant, test file/test name, and date/commit.
