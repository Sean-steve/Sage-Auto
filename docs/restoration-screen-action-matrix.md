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
| Bookings | READ_VERIFIED | `GET /api/v1/bookings` | DISABLED | `booking.read` | Saved bookings display; original workflow mutations remain quarantined |
| Customers | READ_VERIFIED | `GET /api/v1/customers` | DISABLED | `customer.read` | Saved customers display; original mutations remain quarantined |
| Rentals | UNCONNECTED | Not loaded by restored provider | DISABLED | `rental.read` | Layout only |
| Inspections | UNCONNECTED | Not loaded by restored provider | DISABLED | `inspection.read` | Layout only |
| Maintenance | UNCONNECTED | Not loaded by restored provider | DISABLED | `maintenance.read` | Layout only |
| Compliance | UNCONNECTED | Not loaded by restored provider | DISABLED | `compliance.read` | Layout only |
| Vehicle owners | UNCONNECTED | Not loaded by restored provider | DISABLED | `vehicle_owner.read` | Layout only |
| Finance | UNCONNECTED | Not loaded by restored provider | DISABLED | `invoice.read` | No prototype/local financial total is authoritative |
| Settlements | UNCONNECTED | Not loaded by restored provider | DISABLED | `settlement.read` | Layout only |
| Pricing | UNCONNECTED | Not loaded by restored provider | DISABLED | `pricing.read` | Prototype/local quote calculations are not authoritative |
| Availability | UNCONNECTED | Not loaded by restored provider | DISABLED | `vehicle.read` | Layout only |
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

Every button/form inside a restored legacy screen inherits **DISABLED** until an explicit row/evidence entry is added for that action. Enabling an entire screen because one read endpoint works is prohibited.

## Restoration acceptance evidence required per writable action

Record: screen, action, permission, endpoint/command, request/response contract, persistence proof, negative authorization proof, company-isolation proof, error-state proof, retry/concurrency proof where relevant, test file/test name, and date/commit.
