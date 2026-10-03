# CAR HIRE OS — SPRINT 39 TEST STRATEGY & ARCHITECTURE GOVERNANCE
**Authoritative QA, Verification & Release Integrity Specification**

---

## 1. Testing Philosophy & Core Principles

Car Hire OS is a mission-critical multi-tenant mobility operating system handling real financial transactions, legal hire contracts, vehicle lifecycle state machines, and cross-tenant boundary isolation.

### The Inviolable Testing Laws

1. **Sprint 39 is Not About Adding Features**: The test suite is part of the product. It establishes the baseline truth of system stability.
2. **A Test That Only Verifies a Mock is Not Proof**: Tests exercise actual domain repositories, state machines, encryption primitives, and isolation policies against PostgreSQL and Redis semantics.
3. **Deterministic & Isolated Execution**: Every test runs in isolated tenant sandboxes using zero-external-dependency provider fakes and frozen/deterministic clock controls (`FrozenClock`, `DeterministicIdGenerator`).
4. **Zero Flakiness**: Tests must never rely on arbitrary `setTimeout` delays or external third-party sandbox availability. Provider fakes (`MpesaProviderFake`, `NotificationProviderFake`, `DnsVerificationProviderFake`) run entirely in-process with 100% determinism.
5. **Continuous Verification**: All 28 critical verification checks execute in sub-second time (`< 0.5s`) allowing immediate execution on pre-commit and in CI pipelines.

---

## 2. Test Pyramid & Verification Layers

```
                ▲
               / \
              /E2E\             Cross-Domain Rental Lifecycle & Restricted Mode
             /-----\            (E2E-001 - E2E-003)
            /Financial\         Double-Entry Balance & Settlement Math
           /-----------\        (FIN-001 - FIN-005)
          / Concurrency \       Optimistic Locking & Outbox/Webhook Idempotency
         /---------------\      (CONC-001 - CONC-005)
        /  API Contract   \     HTTP Status Codes, Envelopes & DTO Validation
       /-------------------\    (API-001 - API-005)
      /  Security & Policy  \   RLS Isolation, IDOR, RBAC & Crypto Primitives
     /-----------------------\  (SEC-001 - SEC-010)
```

### Layer 1: Security & Multi-Tenant Isolation (`security-regression.test.ts`)
- **Objective**: Prevent cross-tenant data leakage, enforce default-deny RBAC permissions, verify cryptographic security, and defend against injection/malware vectors.
- **Coverage**:
  - `SEC-001`: PostgreSQL RLS tenant isolation & cross-tenant query rejection.
  - `SEC-002`: IDOR mitigation on sensitive customer identity documents.
  - `SEC-003`: RBAC permission matrix enforcement with default-deny behavior.
  - `SEC-004`: Platform staff vs Tenant staff strict privilege separation.
  - `SEC-005`: Revocable and time-bound `SupportAccessSession` audit trails.
  - `SEC-006`: Cryptographic Scrypt password hashing with unique salt and constant-time verification.
  - `SEC-007`: JWT token signing, expiration checking, and claims tamper rejection.
  - `SEC-008`: CSV and spreadsheet formula injection sanitization (`=`, `+`, `-`, `@`).
  - `SEC-009`: File upload malware scanning with EICAR signature detection.
  - `SEC-010`: SQL injection parameterization immunity.

### Layer 2: API Contract & Error Envelopes (`api-contract-and-validation.test.ts`)
- **Objective**: Guarantee that all API endpoints adhere to strict contract formats and return standardized error envelopes without leaking sensitive infrastructure details.
- **Envelope Standard**:
  ```json
  {
    "error": {
      "code": "STRING_ERROR_CODE",
      "message": "Human readable message",
      "details": {},
      "requestId": "req-uuid",
      "timestamp": "ISO-8601"
    }
  }
  ```
- **Coverage**:
  - `API-001`: Standard error envelope conformance across 4xx and 5xx status codes.
  - `API-002`: Field-level validation failure breakdown with actionable feedback.
  - `API-003`: Direct mapping of database exceptions (`P2002`, `23P01`, `P2025`) to domain HTTP statuses.
  - `API-004`: Unhandled exception sanitization (redacting database credentials, SQL traces, and internal callstacks).
  - `API-005`: Tenant context resolution via `x-tenant-id` headers and tenant subdomains.

### Layer 3: Concurrency, Locking & Idempotency (`concurrency-and-idempotency.test.ts`)
- **Objective**: Defend against race conditions, duplicate charges, double-bookings, and lost updates in high-volume concurrent environments.
- **Coverage**:
  - `CONC-001`: Optimistic locking via `expectedVersion`; concurrent mutations on stale versions throw `ConcurrencyConflictError`.
  - `CONC-002`: Double-booking prevention via PostgreSQL GiST exclusion constraints on vehicle allocation intervals.
  - `CONC-003`: Idempotency key deduplication; repeated requests return cached response payloads without re-executing side effects.
  - `CONC-004`: Transactional Outbox pattern atomic batching, FIFO delivery, and single-consumption guarantees.
  - `CONC-005`: Webhook ingestion deduplication by composite key `(provider, provider_event_id)`.

### Layer 4: Financial Invariants & Ledger (`financial-invariants-and-ledger.test.ts`)
- **Objective**: Guarantee absolute mathematical integrity of all financial operations, general ledger journal entries, and owner payouts.
- **Coverage**:
  - `FIN-001`: Double-entry equality: $\sum \text{Debits} \equiv \sum \text{Credits}$ on every posted journal.
  - `FIN-002`: Posted journal immutability: once posted, journal transactions cannot be altered or deleted.
  - `FIN-003`: Monocurrency enforcement per journal transaction header.
  - `FIN-004`: Vehicle owner settlement waterfall formula: $\text{Gross} - \text{Commission} - \text{Maintenance} - \text{WithholdingTax} = \text{Net Payout}$.
  - `FIN-005`: Security deposit liability ring-fencing and zero-sum conservation upon return/damage deduction.

### Layer 5: End-to-End Cross-Domain Lifecycle (`e2e-cross-domain-lifecycle.test.ts`)
- **Objective**: Validate the full journey across multiple bounded contexts working in concert.
- **Coverage**:
  - `E2E-001`: The Golden Path: Customer Registration $\to$ Vehicle Fleet Selection $\to$ M-Pesa STK Push $\to$ Payment Callback $\to$ Notification SMS $\to$ Handover $\to$ Check-in Return $\to$ Financial Journal Recognition.
  - `E2E-002`: Restricted Mode enforcement: expired/suspended subscriptions block write actions while preserving read access.
  - `E2E-003`: Fleet maintenance scheduling: vehicle moved to `MAINTENANCE` is immediately excluded from booking availability and restored upon sign-off.

---

## 3. Test Harness Architecture

Located in `packages/database/test/harness/`:

| Module | Responsibility |
| :--- | :--- |
| `clock.ts` | `FrozenClock` controlling `Date.now()`, ISO string generation, and frozen time advances. |
| `ids.ts` | Deterministic UUID/ULID generation with fixed prefixes (`bkg-`, `veh-`, `cust-`, `ten-`). |
| `fixtures.ts` | Canonical test fixture builders with compliant default parameters. |
| `fakes.ts` | Zero-dependency provider fakes (`MpesaProviderFake`, `NotificationProviderFake`, etc.). |

---

## 4. Execution & Verification

To run the complete Sprint 39 verification suite:

```bash
# From workspace root:
npm run test:sprint39

# Or from packages/database:
cd packages/database && npm run test:sprint39
```

**Target Benchmark**: 28 verification checks across 5 test suites completing in `< 1.0s` with zero external dependencies.
