// ============================================================================
// CAR HIRE OS — SPRINT 43 BACKUP & DISASTER RECOVERY TEST SUITE
// SPRINT 43: Authoritative Backup, Restore Assurance, PITR, Data Durability,
// Queue/Worker Recovery, Financial Reconciliation & Multi-Region DR Verification
// ============================================================================

import assert from "assert";
import {
  ProductionBackupEngine,
  ProductionRestoreEngine,
  ProductionPitrEngine,
  TenantSelectiveRecoveryEngine,
  PostRestoreFinancialReconciler,
  QueueReconstructionEngine,
  AnalyticsReconstructionEngine,
  ObjectStorageProtectionEngine,
  DisasterRecoveryDrillRunner,
  DR_RUNBOOKS,
} from "../src/backup-and-dr";
import { ProductionMigrationEngine } from "../src/migration-engine";

async function runSprint43DrTests() {
  console.log("======================================================================");
  console.log("🚀 STARTING SPRINT 43 BACKUP & DISASTER RECOVERY ASSURANCE SUITE");
  console.log("======================================================================");

  // Reset states
  ProductionBackupEngine.resetCatalog();
  ProductionBackupEngine.initializeCatalog();

  // --------------------------------------------------------------------------
  // TEST 1: AUTHORITATIVE BACKUP GENERATION, CHECKSUMS & WORM COMPLIANCE
  // --------------------------------------------------------------------------
  console.log("\n[Test 1] Validating Authoritative Backup Creation & WORM Immutability...");
  const created = ProductionBackupEngine.createBackup({
    type: "FULL_PHYSICAL",
    storageRegion: "af-south-1",
    retentionDays: 2555, // 7 years financial compliance
    sourceData: {
      tenants: [{ id: "tenant-nairobi", name: "Auto Spec Sage Nairobi" }],
      vehicles: [{ id: "veh-001", regNumber: "KDA 123A", tenantId: "tenant-nairobi" }],
      bookings: [{ id: "bk-001", status: "CONFIRMED", tenantId: "tenant-nairobi" }],
    },
    tenantIds: ["tenant-nairobi"],
  });

  assert.ok(created.metadata.id.startsWith("bkp-"), "Backup ID should start with bkp-");
  assert.strictEqual(created.metadata.backupType, "FULL_PHYSICAL");
  assert.strictEqual(created.metadata.encryptionAlgorithm, "AES-256-GCM");
  assert.strictEqual(created.metadata.storageTier, "WORM_COMPLIANCE");
  assert.strictEqual(created.metadata.retentionDays, 2555);
  assert.ok(created.metadata.sha256Checksum.length === 64, "SHA-256 checksum should be 64 hex characters");
  assert.ok(new Date(created.metadata.immutableUntil) > new Date(), "WORM retention should extend into future");

  const integrityCheck = ProductionBackupEngine.verifyBackupIntegrity(created.metadata.id);
  assert.strictEqual(integrityCheck.valid, true, "Backup archive must pass cryptographic integrity check");
  assert.strictEqual(integrityCheck.checksum, created.metadata.sha256Checksum);
  console.log("  ✔ Authoritative backup generated with SHA-256 checksum and 7-year WORM compliance.");

  // --------------------------------------------------------------------------
  // TEST 2: POINT-IN-TIME RECOVERY (PITR) & CONTINUOUS WAL LOG ARCHIVE
  // --------------------------------------------------------------------------
  console.log("\n[Test 2] Validating Point-In-Time Recovery (PITR) & WAL Segment Planning...");
  const walArchive = ProductionPitrEngine.getWalArchive();
  assert.ok(walArchive.length >= 90, "WAL archive should contain continuous segments");

  const targetValidTime = walArchive[15].timestamp;
  const pitrPlan = ProductionPitrEngine.planPitr(created.metadata.id, targetValidTime);
  assert.strictEqual(pitrPlan.isFeasible, true, "PITR plan within WAL window must be feasible");
  assert.ok(pitrPlan.walSegmentsRequired.length > 0, "PITR plan must identify required WAL segments");
  assert.ok(pitrPlan.calculatedRpoSeconds >= 0, "Candidate RPO must be calculated and non-negative");

  // Invalid future timestamp rejection
  const futureTime = new Date(Date.now() + 3600000 * 48).toISOString();
  const invalidPlan = ProductionPitrEngine.planPitr(created.metadata.id, futureTime);
  assert.strictEqual(invalidPlan.isFeasible, false, "Future timestamp beyond WAL horizon must be rejected");
  assert.ok(invalidPlan.validationError?.includes("future"));
  console.log("  ✔ PITR engine successfully computes required WAL replays and rejects invalid horizons.");

  // --------------------------------------------------------------------------
  // TEST 3: PRIVILEGED ACCESS CONTROL & ADVISORY LOCKING DURING RESTORE
  // --------------------------------------------------------------------------
  console.log("\n[Test 3] Validating Privileged Restore Authorization & Advisory Locking...");
  
  // 3.1 Reject unauthorized operator
  let unauthorizedError: any = null;
  try {
    await ProductionRestoreEngine.executeRestore({
      id: "req-unauth-001",
      backupId: created.metadata.id,
      mode: "FULL_DISASTER_RECOVERY",
      targetEnvironment: "DR_SANDBOX",
      requestedBy: "unauthorized-tenant-user",
      authorizedBy: "tenant-standard-operator", // lacks platform authority
      reason: "Unauthorized test attempt",
    });
  } catch (err: any) {
    unauthorizedError = err;
  }
  assert.ok(unauthorizedError, "Restore must fail for unauthorized non-platform roles");
  assert.ok(unauthorizedError.message.includes("lacks INFRASTRUCTURE_AUTHORITY"));
  console.log("  ✔ Unauthorized restore requests are strictly rejected by security policy.");

  // 3.2 Authorized execution with advisory lock
  const validRestore = await ProductionRestoreEngine.executeRestore({
    id: "req-auth-001",
    backupId: created.metadata.id,
    mode: "FULL_DISASTER_RECOVERY",
    targetEnvironment: "DR_SANDBOX",
    requestedBy: "platform-sre-operator",
    authorizedBy: "platform-super-admin-dual-auth",
    reason: "Scheduled DR restore test",
  });
  assert.strictEqual(validRestore.status, "SUCCESS");
  assert.strictEqual(validRestore.schemaValid, true);
  assert.strictEqual(validRestore.migrationsVerified, true);
  assert.strictEqual(validRestore.ledgerBalanced, true);
  assert.strictEqual(ProductionMigrationEngine.isLockHeld(), false, "Advisory lock must be released after restore");
  console.log("  ✔ Authorized restore acquired and safely released exclusive advisory lock.");

  // --------------------------------------------------------------------------
  // TEST 4: BUSINESS INVARIANT PROOF: DOUBLE-ENTRY GENERAL LEDGER EQUILIBRIUM
  // --------------------------------------------------------------------------
  console.log("\n[Test 4] Validating Double-Entry General Ledger Trial Balance Invariant...");
  const ledgerAudit = ProductionRestoreEngine.auditTrialBalance(created.metadata.id);
  assert.strictEqual(ledgerAudit.isBalanced, true, "General Ledger total debits must equal total credits");
  assert.strictEqual(ledgerAudit.discrepancy, 0, "Ledger discrepancy must be zero");
  assert.ok(ledgerAudit.totalDebits > 0, "Debits should be greater than zero");
  console.log(`  ✔ Restored ledger verified in equilibrium: ${ledgerAudit.totalDebits.toLocaleString()} KES debits == ${ledgerAudit.totalCredits.toLocaleString()} KES credits.`);

  // --------------------------------------------------------------------------
  // TEST 5: BUSINESS INVARIANT PROOF: POST-RESTORE FINANCIAL RECONCILIATION
  // --------------------------------------------------------------------------
  console.log("\n[Test 5] Validating Post-Restore Financial Reconciler & Gateway Webhook Audit...");
  const finReport = await PostRestoreFinancialReconciler.reconcileRestoredState(
    created.metadata.completedAt,
    new Date().toISOString()
  );
  assert.strictEqual(finReport.resolved, true, "Financial reconciliation must resolve cleanly");
  assert.ok(finReport.matchedPayments > 0, "Provider payments should be matched");
  assert.ok(finReport.duplicatePrevented > 0, "Duplicate refund operations must be detected and prevented");
  assert.strictEqual(finReport.discrepanciesFound, 0, "Zero unresolvable discrepancies allowed");
  console.log(`  ✔ Financial reconciler ingested delta payments and prevented duplicate refunds.`);

  // --------------------------------------------------------------------------
  // TEST 6: QUEUE & WORKER RECONSTRUCTION FROM PRIMARY POSTGRESQL (REDIS VOLATILITY)
  // --------------------------------------------------------------------------
  console.log("\n[Test 6] Validating Queue & Worker Reconstruction from PostgreSQL Outbox...");
  const queueReport = await QueueReconstructionEngine.reconstructQueuesFromPostgres();
  assert.strictEqual(queueReport.success, true);
  assert.ok(queueReport.queuesRebuilt.includes("outbox-relay"));
  assert.ok(queueReport.outboxEventsScanned > 0, "Outbox events must be scanned");
  assert.ok(queueReport.outboxEventsReenqueued > 0, "Pending outbox events must be re-queued with idempotency keys");
  console.log(`  ✔ Ephemeral Redis state rebuilt: ${queueReport.queuesRebuilt.length} queues hydrated from PostgreSQL outbox.`);

  // --------------------------------------------------------------------------
  // TEST 7: DERIVED DATA & ANALYTICS PROJECTION RECONSTRUCTION
  // --------------------------------------------------------------------------
  console.log("\n[Test 7] Validating Derived Projections & Analytics Rebuild...");
  const analyticsReport = await AnalyticsReconstructionEngine.rebuildAllProjections();
  assert.strictEqual(analyticsReport.success, true);
  assert.ok(analyticsReport.tenantDailyMetricsCalculated > 0);
  assert.ok(analyticsReport.mrrMovementsRecomputed > 0);
  console.log(`  ✔ Derived projections safely reconstructed: ${analyticsReport.tenantDailyMetricsCalculated} metric periods generated.`);

  // --------------------------------------------------------------------------
  // TEST 8: OBJECT STORAGE MANIFEST PROTECTION & WORM VERIFICATION
  // --------------------------------------------------------------------------
  console.log("\n[Test 8] Validating Object Storage Immutability & Manifest Reconciliation...");
  const storageReport = await ObjectStorageProtectionEngine.reconcileObjectStorage();
  assert.strictEqual(storageReport.integrityPercentage, 100.0);
  assert.strictEqual(storageReport.wormProtectionVerified, true);
  assert.strictEqual(storageReport.crossRegionReplicationActive, true);
  assert.strictEqual(storageReport.missingObjectsFound, 0);
  console.log(`  ✔ Object storage audited: 100% integrity across ${storageReport.totalFilesAudited} files with active cross-region replication.`);

  // --------------------------------------------------------------------------
  // TEST 9: SURGICAL TENANT-SELECTIVE RECOVERY DRILL
  // --------------------------------------------------------------------------
  console.log("\n[Test 9] Validating Tenant-Selective Surgical Recovery Drill...");
  const tenantRestore = await TenantSelectiveRecoveryEngine.extractAndRestoreTenant({
    backupId: created.metadata.id,
    targetTenantId: "tenant-nairobi",
    operatorId: "platform-sre",
    authorizationToken: "dr-auth-valid-token",
  });
  assert.strictEqual(tenantRestore.status, "COMPLETED");
  assert.strictEqual(tenantRestore.crossTenantLeakageDetected, false, "Zero cross-tenant leakage allowed");
  assert.strictEqual(tenantRestore.foreignKeyViolations, 0, "Foreign key constraints must be preserved");
  assert.strictEqual(tenantRestore.nonSelectiveDataUntouched, true, "Platform plans/roles must remain untouched");
  console.log(`  ✔ Tenant-selective recovery succeeded: ${tenantRestore.totalRowsExtracted} rows extracted with zero cross-tenant contamination.`);

  // --------------------------------------------------------------------------
  // TEST 10: END-TO-END DISASTER RECOVERY DRILL RUNNER & RPO/RTO MEASUREMENT
  // --------------------------------------------------------------------------
  console.log("\n[Test 10] Executing End-to-End Disaster Recovery Drill & Candidate RPO/RTO...");
  const drillResult = await DisasterRecoveryDrillRunner.runDrill({
    drillType: "SIMULATED_DRILL",
    targetScenario: "MULTI_REGION_FAILOVER",
    backupId: created.metadata.id,
    candidateRpoTargetSeconds: 300, // 5 min
    candidateRtoTargetSeconds: 900, // 15 min
  });

  assert.strictEqual(drillResult.report.status, "SUCCESS");
  assert.strictEqual(drillResult.report.ledgerAuditPassed, true);
  assert.strictEqual(drillResult.report.financialReconciliationPassed, true);
  assert.strictEqual(drillResult.report.invariantsPreserved, true);
  assert.ok(drillResult.report.observedRtoSeconds > 0, "Observed RTO must be measured");
  assert.strictEqual(drillResult.report.rtoCompliant, true, "Observed RTO must satisfy candidate objective");
  console.log(`  ✔ DR Drill completed successfully! Observed Candidate RTO: ${drillResult.report.observedRtoSeconds}s, Observed Candidate RPO: ${drillResult.report.observedRpoSeconds}s.`);

  // --------------------------------------------------------------------------
  // TEST 11: DISASTER RECOVERY RUNBOOKS AUDIT
  // --------------------------------------------------------------------------
  console.log("\n[Test 11] Validating Disaster Recovery Runbooks-as-Code...");
  assert.ok(DR_RUNBOOKS.length >= 4, "Must define at least 4 canonical DR runbooks");
  for (const rb of DR_RUNBOOKS) {
    assert.ok(rb.code.startsWith("RB-DR-"), `Runbook code ${rb.code} must follow convention`);
    assert.ok(rb.steps.length >= 2, `Runbook ${rb.code} must contain executable step sequences`);
    assert.ok(rb.prerequisites.length > 0, `Runbook ${rb.code} must document prerequisites`);
  }
  console.log(`  ✔ All ${DR_RUNBOOKS.length} Disaster Recovery operational runbooks validated.`);

  console.log("======================================================================");
  console.log("🎉 ALL SPRINT 43 BACKUP & DISASTER RECOVERY ASSURANCES PASSED CLEANLY!");
  console.log("======================================================================");
}

runSprint43DrTests().catch((err) => {
  console.error("❌ Sprint 43 Disaster Recovery Test Failure:", err);
  process.exit(1);
});
