// ============================================================================
// CAR HIRE OS — SPRINT 9 FLEET & VEHICLE OWNER TEST SUITE (DOM-001, DOM-003)
// Production-grade Fleet Assets, Ownership Lineage, Quota & State Machines
// ============================================================================

import {
  VehicleRepository,
  VehicleOwnerRepository,
  VehicleOwnershipRepository,
  VehicleCategoryRepository,
  VehicleDocumentRepository,
  AuditRepository,
  OutboxRepository,
  FeatureRepository,
  PlanFeatureRepository,
  PlanRepository,
  TenantEntitlementRepository,
  EntitlementOverrideRepository,
  EntitlementRestrictionRepository,
  EntitlementUsageRepository,
  SubscriptionRepository,
  ConcurrencyConflictError,
  CrossTenantViolationError,
} from "@carhire/database";
import { FleetService } from "../../../apps/api/src/modules/fleet/application/fleet.service";
import { VehicleOwnersService } from "../../../apps/api/src/modules/vehicle-owners/application/vehicle-owners.service";
import { EntitlementService } from "../../../apps/api/src/modules/entitlements/application/entitlement.service";
import { VehicleAggregate } from "../../../apps/api/src/modules/fleet/domain/vehicle.aggregate";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runFleetAndVehicleOwnersTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 9 FLEET & VEHICLE OWNERS TEST SUITE (DOM-001)");
  console.log("==================================================================");

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
    }
  }

  // Clear & Initialize In-Memory Stores
  VehicleRepository.clear();
  VehicleOwnerRepository.clear();
  VehicleOwnershipRepository.clear();
  VehicleCategoryRepository.clear();
  VehicleDocumentRepository.clear();
  FeatureRepository.initializeSeed();
  PlanFeatureRepository.initializeSeed();
  PlanRepository.initializeSeed();

  const vehicleRepo = new VehicleRepository();
  const ownerRepo = new VehicleOwnerRepository();
  const ownershipRepo = new VehicleOwnershipRepository();
  const categoryRepo = new VehicleCategoryRepository();
  const docRepo = new VehicleDocumentRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();

  const entitlementService = new EntitlementService(
    new FeatureRepository(),
    new PlanFeatureRepository(),
    new TenantEntitlementRepository(),
    new EntitlementOverrideRepository(),
    new EntitlementRestrictionRepository(),
    new EntitlementUsageRepository(),
    new SubscriptionRepository(),
    new PlanRepository(),
    auditRepo,
    outboxRepo
  );

  const fleetService = new FleetService(
    vehicleRepo,
    ownershipRepo,
    ownerRepo,
    categoryRepo,
    docRepo,
    auditRepo,
    outboxRepo,
    entitlementService
  );

  const ownersService = new VehicleOwnersService(
    ownerRepo,
    ownershipRepo,
    vehicleRepo,
    auditRepo,
    outboxRepo
  );

  const TENANT_A = "tenant_alpha";
  const TENANT_B = "tenant_beta";
  const ACTOR_ID = "user_fleet_admin_1";
  const ACTOR_NAME = "Fleet Director John";

  // Setup Subscriptions for Entitlement Quota verification
  const enterprisePlan = (await new PlanRepository().listAll()).find((p) => p.code === "ENTERPRISE")!;
  const subRepo = new SubscriptionRepository();
  await subRepo.create({
    tenantId: TENANT_A,
    planId: enterprisePlan.id,
    status: "ACTIVE",
    state: "ACTIVE",
    currency: "KES",
    amount: 45000,
    autoRenew: true,
    billingCycle: "MONTHLY",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  await subRepo.create({
    tenantId: TENANT_B,
    planId: enterprisePlan.id,
    status: "ACTIVE",
    state: "ACTIVE",
    currency: "KES",
    amount: 45000,
    autoRenew: true,
    billingCycle: "MONTHLY",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Vehicle Owner Management
  // --------------------------------------------------------------------------
  let owner1: any;
  let owner2: any;

  await test("Create Vehicle Owner with payout details and individual investor profile", async () => {
    owner1 = await ownersService.createOwner(
      TENANT_A,
      {
        name: "David Kimani",
        ownerType: "INDIVIDUAL",
        email: "david.kimani@example.com",
        phone: "+254712345678",
        idOrPassportNumber: "ID28492011",
        taxPinNumber: "A009182374Z",
        payoutBank: "NCBA Bank Kenya",
        payoutAccountNumber: "1002938481",
        payoutMpesaNumber: "+254712345678",
        ownershipType: "INDIVIDUAL",
        notes: "Long-term partner with 2 premium SUVs",
      },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(owner1.id !== undefined, "Owner ID must be assigned");
    assert(owner1.name === "David Kimani", "Owner name matches");
    assert(owner1.status === "ACTIVE", "Owner status defaults to ACTIVE");
    assert(owner1.version === 1, "Initial owner version must be 1");
  });

  await test("Create Corporate Fleet Partner Owner", async () => {
    owner2 = await ownersService.createOwner(
      TENANT_A,
      {
        name: "Apex Luxury Holdings Ltd",
        companyName: "Apex Luxury Holdings Ltd",
        ownerType: "COMPANY",
        email: "fleet@apexluxury.co.ke",
        phone: "+254799887766",
        taxPinNumber: "P051928374M",
        payoutBank: "Standard Chartered",
        payoutAccountNumber: "01029384756",
        ownershipType: "LEASED",
      },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(owner2.companyName === "Apex Luxury Holdings Ltd", "Company name recorded");
  });

  await test("Update Owner details with optimistic locking check", async () => {
    const updated = await ownersService.updateOwner(
      TENANT_A,
      owner1.id,
      { phone: "+254722998877", expectedVersion: 1 },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(updated.phone === "+254722998877", "Phone updated");
    assert(updated.version === 2, "Version incremented to 2");

    let conflict = false;
    try {
      await ownersService.updateOwner(
        TENANT_A,
        owner1.id,
        { phone: "+254700000000", expectedVersion: 1 },
        ACTOR_ID,
        ACTOR_NAME
      );
    } catch (err) {
      conflict = err instanceof ConcurrencyConflictError;
    }
    assert(conflict, "Stale version must trigger ConcurrencyConflictError");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Vehicle Asset Registration & Lineage
  // --------------------------------------------------------------------------
  let vehicle1: any;
  let vehicle2: any;

  await test("Register Vehicle with Category, Rates, Telemetry and Auto-Assigned Owner", async () => {
    vehicle1 = await fleetService.createVehicle(
      TENANT_A,
      {
        registrationPlate: "KDG 452X",
        make: "Toyota",
        model: "Prado TX-L",
        year: 2023,
        category: "SUV",
        color: "Pearl White",
        vin: "VIN-TYT-PRADO-2023-9912",
        dailyRate: 15000,
        excessKmRate: 60,
        allowedDailyKm: 250,
        transmission: "Automatic",
        seats: 7,
        fuelType: "Diesel",
        odometer: 18500,
        fuelLevel: 100,
        ownerId: owner1.id,
        revenueSharePercent: 75.0,
        features: ["Leather Seats", "Sunroof", "4WD", "Tow Bar"],
      },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(vehicle1.id !== undefined, "Vehicle ID must be assigned");
    assert(vehicle1.registrationPlate === "KDG 452X", "Registration plate matches");
    assert(vehicle1.lifecycleStatus === "ACTIVE", "Default lifecycle status must be ACTIVE");
    assert(vehicle1.availabilityStatus === "AVAILABLE", "Default availability must be AVAILABLE");
    assert(vehicle1.ownerId === owner1.id, "Owner ID linked");
    assert(vehicle1.activeOwnershipId !== undefined, "Active ownership agreement established");

    const activeAgreement = await ownershipRepo.findById(vehicle1.activeOwnershipId!, TENANT_A);
    assert(activeAgreement !== null, "Active ownership agreement exists in repository");
    assert(activeAgreement!.revenueSharePercent === 75.0, "Revenue share recorded as 75%");
    assert(activeAgreement!.isActive === true, "Agreement is active");
  });

  await test("Prevent duplicate registration plate in the same tenant", async () => {
    let duplicateRejected = false;
    try {
      await fleetService.createVehicle(
        TENANT_A,
        {
          registrationPlate: "KDG 452X", // Duplicate!
          make: "Toyota",
          model: "Prado TX-L",
          year: 2023,
          category: "SUV",
          color: "Silver",
          dailyRate: 15000,
        },
        ACTOR_ID,
        ACTOR_NAME
      );
    } catch (err: any) {
      duplicateRejected = err.code === "VEHICLE_REGISTRATION_EXISTS" || err.name === "UniqueConstraintViolationError";
    }
    assert(duplicateRejected, "Duplicate registration plate must be rejected");
  });

  await test("Allow same registration plate across DIFFERENT tenants (Multi-Tenant Isolation)", async () => {
    const crossTenantVehicle = await fleetService.createVehicle(
      TENANT_B,
      {
        registrationPlate: "KDG 452X", // Same plate in Tenant B
        make: "Toyota",
        model: "Prado TX-L",
        year: 2023,
        category: "SUV",
        color: "Black",
        dailyRate: 16000,
      },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(crossTenantVehicle.tenantId === TENANT_B, "Vehicle registered under Tenant B");
    assert(crossTenantVehicle.registrationPlate === "KDG 452X", "Same plate valid in distinct tenant");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: State Machine Transitions & Invariant Enforcement
  // --------------------------------------------------------------------------
  await test("Lifecycle state transitions conform strictly to domain matrix", async () => {
    // Valid: ACTIVE -> OPERATIONAL
    const op = await fleetService.changeLifecycleStatus(
      TENANT_A,
      vehicle1.id,
      { status: "OPERATIONAL", reason: "Standard operational check completed" },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(op.lifecycleStatus === "OPERATIONAL", "Status updated to OPERATIONAL");

    // Valid: OPERATIONAL -> SUSPENDED
    const suspended = await fleetService.changeLifecycleStatus(
      TENANT_A,
      vehicle1.id,
      { status: "SUSPENDED", reason: "Pending annual insurance renewal" },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(suspended.lifecycleStatus === "SUSPENDED", "Status updated to SUSPENDED");

    // Invalid: SUSPENDED cannot be AVAILABLE
    let blockedAvailability = false;
    try {
      await fleetService.changeAvailabilityStatus(
        TENANT_A,
        vehicle1.id,
        { status: "AVAILABLE" },
        ACTOR_ID,
        ACTOR_NAME
      );
    } catch (err: any) {
      blockedAvailability = err.code === "VEHICLE_NOT_OPERATIONAL" || err.statusCode === 422;
    }
    assert(blockedAvailability, "Cannot mark SUSPENDED vehicle as AVAILABLE");

    // Restore to ACTIVE
    await fleetService.changeLifecycleStatus(
      TENANT_A,
      vehicle1.id,
      { status: "ACTIVE", reason: "Insurance renewed" },
      ACTOR_ID,
      ACTOR_NAME
    );
  });

  await test("Availability state machine transitions for Dispatch & Rental lifecycle", async () => {
    // AVAILABLE -> ON_RENT
    const onRent = await fleetService.changeAvailabilityStatus(
      TENANT_A,
      vehicle1.id,
      { status: "ON_RENT", reason: "Dispatched for booking BK-991" },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(onRent.availabilityStatus === "ON_RENT", "Availability updated to ON_RENT");

    // ON_RENT -> MAINTENANCE
    const maintenance = await fleetService.changeAvailabilityStatus(
      TENANT_A,
      vehicle1.id,
      { status: "MAINTENANCE", reason: "Returned with scheduled service required" },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(maintenance.availabilityStatus === "MAINTENANCE", "Availability updated to MAINTENANCE");

    // MAINTENANCE -> AVAILABLE
    const available = await fleetService.changeAvailabilityStatus(
      TENANT_A,
      vehicle1.id,
      { status: "AVAILABLE", reason: "Service complete and clean" },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(available.availabilityStatus === "AVAILABLE", "Availability restored to AVAILABLE");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Telemetry Monotonicity & Record Tracking
  // --------------------------------------------------------------------------
  await test("Odometer records strictly enforce forward monotonicity", async () => {
    // Normal increase (18,500 -> 19,250)
    const mileageRecord = await fleetService.recordMileage(
      TENANT_A,
      vehicle1.id,
      { recordedMileage: 19250, source: "RENTAL_RETURN", notes: "Safari trip return" },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(mileageRecord.recordedMileage === 19250, "Mileage updated to 19250");

    const currentV = await fleetService.getVehicle(TENANT_A, vehicle1.id);
    assert(currentV.odometer === 19250, "Vehicle odometer updated to 19250");

    // Attempted decrease without manual audit flag fails
    let rollbackBlocked = false;
    try {
      await fleetService.recordMileage(
        TENANT_A,
        vehicle1.id,
        { recordedMileage: 18000, source: "RENTAL_CHECKOUT" }, // Decrease!
        ACTOR_ID,
        ACTOR_NAME
      );
    } catch (err: any) {
      rollbackBlocked = true;
    }
    assert(rollbackBlocked, "Mileage rollback without audit override must fail");

    // Manual audit override succeeds
    const auditRecord = await fleetService.recordMileage(
      TENANT_A,
      vehicle1.id,
      { recordedMileage: 19100, source: "MANUAL_AUDIT", notes: "Correction after odometer inspection" },
      ACTOR_ID,
      ACTOR_NAME
    );
    assert(auditRecord.recordedMileage === 19100, "Mileage corrected via audit override");
  });

  await test("Fuel level telemetry logging", async () => {
    const fuelRecord = await fleetService.recordFuel(
      TENANT_A,
      vehicle1.id,
      85,
      45.5,
      9500,
      "DISPATCH_CHECK",
      ACTOR_NAME
    );
    assert(fuelRecord.fuelLevelPercent === 85, "Fuel level recorded as 85%");
    assert(fuelRecord.litersAdded === 45.5, "Liters added recorded");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Ownership Transfer, Agreement Renegotiation & Lineage
  // --------------------------------------------------------------------------
  await test("Transfer Ownership to new investor and retire previous agreement", async () => {
    const newAgreement = await ownersService.transferOwnership(
      TENANT_A,
      vehicle1.id,
      {
        newOwnerId: owner2.id,
        ownershipType: "LEASED",
        revenueSharePercent: 80.0,
        effectiveDate: new Date().toISOString(),
        termsSnapshot: "Transferred to Apex Luxury Holdings with 80% split",
        notes: "Corporate fleet expansion deal",
      },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(newAgreement.ownerId === owner2.id, "Agreement belongs to new owner");
    assert(newAgreement.revenueSharePercent === 80.0, "New agreement has 80% split");
    assert(newAgreement.isActive === true, "New agreement is active");

    const vUpdated = await fleetService.getVehicle(TENANT_A, vehicle1.id);
    assert(vUpdated.ownerId === owner2.id, "Vehicle ownerId updated to owner2");
    assert(vUpdated.activeOwnershipId === newAgreement.id, "Active ownership agreement updated");

    // Check old agreement was retired
    const oldAgreement = await ownershipRepo.findById(vehicle1.activeOwnershipId!, TENANT_A);
    assert(oldAgreement!.isActive === false, "Previous agreement marked inactive");
    assert(oldAgreement!.endDate !== undefined, "Previous agreement has endDate set");
  });

  await test("Renegotiate agreement revenue-share percentage", async () => {
    const renegotiated = await ownersService.changeAgreement(
      TENANT_A,
      vehicle1.id,
      {
        revenueSharePercent: 82.5,
        effectiveDate: new Date().toISOString(),
        notes: "Bonus tier revenue share agreed for Q4",
      },
      ACTOR_ID,
      ACTOR_NAME
    );

    assert(renegotiated.revenueSharePercent === 82.5, "Revenue share updated to 82.5%");
    assert(renegotiated.isActive === true, "Renegotiated agreement is active");

    const history = await ownersService.getOwnershipHistory(TENANT_A, vehicle1.id);
    assert(history.length === 3, "Historical lineage contains 3 agreements (initial, transferred, renegotiated)");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Complete Digital Twin Assembly
  // --------------------------------------------------------------------------
  await test("Digital Twin compiles complete vehicle asset, owner, lineage, documents and telemetry", async () => {
    // Add compliance document
    await fleetService.addDocument(
      TENANT_A,
      vehicle1.id,
      {
        documentType: "INSURANCE_CERTIFICATE",
        documentNumber: "INS-2026-99124",
        status: "VALID",
        verificationStatus: "VERIFIED",
      },
      ACTOR_ID
    );

    const digitalTwin = await fleetService.getVehicleDigitalTwin(TENANT_A, vehicle1.id);

    assert(digitalTwin.vehicle.id === vehicle1.id, "Digital twin vehicle matches");
    assert(digitalTwin.currentOwnership !== undefined, "Current ownership present");
    assert(digitalTwin.currentOwnership?.owner?.name === "Apex Luxury Holdings Ltd", "Current owner resolved");
    assert(digitalTwin.ownershipHistory.length === 3, "All 3 historical ownership records attached");
    assert(digitalTwin.documents.length === 1, "Attached document present");
    assert(digitalTwin.recentMileage.length >= 2, "Mileage telemetry logs attached");
    assert(digitalTwin.recentFuel.length >= 1, "Fuel telemetry logs attached");
    assert(digitalTwin.statusHistory.length >= 4, "State transition audit trail attached");
    assert(digitalTwin.stats.utilizationRatePercent > 0, "Fleet utilization metrics computed");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 7: Deletion Safeguards & Cross-Tenant Security
  // --------------------------------------------------------------------------
  await test("Prevent deleting an owner with active vehicle fleet attachments", async () => {
    let deletionBlocked = false;
    try {
      await ownersService.deleteOwner(TENANT_A, owner2.id, ACTOR_ID, ACTOR_NAME);
    } catch (err: any) {
      deletionBlocked = true;
    }
    assert(deletionBlocked, "Cannot delete owner who currently owns vehicles in the fleet");
  });

  await test("Cross-tenant access attempts are strictly rejected", async () => {
    let crossTenantBlocked = false;
    try {
      // Tenant B trying to access Tenant A's vehicle
      await fleetService.getVehicle(TENANT_B, vehicle1.id);
    } catch (err) {
      crossTenantBlocked = true;
    }
    assert(crossTenantBlocked, "Tenant B cannot query Tenant A's vehicle");
  });

  console.log("==================================================================");
  console.log(`FLEET & VEHICLE OWNERS TEST RESULTS: ${passed}/${total} PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runFleetAndVehicleOwnersTestSuite().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
