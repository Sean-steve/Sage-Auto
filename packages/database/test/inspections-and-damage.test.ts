// ============================================================================
// CAR HIRE OS — SPRINT 15 COMPREHENSIVE TEST SUITE (DOM-003 §21-22, DEV-004, SEC-007)
// Bounded Context: Inspections, Damage Cases, Evidence & Comparison Engine
// ============================================================================

import assert from "node:assert/strict";
import {
  InspectionRepository,
  DamageRepository,
  InspectionTemplateRepository,
  VehicleRepository,
  BookingRepository,
  RentalRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
  CrossTenantViolationError,
  InspectionNotFoundError,
  DamageCaseNotFoundError,
  InspectionOdometerRegressionError,
  InspectionInvalidFuelLevelError,
  InspectionInvalidStateTransitionError,
  ConcurrencyConflictError,
} from "../src";
import { InspectionService } from "../../../apps/api/src/modules/inspections/application/inspection.service";
import { InspectionStateMachine } from "../../../apps/api/src/modules/inspections/domain/inspection-state-machine";
import { InspectionComparisonEngine } from "../../../apps/api/src/modules/inspections/domain/inspection-comparison";

async function runTests() {
  console.log("----------------------------------------------------------------");
  console.log("RUNNING SPRINT 15 TEST SUITE: INSPECTIONS, DAMAGE & EVIDENCE");
  console.log("----------------------------------------------------------------");

  // Setup repos & service
  InspectionRepository.clear();
  DamageRepository.clear();
  InspectionTemplateRepository.clear();
  VehicleRepository.clear();

  const inspectionRepo = new InspectionRepository();
  const damageRepo = new DamageRepository();
  const templateRepo = new InspectionTemplateRepository();
  const vehicleRepo = new VehicleRepository();
  const bookingRepo = new BookingRepository();
  const rentalRepo = new RentalRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();
  const idempotencyRepo = new IdempotencyRepository();

  const service = new InspectionService(
    inspectionRepo,
    damageRepo,
    templateRepo,
    vehicleRepo,
    bookingRepo,
    rentalRepo,
    auditRepo,
    outboxRepo,
    idempotencyRepo
  );

  const tenantA = "tenant_alpha_safari";
  const tenantB = "tenant_beta_coastal";
  const actor = {
    userId: "usr_inspector_01",
    membershipId: "mbr_inspector_01",
    actorType: "USER" as const,
  };

  // Seed vehicle for tenantA
  const vehicleA = await vehicleRepo.create({
    tenantId: tenantA,
    registrationPlate: "KDA 888X",
    vin: "VIN888SAFARI0001",
    make: "Toyota",
    model: "Prado TX-L",
    year: 2024,
    category: "SUV",
    color: "Pearl White",
    imageUrl: "https://images.unsplash.com/prado.jpg",
    dailyRate: 15000,
    excessKmRate: 60,
    allowedDailyKm: 250,
    transmission: "Automatic",
    seats: 7,
    fuelType: "Diesel",
    lifecycleStatus: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    odometer: 12500,
    fuelLevel: 100,
    isPublishedToWebsite: true,
    features: ["4WD", "Sunroof"],
  });

  // --------------------------------------------------------------------------
  // 1. TEMPLATES & BOOTSTRAP
  // --------------------------------------------------------------------------
  console.log("✓ Test 1: Standard inspection template bootstrap and retrieval");
  const templates = await service.listTemplates(tenantA);
  assert.ok(templates.length >= 1, "Default 15-point inspection template must be bootstrapped");
  const defaultTpl = await service.getTemplate(tenantA, "STANDARD_15_POINT");
  assert.equal(defaultTpl.code, "STANDARD_15_POINT");
  assert.ok(defaultTpl.sections.length >= 4, "Template must include multiple checklist sections");

  // --------------------------------------------------------------------------
  // 2. PRE-RENTAL INSPECTION CREATION & LIFECYCLE
  // --------------------------------------------------------------------------
  console.log("✓ Test 2: Create draft pre-rental inspection and start walkaround");
  const preInspection = await service.createInspection(
    tenantA,
    {
      inspectionType: "PRE_RENTAL",
      vehicleId: vehicleA.id,
      rentalId: "rnt_sample_001",
      odometer: 12500,
      fuelLevel: 100,
      notes: "Clean vehicle prepared for handover dispatch",
    },
    actor
  );

  assert.equal(preInspection.status, "DRAFT");
  assert.equal(preInspection.inspectionType, "PRE_RENTAL");
  assert.equal(preInspection.odometer, 12500);
  assert.equal(preInspection.fuelLevel, 100);
  assert.ok(preInspection.inspectionNumber.startsWith("INS-"));

  // Start inspection
  const started = await service.startInspection(tenantA, preInspection.id, {}, actor);
  assert.equal(started.status, "IN_PROGRESS");
  assert.ok(started.startedAt);

  // --------------------------------------------------------------------------
  // 3. RECORD CHECKLIST RESPONSES & EVIDENCE
  // --------------------------------------------------------------------------
  console.log("✓ Test 3: Record checklist responses and attach integrity evidence");
  const recordedResp = await service.recordResponses(
    tenantA,
    preInspection.id,
    {
      responses: [
        {
          itemCode: "EXT_TIRES",
          responseValue: "PASS",
          condition: "GOOD",
          notes: "Tread depth 6mm, pressure verified at 32 psi",
        },
        {
          itemCode: "EXT_LIGHTS",
          responseValue: "PASS",
          condition: "GOOD",
        },
        {
          itemCode: "SAF_SPARE_WHEEL",
          responseValue: "PASS",
          condition: "GOOD",
        },
      ],
    },
    actor
  );
  assert.equal(recordedResp.responses.length, 3);

  // Add evidence photo
  const evidence = await service.addEvidence(
    tenantA,
    preInspection.id,
    {
      fileId: "fil_odometer_snap_001",
      evidenceType: "PHOTO",
      url: "https://storage.carhire.os/evidence/odo_12500.jpg",
      checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      mimeType: "image/jpeg",
      fileSize: 2048500,
      source: "MOBILE_APP",
    },
    actor
  );
  assert.equal(evidence.evidenceType, "PHOTO");
  assert.equal(evidence.source, "MOBILE_APP");

  // Record pre-existing scratch
  console.log("✓ Test 4: Record pre-existing minor damage observation");
  const scratchObs = await service.recordDamageObservation(
    tenantA,
    preInspection.id,
    {
      bodyZone: "FRONT_BUMPER",
      damageType: "SCRATCH",
      severity: "MINOR",
      description: "Minor superficial scratch on lower bumper lip",
      preExisting: true,
      estimatedCost: 2500,
      photoUrls: ["https://storage.carhire.os/evidence/scratch_bumper.jpg"],
    },
    actor
  );
  assert.equal(scratchObs.preExisting, true);
  assert.equal(scratchObs.attribution, "PRE_EXISTING");

  // Customer signature
  console.log("✓ Test 5: Customer digital signature acknowledgement");
  const ack = await service.addAcknowledgement(
    tenantA,
    preInspection.id,
    {
      signerType: "CUSTOMER",
      signerId: "usr_customer_01",
      signerName: "Kiprono Koech",
      signatureMethod: "DRAWN_CANVAS",
      signatureReference: "sig_blob_reference_encrypted",
      ipAddress: "197.232.14.88",
      userAgent: "Safari iOS Mobile 18.2",
    },
    actor
  );
  assert.equal(ack.signerType, "CUSTOMER");
  assert.equal(ack.signatureMethod, "DRAWN_CANVAS");

  // Complete pre-rental inspection
  console.log("✓ Test 6: Seal & complete pre-rental baseline inspection");
  const completedPre = await service.completeInspection(
    tenantA,
    preInspection.id,
    {
      odometer: 12500,
      fuelLevel: 100,
      overallCondition: "EXCELLENT",
      notes: "Pre-rental audit successfully finalized and handed over",
    },
    actor
  );
  assert.equal(completedPre.status, "COMPLETED");
  assert.ok(completedPre.completedAt);

  // --------------------------------------------------------------------------
  // 4. STATE MACHINE IMMUTABILITY & CORRECTIONS
  // --------------------------------------------------------------------------
  console.log("✓ Test 7: Verify completed inspection immutability & audit correction");
  assert.throws(
    () => InspectionStateMachine.assertCanTransition("COMPLETED", "IN_PROGRESS"),
    (err: any) => err instanceof InspectionInvalidStateTransitionError
  );

  // Apply audit correction
  const correction = await service.correctInspection(
    tenantA,
    preInspection.id,
    {
      correctionReason: "Typo corrected in notes by dispatch supervisor",
      correctedFields: {
        notes: "Pre-rental audit finalized and verified with customer present",
      },
    },
    actor
  );
  assert.equal(correction.correctionReason, "Typo corrected in notes by dispatch supervisor");

  // --------------------------------------------------------------------------
  // 5. RETURN INSPECTION & COMPARISON ENGINE
  // --------------------------------------------------------------------------
  console.log("✓ Test 8: Create return inspection with new damage & mileage deficit");
  const returnInspection = await service.createInspection(
    tenantA,
    {
      inspectionType: "RETURN",
      vehicleId: vehicleA.id,
      rentalId: "rnt_sample_001",
      odometer: 12850, // 350 km driven
      fuelLevel: 75, // 25% deficit
      notes: "Vehicle returned after 3-day rental period",
    },
    actor
  );

  await service.startInspection(tenantA, returnInspection.id, {}, actor);

  // Record pre-existing bumper scratch (still present)
  await service.recordDamageObservation(
    tenantA,
    returnInspection.id,
    {
      bodyZone: "FRONT_BUMPER",
      damageType: "SCRATCH",
      severity: "MINOR",
      description: "Pre-existing scratch on bumper",
      preExisting: true,
    },
    actor
  );

  // Record NEW dent on Right Rear Door
  const newDentObs = await service.recordDamageObservation(
    tenantA,
    returnInspection.id,
    {
      bodyZone: "RIGHT_REAR_DOOR",
      damageType: "DENT",
      severity: "MODERATE",
      description: "Parking lot door dent with paint crease",
      preExisting: false,
      estimatedCost: 15000,
    },
    actor
  );
  assert.equal(newDentObs.preExisting, false);
  assert.ok(newDentObs.damageCaseId, "New moderate damage should auto-create a DamageCase");

  // Complete return inspection (triggers automatic comparison)
  const completedReturn = await service.completeInspection(
    tenantA,
    returnInspection.id,
    {
      odometer: 12850,
      fuelLevel: 75,
      overallCondition: "GOOD",
    },
    actor
  );
  assert.equal(completedReturn.status, "COMPLETED");

  // Verify Vehicle was updated
  const updatedVehicle = await vehicleRepo.findById(vehicleA.id, tenantA);
  assert.equal(updatedVehicle?.odometer, 12850);
  assert.equal(updatedVehicle?.fuelLevel, 75);

  // Verify Comparison Engine Result
  console.log("✓ Test 9: Verify Inspection Comparison Engine calculation");
  const comparison = await service.getComparisonByRental(tenantA, "rnt_sample_001");
  assert.ok(comparison, "Comparison must be saved for the rental");
  assert.equal(comparison.odometerDelta, 350, "Odometer delta must be 350 km");
  assert.equal(comparison.fuelLevelDelta, -25, "Fuel delta must be -25%");
  assert.equal(comparison.newDamageCount, 1, "Must detect 1 NEW damage");
  assert.equal(comparison.unchangedDamageCount, 1, "Must detect 1 UNCHANGED damage");

  // --------------------------------------------------------------------------
  // 6. DAMAGE CASES MANAGEMENT
  // --------------------------------------------------------------------------
  console.log("✓ Test 10: Damage case tracking and repair assessment");
  const damageCases = await service.listDamageCases(tenantA, { rentalId: "rnt_sample_001" });
  assert.equal(damageCases.items.length, 1);
  const damageCase = damageCases.items[0];
  assert.equal(damageCase.status, "OPEN");
  assert.equal(damageCase.severity, "MODERATE");

  // Update Damage Case
  const assessedCase = await service.updateDamageCase(
    tenantA,
    damageCase.id,
    {
      status: "CONFIRMED",
      actualRepairCost: 14500,
      insuranceClaimNumber: "CLAIM-KEN-2026-9921",
      notes: "Authorized panel beating and respray at approved body shop",
    },
    actor
  );
  assert.equal(assessedCase.status, "CONFIRMED");
  assert.equal(assessedCase.actualRepairCost, 14500);

  // --------------------------------------------------------------------------
  // 7. CONCURRENCY, REGRESSION & ERROR HANDLING
  // --------------------------------------------------------------------------
  console.log("✓ Test 11: Validation error on odometer regression");
  await assert.rejects(
    async () => {
      const regInsp = await service.createInspection(
        tenantA,
        {
          inspectionType: "AD_HOC",
          vehicleId: vehicleA.id,
          odometer: 10000, // lower than 12850
          fuelLevel: 80,
        },
        actor
      );
      await service.completeInspection(
        tenantA,
        regInsp.id,
        {
          odometer: 10000,
          fuelLevel: 80,
        },
        actor
      );
    },
    (err: any) => err instanceof InspectionOdometerRegressionError
  );

  console.log("✓ Test 12: Validation error on invalid fuel level > 100%");
  await assert.rejects(
    async () => {
      const fuelInsp = await service.createInspection(
        tenantA,
        {
          inspectionType: "AD_HOC",
          vehicleId: vehicleA.id,
          odometer: 13000,
          fuelLevel: 100,
        },
        actor
      );
      await service.completeInspection(
        tenantA,
        fuelInsp.id,
        {
          odometer: 13000,
          fuelLevel: 120, // Invalid!
        },
        actor
      );
    },
    (err: any) => err instanceof InspectionInvalidFuelLevelError
  );

  console.log("✓ Test 13: Optimistic concurrency lock conflict on inspection update");
  await assert.rejects(
    async () => {
      await inspectionRepo.update(
        completedReturn.id,
        tenantA,
        { notes: "Conflicting write" },
        999 // Wrong version
      );
    },
    (err: any) => err instanceof ConcurrencyConflictError
  );

  // --------------------------------------------------------------------------
  // 8. MULTI-TENANT ISOLATION
  // --------------------------------------------------------------------------
  console.log("✓ Test 14: Cross-tenant isolation verification");
  await assert.rejects(
    async () => {
      // Tenant B attempts to read Tenant A's inspection
      await service.getInspection(tenantB, completedReturn.id);
    },
    (err: any) => err instanceof CrossTenantViolationError
  );

  await assert.rejects(
    async () => {
      // Tenant B attempts to read Tenant A's damage case
      await service.getDamageCase(tenantB, damageCase.id);
    },
    (err: any) => err instanceof CrossTenantViolationError
  );

  // --------------------------------------------------------------------------
  // 9. AUDIT & OUTBOX VERIFICATION
  // --------------------------------------------------------------------------
  console.log("✓ Test 15: Outbox event emission & audit trail completeness");
  const outboxEvents = await outboxRepo.findPending(100);
  const inspectionEvents = outboxEvents.filter((e) => e.tenantId === tenantA && e.eventType.startsWith("inspection."));
  assert.ok(inspectionEvents.length >= 2, "Must emit inspection.created and inspection.completed outbox events");

  const damageEvents = outboxEvents.filter((e) => e.tenantId === tenantA && e.eventType === "damage.observed");
  assert.ok(damageEvents.length >= 1, "Must emit damage.observed outbox event");

  const auditLogs = await auditRepo.findByTenant(tenantA);
  assert.ok(auditLogs.length >= 3, "Must have recorded inspection audit logs");

  console.log("----------------------------------------------------------------");
  console.log("ALL SPRINT 15 TESTS PASSED SUCCESSFULLY! (15/15)");
  console.log("----------------------------------------------------------------");
}

runTests().catch((err) => {
  console.error("Sprint 15 test failure:", err);
  process.exit(1);
});
