// ============================================================================
// CAR HIRE OS — SPRINT 12 AVAILABILITY ENGINE & CONCURRENCY TEST SUITE
// DEV-004, DEV-006, DEV-007, BRS-001
// ============================================================================

import {
  VehicleAllocationRepository,
  VehicleBlockRepository,
  VehicleRepository,
  SubscriptionRepository,
  AuditRepository,
  OutboxRepository,
  AvailabilityConflictError,
  InvalidAvailabilityIntervalError,
  VehicleNotOperationalError,
  AvailabilityHoldNotFoundError,
  AvailabilityHoldExpiredError,
  CrossTenantViolationError,
  SubscriptionSuspendedError,
} from "@carhire/database";
import { AvailabilityService } from "../../../apps/api/src/modules/availability/application/availability.service";
import { TimeInterval } from "../../../apps/api/src/modules/availability/domain/time-interval";
import { AvailabilityEngine } from "../../../apps/api/src/modules/availability/domain/availability-engine";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

export async function runAvailabilityEngineTests() {
  console.log("\n==================================================================");
  console.log("CAR HIRE OS — SPRINT 12 AVAILABILITY ENGINE & CONCURRENCY TEST SUITE");
  console.log("==================================================================");

  // Clear static stores
  VehicleAllocationRepository.clear();
  VehicleBlockRepository.clear();
  VehicleRepository.clear();
  SubscriptionRepository.clear();
  AuditRepository.clear();
  OutboxRepository.clear();

  const tenantA = "tenant_nairobi_rentals";
  const tenantB = "tenant_mombasa_safaris";

  const vehicleRepo = new VehicleRepository();
  const allocationRepo = new VehicleAllocationRepository();
  const blockRepo = new VehicleBlockRepository();
  const subRepo = new SubscriptionRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();

  const service = new AvailabilityService(
    allocationRepo,
    blockRepo,
    vehicleRepo,
    subRepo,
    auditRepo,
    outboxRepo
  );

  // Seed sample vehicles
  const v1 = await vehicleRepo.create({
    tenantId: tenantA,
    registrationPlate: "KDA 101A",
    make: "Toyota",
    model: "Prado TX",
    year: 2024,
    category: "cat_suv",
    lifecycleStatus: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    fuelType: "DIESEL",
    transmission: "AUTOMATIC",
    seatingCapacity: 7,
    dailyRate: 15000,
    currentOdometer: 10000,
    fuelLevel: 100,
    ownershipType: "COMPANY_OWNED",
    isPublishedToWebsite: true,
  } as any);

  const v2 = await vehicleRepo.create({
    tenantId: tenantA,
    registrationPlate: "KDB 202B",
    make: "Toyota",
    model: "Land Cruiser V8",
    year: 2025,
    category: "cat_suv",
    lifecycleStatus: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    fuelType: "DIESEL",
    transmission: "AUTOMATIC",
    seatingCapacity: 7,
    dailyRate: 25000,
    currentOdometer: 5000,
    fuelLevel: 100,
    ownershipType: "COMPANY_OWNED",
    isPublishedToWebsite: true,
  } as any);

  const vDecommissioned = await vehicleRepo.create({
    tenantId: tenantA,
    registrationPlate: "KDC 303C",
    make: "Nissan",
    model: "X-Trail",
    year: 2020,
    category: "cat_suv",
    lifecycleStatus: "DECOMMISSIONED",
    availabilityStatus: "UNAVAILABLE",
    fuelType: "PETROL",
    transmission: "AUTOMATIC",
    seatingCapacity: 5,
    dailyRate: 8000,
    currentOdometer: 180000,
    fuelLevel: 50,
    ownershipType: "COMPANY_OWNED",
    isPublishedToWebsite: false,
  } as any);

  const vTenantB = await vehicleRepo.create({
    tenantId: tenantB,
    registrationPlate: "KDA 101A", // Same plate number across DIFFERENT tenant
    make: "Toyota",
    model: "Prado TX",
    year: 2024,
    category: "cat_suv",
    lifecycleStatus: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    fuelType: "DIESEL",
    transmission: "AUTOMATIC",
    seatingCapacity: 7,
    dailyRate: 16000,
    currentOdometer: 12000,
    fuelLevel: 90,
    ownershipType: "COMPANY_OWNED",
    isPublishedToWebsite: true,
  } as any);

  // --------------------------------------------------------------------------
  // TEST 1: Pure TimeInterval Value Object Mathematics & Boundary Checking
  // --------------------------------------------------------------------------
  console.log("▶ Test 1: TimeInterval Value Object Mathematics & Boundaries...");
  const intA = new TimeInterval("2026-09-01T10:00:00Z", "2026-09-05T10:00:00Z");
  const intB = new TimeInterval("2026-09-03T10:00:00Z", "2026-09-07T10:00:00Z");
  const intAdjacent = new TimeInterval("2026-09-05T10:00:00Z", "2026-09-10T10:00:00Z");
  const intDisjoint = new TimeInterval("2026-09-15T10:00:00Z", "2026-09-20T10:00:00Z");

  assert(intA.overlaps(intB) === true, "Overlapping intervals must return true");
  assert(intB.overlaps(intA) === true, "Interval overlap must be commutative");
  assert(intA.overlaps(intAdjacent) === false, "Touching boundaries [10, 05) and [05, 10) must NOT overlap in half-open semantics");
  assert(intA.overlaps(intDisjoint) === false, "Disjoint intervals must return false");
  assert(intA.durationDays === 4, "4-day duration calculation");
  assert(intA.durationHours === 96, "96-hour duration calculation");

  // Invalid interval should throw InvalidAvailabilityIntervalError
  let invalidIntervalThrown = false;
  try {
    new TimeInterval("2026-09-05T10:00:00Z", "2026-09-01T10:00:00Z");
  } catch (err) {
    if (err instanceof InvalidAvailabilityIntervalError) invalidIntervalThrown = true;
  }
  assert(invalidIntervalThrown, "Inverted interval must throw InvalidAvailabilityIntervalError");
  console.log("  ✓ [PASS] 1. Half-open interval mathematics & boundary assertions verified.");

  // --------------------------------------------------------------------------
  // TEST 2: Direct Vehicle Availability Check (Initial Available State)
  // --------------------------------------------------------------------------
  console.log("▶ Test 2: Initial Vehicle Availability Check...");
  const checkInitial = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v1.id,
    pickupAt: "2026-09-01T10:00:00Z",
    returnAt: "2026-09-05T10:00:00Z",
  });
  assert(checkInitial.available === true, "Vehicle 1 should be initially available");
  assert(checkInitial.code === "AVAILABLE", "Status code should be AVAILABLE");
  console.log("  ✓ [PASS] 2. Unallocated vehicle correctly reports available.");

  // --------------------------------------------------------------------------
  // TEST 3: Create Confirmed Vehicle Allocation
  // --------------------------------------------------------------------------
  console.log("▶ Test 3: Create Confirmed Vehicle Allocation...");
  const alloc1 = await service.createAllocation(
    tenantA,
    {
      vehicleId: v1.id,
      allocationType: "BOOKING",
      startsAt: "2026-09-01T10:00:00Z",
      endsAt: "2026-09-05T10:00:00Z",
      sourceType: "BOOKING",
      sourceId: "booking_12345",
      reason: "VIP Corporate Safari Booking",
    },
    "user_ops_lead"
  );
  assert(alloc1.id.startsWith("alloc_"), "Allocation ID generated");
  assert(alloc1.status === "CONFIRMED", "Allocation status is CONFIRMED");

  // Check audit and outbox
  const auditEntries = await auditRepo.listByTenant(tenantA);
  assert(auditEntries.some((a) => a.action === "AVAILABILITY_ALLOCATION_CREATED"), "Audit entry recorded for allocation");
  const outboxEntries = await outboxRepo.findPending(10);
  assert(outboxEntries.some((o) => o.eventType === "AVAILABILITY_ALLOCATION_CREATED"), "Outbox event emitted");

  // Now vehicle should report conflict for overlapping range
  const checkOverlapping = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v1.id,
    pickupAt: "2026-09-03T10:00:00Z",
    returnAt: "2026-09-08T10:00:00Z",
  });
  assert(checkOverlapping.available === false, "Vehicle 1 must report unavailable for overlapping range");
  assert(checkOverlapping.code === "AVAILABILITY_CONFLICT", "Conflict code returned");
  assert(checkOverlapping.conflictingAllocationId === alloc1.id, "Conflicting allocation ID reported");

  // But adjacent range on same vehicle should be available
  const checkAdjacent = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v1.id,
    pickupAt: "2026-09-05T10:00:00Z",
    returnAt: "2026-09-10T10:00:00Z",
  });
  assert(checkAdjacent.available === true, "Adjacent interval touching exact return boundary is available");
  console.log("  ✓ [PASS] 3. Allocation creation and interval overlap conflict correctly enforced.");

  // --------------------------------------------------------------------------
  // TEST 4: Concurrency Stress Test — Simulated Race Condition
  // --------------------------------------------------------------------------
  console.log("▶ Test 4: Concurrency Stress Test (Simultaneous Allocation Attempts)...");
  // Two concurrent calls attempting to allocate vehicle 2 for overlapping intervals
  const concurrentCalls = [
    service.createAllocation(tenantA, {
      vehicleId: v2.id,
      allocationType: "BOOKING",
      startsAt: "2026-09-10T08:00:00Z",
      endsAt: "2026-09-15T18:00:00Z",
      sourceId: "booking_race_1",
    }),
    service.createAllocation(tenantA, {
      vehicleId: v2.id,
      allocationType: "BOOKING",
      startsAt: "2026-09-12T08:00:00Z",
      endsAt: "2026-09-18T18:00:00Z",
      sourceId: "booking_race_2",
    }),
  ];

  const results = await Promise.allSettled(concurrentCalls);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert(fulfilled.length === 1, `Exactly 1 concurrent allocation must succeed (got ${fulfilled.length})`);
  assert(rejected.length === 1, `Exactly 1 concurrent allocation must be rejected (got ${rejected.length})`);
  const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
  assert(
    rejectionReason instanceof AvailabilityConflictError ||
      rejectionReason?.code === "AVAILABILITY_CONFLICT",
    "Rejected call must throw AvailabilityConflictError"
  );
  console.log("  ✓ [PASS] 4. Concurrency mutex & GiST exclusion prevents double-booking race condition.");

  // --------------------------------------------------------------------------
  // TEST 5: Temporary Hold Lifecycle & Expiry
  // --------------------------------------------------------------------------
  console.log("▶ Test 5: Temporary Hold Lifecycle & Expiry...");
  // Create hold on Vehicle 1 for future date
  const { allocation: holdAlloc, hold } = await service.createHold(tenantA, {
    vehicleId: v1.id,
    startsAt: "2026-09-20T10:00:00Z",
    endsAt: "2026-09-25T10:00:00Z",
    ttlMinutes: 15,
    customerId: "cust_safari_01",
  });

  assert(holdAlloc.status === "HELD", "Hold allocation status is HELD");
  assert(hold.status === "PENDING", "Hold status is PENDING");
  assert(hold.holdToken.startsWith("hld_tok_"), "Valid holdToken generated");

  // While hold is active, interval is blocked
  const checkDuringHold = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v1.id,
    pickupAt: "2026-09-21T10:00:00Z",
    returnAt: "2026-09-24T10:00:00Z",
  });
  assert(checkDuringHold.available === false, "Active hold blocks new allocations");

  // Confirm hold to booking
  const confirmedFromHold = await service.confirmHold(tenantA, hold.holdToken, {
    holdToken: hold.holdToken,
    sourceType: "BOOKING",
    sourceId: "booking_confirmed_from_hold",
  });
  assert(confirmedFromHold.status === "CONFIRMED", "Confirmed hold converts allocation to CONFIRMED");
  assert(confirmedFromHold.sourceId === "booking_confirmed_from_hold", "Source ID attached");

  // Test hold expiry simulation
  const { allocation: holdAllocExpired, hold: expiredHold } = await service.createHold(tenantA, {
    vehicleId: v1.id,
    startsAt: "2026-10-01T10:00:00Z",
    endsAt: "2026-10-05T10:00:00Z",
    ttlMinutes: -1, // Expired immediately
  });

  // Check availability for expired hold window -> should be AVAILABLE
  const checkAfterExpiredHold = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v1.id,
    pickupAt: "2026-10-02T10:00:00Z",
    returnAt: "2026-10-04T10:00:00Z",
  });
  assert(checkAfterExpiredHold.available === true, "Expired hold does NOT block vehicle availability");

  // Confirming expired hold must fail
  let confirmExpiredFailed = false;
  try {
    await service.confirmHold(tenantA, expiredHold.holdToken, {
      holdToken: expiredHold.holdToken,
      sourceType: "BOOKING",
      sourceId: "booking_invalid",
    });
  } catch (err) {
    if (err instanceof AvailabilityHoldExpiredError || (err as any)?.code === "AVAILABILITY_HOLD_EXPIRED") {
      confirmExpiredFailed = true;
    }
  }
  assert(confirmExpiredFailed, "Attempting to confirm expired hold throws AvailabilityHoldExpiredError");
  console.log("  ✓ [PASS] 5. Temporary hold creation, conversion, and TTL expiry verified.");

  // --------------------------------------------------------------------------
  // TEST 6: Operational & Maintenance Blocks
  // --------------------------------------------------------------------------
  console.log("▶ Test 6: Operational & Maintenance Blocks...");
  // Create maintenance block on Vehicle 2
  const block = await service.createVehicleBlock(
    tenantA,
    {
      vehicleId: v2.id,
      blockType: "MAINTENANCE",
      startsAt: "2026-11-01T08:00:00Z",
      endsAt: "2026-11-05T18:00:00Z",
      reason: "Scheduled 50,000 KM Engine & Brake Service",
    },
    "user_fleet_mgr"
  );
  assert(block.status === "ACTIVE", "Block status is ACTIVE");

  // Availability check during maintenance window should report conflict
  const checkBlock = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v2.id,
    pickupAt: "2026-11-02T08:00:00Z",
    returnAt: "2026-11-04T18:00:00Z",
  });
  assert(checkBlock.available === false, "Active maintenance block makes vehicle unavailable");

  // Release maintenance block
  const releasedBlock = await service.releaseVehicleBlock(tenantA, block.id, "Service completed early");
  assert(releasedBlock.status === "RELEASED", "Block is RELEASED");

  const checkAfterRelease = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v2.id,
    pickupAt: "2026-11-02T08:00:00Z",
    returnAt: "2026-11-04T18:00:00Z",
  });
  assert(checkAfterRelease.available === true, "Vehicle is available again after block release");
  console.log("  ✓ [PASS] 6. Operational & maintenance blocks properly gate and restore availability.");

  // --------------------------------------------------------------------------
  // TEST 7: Lifecycle Status Gating (Decommissioned Vehicle Blocked)
  // --------------------------------------------------------------------------
  console.log("▶ Test 7: Non-Operational Lifecycle Status Gating...");
  const checkDecommissioned = await service.checkVehicleAvailability(tenantA, {
    vehicleId: vDecommissioned.id,
    pickupAt: "2026-12-01T10:00:00Z",
    returnAt: "2026-12-05T10:00:00Z",
  });
  assert(checkDecommissioned.available === false, "Decommissioned vehicle cannot be available");
  assert(checkDecommissioned.code === "VEHICLE_NOT_OPERATIONAL", "Correct non-operational error code returned");

  let allocDecomFailed = false;
  try {
    await service.createAllocation(tenantA, {
      vehicleId: vDecommissioned.id,
      allocationType: "BOOKING",
      startsAt: "2026-12-01T10:00:00Z",
      endsAt: "2026-12-05T10:00:00Z",
    });
  } catch (err) {
    if (err instanceof VehicleNotOperationalError || (err as any)?.code === "VEHICLE_NOT_OPERATIONAL") {
      allocDecomFailed = true;
    }
  }
  assert(allocDecomFailed, "Attempting to allocate decommissioned vehicle throws VehicleNotOperationalError");
  console.log("  ✓ [PASS] 7. Lifecycle & operational status gates allocation eligibility.");

  // --------------------------------------------------------------------------
  // TEST 8: Concurrency-Safe Vehicle Substitution
  // --------------------------------------------------------------------------
  console.log("▶ Test 8: Concurrency-Safe Vehicle Substitution...");
  // Create an initial allocation for Vehicle 1
  const originalAlloc = await service.createAllocation(tenantA, {
    vehicleId: v1.id,
    allocationType: "BOOKING",
    startsAt: "2026-12-10T10:00:00Z",
    endsAt: "2026-12-15T10:00:00Z",
    sourceType: "BOOKING",
    sourceId: "booking_sub_test",
  });

  // Substitute Vehicle 1 with Vehicle 2
  const subResult = await service.substituteVehicle(
    tenantA,
    originalAlloc.id,
    v2.id,
    "user_ops_mgr"
  );
  assert(subResult.previousAllocation.status === "RELEASED", "Previous allocation released on substitution");
  assert(subResult.newAllocation.vehicleId === v2.id, "New allocation assigned to replacement vehicle");
  assert(subResult.newAllocation.status === "CONFIRMED", "New allocation is CONFIRMED");

  // Vehicle 1 should now be available for that window
  const checkV1AfterSub = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v1.id,
    pickupAt: "2026-12-10T10:00:00Z",
    returnAt: "2026-12-15T10:00:00Z",
  });
  assert(checkV1AfterSub.available === true, "Original vehicle is freed up after substitution");

  // Vehicle 2 should now be blocked
  const checkV2AfterSub = await service.checkVehicleAvailability(tenantA, {
    vehicleId: v2.id,
    pickupAt: "2026-12-10T10:00:00Z",
    returnAt: "2026-12-15T10:00:00Z",
  });
  assert(checkV2AfterSub.available === false, "Replacement vehicle is now allocated");
  console.log("  ✓ [PASS] 8. Atomic vehicle substitution transfers reservation cleanly.");

  // --------------------------------------------------------------------------
  // TEST 9: Multi-Tenant Isolation & Cross-Tenant Access Rejection
  // --------------------------------------------------------------------------
  console.log("▶ Test 9: Multi-Tenant Isolation & Cross-Tenant Boundaries...");
  // Tenant B allocates its own vehicle (same plate number as Tenant A's v1) for same dates
  const tenantBAlloc = await service.createAllocation(tenantB, {
    vehicleId: vTenantB.id,
    allocationType: "BOOKING",
    startsAt: "2026-09-01T10:00:00Z",
    endsAt: "2026-09-05T10:00:00Z",
  });
  assert(tenantBAlloc.tenantId === tenantB, "Tenant B allocation created under tenant B");

  // Tenant A attempting to access or release Tenant B's allocation must be rejected
  let crossTenantFailed = false;
  try {
    await service.releaseAllocation(tenantA, tenantBAlloc.id, "Malicious release attempt");
  } catch (err) {
    if (err instanceof CrossTenantViolationError || (err as any)?.code === "CROSS_TENANT_VIOLATION" || (err as any)?.code === "RECORD_NOT_FOUND") {
      crossTenantFailed = true;
    }
  }
  assert(crossTenantFailed, "Cross-tenant allocation release is strictly forbidden");
  console.log("  ✓ [PASS] 9. Strict multi-tenant isolation and cross-tenant boundary security verified.");

  // --------------------------------------------------------------------------
  // TEST 10: Fleet Availability Search & Candidate Matching
  // --------------------------------------------------------------------------
  console.log("▶ Test 10: Fleet Candidate Search...");
  const searchResults = await service.searchAvailableVehicles(tenantA, {
    pickupAt: "2027-01-01T10:00:00Z",
    returnAt: "2027-01-05T10:00:00Z",
    vehicleCategoryId: "cat_suv",
  });

  assert(searchResults.totalAvailable === 2, `Should find 2 active operable SUV candidates (got ${searchResults.totalAvailable})`);
  assert(searchResults.vehicles.every((v) => v.id !== vDecommissioned.id), "Decommissioned vehicle excluded from search results");
  console.log("  ✓ [PASS] 10. Set-based candidate fleet availability search verified.");

  // --------------------------------------------------------------------------
  // TEST 11: Vehicle Availability Calendar Timeline
  // --------------------------------------------------------------------------
  console.log("▶ Test 11: Vehicle Availability Calendar Generation...");
  const calendar = await service.getVehicleCalendar(
    tenantA,
    v1.id,
    "2026-09-01T00:00:00Z",
    "2026-09-30T23:59:59Z"
  );
  assert(calendar.vehicleId === v1.id, "Calendar vehicle ID matches");
  assert(calendar.entries.length > 0, "Calendar entries contain scheduled allocations");
  console.log("  ✓ [PASS] 11. Vehicle timeline calendar response generated accurately.");

  console.log("==================================================================");
  console.log("SPRINT 12 AVAILABILITY ENGINE TESTS COMPLETE: 11/11 PASSED (100%)");
  console.log("==================================================================\n");
}

if (require.main === module) {
  runAvailabilityEngineTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
