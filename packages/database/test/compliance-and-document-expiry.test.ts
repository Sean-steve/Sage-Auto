// ============================================================================
// CAR HIRE OS — SPRINT 18 COMPREHENSIVE TEST SUITE (DEV-006, DEV-007, DEV-009, DOM-003)
// Bounded Context: Compliance, Document Expiry, Readiness Engine & Operational Blocking
// ============================================================================

import assert from "node:assert/strict";
import {
  ComplianceRequirementRepository,
  ComplianceRecordRepository,
  ComplianceIssueRepository,
  ComplianceOverrideRepository,
  VehicleRepository,
  VehicleBlockRepository,
  DriverRepository,
  CustomerRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
  CrossTenantViolationError,
  RecordNotFoundError,
} from "../src";
import {
  TestClock,
  normalizeExpiryBoundary,
  calculateDaysRemaining,
  evaluateExpiryState,
} from "../../../apps/api/src/modules/compliance/domain/clock";
import {
  evaluateIntervalCoverage,
} from "../../../apps/api/src/modules/compliance/domain/continuous-coverage";
import {
  ComplianceStateMachine,
  FourEyesComplianceViolationError,
} from "../../../apps/api/src/modules/compliance/domain/compliance-state-machine";
import {
  ComplianceReadinessEngine,
} from "../../../apps/api/src/modules/compliance/domain/compliance-readiness-engine";
import { ComplianceService } from "../../../apps/api/src/modules/compliance/application/compliance.service";
import { ComplianceReadinessService } from "../../../apps/api/src/modules/compliance/application/compliance-readiness.service";
import type { ComplianceRecord } from "@carhire/types";

async function runTests() {
  console.log("----------------------------------------------------------------");
  console.log("RUNNING SPRINT 18 TEST SUITE: COMPLIANCE & DOCUMENT EXPIRY");
  console.log("----------------------------------------------------------------");

  // Reset in-memory repositories
  ComplianceRequirementRepository._reset();
  ComplianceRecordRepository._reset();
  ComplianceIssueRepository._reset();
  ComplianceOverrideRepository._reset();
  VehicleRepository.clear();
  VehicleBlockRepository.clear();
  DriverRepository.clear();
  CustomerRepository.clear();

  const clock = new TestClock("2026-06-01T10:00:00.000Z");

  const requirementRepo = new ComplianceRequirementRepository();
  const recordRepo = new ComplianceRecordRepository();
  const issueRepo = new ComplianceIssueRepository();
  const overrideRepo = new ComplianceOverrideRepository();
  const vehicleRepo = new VehicleRepository();
  const vehicleBlockRepo = new VehicleBlockRepository();
  const driverRepo = new DriverRepository();
  const customerRepo = new CustomerRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();
  const idempotencyRepo = new IdempotencyRepository();

  const complianceService = new ComplianceService(
    requirementRepo,
    recordRepo,
    issueRepo,
    overrideRepo,
    vehicleRepo,
    vehicleBlockRepo,
    driverRepo,
    auditRepo,
    outboxRepo,
    idempotencyRepo,
    clock
  );

  const readinessService = new ComplianceReadinessService(
    requirementRepo,
    recordRepo,
    issueRepo,
    overrideRepo,
    vehicleRepo,
    driverRepo,
    customerRepo,
    clock
  );

  const tenantA = "tenant_safari_rentals";
  const tenantB = "tenant_coastal_cruisers";

  // ==========================================================================
  // TEST 1: Catalog Definitions & Strict Tenant Isolation
  // ==========================================================================
  console.log("\n[TEST 1] Requirements catalog creation & tenant isolation...");

  const reqInsurance = await complianceService.createRequirement(
    tenantA,
    {
      code: "VEH_INSURANCE_COMMERCIAL",
      name: "Commercial Fleet Comprehensive Insurance",
      subjectType: "VEHICLE",
      requirementType: "INSURANCE",
      mandatory: true,
      blockingPolicy: "BLOCK_RENTAL_START",
      verificationRequired: true,
      expiryRequired: true,
      warningThresholdDays: 30,
    },
    "admin_1"
  );
  assert.equal(reqInsurance.code, "VEH_INSURANCE_COMMERCIAL");
  assert.equal(reqInsurance.tenantId, tenantA);

  const reqLicense = await complianceService.createRequirement(
    tenantA,
    {
      code: "DRV_LICENSE_VALID",
      name: "Valid National/International Driving Permit",
      subjectType: "DRIVER",
      requirementType: "LICENCE",
      mandatory: true,
      blockingPolicy: "BLOCK_HANDOVER",
      verificationRequired: true,
      expiryRequired: true,
      warningThresholdDays: 14,
    },
    "admin_1"
  );
  assert.equal(reqLicense.code, "DRV_LICENSE_VALID");

  // Tenant B cannot see Tenant A's custom requirements
  const tenantBRequirements = await complianceService.listRequirements(tenantB);
  assert.equal(tenantBRequirements.some((r) => r.id === reqInsurance.id || r.id === reqLicense.id), false);
  assert.ok(tenantBRequirements.every((r) => !r.tenantId || r.tenantId === tenantB));

  // Attempting to access Tenant A's requirement using Tenant B throws CrossTenantViolationError
  await assert.rejects(
    async () => requirementRepo.findById(reqInsurance.id, tenantB),
    (err: any) => err instanceof CrossTenantViolationError
  );
  console.log("✓ Requirements catalog and tenant isolation verified.");

  // ==========================================================================
  // TEST 2: Deterministic Time Engine & Legal Expiry Mathematics
  // ==========================================================================
  console.log("\n[TEST 2] Deterministic time engine & legal date boundaries...");

  // Date-only string "2026-06-30" must normalize to 23:59:59.999Z UTC
  const normalizedEnd = normalizeExpiryBoundary("2026-06-30");
  assert.equal(normalizedEnd.getUTCHours(), 23);
  assert.equal(normalizedEnd.getUTCMinutes(), 59);
  assert.equal(normalizedEnd.getUTCSeconds(), 59);
  assert.equal(normalizedEnd.getUTCMilliseconds(), 999);

  // Clock is at 2026-06-01: Document expiring 2026-06-30 is 29 days away
  const daysLeft = calculateDaysRemaining("2026-06-30", clock.now());
  assert.ok(daysLeft >= 29 && daysLeft <= 30);

  // With warning threshold of 30 days, status should be DUE_SOON
  const statusDueSoon = evaluateExpiryState("2026-06-30", 30, clock.now());
  assert.equal(statusDueSoon, "DUE_SOON");

  // With warning threshold of 14 days, status should be VALID
  const statusValid = evaluateExpiryState("2026-06-30", 14, clock.now());
  assert.equal(statusValid, "VALID");

  // Advance clock past June 30
  const futureClock = new Date("2026-07-01T00:00:01.000Z");
  const statusExpired = evaluateExpiryState("2026-06-30", 30, futureClock);
  assert.equal(statusExpired, "EXPIRED");
  console.log("✓ Deterministic time engine and boundary calculations verified.");

  // ==========================================================================
  // TEST 3: Document Submission, PII Masking & Four-Eyes Verification
  // ==========================================================================
  console.log("\n[TEST 3] Document submission, PII masking & Four-Eyes verification...");

  // Create vehicle in tenantA
  const vehicle = await vehicleRepo.create({
    tenantId: tenantA,
    registrationPlate: "KDD-982X",
    vin: "VIN-KDD-982X-KENYA",
    make: "Toyota",
    model: "Prado",
    year: 2024,
    ownershipType: "COMPANY_OWNED",
    status: "ACTIVE",
    availabilityStatus: "AVAILABLE",
    currentOdometer: 15400,
    fuelLevelPercentage: 100,
  } as any);

  // Submit insurance record
  const record = await complianceService.submitRecord(
    tenantA,
    {
      requirementCode: "VEH_INSURANCE_COMMERCIAL",
      subjectType: "VEHICLE",
      subjectId: vehicle.id,
      documentReference: "POL-JUBILEE-998811",
      identifierNumber: "INS-987654321-KENYA",
      validFrom: "2026-01-01",
      expiresAt: "2026-12-31",
      issuer: "Jubilee Commercial Fleet",
      jurisdiction: "KE",
    },
    "agent_uploader_1"
  );

  assert.equal(record.status, "PENDING");
  assert.equal(record.verificationStatus, "UNVERIFIED");
  // PII masking check: identifierNumber masked (first 2 chars, ****, last 4 chars)
  assert.equal(record.maskedIdentifier, "IN****ENYA");

  // Four-Eyes Enforcement: Submitter cannot verify their own document
  assert.throws(
    () =>
      ComplianceStateMachine.applyVerification(
        record,
        reqInsurance,
        {
          verifiedBy: "agent_uploader_1",
          submitterId: "agent_uploader_1",
          enforceFourEyes: true,
        },
        clock.now()
      ),
    (err: any) => err instanceof FourEyesComplianceViolationError
  );

  // Authorized auditor verifies the document
  const verifiedRecord = await complianceService.verifyRecord(
    tenantA,
    record.id,
    {
      verificationMethod: "DIGITAL_POLICY_API",
      notes: "Checked against Jubilee Fleet API database.",
    },
    "auditor_2"
  );
  assert.equal(verifiedRecord.verificationStatus, "VERIFIED");
  assert.equal(verifiedRecord.status, "VALID");
  assert.equal(verifiedRecord.verifiedBy, "auditor_2");

  // Outbox event was generated
  const outboxItems = await outboxRepo.findPending(100);
  const verifyEvent = outboxItems.find(
    (e) => e.eventType === "compliance.record_verified" && e.tenantId === tenantA
  );
  assert.ok(verifyEvent);
  console.log("✓ Submission, PII masking, four-eyes check, and verification passed.");

  // ==========================================================================
  // TEST 4: Continuous Interval Coverage & Temporal Gaps
  // ==========================================================================
  console.log("\n[TEST 4] Continuous interval coverage & gap detection...");

  const baseRecord: ComplianceRecord = {
    id: "rec_1",
    tenantId: tenantA,
    requirementId: reqInsurance.id,
    requirementCode: "VEH_INSURANCE_COMMERCIAL",
    subjectType: "VEHICLE",
    subjectId: vehicle.id,
    documentReference: "DOC-1",
    validFrom: "2026-06-01",
    expiresAt: "2026-06-15",
    status: "VALID",
    verificationStatus: "VERIFIED",
    version: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };

  // Record 1 covers June 1 to June 15. Rental is June 1 to June 20 -> Gap detected from June 15 to June 20!
  const gapResult = evaluateIntervalCoverage([baseRecord], {
    start: "2026-06-01",
    end: "2026-06-20",
  });
  assert.equal(gapResult.isFullyCovered, false);
  assert.equal(gapResult.gaps.length, 1);
  console.log("✓ Gap correctly detected: missing coverage after 2026-06-15.");

  // Chained successor record covers June 15 to June 30
  const chainedRecord: ComplianceRecord = {
    ...baseRecord,
    id: "rec_2",
    validFrom: "2026-06-15",
    expiresAt: "2026-06-30",
  };

  const fullCoverageResult = evaluateIntervalCoverage([baseRecord, chainedRecord], {
    start: "2026-06-01",
    end: "2026-06-20",
  });
  assert.equal(fullCoverageResult.isFullyCovered, true);
  assert.equal(fullCoverageResult.gaps.length, 0);
  assert.equal(fullCoverageResult.coveringRecordIds.length, 2);
  console.log("✓ Continuous multi-document coverage successfully validated.");

  // ==========================================================================
  // TEST 5: Operational Gating & The RETURN Invariant
  // ==========================================================================
  console.log("\n[TEST 5] Operational context gating & RETURN invariant...");

  // Advance clock to 2027-01-15 (after verifiedRecord expires on 2026-12-31)
  clock.setNow("2027-01-15T12:00:00.000Z");

  // 1. In context RENTAL_START, vehicle MUST BE BLOCKED
  const rentalStartReadiness = await readinessService.evaluateVehicle(
    tenantA,
    vehicle.id,
    "RENTAL_START"
  );
  assert.equal(rentalStartReadiness.isReady, false);
  assert.ok(rentalStartReadiness.blockingIssues.some((b) => b.issueType === "EXPIRED"));
  console.log("✓ RENTAL_START correctly blocked due to expired insurance.");

  // 2. In context HANDOVER, vehicle MUST BE BLOCKED
  const handoverReadiness = await readinessService.evaluateVehicle(
    tenantA,
    vehicle.id,
    "HANDOVER"
  );
  assert.equal(handoverReadiness.isReady, false);
  console.log("✓ HANDOVER correctly blocked due to expired insurance.");

  // 3. CRITICAL INVARIANT: In context RETURN, return MUST NEVER BE BLOCKED!
  const returnReadiness = await readinessService.evaluateVehicle(
    tenantA,
    vehicle.id,
    "RETURN"
  );
  assert.equal(returnReadiness.isReady, true);
  assert.equal(returnReadiness.blockingIssues.length, 0);
  assert.ok(returnReadiness.warnings.length > 0); // Warning preserved for post-return resolution
  console.log("✓ RETURN invariant verified: asset return is never blocked by compliance expiry.");

  // ==========================================================================
  // TEST 6: Managerial Emergency Override
  // ==========================================================================
  console.log("\n[TEST 6] Managerial emergency override audit & gating...");

  // Manager approves emergency override for RENTAL_START
  const override = await complianceService.createOverride(
    tenantA,
    "VEHICLE",
    vehicle.id,
    "VEH_INSURANCE_COMMERCIAL",
    {
      operationContext: "RENTAL_START",
      reason: "Grace period endorsement active from insurer via letter #LTR-992; physical certificate pending.",
      validUntil: "2027-01-16T12:00:00.000Z",
    },
    "manager_emergency_auth"
  );
  assert.equal(override.approvedBy, "manager_emergency_auth");

  // Re-evaluating vehicle for RENTAL_START should now pass (isReady = true) with warning
  const overriddenReadiness = await readinessService.evaluateVehicle(
    tenantA,
    vehicle.id,
    "RENTAL_START"
  );
  assert.equal(overriddenReadiness.isReady, true);
  assert.equal(overriddenReadiness.blockingIssues.length, 0);
  assert.ok(overriddenReadiness.warnings.some((w) => w.message.includes("OVERRIDDEN")));
  console.log("✓ Emergency managerial override successfully unblocked operational dispatch.");

  // Delete override: immediately reverts to blocked!
  await complianceService.deleteOverride(tenantA, override.id, "auditor_reverter");
  const revertedReadiness = await readinessService.evaluateVehicle(
    tenantA,
    vehicle.id,
    "RENTAL_START"
  );
  assert.equal(revertedReadiness.isReady, false);
  console.log("✓ Override revocation immediately reinstates operational block.");

  // ==========================================================================
  // TEST 7: Fleet Availability Synchronization & Multi-Blocker Coordination
  // ==========================================================================
  console.log("\n[TEST 7] Periodic compliance sweep & multi-blocker coordination...");

  // Trigger evaluation sweep
  await complianceService.evaluateTenantCompliance(tenantA);

  // Vehicle should now have a COMPLIANCE block and availabilityStatus = BLOCKED
  const refreshedVehicle = await vehicleRepo.findById(vehicle.id, tenantA);
  assert.equal(refreshedVehicle?.availabilityStatus, "BLOCKED");

  const blocks = await vehicleBlockRepo.findByVehicleId(vehicle.id, tenantA);
  const complianceBlock = blocks.find((b) => b.blockType === "COMPLIANCE" && b.status === "ACTIVE");
  assert.ok(complianceBlock);
  console.log("✓ Fleet compliance block successfully synchronized.");

  // Place an independent MAINTENANCE block
  const maintenanceBlock = await vehicleBlockRepo.create({
    tenantId: tenantA,
    vehicleId: vehicle.id,
    blockType: "MAINTENANCE",
    status: "ACTIVE",
    reason: "Scheduled engine overhaul",
    blockedFrom: clock.nowIso(),
  });

  // Now renew the insurance policy with a valid document for 2027
  const renewal = await complianceService.renewRecord(
    tenantA,
    record.id,
    {
      documentReference: "POL-JUBILEE-2027-RENEWED",
      validFrom: "2027-01-01",
      expiresAt: "2027-12-31",
      issuer: "Jubilee Insurance Kenya",
    },
    "agent_renew"
  );
  await complianceService.verifyRecord(
    tenantA,
    renewal.id,
    { verificationMethod: "AUDIT_VERIFIED" },
    "auditor_renewal"
  );

  // Re-run compliance sweep
  await complianceService.evaluateTenantCompliance(tenantA);

  // Compliance block is released, BUT vehicle must REMAIN BLOCKED due to maintenance block!
  const updatedBlocks = await vehicleBlockRepo.findByVehicleId(vehicle.id, tenantA);
  const activeCompliance = updatedBlocks.find((b) => b.blockType === "COMPLIANCE" && b.status === "ACTIVE");
  assert.equal(activeCompliance, undefined); // released!

  const vehicleStillBlocked = await vehicleRepo.findById(vehicle.id, tenantA);
  assert.equal(vehicleStillBlocked?.availabilityStatus, "BLOCKED");
  console.log("✓ Multi-blocker coordination verified: vehicle remains blocked while maintenance block active.");

  // Release maintenance block
  await vehicleBlockRepo.update(maintenanceBlock.id, tenantA, {
    status: "RELEASED",
    releasedAt: clock.nowIso(),
  });

  // Trigger sweep again: now with ALL blockers clear, vehicle returns to AVAILABLE!
  await complianceService.evaluateSubjectCompliance(tenantA, "VEHICLE", vehicle.id);
  const fullyRestoredVehicle = await vehicleRepo.findById(vehicle.id, tenantA);
  assert.equal(fullyRestoredVehicle?.availabilityStatus, "AVAILABLE");
  console.log("✓ Fleet availability successfully restored to AVAILABLE after all blockers resolved.");

  console.log("================================================================");
  console.log("ALL SPRINT 18 COMPLIANCE & EXPIRY TESTS COMPLETED SUCCESSFULLY!");
  console.log("================================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
