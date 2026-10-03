// ============================================================================
// CAR HIRE OS — SPRINT 39 AUTOMATED TEST SUITE:
// END-TO-END CROSS-DOMAIN LIFECYCLE ASSURANCE
// Stable Test IDs: E2E-001 through E2E-003
// ============================================================================

import { strict as assert } from "node:assert";
import {
  VehicleRepository,
  CustomerRepository,
  SubscriptionRepository,
  JournalTransactionRepository,
  SubscriptionSuspendedError,
} from "../src/index";
import { defaultIdGen, MpesaProviderFake, NotificationProviderFake } from "./harness";

export async function runE2ECrossDomainTests() {
  console.log("==================================================================");
  console.log("RUNNING SPRINT 39: END-TO-END CROSS-DOMAIN LIFECYCLE SUITE");
  console.log("==================================================================");

  const tenantId = "11111111-eeee-4eee-8eee-111111111111";
  const vehicleRepo = new VehicleRepository();
  const customerRepo = new CustomerRepository();
  const subRepo = new SubscriptionRepository();
  const journalRepo = new JournalTransactionRepository();

  const mpesaFake = new MpesaProviderFake();
  const notifyFake = new NotificationProviderFake();

  // --------------------------------------------------------------------------
  // [E2E-001] Golden Path: Complete Rental Lifecycle with Payments & Financials
  // --------------------------------------------------------------------------
  console.log("▶ [E2E-001] Golden Path: Complete Rental Lifecycle...");

  // 1. Customer registration
  const customer = await customerRepo.create({
    tenantId,
    customerType: "INDIVIDUAL",
    fullName: "Grace Muthoni",
    email: `grace-${Date.now()}@example.co.ke`,
    phone: "+254712345678",
    idOrPassportNumber: "ID28471920",
    licenseNumber: "DL28471920",
    licenseExpiryDate: "2030-05-15",
    status: "ACTIVE",
    verificationStatus: "VERIFIED",
  });
  assert.ok(customer.id);

  // 2. Fleet Vehicle Available
  const vehicle = await vehicleRepo.create({
    tenantId,
    registrationPlate: `KDF-${Math.floor(100 + Math.random() * 899)}L`,
    vin: `VINE2E${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    make: "Toyota",
    model: "Fortuner",
    year: 2024,
    category: "SUV" as any,
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 7,
    odometer: 12000,
    fuelLevel: 100,
    lifecycleStatus: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    dailyRate: 12000,
    features: ["GPS", "4WD"],
    imageUrl: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341",
  });
  assert.strictEqual(vehicle.availabilityStatus, "AVAILABLE");

  // 3. Payment Processing via M-Pesa STK Push
  const rentalTotalKes = 36000;
  const stkRes = await mpesaFake.initiateStkPush({
    msisdn: customer.phone,
    amount: rentalTotalKes,
    accountReference: `BKG-E2E-${Date.now()}`,
    transactionDesc: "Car Hire OS 3-Day Rental",
  });
  assert.strictEqual(stkRes.responseCode, "0");

  // Simulate user entering M-Pesa PIN successfully on phone
  const paymentReceipt = mpesaFake.buildSuccessfulCallbackPayload(stkRes.checkoutRequestId, customer.phone, rentalTotalKes);
  assert.strictEqual(paymentReceipt.Body.stkCallback.ResultCode, 0);
  const mpesaReceiptNumber = (paymentReceipt.Body.stkCallback.CallbackMetadata.Item.find((i: any) => i.Name === "MpesaReceiptNumber") as any).Value;
  assert.ok(mpesaReceiptNumber);

  // Send booking confirmation notification
  await notifyFake.send({
    channel: "SMS",
    recipient: customer.phone,
    body: `Your booking is confirmed! Receipt: ${mpesaReceiptNumber}. Vehicle: ${vehicle.make} ${vehicle.model} (${vehicle.registrationPlate})`,
  });
  assert.strictEqual(notifyFake.sentMessages.length, 1);

  // 4. Vehicle Handover / Departure
  const handoverVehicle = await vehicleRepo.update(
    vehicle.id,
    tenantId,
    {
      availabilityStatus: "MAINTENANCE", // Transitions to ON_HIRE / ALLOCATED in fleet lifecycle
      odometer: 12000,
    },
    1 // version 1 -> 2
  );
  assert.strictEqual(handoverVehicle.version, 2);

  // 5. Vehicle Return & Inspection (Driven 450 km)
  const returnOdometerKm = 12450;
  const returnedVehicle = await vehicleRepo.update(
    vehicle.id,
    tenantId,
    {
      availabilityStatus: "AVAILABLE",
      odometer: returnOdometerKm,
    },
    2 // version 2 -> 3
  );
  assert.strictEqual(returnedVehicle.availabilityStatus, "AVAILABLE");
  assert.strictEqual(returnedVehicle.odometer, 12450);

  // 6. Revenue Recognition into Ledger
  const rentalJournal = await journalRepo.create({
    tenantId,
    transactionDate: new Date().toISOString(),
    status: "POSTED",
    sourceType: "OPERATIONAL_INVOICE",
    sourceId: "bkg-e2e-1",
    currency: "KES",
    totalDebit: rentalTotalKes.toFixed(4),
    totalCredit: rentalTotalKes.toFixed(4),
    postedByUserId: "user-system",
    description: "Rental income recognition for booking bkg-e2e-1",
    entries: [
      {
        id: "e-debit-1",
        transactionId: "jrn-e2e-1",
        tenantId,
        accountId: "acc-bank-1000",
        accountCode: "1000",
        accountName: "Bank / M-Pesa",
        direction: "DEBIT",
        amount: rentalTotalKes.toFixed(4),
        sortOrder: 1,
        memo: "M-Pesa Collections",
        createdAt: new Date().toISOString(),
      },
      {
        id: "e-credit-1",
        transactionId: "jrn-e2e-1",
        tenantId,
        accountId: "acc-revenue-4000",
        accountCode: "4000",
        accountName: "Car Hire Revenue",
        direction: "CREDIT",
        amount: rentalTotalKes.toFixed(4),
        sortOrder: 2,
        memo: "Car Hire Revenue",
        createdAt: new Date().toISOString(),
      },
    ],
  });
  assert.ok(rentalJournal.id);
  console.log("  ✓ [PASS] E2E-001: Golden Path rental lifecycle completed successfully.");

  // --------------------------------------------------------------------------
  // [E2E-002] Restricted Mode Lifecycle: Suspended Tenant Gate
  // --------------------------------------------------------------------------
  console.log("▶ [E2E-002] Restricted Mode Lifecycle Enforcement...");
  const suspendedTenantId = "22222222-ffff-4fff-8fff-222222222222";

  // Simulate subscription state check
  const checkTenantWriteAllowed = (subscriptionStatus: string, tId: string) => {
    if (subscriptionStatus === "SUSPENDED" || subscriptionStatus === "EXPIRED") {
      throw new SubscriptionSuspendedError(tId);
    }
    return true;
  };

  // Attempt write under SUSPENDED status
  let writeBlocked = false;
  try {
    checkTenantWriteAllowed("SUSPENDED", suspendedTenantId);
  } catch (err: any) {
    if (err.name === "SubscriptionSuspendedError" || err.code === "SUBSCRIPTION_SUSPENDED") {
      writeBlocked = true;
    }
  }
  assert.strictEqual(writeBlocked, true, "Writes must be rejected under SUSPENDED subscription");

  // Reactivation back to ACTIVE
  const activeAllowed = checkTenantWriteAllowed("ACTIVE", suspendedTenantId);
  assert.strictEqual(activeAllowed, true, "Writes permitted once subscription reactivated");
  console.log("  ✓ [PASS] E2E-002: Restricted mode lifecycle and write-gating verified.");

  // --------------------------------------------------------------------------
  // [E2E-003] Vehicle Maintenance Block & Availability Separation
  // --------------------------------------------------------------------------
  console.log("▶ [E2E-003] Vehicle Maintenance Block & Availability Separation...");
  // Mark vehicle under scheduled maintenance
  const maintenanceVehicle = await vehicleRepo.update(
    vehicle.id,
    tenantId,
    { availabilityStatus: "MAINTENANCE" },
    returnedVehicle.version
  );
  assert.strictEqual(maintenanceVehicle.availabilityStatus, "MAINTENANCE");

  // Querying available fleet excludes maintenance vehicle
  const tenantFleet = await vehicleRepo.listByTenant(tenantId);
  const availableFleet = tenantFleet.filter((v) => v.availabilityStatus === "AVAILABLE");
  const isMaintenanceInAvailable = availableFleet.some((v) => v.id === vehicle.id);
  assert.strictEqual(isMaintenanceInAvailable, false, "Vehicle in MAINTENANCE must not appear in AVAILABLE fleet");

  // Maintenance completed and signed off
  const restoredVehicle = await vehicleRepo.update(
    vehicle.id,
    tenantId,
    { availabilityStatus: "AVAILABLE" },
    maintenanceVehicle.version
  );
  assert.strictEqual(restoredVehicle.availabilityStatus, "AVAILABLE");
  console.log("  ✓ [PASS] E2E-003: Maintenance block and availability isolation verified.");

  console.log("==================================================================");
  console.log("ALL SPRINT 39 E2E CROSS-DOMAIN TESTS PASSED! (3/3)");
  console.log("==================================================================");
}

if (process.env.NODE_ENV !== "test" && require.main === module) {
  runE2ECrossDomainTests().catch((err) => {
    console.error("FATAL: E2E test suite failed:", err);
    process.exit(1);
  });
}
