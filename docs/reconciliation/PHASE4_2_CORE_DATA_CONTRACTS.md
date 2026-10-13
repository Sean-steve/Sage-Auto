# Phase 4.2 — Screen → Component → Client → API → Data Contract Map

**Status:** Source-traced contracts for the core rental spine; not a claim that V2 invokes these APIs. Completed 14 October 2026 on `feat/phase4-2-contracts-ci-repair`, relative to V2 baseline `8e7dd81`. Full route-level 251-method API client inventory is in [PHASE4_2_FRONTEND_API_CLIENT_CONTRACTS.csv](PHASE4_2_FRONTEND_API_CLIENT_CONTRACTS.csv).

## Governing integration invariant

V2 `app.js`, `rental-core.js` and `rental-journey.js` maintain example booking, company, rental, ledger and payout objects via browser state. These must become **presentational references**. The original React `src/App.tsx`, `src/lib/api-client.ts`, `src/lib/store.tsx`, `apps/api/src/app.module.ts` and registered domain modules are the destination runtime. All new V2 interactions become React components/use cases calling the authoritative API. Nothing should replicate price, possession, finance or payout status in localStorage.

### Authoritative core journey — concrete route declarations

| Boundary | V2 reference | Original React component | Canonical REST routes (prefix `/api/v1`) | Data / invariant | Required negative case |
|---|---|---|---|---|---|
| Tenant authentication | V2 marketing signup/onboarding | `AuthModal.tsx`, `AccessApp.tsx` | `POST /auth/register`, `/login`, `/verify-email`, `/refresh`, `/forgot-password`, `/reset-password` | Identity session, tenant membership, permission grant; no demo OTP | Unverified/expired token; forbidden tenancy; no guessed verification |
| Fleet and owners | V2 Fleet / asset profile / vehicle owners | `FleetExperienceView.tsx`, `VehicleOwnersView.tsx`, `NewVehicleModal.tsx` | `/fleet`, `/vehicle-owners` routers | Union of original asset, lifecycle, owner, category, financial term fields; media/data lineage preserved | Wrong tenant or unfit vehicle denied |
| Customer and driver | V2 customer and driver workspaces | `CustomersDriversExperienceView.tsx`, `CustomersView.tsx` | `/customers`, `/drivers` routers | Customer/driver records and eligibility separate from a booking's user-facing display | Missing consent / unverified driver |
| Pricing | V2 Pricing Centre and quote lab | `PricingExperienceView.tsx` | `/pricing` router, `POST /bookings/quote` | Rate plan version, category alias, duration, promotion, tax, deposit, frozen snapshot | Published rate with effective-date validation and authoritative value |
| Availability | V2 fleet/date board and alternatives | `AvailabilityExperienceView.tsx` | `POST /availability/check`, `/search`, `GET /allocations`, `POST /allocations`, `GET/POST /holds`, `GET /calendar/:vehicleId` | Tenant, vehicle, time interval, hold TTL, reservation conflict state | Concurrent same-vehicle booking and expired hold |
| Booking / amendment | V2 Bookings and Booking changes | `BookingExperienceView.tsx`, `BookingsView.tsx`, `BookingDetailsModal.tsx` | `POST /bookings`, `/quote`, `/:id/confirm`, `/:id/cancel`, `/:id/amend-dates`, `/:id/request-payment` | Original and proposed terms, actor, immutable quote snapshot, associated allocation | Invalid state, repricing divergence, duplicate confirmation |
| Branded checkout | V2 brand site checkout and enquiry | `PublicBookingExperience.tsx`, `TenantPublicSite.tsx` | `/public/booking` router | Host identifies tenant; enquiry vs booking vs payment intent clearly separated | Wrong domain, expired quote, unverified payment |
| Contract/handover | V2 Contracts & handover / checklist | `ContractHandoverExperienceView.tsx` | `POST /handovers/schedule`, `/:id/arrive`, `/:id/verify-documents`, `/:id/inspection`, `/:id/confirm-signature`, `/:id/handover-keys`, `/:id/complete` | Identity, signed agreement, inspection evidence, readiness and keys/possession | Missing checklist element/defect/signature blocks handover |
| Rental possession | V2 Rentals and renter portal | `RentalsView.tsx`, `RenterAccount.tsx` | `GET /rentals/readiness/:bookingId`, `POST /rentals/start`, `GET /rentals/:id`, `GET /rentals` | Real rental only after handover; scope renter to their booking | Customer can't see other tenant/renter |
| Extensions/incidents | V2 renter requests and assistance | `RentalsView.tsx` and renter portal | `POST /rentals/:id/extensions`, `/:id/extensions/:extensionId/approve`, `/reject`, `POST /rentals/:id/incidents` | Fresh availability/repricing and notices; incident audit | Race with next booking; unauthorized extension |
| Return & final calc | V2 Returns & charges | `ReturnFinalCalculationView.tsx` | `POST /rentals/:id/receive`, `/:id/return-inspection`, `/:id/calculate-final`, `/:id/deposit-settlement`, `/:id/complete` | Distinguish physical possession, sealed final calculation, deposit disposition and completed state | Missing disposition must not mutate state; immutable replay read-only |
| Finance/invoice | V2 Finance & payments / refunds | `FinanceView.tsx` | `GET /finance/invoices`, `POST /finance/invoices/generate-from-rental`, `/:id/issue`, `GET /finance/deposits`, `GET /finance/refunds`, `POST /finance/refunds`, `/:id/approve` | Financial invoice only after final rental; ledger and refund liabilities; Stripe/M-Pesa provider events | Never post invoice for ACTIVE_ON_ROAD; no duplicate PSP reference |
| Owner settlement | V2 Owner settlements + owner portal | `SettlementsView.tsx`, `VehicleOwnersView.tsx` | `GET/POST /owner-settlements/periods`, `/batches`, `/calculate`, `/:id/approve`, `/:id/payout`, `/mine`, `/mine/:id/statement` | Owner share from verified settled revenue, approved settlement, payable, transfer confirmation | Unapproved/orphan payable must not execute; approver cannot execute own payout |
| Notifications/realtime | V2 cross-role status banners | Existing notification orchestration and outbox/worker | `/notifications` plus domain events | Event actor/tenant/idempotency, retry delivery; no fake notifications | Outbox retry; no cross-role leakage |

### Data contract comparison rules for every row

For each UI operation, the final contract ledger must additionally capture:
- Original TSX form fields **and** all V2 fields; union retained. Optional does not mean discardable.
- Client request method/URL and DTO schema from `packages/types`/`packages/validation`.
- Handler authorization (`TENANT_PERMISSIONS`, platform role, tenant context, branch).
- Service and repository owners; event and ledger posting if any.
- Synchronous response state, reload behavior and projected cross-portal state.
- User-facing error/empty/loading/denied/conflict paths, keyboard and responsive acceptance.
- File/link options: actual uploaded binary + scanned metadata versus externally referenced document (distinguished).

### Identified incompatibilities that must remain visible

**Different architecture:** V2 DOM-based action dispatcher cannot be imported as an authoritative data layer into React. Wrap visual components; build typed adapters.

**Date/rate category:** Historic plan lines use category codes (e.g. `SUV`) while some pricing requests normalize to canonical category IDs. Both must resolve the *same published, effective* rate plan, or the result falls back to incorrect deposit/discount behavior. Proposed fix is under review in PR #17.

**Financial truth:** V2 displays simulated receipts and payout stages; these must map to the real payments, double-entry ledger, settled revenue and owner-payable state machines. A "demo paid" action must not call a real payout endpoint.

**Data model compatibility:** Original `src/lib/store.tsx` contains local fallback/demo state alongside remote client methods, so API existence alone is insufficient. Trace actual React screen actions and remove false persisted-success pathways only when canonical endpoints and offline behavior are proved.

**Support/role gating:** Original API mounts most tenant domains behind auth/tenant guards in `apps/api/src/app.module.ts`; the V2 portal switcher never substitutes for those guards.

**Design preservation:** Make V2's unique workboard, customer state timeline, availability calendar, booking amendment compare, return review, finance reconciliation and owner share presentation into responsive React modules. Do not hide original-only controls merely because V2 lacks a corresponding view.

## Traceability and next pass
- [215 screen candidate matrix](PHASE4_1_215_SCREEN_DUAL_REPO_MATRIX.csv): one row per design contract (heuristic initial mapping).
- [22 cross-role journeys](PHASE4_1_22_JOURNEY_BINDINGS.csv): business outcome and backend candidate per journey.
- [251 API client method candidates](PHASE4_2_FRONTEND_API_CLIENT_CONTRACTS.csv): named original client methods with provisional route information, **not certified route matches**.
- Next validation: enumerate controllers and schemas exhaustively, rerun real HTTP contract and tenant authorization tests, then upgrade evidence confidence from inferred to verified. No UI migration until those checks succeed.
