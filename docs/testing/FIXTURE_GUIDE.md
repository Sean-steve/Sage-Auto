# CAR HIRE OS — SPRINT 39 FIXTURE ARCHITECTURE GUIDE
**Authoritative Guide to Test Fixtures, Synthetic Seed Generators & Isolation**

---

## 1. Fixture Design Principles

1. **Valid-By-Default**: Fixture builders generate schema-compliant, strictly valid aggregates unless explicitly overridden by the test.
2. **Synthetic & Privacy Preserving**: Zero real customer PII or production secrets. Synthetic names, Kenyan phone numbers (`+2547...`), mock national IDs, and deterministic mock UUIDs are used.
3. **Tenant Sandboxing**: Fixtures always require or generate an isolated `tenantId` to ensure no cross-contamination between test runs.
4. **Immutable Clock Alignment**: Fixtures use `FrozenClock` or ISO-8601 timestamps anchored to predictable dates (e.g. `2026-09-16T12:00:00.000Z`).

---

## 2. Core Harness Fixtures (`packages/database/test/harness/fixtures.ts`)

| Builder Function | Default Aggregate Produced | Key Invariants Enforced |
| :--- | :--- | :--- |
| `buildTenantFixture(overrides)` | Active multi-tenant organization | UUID v4 PK, `status: 'ACTIVE'`, `tier: 'ENTERPRISE'` |
| `buildUserFixture(overrides)` | Platform or Tenant user identity | Scrypt-hashed password, verified email |
| `buildVehicleFixture(overrides)` | Fleet digital twin | Valid registration (`KDA-101A`), `AVAILABLE`, `ACTIVE`, `version: 1` |
| `buildCustomerFixture(overrides)` | Fully verified customer | Driving license expiry in future, verified national ID |
| `buildBookingFixture(overrides)` | Confirmed reservation | Non-overlapping half-open date interval `[start, end)` |
| `buildJournalEntryFixture(overrides)` | Balanced double-entry journal | Strict mathematical equality: $\sum \text{Debits} \equiv \sum \text{Credits}$ |

---

## 3. Example Usage in Tests

```typescript
import { buildTenantFixture, buildVehicleFixture } from "./harness";

// Create an isolated tenant and vehicle
const tenant = buildTenantFixture({ name: "Rift Valley Safari Hire" });
const vehicle = buildVehicleFixture({
  tenantId: tenant.id,
  dailyRateKes: 15000,
  make: "Toyota",
  model: "Land Cruiser Prado",
});
```
