import assert from "node:assert/strict";
import { scanClosureIntegrity, type ClosureAuditSnapshot } from "../../../scripts/closure-integrity-audit";

const good: ClosureAuditSnapshot = {
  rentals: [
    { id: "rental-1", tenantId: "tenant-A", state: "COMPLETED",
      bookingId: "booking-1", contractId: "contract-1", vehicleId: "vehicle-1" },
  ],
  bookings: [{ id: "booking-1", tenantId: "tenant-A", status: "COMPLETED" }],
  contracts: [{ id: "contract-1", tenantId: "tenant-A", status: "COMPLETED" }],
  vehicles: [{ id: "vehicle-1", tenantId: "tenant-A", availabilityStatus: "AVAILABLE" }],
  allocations: [{ id: "allocation-1", tenantId: "tenant-A", vehicleId: "vehicle-1",
    sourceType: "BOOKING", sourceId: "booking-1", status: "RELEASED" }],
  calculations: [{ id: "calc-1", rentalId: "rental-1", tenantId: "tenant-A",
    isImmutable: true, depositSettlementStatus: "SETTLED" }],
  returnRecords: [{ id: "return-1", rentalId: "rental-1", tenantId: "tenant-A", status: "COMPLETED" }],
  invoices: [{ id: "invoice-1", tenantId: "tenant-A", rentalId: "rental-1",
    status: "PAID", amountOutstanding: "0.0000" }],
  settlements: [{ id: "settlement-1", tenantId: "tenant-A", status: "PAID" }],
  payables: [{ id: "payable-1", settlementId: "settlement-1", tenantId: "tenant-A", status: "PAID" }],
};

assert.deepEqual(scanClosureIntegrity(good), [], "fully closed rental must be clean");

const corrupted: ClosureAuditSnapshot = structuredClone(good);
corrupted.bookings[0].status = "ACTIVE";
corrupted.contracts[0].status = "SIGNED";
corrupted.vehicles[0].availabilityStatus = "ON_RENT";
corrupted.allocations[0].status = "CONFIRMED";
corrupted.calculations[0].isImmutable = false;
corrupted.returnRecords[0].status = "DEPOSIT_PROCESSING";
corrupted.invoices[0].amountOutstanding = "200.0000";
corrupted.payables[0].status = "PENDING";
const problems = scanClosureIntegrity(corrupted);
const codes = problems.map(p => p.code);
for (const code of [
  "RENTAL_MISSING_SEALED_SETTLEMENT",
  "RENTAL_MISSING_COMPLETED_RETURN_RECORD",
  "RENTAL_BOOKING_NOT_COMPLETED",
  "RENTAL_CONTRACT_NOT_COMPLETED",
  "RENTAL_ALLOCATION_STILL_BLOCKING",
  "COMPLETED_RENTAL_VEHICLE_STILL_ON_RENT",
  "PAID_INVOICE_HAS_OUTSTANDING_BALANCE",
  "PAID_SETTLEMENT_LACKS_PAID_PAYABLE",
]) {
  assert.ok(codes.includes(code), "missing integrity signal: " + code);
}
assert.equal(problems.length, 8);
assert.equal(problems.some(p => p.recordToken === "rental-1"), false,
  "findings must not expose raw internal identifiers");
assert.equal(problems.some(p => p.tenantToken === "tenant-A"), false,
  "findings must not expose raw tenant identifiers");
assert.deepEqual(scanClosureIntegrity(corrupted, "tenant-B"), [],
  "tenant filter must never include other tenant's records");

// A vehicle legitimately dispatched on a subsequent rental is not marked as
// stranded simply because an older completed rental used it.
corrupted.rentals.push({ id: "rental-next", tenantId: "tenant-A",
  state: "ACTIVE_ON_ROAD", vehicleId: "vehicle-1" });
assert.equal(scanClosureIntegrity(corrupted).some(p =>
  p.code === "COMPLETED_RENTAL_VEHICLE_STILL_ON_RENT"), false);

console.log("PASS: read-only closure integrity audit detects mismatches, protects IDs, scopes tenants and avoids redispatch false positives.");
