# CAR HIRE OS — SPRINT 31 PRE-IMPLEMENTATION ASSESSMENT
## PUBLIC VEHICLE DISCOVERY, LIVE AVAILABILITY, PUBLIC PRICING, GUEST BOOKING, CHECKOUT & PAYMENT HANDOFF

**Document Identifier:** DOC-SPRINT-31-ASSESSMENT  
**Status:** READY FOR IMPLEMENTATION  
**Author:** Principal Platform Architect & Antigravity Engineering  
**Governing Architecture Standards:** ARCH-001, SEC-001, TEN-001, DEV-001, DEV-004, DEV-006, DEV-007, DEV-008, DEV-009, BRS-001, ADR-001, ADR-009  

---

### EXECUTIVE SUMMARY

Sprint 31 delivers the direct-to-consumer commercial engine of Car Hire OS. Building directly upon the foundation of:
- Fleet Digital Twins & Vehicle Media (Sprints 9 & 28),
- Rate Engines & Authoritative Quotations (Sprint 11),
- Concurrency-Safe Fleet Availability & Allocations (Sprint 12),
- Reservation Lifecycle & State Machines (Sprint 13),
- Provider-Agnostic Payments, M-Pesa & Card Execution (Sprint 22),
- Tenant Website CMS & Branding (Sprint 29), and
- Authoritative Host Resolution & Custom Domains (Sprint 30),

Sprint 31 activates the public booking journey. It empowers guests and retail renters to discover vehicles on any tenant's branded website, search real-time fleet availability, receive binding cryptographic pricing quotes, complete guest registration, and execute checkout with instant M-Pesa STK push or Card payment handoff.

In strict compliance with Car Hire OS architectural principles, Sprint 31 introduces **NO parallel booking engines**, **NO duplicated database tables**, and **NO bypassed business invariants**. The new `PublicBookingModule` functions as an orchestration facade over our battle-tested domain aggregates.

---

### 1. GOVERNING SPECIFICATIONS & ARCHITECTURAL STANDARDS

The design and implementation of Sprint 31 are governed by:
- **ARCH-001 (Modular Monolith & Canonical Repository Structure):** `PublicBookingModule` resides in `apps/api/src/modules/public-booking/` and orchestrates existing production bounded contexts: `Fleet`, `Availability`, `Pricing`, `Customers`, `Bookings`, and `Payments`.
- **TEN-001 (Multi-Tenancy & Host Resolution):** Zero trust in client-supplied tenant headers or route parameters. All public endpoints determine `tenantId` exclusively via the authoritative `HostResolutionService` (`Host → Domain → Website → Tenant`).
- **SEC-001 (Zero-Trust Security & Public Ingress):** Unauthenticated public endpoints are strictly sandboxed, rate-limited, and hardened against parameter tampering, vehicle data exfiltration, price manipulation, and replay attacks.
- **DEV-006 & DEV-007 (Pricing, Availability & Concurrency Standards):** The client never computes price; only server-generated `PricingSnapshot` records are accepted. Availability search is strictly non-blocking and non-allocating.
- **DEV-008 (§34-38 - Public Storefront Integration):** The shared public-web engine renders catalog, search, and checkout seamlessly across all tenant subdomains and custom domains.
- **DEV-009 & DATA-002 (Authoritative Server-Side Payment Verification):** Client-side payment callbacks are completely untrusted; booking confirmation requires server-to-server webhook verification or direct provider polling.

---

### 2. BUSINESS PURPOSE & OPERATIONAL VALUE

Public direct booking is the commercial lifeblood of modern car rental operators. Sprint 31 provides:
1. **Direct Revenue Generation:** Eliminates dependency on expensive third-party OTAs by enabling instant, commission-free direct online bookings.
2. **Frictionless Guest Experience:** Renters search real-time availability and complete checkout in under 2 minutes with automated M-Pesa STK push or credit card payment.
3. **Elimination of Double-Bookings:** Concurrency-safe allocations ensure that the moment a guest confirms a reservation, inventory is authoritatively locked across all channels (public website, operations desk, corporate portal).
4. **Authoritative Revenue Protection:** Dynamic pricing rules, seasonal surcharges, distance allowances, ancillary options, and security deposits are applied deterministically on the server.

---

### 3. DOMAIN BOUNDARIES & AGGREGATE ROOTS

`PublicBookingModule` operates purely as an **Application Orchestration Facade** and does NOT define duplicate aggregates. It interfaces with:
1. **`Vehicle` & `VehicleMedia` Aggregates (`Fleet` / `Media`):** Discovers operational, public-facing fleet assets and sanitizes operational telemetry.
2. **`VehicleAllocation` & `VehicleBlock` Aggregates (`Availability`):** Evaluates real-time candidate availability without writing locks during search.
3. **`RatePlan` & `PricingRule` Aggregates (`Pricing`):** Produces binding server-calculated quotes and immutable `PricingSnapshot` entities.
4. **`Customer` Aggregate (`Customers`):** Resolves returning renters or provisions verified guest customer profiles.
5. **`Booking` Aggregate (`Bookings`):** Orchestrates reservation creation, allocation locking, state transitions, and audit/outbox events.
6. **`PaymentAttempt` & `Payment` Aggregates (`Payments`):** Orchestrates M-Pesa STK push / Stripe checkout session initiation and verifies provider settlement.

---

### 4. CRITICAL INVARIANT 1: PUBLIC BOOKING MUST USE EXISTING PRODUCTION DOMAINS

- **Strict Prohibition:** Creating duplicate "public bookings", shadow database tables, or simplified mock reservation entities is strictly forbidden.
- **Enforcement:** Every reservation created through the public storefront is an authoritative `Booking` aggregate persisted in `BookingRepository`. It immediately reflects on the operator's fleet calendar, operations dispatch desk, and audit logs.

---

### 5. CRITICAL INVARIANT 2: PUBLIC WEBSITE CONTEXT IS SERVER-RESOLVED

- **Strict Prohibition:** Trusting `req.body.tenantId`, `req.query.tenantId`, or `req.headers["x-tenant-id"]` from public callers is strictly prohibited.
- **Enforcement:**
  ```
  Incoming Request Host ──► HostResolver ──► PublicWebsiteContext (TenantId)
  ```
  The resolved `tenantId` is injected into the execution context. Any attempt by a client to query or book vehicles across tenants is rejected at the ingress pipeline.

---

### 6. CRITICAL INVARIANT 3: SEARCH AVAILABILITY IS NOT A RESERVATION

- **Rule:** Searching availability does NOT lock, block, or hold vehicles.
- **Enforcement:**
  - `GET /api/v1/public/booking/availability` is a pure read query against `VehicleAllocationRepository` and `VehicleBlockRepository`.
  - It returns candidate vehicles that meet the requested time interval and turnaround buffer.
  - No database mutations or locks occur until the guest submits the checkout action.

---

### 7. CRITICAL INVARIANT 4: THE CLIENT NEVER CALCULATES AUTHORITATIVE PRICE

- **Strict Prohibition:** The frontend or API caller cannot dictate rates, line items, taxes, discounts, or total amounts.
- **Enforcement:**
  - The client submits vehicle ID, dates, promo code, and requested add-ons.
  - The server invokes `PricingService.calculatePrice(tenantId, request)`, evaluating effective rate plans, duration tiers, seasonal rules, and VAT.
  - The resulting `PricingSnapshot` is attached directly to the created `Booking`. Any client-supplied price is disregarded.

---

### 8. CRITICAL INVARIANT 5: PAYMENT SUCCESS IS SERVER-VERIFIED

- **Strict Prohibition:** A client cannot assert "payment succeeded" or transition a booking to `CONFIRMED` via client payload.
- **Enforcement:**
  - Payment initiation produces a `PaymentAttempt` record.
  - Confirmation is strictly gated on `PaymentService.verifyPaymentAttempt`, which queries the upstream provider (Safaricom Daraja API or Stripe) or processes a signed cryptographic webhook.
  - Only when the provider confirms settlement is the `Payment` recorded and the `Booking` confirmed.

---

### 9. CRITICAL INVARIANT 6: PUBLIC BOOKING MUST BE CONCURRENCY-SAFE

- **Rule:** High-volume concurrent checkout attempts for the same vehicle over overlapping dates must never produce a double-booking.
- **Enforcement:**
  - When creating the booking allocation, `BookingService` verifies no overlapping allocation exists within the critical transaction window.
  - If a race condition occurs, the losing request fails with `BookingAvailabilityConflictError` (HTTP 409 Conflict), preventing state corruption.

---

### 10. CRITICAL INVARIANT 7: SPRINT SCOPE DISCIPLINE

- **Included in Sprint 31:**
  - Public vehicle discovery & sanitized catalog.
  - Live availability search with turnaround buffer.
  - Authoritative public pricing calculation & quote generation.
  - Guest customer resolution & booking creation.
  - M-Pesa STK push & Card checkout payment handoff.
  - Server-side payment verification & booking confirmation.
- **Explicitly Deferred:**
  - Customer email & SMS delivery (Sprint 32: Notifications & Communications).
  - Marketing leads & CRM funnels (Sprint 33: CRM & Marketing).
  - Conversion analytics & funnel tracking (Sprint 34: Public Web Analytics).

---

### 11. PUBLIC VEHICLE DISCOVERY & DATA PRIVACY SANITIZATION

Public renters only see catalog data that is safe for public presentation:
- **Exposed Fields:** `id`, `make`, `model`, `year`, `category`, `transmission`, `fuelType`, `seatingCapacity`, `luggageCapacity`, `features`, `dailyRate`, `currency`, `images`.
- **Sanitized / Stripped Fields:**
  - GPS tracker device serials and real-time coordinates.
  - Vehicle ownership structures, owner names, revenue share splits.
  - Acquisition costs, purchase invoices, depreciation schedules.
  - Internal fleet maintenance logs and mechanical defect notes.
  - Operational flags and internal backoffice annotations.

---

### 12. LIVE AVAILABILITY SEARCH ENGINE & TURNAROUND BUFFER

- **Search Query Parameters:**
  - `pickupDateTime`: ISO string.
  - `returnDateTime`: ISO string.
  - `vehicleCategoryId`: Optional category filter.
  - `features`: Optional feature requirements (e.g. `["AWD", "GPS", "Child Seat"]`).
- **Turnaround Buffer Logic:**
  - Respects tenant configuration (default 60 minutes) to allow vehicle cleaning, inspection, and fueling between consecutive rentals.
  - `effectivePickup = pickupDateTime - buffer`
  - `effectiveReturn = returnDateTime + buffer`
- **Output:** List of available candidate vehicles with real-time base rates.

---

### 13. AUTHORITATIVE PUBLIC PRICING QUOTATION ENGINE

`POST /api/v1/public/booking/quote` executes:
1. Resolves tenant currency and tax settings (e.g., KES, 16% VAT).
2. Evaluates active `RatePlan` for the target vehicle or category.
3. Computes duration tiers (e.g. 1-3 days vs 4-7 days vs weekly/monthly discounts).
4. Evaluates seasonal rules and demand multipliers.
5. Validates and applies promo code discounts (percentage or fixed amount).
6. Computes mandatory refundable security deposit requirement.
7. Produces immutable `PricingSnapshot` including itemized breakdown:
   - Base Rental Amount
   - Duration Discount
   - Promo Discount
   - Ancillary Fees
   - VAT / Tax Amount
   - Refundable Security Deposit
   - Gross Total Payable Now

---

### 14. GUEST CUSTOMER RESOLUTION & LIFECYCLE ORCHESTRATION

Public renters book without pre-existing accounts:
1. Guest provides: `fullName`, `email`, `phone`, `idOrPassportNumber`, and `licenseNumber`.
2. Ingress validator verifies phone formatting (`E.164` or Kenyan local format) and non-empty identity fields.
3. System queries `CustomerRepository` by `idOrPassportNumber` or `email` within `tenantId`.
4. If found:
   - Validates that customer status is not `BLOCKED`.
   - Reuses existing `customer.id` and updates contact information if modified.
5. If not found:
   - Provisions new `Customer` aggregate with status `ACTIVE` and `customerType: "INDIVIDUAL"`.

---

### 15. CONCURRENCY-SAFE BOOKING CREATION PIPELINE

When the guest submits checkout:
1. Re-validates vehicle availability for the exact time window.
2. Generates fresh, binding `PricingSnapshot`.
3. Creates `Booking` aggregate:
   - `bookingSource: "PUBLIC_WEBSITE"`
   - `status: "PENDING_CONFIRMATION"`
   - `pricingSnapshot: snapshot`
4. Reserves `VehicleAllocation` with `allocationType: "RESERVATION"`.
5. Emits `booking.created` domain event to transactional outbox.

---

### 16. MULTI-CHANNEL PAYMENT HANDOFF: M-PESA STK PUSH

For African / Kenyan commercial deployments:
1. Guest selects M-Pesa and provides mobile number (e.g., `254712345678`).
2. Server calls `PaymentService.initiatePaymentAttempt`:
   - `provider: "MPESA_DARAYA"`
   - `purpose: "BOOKING_PAYMENT"`
   - `amount: booking.totalAmount`
   - `targetId: booking.id`
3. Daraja STK Push triggers on guest's mobile handset.
4. Returning response includes `attemptId` and `status: "INITIATED"`.
5. Frontend polls `GET /api/v1/public/booking/payment-status/:attemptId` until Safaricom callback completes.

---

### 17. MULTI-CHANNEL PAYMENT HANDOFF: CARD CHECKOUT (STRIPE)

For international renters:
1. Guest selects Card payment.
2. Server calls `PaymentService.initiatePaymentAttempt`:
   - `provider: "STRIPE_CHECKOUT"`
   - `purpose: "BOOKING_PAYMENT"`
   - `amount: booking.totalAmount`
   - `targetId: booking.id`
3. Provider initializes Stripe Checkout session and returns `checkoutUrl`.
4. Guest is redirected to secure Stripe checkout, returning to `/booking/success?attemptId=...`.

---

### 18. AUTHORITATIVE PAYMENT VERIFICATION & BOOKING CONFIRMATION

When payment verification completes:
1. Provider webhook or polling initiates `PaymentService.verifyPaymentAttempt`.
2. Verified `Payment` record is created and linked to `Booking`.
3. `Booking` transitions atomically from `PENDING_CONFIRMATION` to `CONFIRMED`.
4. Allocation status transitions to `CONFIRMED`.
5. Emits `booking.confirmed` and `payment.received` canonical events.

---

### 19. IDEMPOTENCY & REPLAY ATTACK DEFENSE

- Every checkout submission accepts an optional or auto-generated `idempotencyKey` (UUIDv4).
- Stored in `IdempotencyRepository` scoped to `tenantId`.
- Duplicate network retries return the original booking response without duplicate allocations or charges.

---

### 20. SECURITY ARCHITECTURE & ATTACK SURFACE MITIGATION

| Vulnerability | Mitigation Mechanism |
|---|---|
| Host Header Poisoning | Validated strictly via `HostResolutionService` trusted proxy lookup |
| Price Tampering | Client price submissions ignored; 100% computed via `PricingService` |
| Double-Booking Race Condition | Transactional allocation check & optimistic concurrency control |
| Falsified Payment Evidence | Client receipts rejected; 100% verified server-to-server with provider |
| Telemetry / PII Leakage | Telemetry & owner details stripped at public repository boundary |
| STK Push Abuse / Denial of Service | Ingress rate-limited per IP and per phone number |

---

### 21. DEDICATED PUBLIC BOOKING MODULE ARCHITECTURE

Located at `/apps/api/src/modules/public-booking/`:
```
apps/api/src/modules/public-booking/
├── public-booking.module.ts
├── application/
│   ├── public-booking.service.ts
│   └── dto/
│       ├── public-vehicle-query.dto.ts
│       ├── public-availability-query.dto.ts
│       ├── public-quote-request.dto.ts
│       ├── public-checkout-request.dto.ts
│       └── public-payment-initiation.dto.ts
├── domain/
│   └── public-booking.errors.ts
└── presentation/
    └── public-booking.controller.ts
```

---

### 22. REST API ENDPOINTS & HTTP CONTRACTS

All endpoints are mounted under `/api/v1/public/booking`:
1. `GET /vehicles`: Returns public catalogue with categories, rates, and media.
2. `GET /vehicles/:id`: Returns sanitized single vehicle details.
3. `GET /availability`: Searches live fleet availability for a date range.
4. `POST /quote`: Generates authoritative pricing snapshot.
5. `POST /checkout`: Submits guest checkout, resolves customer, creates booking & initiates payment.
6. `GET /status/:bookingId`: Retrieves public booking voucher and confirmation state.
7. `GET /payment-status/:attemptId`: Polls server-verified payment attempt status.

---

### 23. CROSS-DOMAIN SERVICE INTEGRATION MATRIX

| Domain Context | Interfacing Service / Repository | Responsibility in Public Booking |
|---|---|---|
| `Domains` | `HostResolutionService` | Authoritative tenant context extraction from Host |
| `Fleet` | `VehicleRepository`, `VehicleCategoryRepository` | Public catalog & operable vehicle filtering |
| `Availability` | `AvailabilityService`, `VehicleAllocationRepository` | Availability search & allocation conflict checks |
| `Pricing` | `PricingService`, `RatePlanRepository` | Authoritative price computation & snapshot generation |
| `Customers` | `CustomerRepository` | Guest lookup, deduplication, and auto-registration |
| `Bookings` | `BookingService`, `BookingRepository` | Booking aggregate creation & lifecycle management |
| `Payments` | `PaymentService`, `PaymentAttemptRepository` | M-Pesa & Card handoff, server verification |
| `Outbox / Audit` | `OutboxRepository`, `AuditRepository` | Event publishing & compliance trail |

---

### 24. TEST SUITE ARCHITECTURE & VERIFICATION STRATEGY

A dedicated end-to-end integration test suite will be created at:
`/packages/database/test/public-booking-and-checkout.test.ts`

- **Execution Command:** `"test:public-booking": "tsx packages/database/test/public-booking-and-checkout.test.ts"`
- **Assertion Matrix (12 Test Scenarios):**
  1. Authoritative host resolution binds public request to tenant context.
  2. Public catalog sanitizes private telemetry, GPS, and owner revenue fields.
  3. Live availability search returns operable candidate vehicles; does not lock inventory.
  4. Turnaround buffer prevents back-to-back bookings with insufficient cleaning time.
  5. Authoritative pricing calculation applies duration tiers, promos, and taxes correctly.
  6. Client price tampering is completely ignored by server quote calculation.
  7. Guest customer is created or matched without duplicate identity collisions.
  8. Concurrent bookings for the same vehicle over overlapping dates reject the second request.
  9. M-Pesa STK push initiation produces valid pending payment attempt.
  10. Client cannot fake payment success; server-side verification required.
  11. Authoritative payment verification automatically transitions booking to `CONFIRMED`.
  12. Cross-tenant isolation prevents tenant A public storefront from booking tenant B fleet.

---

### 25. SCOPE DISCIPLINE & SPRINT 32 BOUNDARY

- **Explicitly in Scope (Sprint 31):**
  - Public vehicle discovery, availability search, pricing quote, guest booking, and checkout payment handoff.
- **Explicitly Deferred to Sprint 32:**
  - Automated transactional customer email notifications & booking voucher PDFs.
  - SMS confirmations via Africa's Talking / Twilio.
  - Driver reminders and check-in links.

---

**End of Pre-Implementation Assessment — Ready for Implementation**
