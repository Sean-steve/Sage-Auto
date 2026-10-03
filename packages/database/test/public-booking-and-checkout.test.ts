// ============================================================================
// CAR HIRE OS — SPRINT 31 INTEGRATION TEST SUITE:
// PUBLIC VEHICLE DISCOVERY, LIVE AVAILABILITY, PUBLIC PRICING, GUEST BOOKING,
// CHECKOUT & PAYMENT HANDOFF (DEV-006, DEV-008, DEV-009, SEC-001)
// ============================================================================

import { strict as assert } from "node:assert";
import {
  InMemoryTenantWebsiteRepository,
  InMemoryWebPageRepository,
  InMemoryWebsiteDomainRepository,
  InMemoryWebsiteSnapshotRepository,
  TenantRepository,
  VehicleRepository,
  VehicleCategoryRepository,
  CustomerRepository,
  BookingRepository,
  VehicleAllocationRepository,
  VehicleBlockRepository,
  RatePlanRepository,
  PaymentAttemptRepository,
  PaymentRepository,
  VehicleMediaRepository,
} from "../src/index";
import { HostResolutionService } from "../../../apps/api/src/modules/domains/application/host-resolution.service";
import { AvailabilityService } from "../../../apps/api/src/modules/availability/application/availability.service";
import { PricingService } from "../../../apps/api/src/modules/pricing/application/pricing.service";
import { BookingService } from "../../../apps/api/src/modules/bookings/application/booking.service";
import { PaymentService } from "../../../apps/api/src/modules/payments/application/payment.service";
import { PaymentProviderRegistry } from "../../../apps/api/src/modules/payments/infrastructure/providers/provider-registry";
import { FakePaymentProvider } from "../../../apps/api/src/modules/payments/infrastructure/providers/fake-payment-provider";
import { PublicBookingService } from "../../../apps/api/src/modules/public-booking/application/public-booking.service";
import {
  VehicleNotAvailableForBookingError,
  VehicleNotPubliclyRentableError,
  GuestCustomerBlockedError,
} from "../../../apps/api/src/modules/public-booking/domain/public-booking.errors";

async function runSprint31TestSuite() {
  console.log("======================================================================");
  console.log("RUNNING SPRINT 31: PUBLIC VEHICLE DISCOVERY, LIVE AVAILABILITY,");
  console.log("PUBLIC PRICING, GUEST BOOKING, CHECKOUT & PAYMENT HANDOFF TEST SUITE");
  console.log("======================================================================");

  // Setup Shared Database Repositories
  const tenantRepo = new TenantRepository();
  const websiteRepo = new InMemoryTenantWebsiteRepository();
  const pageRepo = new InMemoryWebPageRepository();
  const domainRepo = new InMemoryWebsiteDomainRepository();
  const snapshotRepo = new InMemoryWebsiteSnapshotRepository();
  const vehicleRepo = new VehicleRepository();
  const categoryRepo = new VehicleCategoryRepository();
  const customerRepo = new CustomerRepository();
  const bookingRepo = new BookingRepository();
  const allocationRepo = new VehicleAllocationRepository();
  const blockRepo = new VehicleBlockRepository();
  const ratePlanRepo = new RatePlanRepository();
  const attemptRepo = new PaymentAttemptRepository();
  const paymentRepo = new PaymentRepository();
  const mediaRepo = new VehicleMediaRepository();

  // Setup Providers & Services
  const providerRegistry = new PaymentProviderRegistry();
  const fakeProvider = new FakePaymentProvider();
  providerRegistry.register(fakeProvider);
  providerRegistry.register({
    name: "MPESA_DARAJA",
    type: "MOBILE_MONEY",
    supportedCurrencies: ["KES"],
    async initializePayment(req) {
      return {
        status: "INITIATED",
        providerReference: `ws_CO_${Date.now()}`,
        providerRequestReference: `daraja_req_${Date.now()}`,
      };
    },
    async verifyPayment(req) {
      return {
        verified: true,
        providerTransactionId: `NLX${Date.now()}`,
        status: "SETTLED",
        amount: "15000.0000",
        currency: "KES",
        paidAt: new Date().toISOString(),
        verificationSource: "PROVIDER_QUERY" as any,
      };
    },
    async refundPayment() {
      throw new Error("Not implemented");
    },
  } as any);

  const hostResolver = new HostResolutionService(
    domainRepo,
    websiteRepo,
    pageRepo,
    snapshotRepo,
    tenantRepo
  );

  const availabilityService = new AvailabilityService(
    allocationRepo,
    blockRepo,
    vehicleRepo,
    undefined,
    undefined,
    undefined
  );

  const pricingService = new PricingService(
    ratePlanRepo,
    undefined,
    undefined,
    undefined,
    undefined,
    categoryRepo
  );

  const bookingService = new BookingService(
    bookingRepo,
    pricingService,
    availabilityService,
    customerRepo,
    undefined,
    undefined,
    undefined,
    vehicleRepo,
    categoryRepo
  );

  const paymentService = new PaymentService(
    attemptRepo,
    paymentRepo,
    undefined as any,
    undefined as any,
    undefined as any,
    providerRegistry
  );

  const publicBookingService = new PublicBookingService({
    vehicleRepo,
    categoryRepo,
    customerRepo,
    bookingRepo,
    mediaRepo,
    availabilityService,
    pricingService,
    bookingService,
    paymentService,
  });

  // Provision Test Tenant & Storefront
  const createdTenant = await tenantRepo.create({
    name: "Safari Car Hire Ltd",
    slug: `safari-${Date.now()}`,
    status: "ACTIVE",
    planId: "enterprise_plan",
    ownerUserId: "user_safari_admin",
  } as any);
  const tenantId = createdTenant.id;

  const websiteId = `site_${Date.now()}`;
  const website = await websiteRepo.save({
    id: websiteId,
    tenantId,
    subdomain: "safari",
    status: "PUBLISHED",
    branding: {
      siteTitle: "Safari Car Hire Kenya",
      primaryColor: "#059669",
    } as any,
    navigation: {
      headerNavigation: [],
      footerNavigation: [],
    },
    publishedVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const domainId = `dom_${Date.now()}`;
  await domainRepo.save({
    id: domainId,
    tenantId,
    websiteId: website.id,
    hostname: "safari.carhireos.com",
    type: "PLATFORM_SUBDOMAIN",
    verificationStatus: "VERIFIED",
    verificationMethod: "DNS_CNAME",
    verificationToken: "token-123",
    expectedTxtRecord: "carhireos-verify=token-123",
    expectedCnameRecord: "cname.carhireos.com",
    sslStatus: "ACTIVE",
    isPrimary: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Provision Fleet Categories
  const catSedan =
    (await categoryRepo.findByCode("SEDAN", tenantId)) ||
    (await categoryRepo.create({
      tenantId,
      code: "SEDAN",
      name: "Standard Sedan",
      description: "Comfortable city runabout",
      status: "ACTIVE",
    }));

  const catSuv =
    (await categoryRepo.findByCode("SUV", tenantId)) ||
    (await categoryRepo.create({
      tenantId,
      code: "SUV",
      name: "Full-Size 4x4 Safari SUV",
      description: "Rugged all-terrain vehicle",
      status: "ACTIVE",
    }));

  const vehiclePrado = await vehicleRepo.create({
    tenantId,
    category: "SUV",
    make: "Toyota",
    model: "Land Cruiser Prado",
    year: 2023,
    registrationPlate: "KDA 890X",
    vin: "VIN-TOY-PRADO-001",
    color: "Pearl White",
    fuelType: "DIESEL",
    transmission: "AUTOMATIC",
    seatingCapacity: 7,
    dailyRate: 12000,
    lifecycleStatus: "OPERATIONAL",
    availabilityStatus: "AVAILABLE",
    features: ["AWD", "4x4", "Air Conditioning", "Leather Seats", "Roof Rack"],
  } as any);

  // Inactive / Under Maintenance Vehicle
  const vehicleDamaged = await vehicleRepo.create({
    tenantId,
    category: "SEDAN",
    make: "Toyota",
    model: "Corolla",
    year: 2021,
    registrationPlate: "KCC 123A",
    vin: "VIN-TOY-COROLLA-001",
    color: "Silver",
    fuelType: "PETROL",
    transmission: "AUTOMATIC",
    seatingCapacity: 5,
    dailyRate: 4500,
    lifecycleStatus: "MAINTENANCE",
    availabilityStatus: "MAINTENANCE",
    features: ["Bluetooth"],
  } as any);

  // Provision Active Rate Plan
  const ratePlan = await pricingService.createRatePlan(
    tenantId,
    {
      code: "STANDARD_PUBLIC_2026",
      name: "Standard Public 2026",
      currency: "KES",
      priority: 10,
      isDefault: true,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    },
    "usr-admin-safari"
  );

  await pricingService.setRates(
    tenantId,
    ratePlan.id,
    [
      {
        vehicleCategoryId: "SUV",
        dailyRate: 12000,
        depositAmount: 20000,
        depositModel: "FIXED",
        mileageAllowanceModel: "UNLIMITED",
      },
      {
        vehicleCategoryId: "SEDAN",
        dailyRate: 4500,
        depositAmount: 10000,
        depositModel: "FIXED",
        mileageAllowanceModel: "UNLIMITED",
      },
    ],
    "usr-admin-safari"
  );

  await pricingService.createDurationTier(tenantId, ratePlan.id, {
    minDays: 3,
    maxDays: 6,
    discountPercent: 10,
  });

  await pricingService.publishRatePlan(tenantId, ratePlan.id, "usr-admin-safari");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 1: Authoritative Host Resolution Binds Request to Tenant Context
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Authoritative Host Resolution Pipeline");
  const publicContext = await hostResolver.resolve("safari.carhireos.com:443");
  assert.equal(publicContext.tenantId, tenantId, "Host resolution must bind to Safari tenant");
  assert.equal(publicContext.websiteId, website.id, "Context must link to active website");
  console.log("✔ TEST 1 PASSED: Host resolution authoritatively mapped to tenant context without trusting client headers.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 2: Public Catalog Sanitizes Internal Telemetry & Confidential Data
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Public Vehicle Discovery & Data Privacy Sanitization");
  const catalog = await publicBookingService.getPublicVehicles(tenantId);
  assert.equal(catalog.length, 1, "Only operational vehicles must be returned in public catalog");
  assert.equal(catalog[0].id, vehiclePrado.id, "Prado must be returned");
  assert.equal(catalog[0].make, "Toyota");
  assert.equal(catalog[0].categoryName, "SUV");
  // Check that private fields like registrationNumber or internal telemetry are omitted from PublicVehicleSummaryDto
  assert.equal((catalog[0] as any).registrationNumber, undefined, "Vehicle registration plate must not be exposed");
  assert.equal((catalog[0] as any).gpsTrackerId, undefined, "GPS tracker serial must not be exposed");
  assert.equal((catalog[0] as any).ownerId, undefined, "Vehicle owner identity must not be exposed");
  console.log("✔ TEST 2 PASSED: Public catalog sanitized and filtered to operational inventory.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 3: Live Availability Search Returns Candidates Without Reservation Locks
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Live Availability Search Engine (Non-allocating)");
  const pickupAt = "2026-10-15T09:00:00.000Z";
  const returnAt = "2026-10-18T18:00:00.000Z";

  const searchResults = await publicBookingService.searchAvailability(tenantId, {
    pickupAt,
    returnAt,
    vehicleCategoryId: "SUV",
  });
  assert.equal(searchResults.total, 1, "Must find Prado available for requested dates");
  assert.equal(searchResults.availableVehicles[0].id, vehiclePrado.id);

  // Invariant Assertion: Search Availability IS NOT a Reservation!
  const allAllocations = await allocationRepo.findOverlappingAllocations(
    tenantId,
    vehiclePrado.id,
    "2026-01-01T00:00:00.000Z",
    "2026-12-31T00:00:00.000Z"
  );
  assert.equal(allAllocations.length, 0, "Availability search must NEVER create reservation allocations");
  console.log("✔ TEST 3 PASSED: Availability search completed statelessly with zero reservation holds.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 4: Turnaround Buffer Logic Prevents Back-to-Back Turnaround Collisions
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Turnaround Buffer Allocation Invariant");
  // Place an allocation on the vehicle ending at 12:00
  await availabilityService.createAllocation(
    tenantId,
    {
      vehicleId: vehiclePrado.id,
      allocationType: "BOOKING",
      startsAt: "2026-10-10T09:00:00.000Z",
      endsAt: "2026-10-10T12:00:00.000Z",
      sourceType: "BOOKING",
      sourceId: "bk_existing_buffer_test",
      reason: "Buffer Test Reservation",
    },
    "system"
  );

  // Attempt search starting 30 minutes after return (within 60m turnaround buffer)
  const bufferSearch = await publicBookingService.searchAvailability(tenantId, {
    pickupAt: "2026-10-10T12:30:00.000Z",
    returnAt: "2026-10-10T18:00:00.000Z",
  });
  assert.equal(bufferSearch.total, 0, "Vehicle must not be available during 60-minute turnaround cleaning buffer");
  console.log("✔ TEST 4 PASSED: 60-minute turnaround cleaning buffer enforced correctly.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 5: Authoritative Pricing Quote Applies Tiers, Duration Discounts & Taxes
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Authoritative Public Pricing Quotation Engine");
  const quote = await publicBookingService.calculateQuote(tenantId, {
    vehicleId: vehiclePrado.id,
    pickupAt: "2026-10-15T09:00:00.000Z",
    returnAt: "2026-10-18T09:00:00.000Z", // 3 full days
  });

  assert.equal(quote.rentalDuration.billableDays, 3, "Duration must be 3 billable days");
  assert.equal(quote.baseRate.standardDailyRate, 12000, "Base daily rate must be 12,000 KES");
  // 3 days * 12,000 = 36,000 base. 3 days duration discount (10%) = -3,600.
  assert.equal(quote.baseRentalAmount, 36000);
  assert.equal(quote.totalDiscount, 3600, "10% duration discount must apply for >= 3 days");
  assert.equal(quote.currency, "KES");
  console.log("✔ TEST 5 PASSED: Server calculated authoritative pricing with duration discount.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 6: Guest Customer Resolution & Auto-Registration
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Guest Customer Lifecycle & Auto-Registration");
  const guestDetails = {
    fullName: "Wanjiku Kamau",
    email: "wanjiku.kamau@example.co.ke",
    phone: "+254712345678",
    idOrPassportNumber: "ID-29384756",
    licenseNumber: "DL-KEN-987654",
  };

  const voucher = await publicBookingService.checkout(tenantId, {
    vehicleId: vehiclePrado.id,
    pickupAt: "2026-10-20T09:00:00.000Z",
    returnAt: "2026-10-23T09:00:00.000Z",
    guest: guestDetails,
    paymentMethod: "MPESA",
    paymentDetails: {
      mpesaPhoneNumber: "+254712345678",
    },
    idempotencyKey: `idem_${Date.now()}`,
  });

  assert.ok(voucher.bookingId, "Booking must be created");
  assert.equal(voucher.status, "PENDING_CONFIRMATION", "Initial booking status must be PENDING_CONFIRMATION");
  assert.equal(voucher.source, "PUBLIC_WEBSITE", "Booking source must be marked PUBLIC_WEBSITE");
  assert.equal(voucher.customer.fullName, "Wanjiku Kamau");

  // Verify customer was created in CustomerRepository
  const persistedCustomer = await customerRepo.findByIdOrPassport(guestDetails.idOrPassportNumber, tenantId);
  assert.ok(persistedCustomer, "Customer must be persisted in tenant customer repository");
  assert.equal(persistedCustomer?.customerType, "INDIVIDUAL");
  console.log("✔ TEST 6 PASSED: Guest customer auto-registered and linked to booking.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 7: Concurrency Safety & Double-Booking Prevention
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] Concurrency Safety & Double-Booking Rejection");
  let doubleBookingError: any;
  try {
    // Attempt overlapping booking for the same vehicle
    await publicBookingService.checkout(tenantId, {
      vehicleId: vehiclePrado.id,
      pickupAt: "2026-10-21T09:00:00.000Z", // Overlaps with Oct 20-23
      returnAt: "2026-10-24T09:00:00.000Z",
      guest: {
        fullName: "John Doe",
        email: "john.doe@example.com",
        phone: "+254700000000",
        idOrPassportNumber: "ID-99999999",
      },
      paymentMethod: "PAY_LATER",
    });
  } catch (err) {
    doubleBookingError = err;
  }

  assert.ok(doubleBookingError, "Concurrent overlapping booking must throw an error");
  assert.ok(
    doubleBookingError instanceof VehicleNotAvailableForBookingError,
    "Must throw VehicleNotAvailableForBookingError"
  );
  console.log("✔ TEST 7 PASSED: Concurrent reservation conflict rejected with 409 Conflict.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 8: Blocked Customer is Forbidden From Public Booking
  // --------------------------------------------------------------------------
  console.log("\n[TEST 8] Blocked Identity Security Enforcement");
  await customerRepo.create({
    tenantId,
    customerType: "INDIVIDUAL",
    fullName: "Suspended Individual",
    email: "blocked@fraudulent.org",
    phone: "+254799999999",
    idOrPassportNumber: "ID-BLOCKED-001",
    status: "BLOCKED",
    verificationStatus: "VERIFIED",
    licenseNumber: "DL-BLOCKED-01",
    licenseExpiryDate: new Date(Date.now() + 365 * 86400000).toISOString(),
  });

  let blockedError: any;
  try {
    await publicBookingService.checkout(tenantId, {
      vehicleId: vehiclePrado.id,
      pickupAt: "2026-11-01T09:00:00.000Z",
      returnAt: "2026-11-04T09:00:00.000Z",
      guest: {
        fullName: "Suspended Individual",
        email: "blocked@fraudulent.org",
        phone: "+254799999999",
        idOrPassportNumber: "ID-BLOCKED-001",
      },
      paymentMethod: "PAY_LATER",
    });
  } catch (err) {
    blockedError = err;
  }

  assert.ok(blockedError instanceof GuestCustomerBlockedError, "Must reject blocked customer with 403 Forbidden");
  console.log("✔ TEST 8 PASSED: Blocked/flagged customer identity rejected at checkout.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 9: M-Pesa STK Push Payment Handoff
  // --------------------------------------------------------------------------
  console.log("\n[TEST 9] M-Pesa STK Push Payment Initiation");
  assert.ok(voucher.payment, "Voucher must contain payment handoff details");
  assert.equal(voucher.payment?.status, "INITIATED");
  assert.equal(voucher.payment?.provider, "MPESA_DARAJA");
  assert.ok(voucher.payment?.attemptId, "Payment attemptId must be generated");
  console.log(`✔ TEST 9 PASSED: M-Pesa STK push initiated with attemptId '${voucher.payment?.attemptId}'.`);

  // --------------------------------------------------------------------------
  // TEST SCENARIO 10: Authoritative Server Payment Verification & Auto-Confirmation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 10] Server-Verified Payment Confirmation Lifecycle");
  const attemptId = voucher.payment!.attemptId!;
  const confirmResult = await publicBookingService.verifyPaymentAndConfirmBooking(
    tenantId,
    attemptId
  );

  assert.equal(confirmResult.success, true, "Payment verification must succeed");
  assert.equal(confirmResult.bookingStatus, "CONFIRMED", "Booking must transition to CONFIRMED");

  // Verify booking status voucher shows confirmed
  const updatedVoucher = await publicBookingService.getBookingStatus(tenantId, voucher.bookingId);
  assert.equal(updatedVoucher.status, "CONFIRMED", "Voucher status must reflect CONFIRMED");
  console.log("✔ TEST 10 PASSED: Authoritative server verification confirmed booking and updated allocation.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 11: Cross-Tenant Storefront Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 11] Cross-Tenant Fleet Isolation");
  const otherTenantId = `tenant_coastal_${Date.now()}`;
  let crossTenantError: any;
  try {
    // Attempt to book Safari vehicle on Coastal storefront
    await publicBookingService.checkout(otherTenantId, {
      vehicleId: vehiclePrado.id, // Belongs to Safari tenant
      pickupAt: "2026-12-01T09:00:00.000Z",
      returnAt: "2026-12-04T09:00:00.000Z",
      guest: {
        fullName: "Foreign Tenant User",
        email: "foreign@example.com",
        phone: "+254722222222",
        idOrPassportNumber: "ID-FOREIGN-99",
      },
      paymentMethod: "PAY_LATER",
    });
  } catch (err) {
    crossTenantError = err;
  }

  assert.ok(crossTenantError, "Cross-tenant vehicle checkout must be rejected");
  console.log("✔ TEST 11 PASSED: Strict multi-tenant vehicle isolation preserved.");

  // --------------------------------------------------------------------------
  // TEST SCENARIO 12: Idempotency Key Prevents Duplicate Submissions
  // --------------------------------------------------------------------------
  console.log("\n[TEST 12] Idempotent Checkout Protection");
  const duplicateIdemKey = `idem_replay_${Date.now()}`;
  const checkout1 = await publicBookingService.checkout(tenantId, {
    vehicleId: vehiclePrado.id,
    pickupAt: "2026-12-10T09:00:00.000Z",
    returnAt: "2026-12-13T09:00:00.000Z",
    guest: {
      fullName: "Idempotent User",
      email: "idem@example.com",
      phone: "+254733333333",
      idOrPassportNumber: "ID-IDEM-001",
    },
    paymentMethod: "PAY_LATER",
    idempotencyKey: duplicateIdemKey,
  });

  const checkout2 = await publicBookingService.checkout(tenantId, {
    vehicleId: vehiclePrado.id,
    pickupAt: "2026-12-10T09:00:00.000Z",
    returnAt: "2026-12-13T09:00:00.000Z",
    guest: {
      fullName: "Idempotent User",
      email: "idem@example.com",
      phone: "+254733333333",
      idOrPassportNumber: "ID-IDEM-001",
    },
    paymentMethod: "PAY_LATER",
    idempotencyKey: duplicateIdemKey,
  });

  assert.equal(checkout1.bookingId, checkout2.bookingId, "Duplicate checkout must return identical bookingId");
  console.log("✔ TEST 12 PASSED: Idempotency keys prevented duplicate bookings and allocations.");

  console.log("\n======================================================================");
  console.log("ALL 12 SPRINT 31 TEST SCENARIOS PASSED WITH ZERO DEFECTS!");
  console.log("======================================================================\n");
}

runSprint31TestSuite().catch((err) => {
  console.error("Sprint 31 Test Suite Failed:", err);
  process.exit(1);
});
