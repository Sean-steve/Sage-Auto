// ============================================================================
// CAR HIRE OS — SPRINT 13 BOOKINGS & RESERVATION LIFECYCLE TEST SUITE
// DOM-003 §14-16, DEV-006, DEV-007, BRS-001
// ============================================================================

import {
  BookingRepository,
  VehicleAllocationRepository,
  VehicleBlockRepository,
  VehicleRepository,
  CustomerRepository,
  DriverRepository,
  SubscriptionRepository,
  AuditRepository,
  OutboxRepository,
  RatePlanRepository,
  VehicleCategoryRepository,
  CorporateAccountRepository,
  AgentRepository,
  IdempotencyRepository,
  InvalidBookingStateTransitionError,
  BookingNotFoundError,
  BookingConcurrencyConflictError,
  CustomerNotEligibleError,
  CrossTenantViolationError,
  BookingAvailabilityConflictError,
} from "@carhire/database";
import { BookingStateMachine } from "../../../apps/api/src/modules/bookings/domain/booking-state-machine";
import { BookingService } from "../../../apps/api/src/modules/bookings/application/booking.service";
import { BookingReaderService } from "../../../apps/api/src/modules/bookings/application/booking-reader.service";
import { AvailabilityService } from "../../../apps/api/src/modules/availability/application/availability.service";
import { PricingService } from "../../../apps/api/src/modules/pricing/application/pricing.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

export async function runBookingsAndReservationsTests() {
  console.log("\n==================================================================");
  console.log("CAR HIRE OS — SPRINT 13 BOOKINGS & RESERVATION LIFECYCLE TEST SUITE");
  console.log("==================================================================");

  // Clear static stores
  BookingRepository.clear();
  VehicleAllocationRepository.clear();
  VehicleBlockRepository.clear();
  VehicleRepository.clear();
  CustomerRepository.clear();
  DriverRepository.clear();
  SubscriptionRepository.clear();
  AuditRepository.clear();
  OutboxRepository.clear();
  RatePlanRepository.clear();
  VehicleCategoryRepository.clear();
  CorporateAccountRepository.clear();
  AgentRepository.clear();
  IdempotencyRepository.clear();

  const tenantA = "tenant_nairobi_premium";
  const tenantB = "tenant_mombasa_safaris";

  // Repositories
  const bookingRepo = new BookingRepository();
  const allocationRepo = new VehicleAllocationRepository();
  const blockRepo = new VehicleBlockRepository();
  const vehicleRepo = new VehicleRepository();
  const customerRepo = new CustomerRepository();
  const driverRepo = new DriverRepository();
  const subRepo = new SubscriptionRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();
  const corporateRepo = new CorporateAccountRepository();
  const agentRepo = new AgentRepository();
  const categoryRepo = new VehicleCategoryRepository();
  const idempotencyRepo = new IdempotencyRepository();

  // Services
  const availabilityService = new AvailabilityService(
    allocationRepo,
    blockRepo,
    vehicleRepo,
    subRepo,
    auditRepo,
    outboxRepo
  );

  const pricingService = new PricingService();

  const bookingService = new BookingService(
    bookingRepo,
    pricingService,
    availabilityService,
    customerRepo,
    corporateRepo,
    driverRepo,
    agentRepo,
    vehicleRepo,
    categoryRepo,
    subRepo,
    auditRepo,
    outboxRepo,
    idempotencyRepo
  );

  const readerService = new BookingReaderService(
    bookingRepo,
    customerRepo,
    driverRepo,
    vehicleRepo,
    allocationRepo
  );

  // Seed baseline data
  const cust1 = await customerRepo.create({
    tenantId: tenantA,
    customerType: "INDIVIDUAL",
    fullName: "Jared Otieno",
    email: "jared.otieno@example.co.ke",
    phone: "+254711223344",
    idOrPassportNumber: "29883412",
    licenseNumber: "DL-NRB-1122",
    licenseExpiryDate: "2029-01-01",
    status: "ACTIVE",
    verificationStatus: "VERIFIED",
  });

  const custBlocked = await customerRepo.create({
    tenantId: tenantA,
    customerType: "INDIVIDUAL",
    fullName: "Suspicious User",
    email: "suspicious@example.co.ke",
    phone: "+254799000111",
    idOrPassportNumber: "11223344",
    licenseNumber: "DL-NRB-9999",
    licenseExpiryDate: "2027-01-01",
    status: "BLOCKED",
    verificationStatus: "REJECTED",
  });

  const drv1 = await driverRepo.create({
    tenantId: tenantA,
    fullName: "Ezekiel Mutua",
    licenseNumber: "DL-NRB-99882",
    licenseExpiryDate: "2030-01-01",
    phone: "+254722334455",
    rating: 5.0,
    status: "ACTIVE",
    verificationStatus: "VERIFIED",
  });

  const veh1 = await vehicleRepo.create({
    tenantId: tenantA,
    registrationPlate: "KDF 404X",
    make: "Toyota",
    model: "Prado TX-L",
    year: 2023,
    category: "SUV",
    lifecycleStatus: "OPERATIONAL",
    availabilityStatus: "AVAILABLE",
    odometer: 15400,
    fuelLevel: 80,
    dailyRate: 15000,
    vin: "JTEBX29J8K012345",
    transmission: "Automatic",
    seats: 7,
    fuelType: "Diesel",
    features: ["4x4", "GPS", "Leather"],
    imageUrl: "/vehicles/prado.png",
  });

  const veh2 = await vehicleRepo.create({
    tenantId: tenantA,
    registrationPlate: "KDG 889Y",
    make: "Toyota",
    model: "Land Cruiser V8",
    year: 2024,
    category: "SUV",
    lifecycleStatus: "OPERATIONAL",
    availabilityStatus: "AVAILABLE",
    odometer: 8200,
    fuelLevel: 95,
    dailyRate: 20000,
    vin: "JTEBX29J8K098765",
    transmission: "Automatic",
    seats: 7,
    fuelType: "Diesel",
    features: ["4x4", "Sunroof", "Coolbox"],
    imageUrl: "/vehicles/lc_v8.png",
  });

  // Setup Rate Plan in PricingService
  const ratePlan = await pricingService.createRatePlan(
    tenantA,
    {
      name: "Standard 2026 Fleet Rates",
      code: "STD-2026",
      currency: "KES",
      isDefault: true,
      priority: 10,
    },
    "admin_usr"
  );

  await pricingService.setRatePlanRate(
    tenantA,
    ratePlan.id,
    {
      vehicleCategoryId: "SUV",
      dailyRate: 15000,
      weeklyDailyRate: 13500,
      monthlyDailyRate: 12000,
      depositAmount: 30000,
      depositModel: "FIXED",
      mileageAllowanceModel: "INCLUDED_DAILY",
      includedKilometersPerDay: 200,
      extraKilometerRate: 50,
      extraHourRate: 1500,
    },
    "admin_usr"
  );
  await pricingService.publishRatePlan(tenantA, ratePlan.id, "admin_usr");

  // ============================================================================
  // TEST 1: Booking State Machine Transitions
  // ============================================================================
  console.log("▶ Test 1: Canonical Booking State Machine Valid Transitions...");
  assert(BookingStateMachine.canTransition("DRAFT", "PENDING"), "DRAFT can transition to PENDING");
  assert(BookingStateMachine.canTransition("DRAFT", "QUOTED"), "DRAFT can transition to QUOTED");
  assert(BookingStateMachine.canTransition("QUOTED", "CONFIRMED"), "QUOTED can transition to CONFIRMED");
  assert(BookingStateMachine.canTransition("CONFIRMED", "ACTIVE"), "CONFIRMED can transition to ACTIVE");
  assert(BookingStateMachine.canTransition("ACTIVE", "COMPLETED"), "ACTIVE can transition to COMPLETED");
  assert(BookingStateMachine.canTransition("CONFIRMED", "NO_SHOW"), "CONFIRMED can transition to NO_SHOW");
  assert(BookingStateMachine.canTransition("CONFIRMED", "CANCELLED"), "CONFIRMED can transition to CANCELLED");
  assert(BookingStateMachine.isTerminal("COMPLETED"), "COMPLETED is terminal state");
  assert(BookingStateMachine.isTerminal("CANCELLED"), "CANCELLED is terminal state");
  assert(!BookingStateMachine.canTransition("COMPLETED", "DRAFT"), "COMPLETED cannot transition to DRAFT");
  assert(!BookingStateMachine.canTransition("CANCELLED", "CONFIRMED"), "CANCELLED cannot transition to CONFIRMED");
  console.log("  ✓ [PASS] 1. Booking State Machine transition matrix verified.");

  // ============================================================================
  // TEST 2: Create Booking Draft & Quotation Calculation
  // ============================================================================
  console.log("▶ Test 2: Create Booking Draft & Frozen Pricing Snapshot...");
  const pickupDate = "2026-10-01T09:00:00Z";
  const returnDate = "2026-10-05T09:00:00Z";

  const booking1 = await bookingService.createBooking(
    tenantA,
    {
      customerId: cust1.id,
      primaryDriverId: drv1.id,
      requestedVehicleCategoryId: "SUV",
      assignedVehicleId: veh1.id,
      pickupLocationId: "station_nairobi_cbd",
      pickupLocationName: "Nairobi CBD HQ",
      returnLocationId: "station_nairobi_cbd",
      returnLocationName: "Nairobi CBD HQ",
      pickupAt: pickupDate,
      returnAt: returnDate,
      source: "BACKOFFICE",
      autoQuote: true,
    },
    { userId: "staff_user" }
  );

  assert(booking1.status === "QUOTED", "Booking starts in QUOTED state upon calculation");
  assert(booking1.bookingNumber.startsWith("BKG-"), "Booking has auto-generated BKG- number");
  assert((booking1.grossTotal || 0) > 0, "Booking has gross total calculated");
  assert(booking1.pricingSnapshotVersion === 1, "Snapshot version is 1");
  assert(booking1.pricingSnapshot !== undefined, "Immutable Pricing Snapshot is frozen on booking");
  assert(booking1.depositRequired === 30000, "Security deposit escrow requirement is set to 30,000");
  console.log("  ✓ [PASS] 2. Booking draft created with frozen pricing snapshot (v1).");

  // ============================================================================
  // TEST 3: Confirm Booking and Create Concurrency Allocation
  // ============================================================================
  console.log("▶ Test 3: Confirm Booking and Availability Allocation...");
  const confirmedBooking = await bookingService.confirmBooking(
    tenantA,
    booking1.id,
    {},
    { userId: "staff_user" }
  );

  assert(confirmedBooking.status === "CONFIRMED", "Booking status transitioned to CONFIRMED");
  assert(confirmedBooking.allocationId !== undefined, "Exclusive vehicle allocation created");
  assert(confirmedBooking.version === 2, "Booking version bumped to 2");

  // Verify that veh1 is now blocked for these dates
  const isAvailable = await availabilityService.checkVehicleAvailability(
    tenantA,
    {
      vehicleId: veh1.id,
      pickupAt: "2026-10-02T10:00:00Z",
      returnAt: "2026-10-04T10:00:00Z",
    }
  );
  assert(!isAvailable.available, "Vehicle is unavailable during allocated booking interval");
  console.log("  ✓ [PASS] 3. Booking confirmed and exclusive allocation locked.");

  // ============================================================================
  // TEST 4: Handover Readiness Evaluation Protocol
  // ============================================================================
  console.log("▶ Test 4: Handover Readiness Verification Engine...");
  const readiness = await readerService.evaluateHandoverReadiness(tenantA, booking1.id);
  assert(readiness.booking.id === booking1.id, "Readiness evaluation matches booking ID");
  assert(readiness.customerEligible, "Customer Jared Otieno is eligible");
  assert(readiness.driverEligible, "Driver Ezekiel Mutua is eligible");
  assert(readiness.vehicleOperable, "Vehicle Prado TX-L is operable");
  assert(readiness.allocationActive, "Vehicle allocation is active");
  assert(readiness.isReady, "Booking passes all readiness gates for handover");
  console.log("  ✓ [PASS] 4. Handover readiness protocol passed verification checks.");

  // ============================================================================
  // TEST 5: Atomic Vehicle Substitution (DOM-003)
  // ============================================================================
  console.log("▶ Test 5: Atomic Vehicle Substitution...");
  const substitutedBooking = await bookingService.substituteVehicle(
    tenantA,
    booking1.id,
    {
      replacementVehicleId: veh2.id,
      reason: "Scheduled fleet maintenance swap",
    },
    { userId: "workshop_mgr" }
  );

  assert(substitutedBooking.assignedVehicleId === veh2.id, "Assigned vehicle updated to veh2");
  assert((substitutedBooking.substitutions?.length || 0) === 1, "Substitution recorded in audit history");
  assert(substitutedBooking.substitutions?.[0].originalVehicleId === veh1.id, "Original asset recorded");
  assert(substitutedBooking.substitutions?.[0].replacementVehicleId === veh2.id, "Replacement asset recorded");

  // Old vehicle should now be free
  const oldVehicleAvail = await availabilityService.checkVehicleAvailability(
    tenantA,
    {
      vehicleId: veh1.id,
      pickupAt: "2026-10-02T10:00:00Z",
      returnAt: "2026-10-04T10:00:00Z",
    }
  );
  assert(oldVehicleAvail.available, "Original vehicle is now released and available");

  // New vehicle should now be allocated
  const newVehicleAvail = await availabilityService.checkVehicleAvailability(
    tenantA,
    {
      vehicleId: veh2.id,
      pickupAt: "2026-10-02T10:00:00Z",
      returnAt: "2026-10-04T10:00:00Z",
    }
  );
  assert(!newVehicleAvail.available, "New vehicle is now allocated for the booking");
  console.log("  ✓ [PASS] 5. Atomic vehicle substitution executed and availability transferred.");

  // ============================================================================
  // TEST 6: Reschedule Booking Dates & Re-allocate
  // ============================================================================
  console.log("▶ Test 6: Reschedule Booking Dates & Dynamic Re-pricing...");
  const newPickup = "2026-11-10T09:00:00Z";
  const newReturn = "2026-11-16T09:00:00Z"; // 6 days instead of 4

  const rescheduled = await bookingService.amendDates(
    tenantA,
    booking1.id,
    {
      pickupAt: newPickup,
      returnAt: newReturn,
      reason: "Customer extended stay",
      recalculatePricing: true,
    },
    { userId: "reschedule_user" }
  );

  assert(rescheduled.pickupAt === newPickup, "Pickup date updated");
  assert(rescheduled.returnAt === newReturn, "Return date updated");
  assert(rescheduled.pricingSnapshotVersion === 2, "Pricing snapshot version incremented to 2");
  assert((rescheduled.grossTotal || 0) > (booking1.grossTotal || 0), "Gross total increased for longer duration");
  console.log("  ✓ [PASS] 6. Booking rescheduled and re-priced with snapshot v2.");

  // ============================================================================
  // TEST 7: Eligibility Gating — Blocked Customer Rejection
  // ============================================================================
  console.log("▶ Test 7: Booking Eligibility Gating (Blocked Customer)...");
  let blockedErrorThrown = false;
  try {
    await bookingService.createBooking(
      tenantA,
      {
        customerId: custBlocked.id,
        requestedVehicleCategoryId: "SUV",
        pickupLocationId: "station_nairobi_cbd",
        pickupLocationName: "Nairobi CBD HQ",
        returnLocationId: "station_nairobi_cbd",
        returnLocationName: "Nairobi CBD HQ",
        pickupAt: "2026-12-01T09:00:00Z",
        returnAt: "2026-12-05T09:00:00Z",
        source: "WEB",
      },
      { userId: "web_portal" }
    );
  } catch (err: any) {
    blockedErrorThrown = true;
    assert(err instanceof CustomerNotEligibleError, "Throws CustomerNotEligibleError for blocked customer");
  }
  assert(blockedErrorThrown, "Blocked customer booking creation was prevented");
  console.log("  ✓ [PASS] 7. Eligibility gating prevents blocked customers from booking.");

  // ============================================================================
  // TEST 8: Concurrency Conflict & Version Monotonicity
  // ============================================================================
  console.log("▶ Test 8: Optimistic Concurrency Control (Version Lock)...");
  let staleConflictThrown = false;
  try {
    // Attempt update with stale version 1 when current version is >= 3
    await bookingRepo.update(
      booking1.id,
      tenantA,
      { internalNotes: "Stale overwrite" },
      1 // Stale expected version
    );
  } catch (err: any) {
    staleConflictThrown = true;
    assert(err instanceof BookingConcurrencyConflictError, "Throws BookingConcurrencyConflictError");
  }
  assert(staleConflictThrown, "Stale update was rejected by optimistic concurrency control");
  console.log("  ✓ [PASS] 8. Optimistic locking enforced version monotonicity.");

  // ============================================================================
  // TEST 9: Multi-Tenant Boundary Isolation
  // ============================================================================
  console.log("▶ Test 9: Multi-Tenant Boundary Isolation...");
  let crossTenantThrown = false;
  try {
    await bookingService.getBooking(tenantB, booking1.id);
  } catch (err: any) {
    crossTenantThrown = true;
    assert(
      err instanceof CrossTenantViolationError || err instanceof BookingNotFoundError,
      "Throws CrossTenantViolationError or BookingNotFoundError for cross-tenant access"
    );
  }
  assert(crossTenantThrown, "Cross-tenant access attempt strictly denied");
  console.log("  ✓ [PASS] 9. Strict multi-tenant isolation verified.");

  // ============================================================================
  // TEST 10: Cancellation & Allocation Release
  // ============================================================================
  console.log("▶ Test 10: Booking Cancellation & Allocation Release...");
  const cancelled = await bookingService.cancelBooking(
    tenantA,
    booking1.id,
    { reason: "Customer flight delayed indefinitely" },
    { userId: "agent_usr" }
  );

  assert(cancelled.status === "CANCELLED", "Booking is now CANCELLED");
  assert(cancelled.cancellationReason === "Customer flight delayed indefinitely", "Cancellation reason recorded");
  assert(cancelled.cancelledAt !== undefined, "Cancellation timestamp stamped");

  // Verify allocation is released
  const releasedVehicleAvail = await availabilityService.checkVehicleAvailability(
    tenantA,
    {
      vehicleId: veh2.id,
      pickupAt: newPickup,
      returnAt: newReturn,
    }
  );
  assert(releasedVehicleAvail.available, "Vehicle allocation was cleanly released upon cancellation");
  console.log("  ✓ [PASS] 10. Booking cancelled and allocation released atomically.");

  console.log("\n==================================================================");
  console.log("SPRINT 13 BOOKING & RESERVATION TESTS COMPLETE: 10/10 PASSED (100%)");
  console.log("==================================================================\n");
}

if (process.argv[1]?.endsWith("bookings-and-reservations.test.ts")) {
  runBookingsAndReservationsTests().catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
  });
}
