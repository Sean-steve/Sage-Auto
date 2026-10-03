// ============================================================================
// CAR HIRE OS — SPRINT 16 COMPREHENSIVE TEST SUITE (DOM-003 §19-20, DEV-006, DEV-007)
// Bounded Context: Rental Extensions, Return Workflow, Final Calculation & Completion
// ============================================================================

import assert from "node:assert/strict";
import {
  RentalRepository,
  BookingRepository,
  ContractRepository,
  HandoverRepository,
  VehicleRepository,
  VehicleAllocationRepository,
  InspectionRepository,
  DamageRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
  RentalAlreadyCompletedError,
  RentalExtensionNotFoundError,
  RentalExtensionInvalidStatusError,
  InspectionOdometerRegressionError,
  InspectionInvalidFuelLevelError,
  RentalInvalidStateTransitionError,
} from "../src";
import { RentalService, RentalActor } from "../../../apps/api/src/modules/rentals/application/rental.service";
import { RentalStateMachine } from "../../../apps/api/src/modules/rentals/domain/rental-state-machine";

async function runTests() {
  console.log("----------------------------------------------------------------");
  console.log("RUNNING SPRINT 16 TEST SUITE: RENTAL RETURN, EXTENSION & COMPLETION");
  console.log("----------------------------------------------------------------");

  // Clear repository stores
  RentalRepository.clear();
  BookingRepository.clear();
  ContractRepository.clear();
  HandoverRepository.clear();
  VehicleRepository.clear();
  VehicleAllocationRepository.clear();
  InspectionRepository.clear();
  DamageRepository.clear();

  const rentalRepo = new RentalRepository();
  const bookingRepo = new BookingRepository();
  const contractRepo = new ContractRepository();
  const handoverRepo = new HandoverRepository();
  const vehicleRepo = new VehicleRepository();
  const allocationRepo = new VehicleAllocationRepository();
  const inspectionRepo = new InspectionRepository();
  const damageRepo = new DamageRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();
  const idempotencyRepo = new IdempotencyRepository();

  const service = new RentalService(
    rentalRepo,
    bookingRepo,
    contractRepo,
    handoverRepo,
    vehicleRepo,
    allocationRepo,
    auditRepo,
    outboxRepo,
    idempotencyRepo,
    inspectionRepo,
    damageRepo
  );

  const tenantId = "tenant-sprint-16-alpha";
  const actor: RentalActor = {
    userId: "staff-sprint16-admin",
    actorType: "PLATFORM_STAFF",
    name: "Fleet Ops Manager",
  };

  // --------------------------------------------------------------------------
  // TEST 1: Rental State Machine Transitions
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Testing Rental State Machine Transitions...");
  assert.equal(RentalStateMachine.canTransition("SCHEDULED_HANDOVER", "ACTIVE_ON_ROAD"), true);
  assert.equal(RentalStateMachine.canTransition("ACTIVE_ON_ROAD", "RETURN_SCHEDULED"), true);
  assert.equal(RentalStateMachine.canTransition("ACTIVE_ON_ROAD", "VEHICLE_RECEIVED"), true);
  assert.equal(RentalStateMachine.canTransition("ACTIVE_ON_ROAD", "FINAL_CALCULATION"), true);
  assert.equal(RentalStateMachine.canTransition("VEHICLE_RECEIVED", "DAMAGE_ASSESSMENT"), true);
  assert.equal(RentalStateMachine.canTransition("FINAL_CALCULATION", "DEPOSIT_PROCESSING"), true);
  assert.equal(RentalStateMachine.canTransition("DEPOSIT_PROCESSING", "COMPLETED"), true);
  assert.equal(RentalStateMachine.canTransition("COMPLETED", "ACTIVE_ON_ROAD"), false);
  assert.equal(RentalStateMachine.TERMINAL_STATES.has("COMPLETED"), true);
  console.log("✓ Rental State Machine transitions verified.");

  // --------------------------------------------------------------------------
  // TEST 2: Setup Base Vehicle, Booking, Contract, Allocation, and Active Rental
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Setting up Base Rental Environment...");
  const vehicle = await vehicleRepo.create({
    tenantId,
    registrationPlate: "KDD 888Z",
    vin: "VIN888SPRINT16",
    make: "Toyota",
    model: "Prado TX-L",
    year: 2024,
    category: "SUV",
    color: "Black",
    imageUrl: "https://images.unsplash.com/prado.jpg",
    dailyRate: 12000,
    excessKmRate: 35,
    allowedDailyKm: 200,
    transmission: "Automatic",
    seats: 7,
    fuelType: "Diesel",
    lifecycleStatus: "ACTIVE",
    availabilityStatus: "ON_RENT",
    odometer: 45000,
    fuelLevel: 100,
    isPublishedToWebsite: true,
    features: ["4WD", "Sunroof"],
  });

  const booking = await bookingRepo.create(tenantId, {
    bookingNumber: "BKG-16001",
    customerId: "cust-16-vip",
    vehicleId: vehicle.id,
    pickupAt: "2026-09-01T08:00:00Z",
    returnAt: "2026-09-05T08:00:00Z",
    dailyRate: 12000,
    days: 4,
    status: "ACTIVE",
    grossTotal: 48000,
  } as any);

  const contract = await contractRepo.create(tenantId, {
    contractNumber: "CNT-16001",
    bookingId: booking.id,
    customerId: "cust-16-vip",
    status: "ACTIVE",
  } as any);

  const allocation = await allocationRepo.createAllocation(tenantId, {
    vehicleId: vehicle.id,
    startsAt: "2026-09-01T08:00:00Z",
    endsAt: "2026-09-05T08:00:00Z",
    allocationType: "BOOKING",
    sourceType: "BOOKING",
    sourceId: booking.id,
  });

  const rental = await rentalRepo.create(tenantId, {
    rentalNumber: "RNT-16001",
    bookingId: booking.id,
    contractId: contract.id,
    handoverId: "hnd-16001",
    customerId: "cust-16-vip",
    primaryDriverId: "drv-16-vip",
    vehicleId: vehicle.id,
    status: "ACTIVE_ON_ROAD",
    scheduledStart: "2026-09-01T08:00:00Z",
    scheduledReturnAt: "2026-09-05T08:00:00Z",
    actualStart: "2026-09-01T08:30:00Z",
    checkoutOdometer: 45000,
    checkoutFuelLevel: 100,
    pricingSnapshot: {
      dailyRate: 12000,
      days: 4,
      grossRentalTotal: 48000,
      grossTotal: 48000,
      depositRequirement: 30000,
      freeKmPerDay: 200,
      excessKmRate: 35,
    } as any,
  });

  await rentalRepo.saveStartSnapshot(tenantId, {
    tenantId,
    rentalId: rental.id,
    actualVehicleId: vehicle.id,
    startedAt: "2026-09-01T08:30:00Z",
    scheduledReturnAt: "2026-09-05T08:00:00Z",
    startOdometer: 45000,
    startFuelLevel: 100,
    depositRequirement: 30000,
    contractVersion: 1,
    driverId: "drv-16-vip",
    pricingSnapshot: {
      dailyRate: 12000,
      days: 4,
      grossRentalTotal: 48000,
      grossTotal: 48000,
      depositRequirement: 30000,
      freeKmPerDay: 200,
      excessKmRate: 35,
    } as any,
  });

  assert.equal(rental.state, "ACTIVE_ON_ROAD");
  assert.equal(rental.checkoutOdometer, 45000);
  console.log("✓ Base Rental created and start snapshot saved.");

  // --------------------------------------------------------------------------
  // TEST 3: Rental Extension Request & Pricing Calculation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing Rental Extension Request & Pricing...");
  const extension = await service.requestExtension(
    tenantId,
    rental.id,
    {
      newEndDate: "2026-09-07T08:00:00Z", // +2 days
      reason: "Safari excursion extension in Maasai Mara",
    },
    actor
  );

  assert.equal(extension.status, "REQUESTED");
  assert.equal(extension.additionalDays, 2);
  assert.equal(extension.dailyRate, 12000);
  assert.equal(extension.additionalCost, 24000);
  assert.equal(extension.additionalTax, 3840);
  assert.equal(extension.grossAdditionalTotal, 27840);
  console.log("✓ Extension request created with accurate decimal-safe pricing:", extension.grossAdditionalTotal);

  // --------------------------------------------------------------------------
  // TEST 4: Rental Extension Approval & Synchronization
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Testing Extension Approval & Booking/Rental Synchronization...");
  const approvedRental = await service.approveExtension(
    tenantId,
    rental.id,
    extension.id,
    { notes: "Extension approved by Operations Manager" },
    actor
  );

  assert.equal(approvedRental.scheduledEnd, "2026-09-07T08:00:00Z");
  const updatedBooking = await bookingRepo.findById(booking.id, tenantId);
  assert.equal(updatedBooking?.returnAt, "2026-09-07T08:00:00Z");
  console.log("✓ Extension approved, rental and booking scheduledEnd synchronized to:", approvedRental.scheduledEnd);

  // --------------------------------------------------------------------------
  // TEST 5: Return Scheduling & Vehicle Receipt Validation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Testing Return Scheduling & Vehicle Receipt...");
  const scheduledRental = await service.scheduleReturn(
    tenantId,
    rental.id,
    {
      scheduledReturnAt: "2026-09-07T10:00:00Z",
      scheduledReturnLocationId: "branch-nairobi-hq",
    },
    actor
  );
  assert.equal(scheduledRental.state, "RETURN_SCHEDULED");

  // Test odometer regression validation
  await assert.rejects(
    async () => {
      await service.receiveReturnedVehicle(
        tenantId,
        rental.id,
        {
          returnOdometer: 44900, // less than start 45000
          returnFuelLevel: 80,
        },
        actor
      );
    },
    (err: any) => err instanceof InspectionOdometerRegressionError
  );
  console.log("✓ Odometer regression correctly rejected.");

  // Test invalid fuel level validation
  await assert.rejects(
    async () => {
      await service.receiveReturnedVehicle(
        tenantId,
        rental.id,
        {
          returnOdometer: 46200,
          returnFuelLevel: 105, // invalid > 100
        },
        actor
      );
    },
    (err: any) => err instanceof InspectionInvalidFuelLevelError
  );
  console.log("✓ Invalid fuel level correctly rejected.");

  // Receive vehicle successfully
  // Start: 45,000 km, Return: 46,600 km (Total: 1,600 km)
  // Allowed: 6 days * 200 km = 1,200 km -> Excess: 400 km @ 35 = 14,000 KES
  // Fuel: Start 100%, Return 60% -> Deficit: 40% of 55L = 22L @ 185 = 4,070 KES + 500 Refueling fee
  // Return Date: 2026-09-07T12:00:00Z (Scheduled: 2026-09-07T08:00:00Z -> 4 hrs late - 1 hr grace = 3 billable hrs @ 500 = 1,500 KES)
  const receivedRental = await service.receiveReturnedVehicle(
    tenantId,
    rental.id,
    {
      returnOdometer: 46600,
      returnFuelLevel: 60,
      receivedAt: "2026-09-07T12:00:00Z",
      conditionNotes: "Vehicle returned with light dust and minor scratches on rear bumper.",
    },
    actor
  );

  assert.equal(receivedRental.state, "VEHICLE_RECEIVED");
  assert.equal(receivedRental.returnOdometer, 46600);
  assert.equal(receivedRental.returnFuelLevel, 60);
  console.log("✓ Vehicle successfully received at branch. State:", receivedRental.state);

  // --------------------------------------------------------------------------
  // TEST 6: Link Damage Cases to Rental
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Linking Observed Damage Cases...");
  const damageCase = await damageRepo.create(tenantId, {
    vehicleId: vehicle.id,
    inspectionId: "insp-return-16001",
    rentalId: rental.id,
    damageType: "SCRATCH",
    severity: "MINOR",
    bodyZone: "REAR_BUMPER",
    description: "Deep clear-coat scratch on rear bumper right corner",
    responsibleParty: "CUSTOMER",
    estimatedRepairCost: 7500,
  });

  const inspectionLinkedRental = await service.linkReturnInspection(
    tenantId,
    rental.id,
    {
      inspectionId: "insp-return-16001",
      damageCaseIds: [damageCase.id],
    },
    actor
  );
  assert.equal(inspectionLinkedRental.state, "DAMAGE_ASSESSMENT");
  console.log("✓ Damage case linked and rental state transitioned to:", inspectionLinkedRental.state);

  // --------------------------------------------------------------------------
  // TEST 7: Authoritative Final Calculation Engine & Deposit Reconciliation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] Executing Authoritative Final Rental Calculation Engine...");
  const { calculation, rental: calculatedRental } = await service.calculateFinalRental(
    tenantId,
    rental.id,
    {
      fuelPricePerLiter: 185,
      tankCapacityLitres: 55,
      refuelingFee: 500,
      lateHourlyRate: 500,
      lateGracePeriodHours: 1,
      freeKmPerDay: 200,
      excessKmRate: 35,
      additionalFees: [
        {
          code: "INTERIOR_VALET",
          label: "Interior Deep Valet Cleaning Fee",
          amount: 2500,
          taxAmount: 400,
          category: "CLEANING",
        },
      ],
    },
    actor
  );

  console.log("Final Calculation Breakdown:");
  console.log(" - Base Rental Amount:", calculation.baseRentalAmount);
  console.log(" - Extension Amount:", calculation.extensionsTotalAmount);
  console.log(" - Excess Mileage (400 km @ 35):", calculation.excessKmCharge);
  console.log(" - Fuel Deficit (22L @ 185 + 500 fee):", calculation.fuelDeficitCharge, "+", calculation.fuelRefuelingFee);
  console.log(" - Late Return Fee (3 billable hrs @ 500):", calculation.lateReturnFee);
  console.log(" - Damage Repair Charge:", calculation.totalDamageCharge);
  console.log(" - Additional Fees:", calculation.totalAdditionalFees);
  console.log(" - Gross Final Total:", calculation.grossFinalTotal);
  console.log(" - Deposit Held:", calculation.depositHeldAmount);
  console.log(" - Post-Rental Incidental Deductions:", calculation.depositDeductionsTotal);
  console.log(" - Deposit Refund Due:", calculation.depositRefundDue);
  console.log(" - Deposit Settlement Status:", calculation.depositSettlementStatus);

  assert.equal(calculation.totalDistanceKm, 1600);
  assert.equal(calculation.excessDistanceKm, 400);
  assert.equal(calculation.excessKmCharge, 14000);
  assert.equal(calculation.fuelDeficitLitres, 22);
  assert.equal(calculation.fuelDeficitCharge, 4070);
  assert.equal(calculation.fuelRefuelingFee, 500);
  assert.equal(calculation.billableLateHours, 3);
  assert.equal(calculation.lateReturnFee, 1500);
  assert.equal(calculation.totalDamageCharge, 7500);
  assert.equal(calculation.depositHeldAmount, 30000);
  // Post rental incidental charges = 14000 (excess km) + 4070 (fuel) + 500 (refuel fee) + 1500 (late) + 7500 (damage) + 3000 (500 refuel + 2500 cleaning) = 30070
  // Deposit held = 30000. Incidental total = 30070.
  // Deposit Additional Payment Due = 70.00 KES, Deposit Refund Due = 0 KES, Status: CHARGE_QUEUED
  assert.equal(calculation.depositAdditionalPaymentDue, 70);
  assert.equal(calculation.depositRefundDue, 0);
  assert.equal(calculation.depositSettlementStatus, "CHARGE_QUEUED");
  assert.equal(calculatedRental.state, "FINAL_CALCULATION");
  console.log("✓ Final Calculation Engine produced mathematically exact results.");

  // --------------------------------------------------------------------------
  // TEST 8: Process Deposit Settlement
  // --------------------------------------------------------------------------
  console.log("\n[TEST 8] Processing Deposit Settlement & Payment...");
  const settledCalc = await service.processDepositSettlement(
    tenantId,
    rental.id,
    {
      settlementStatus: "SETTLED",
      additionalChargedAmount: 70,
      paymentMethod: "MPESA",
      transactionReference: "QKD883921Z",
      notes: "Customer settled 70 KES remaining incidental balance via M-Pesa.",
    },
    actor
  );

  assert.equal(settledCalc.depositSettlementStatus, "SETTLED");
  assert.equal(settledCalc.isImmutable, true);
  console.log("✓ Deposit settlement sealed as immutable and recorded.");

  // --------------------------------------------------------------------------
  // TEST 9: Complete Rental, Booking, Contract & Release Fleet
  // --------------------------------------------------------------------------
  console.log("\n[TEST 9] Completing Rental & Releasing Vehicle to Fleet...");
  const completedRental = await service.completeRental(
    tenantId,
    rental.id,
    {
      releaseVehicleToStatus: "AVAILABLE",
      notes: "Rental fully completed, customer signed off, vehicle released.",
    },
    actor
  );

  assert.equal(completedRental.state, "COMPLETED");
  assert.ok(completedRental.completedAt);

  const finalBooking = await bookingRepo.findById(booking.id, tenantId);
  assert.equal(finalBooking?.status, "COMPLETED");

  const finalContract = await contractRepo.findById(contract.id, tenantId);
  assert.equal(finalContract?.status, "COMPLETED");

  const finalVehicle = await vehicleRepo.findById(vehicle.id, tenantId);
  assert.equal(finalVehicle?.availabilityStatus, "AVAILABLE");
  assert.equal(finalVehicle?.odometer, 46600);
  assert.equal(finalVehicle?.fuelLevel, 60);

  const finalAllocation = await allocationRepo.findById(allocation.id, tenantId);
  assert.equal(finalAllocation?.status, "RELEASED");

  console.log("✓ Rental, Booking, Contract completed and Vehicle allocation released.");

  // --------------------------------------------------------------------------
  // TEST 10: Terminal State Invariants
  // --------------------------------------------------------------------------
  console.log("\n[TEST 10] Testing Terminal State Invariants...");
  await assert.rejects(
    async () => {
      await service.requestExtension(
        tenantId,
        rental.id,
        { newEndDate: "2026-09-10T08:00:00Z" },
        actor
      );
    },
    (err: any) => err instanceof RentalAlreadyCompletedError
  );
  console.log("✓ Post-completion modifications strictly rejected.");

  console.log("\n================================================================");
  console.log("ALL SPRINT 16 TESTS PASSED SUCCESSFULLY! (10/10 TEST SUITES GREEN)");
  console.log("================================================================\n");
}

runTests().catch((err) => {
  console.error("Sprint 16 Test Failure:", err);
  process.exit(1);
});
