import assert from "node:assert";
import { SettlementCalculationEngine } from "../../../apps/api/src/modules/owner-settlements/domain/settlement-calculation-engine";

console.log("----------------------------------------------------------------------");
console.log("OWNER SETTLEMENT BLUEPRINT — FINANCIAL LINEAGE & HISTORICAL TERMS");
console.log("----------------------------------------------------------------------");

const owner: any = {
  id: "owner-1",
  tenantId: "tenant-1",
  name: "Owner One",
  email: "owner@example.com",
  phone: "+254700000001",
  status: "ACTIVE",
};

const ownership: any = {
  id: "ownership-1",
  tenantId: "tenant-1",
  vehicleId: "vehicle-1",
  ownerId: owner.id,
  ownershipType: "THIRD_PARTY_OWNED",
  startDate: "2026-01-01",
  revenueSharePercent: 70,
  allowableExpenseDeductions: true,
  termsSnapshot: "70/30 owner/operator agreement",
  isActive: true,
  version: 3,
  createdAt: "2026-01-01T00:00:00Z",
};

const vehicle: any = {
  id: "vehicle-1",
  tenantId: "tenant-1",
  registrationPlate: "KDA 001A",
  make: "Toyota",
  model: "Axio",
};

const rental: any = {
  id: "rental-1",
  tenantId: "tenant-1",
  rentalNumber: "RNT-2026-00001",
  bookingId: "booking-1",
  vehicleId: vehicle.id,
  customerId: "customer-1",
  state: "COMPLETED",
  scheduledStart: "2026-09-05T08:00:00Z",
  scheduledEnd: "2026-09-08T08:00:00Z",
  actualStart: "2026-09-05T08:00:00Z",
  actualEnd: "2026-09-08T09:00:00Z",
  checkoutOdometer: 10000,
  checkoutFuelLevel: 100,
  extensions: [],
  incidents: [],
  finalExcessKmCharge: 0,
  finalFuelDeficitCharge: 0,
  finalDamageCharge: 0,
  finalLateReturnFee: 0,
  depositRefundedAmount: 0,
  completedAt: "2026-09-08T10:00:00Z",
  createdAt: "2026-09-05T08:00:00Z",
  updatedAt: "2026-09-08T10:00:00Z",
};

const financeFact: any = {
  rentalId: rental.id,
  vehicleId: vehicle.id,
  baseRentalGross: "10000.0000",
  extensionsGross: "2000.0000",
  excessMileageGross: "1000.0000",
  fuelDeficitGross: "500.0000",
  damageChargesGross: "1000.0000",
  totalGross: "14500.0000",
  totalTax: "0.0000",
  currency: "KES",
  invoiceId: "invoice-1",
  invoiceNumber: "INV-2026-00001",
  isPaidOrSettled: true,
};

const approvedExpense: any = {
  id: "expense-approved",
  tenantId: "tenant-1",
  expenseNumber: "EXP-0001",
  vehicleId: vehicle.id,
  category: "MAINTENANCE",
  description: "Approved service cost",
  expenseDate: "2026-09-07",
  currency: "KES",
  netAmount: "1000.0000",
  taxAmount: "0.0000",
  grossAmount: "1000.0000",
  status: "APPROVED",
  ownerDeductible: true,
};

const draftExpense: any = {
  ...approvedExpense,
  id: "expense-draft",
  expenseNumber: "EXP-0002",
  description: "Draft cost must not enter settlement",
  grossAmount: "9000.0000",
  status: "DRAFT",
};

const result = SettlementCalculationEngine.calculate({
  owner,
  ownerships: [ownership],
  vehicles: [vehicle],
  rentals: [rental],
  rentalRevenueFacts: new Map([[rental.id, financeFact]]),
  expenses: [approvedExpense, draftExpense],
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  currency: "KES",
});

assert.strictEqual(result.totalEligibleRentalRevenue, "13000.0000");
assert.strictEqual(result.totalExcludedRevenue, "1500.0000");
assert.strictEqual(result.ownerGrossRevenueShare, "9100.0000");
assert.strictEqual(result.totalDeductions, "1000.0000");
assert.strictEqual(result.netPayoutAmount, "8100.0000");
assert.strictEqual(result.rentalLines.length, 1);
assert.strictEqual(result.rentalLines[0].invoiceId, "invoice-1");
assert.strictEqual(result.rentalLines[0].invoiceNumber, "INV-2026-00001");
assert.strictEqual(result.rentalLines[0].financeSourceSettled, true);
assert.strictEqual(result.expenseLines.length, 1, "Draft/unapproved expenses must not enter owner deductions");
assert.strictEqual(result.termsSnapshots.length, 1);
assert.strictEqual(result.termsSnapshots[0].ownershipId, ownership.id);
console.log("✓ Settlement is derived from settled Finance facts, not browser/pricing fallbacks");
console.log("✓ Only approved owner-deductible expenses enter the payout waterfall");
console.log("✓ Source invoice and historical ownership terms are reconstructable");

assert.throws(
  () =>
    SettlementCalculationEngine.calculate({
      owner,
      ownerships: [{ ...ownership, startDate: "2026-10-01" }],
      vehicles: [vehicle],
      rentals: [rental],
      rentalRevenueFacts: new Map([[rental.id, financeFact]]),
      expenses: [],
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      currency: "KES",
    }),
  /No historical ownership agreement covers settlement period/i
);
console.log("✓ Missing historical ownership terms fail closed; current/default terms are never substituted");

const unpaidResult = SettlementCalculationEngine.calculate({
  owner,
  ownerships: [ownership],
  vehicles: [vehicle],
  rentals: [rental],
  rentalRevenueFacts: new Map([[rental.id, { ...financeFact, isPaidOrSettled: false }]]),
  expenses: [],
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  currency: "KES",
});
assert.strictEqual(unpaidResult.rentalLines.length, 0);
assert.strictEqual(unpaidResult.totalEligibleRentalRevenue, "0.0000");
console.log("✓ Unsettled customer revenue is excluded from owner payout eligibility");

console.log("----------------------------------------------------------------------");
console.log("OWNER SETTLEMENT BLUEPRINT TEST PASSED");
console.log("----------------------------------------------------------------------");
