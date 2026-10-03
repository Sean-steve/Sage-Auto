// ============================================================================
// CAR HIRE OS — SPRINT 27 TEST SUITE:
// SECURE FILES, DOCUMENT STORAGE, PRIVATE OBJECT ACCESS, UPLOAD PIPELINE,
// DOCUMENT METADATA & FILE SECURITY (ARCH-001, SEC-001, SEC-002, SEC-004, SEC-005)
// ============================================================================

import { strict as assert } from "node:assert";
import {
  FileRepository,
  FileUploadSessionRepository,
  FileScanRecordRepository,
  DocumentRepository,
  DocumentVersionRepository,
  FileResourceLinkRepository,
  FileAccessRecordRepository,
  StorageReconciliationRepository,
  OutboxRepository,
} from "../src/index";
import {
  FileSecurityService,
  EICAR_SIGNATURE,
  InMemoryObjectStorageDriver,
  MockMalwareScanner,
  FileUploadService,
  FileAccessService,
  DocumentLifecycleService,
  StorageReconciliationService,
  ProhibitedFileExtensionError,
  FileSizeLimitExceededError,
  MimeTypeMismatchError,
  InvalidFileStateError,
  SensitiveDocumentAccessDeniedError,
} from "../../../apps/api/src/modules/files";
import { processFileCleanup } from "../../../apps/worker/src/jobs/file-cleanup.job";

async function runSprint27TestSuite() {
  console.log("----------------------------------------------------------------------");
  console.log("RUNNING SPRINT 27: SECURE FILES & DOCUMENT MANAGEMENT SUITE");
  console.log("----------------------------------------------------------------------");

  // Reset in-memory stores
  FileRepository.clear();
  FileUploadSessionRepository.clear();
  FileScanRecordRepository.clear();
  DocumentRepository.clear();
  DocumentVersionRepository.clear();
  FileResourceLinkRepository.clear();
  FileAccessRecordRepository.clear();
  StorageReconciliationRepository.clear();
  OutboxRepository.clear();

  const fileRepo = new FileRepository();
  const sessionRepo = new FileUploadSessionRepository();
  const scanRepo = new FileScanRecordRepository();
  const docRepo = new DocumentRepository();
  const versionRepo = new DocumentVersionRepository();
  const linkRepo = new FileResourceLinkRepository();
  const accessRepo = new FileAccessRecordRepository();
  const reconRepo = new StorageReconciliationRepository();
  const outboxRepo = new OutboxRepository();

  const storageDriver = new InMemoryObjectStorageDriver();
  const scanner = new MockMalwareScanner();
  const security = new FileSecurityService();

  const fileUploadService = new FileUploadService(
    fileRepo,
    sessionRepo,
    scanRepo,
    linkRepo,
    storageDriver,
    scanner,
    outboxRepo
  );

  const fileAccessService = new FileAccessService(
    fileRepo,
    accessRepo,
    linkRepo,
    storageDriver,
    outboxRepo
  );

  const documentLifecycleService = new DocumentLifecycleService(
    docRepo,
    versionRepo,
    fileRepo,
    outboxRepo
  );

  const storageReconciliationService = new StorageReconciliationService(
    fileRepo,
    reconRepo,
    storageDriver,
    outboxRepo
  );

  const tenantA = "tenant_alpha_123";
  const tenantB = "tenant_bravo_456";
  const actorA = "user_agent_001";

  // ============================================================================
  // TEST 1: FILENAME SANITIZATION, PATH TRAVERSAL DEFENSE & PROHIBITED EXTENSIONS
  // ============================================================================
  console.log("TEST 1: Filename Sanitization & Extension Security Validation");
  {
    // Path traversal removal
    const unsafeName1 = "../../../etc/passwd";
    const sanitized1 = security.sanitizeFilename(unsafeName1);
    assert.strictEqual(sanitized1, "passwd", "Should strip directory traversal segments");

    const unsafeName2 = "C:\\Windows\\System32\\drivers\\evil.bin";
    const sanitized2 = security.sanitizeFilename(unsafeName2);
    assert.strictEqual(sanitized2, "evil.bin", "Should strip Windows path separators");

    // Prohibited extensions
    assert.throws(
      () => security.validateExtension("malicious_script.sh"),
      ProhibitedFileExtensionError,
      "Shell scripts must be rejected"
    );

    assert.throws(
      () => security.validateExtension("ransomware.exe"),
      ProhibitedFileExtensionError,
      "Executables must be rejected"
    );

    assert.throws(
      () => security.validateExtension("backdoor.php"),
      ProhibitedFileExtensionError,
      "PHP scripts must be rejected"
    );

    // Valid extension
    assert.doesNotThrow(() => security.validateExtension("contract_agreement.pdf"));
    assert.doesNotThrow(() => security.validateExtension("vehicle_inspection.jpg"));
    console.log("  ✓ Path traversal sequences and prohibited extensions safely blocked");
  }

  // ============================================================================
  // TEST 2: UPLOAD INTENT & 15-MINUTE SIGNED UPLOAD TICKET GENERATION
  // ============================================================================
  console.log("TEST 2: Upload Intent & Signed URL Generation");
  let validUploadSession: any;
  {
    const intentResult = await fileUploadService.requestUploadIntent(tenantA, actorA, {
      originalFilename: "driver_license_front.png",
      declaredContentType: "image/png",
      declaredSizeBytes: 1024 * 500, // 500 KB
      resourceType: "CUSTOMER",
      resourceId: "cust_777",
      resourceRole: "ID_DOCUMENT_FRONT",
      classification: "PRIVATE",
      idempotencyKey: "upload_key_001",
    });

    assert.ok(intentResult.sessionId, "Must return upload sessionId");
    assert.ok(intentResult.fileId, "Must return fileId");
    assert.ok(intentResult.uploadUrl.includes("signature="), "Upload URL must be signed");
    assert.strictEqual(intentResult.uploadMethod, "PUT");
    assert.ok(intentResult.objectKey.startsWith(`tenants/${tenantA}/files/`));

    // Verify file created in PENDING_UPLOAD
    const file = await fileRepo.findById(intentResult.fileId, tenantA);
    assert.ok(file);
    assert.strictEqual(file.status, "PENDING_UPLOAD");
    assert.strictEqual(file.scanStatus, "PENDING");

    // Test idempotency: second call with same key returns identical ticket
    const replayResult = await fileUploadService.requestUploadIntent(tenantA, actorA, {
      originalFilename: "driver_license_front.png",
      declaredContentType: "image/png",
      declaredSizeBytes: 1024 * 500,
      resourceType: "CUSTOMER",
      resourceId: "cust_777",
      resourceRole: "ID_DOCUMENT_FRONT",
      idempotencyKey: "upload_key_001",
    });
    assert.strictEqual(replayResult.sessionId, intentResult.sessionId);
    assert.strictEqual(replayResult.fileId, intentResult.fileId);

    validUploadSession = intentResult;
    console.log("  ✓ Upload intent established with 15-min signed URL and idempotency replay guarantee");
  }

  // ============================================================================
  // TEST 3: CLIENT SIMULATION, MAGIC BYTES VALIDATION & UPLOAD FINALIZATION
  // ============================================================================
  console.log("TEST 3: Magic Bytes Inspection, Antivirus Scan & Finalization");
  {
    // Create valid PNG binary payload (PNG magic bytes: \x89PNG\r\n\x1a\n)
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);

    // Simulate client PUT upload to storage
    await storageDriver.simulateClientUpload(
      validUploadSession.uploadUrl,
      validPngBuffer,
      "image/png"
    );

    // Finalize upload
    const finalizeResult = await fileUploadService.finalizeUpload(tenantA, actorA, {
      sessionId: validUploadSession.sessionId,
    });

    assert.strictEqual(finalizeResult.status, "ACTIVE");
    assert.strictEqual(finalizeResult.scanStatus, "CLEAN");
    assert.strictEqual(finalizeResult.detectedContentType, "image/png");

    // Verify file record updated
    const finalizedFile = await fileRepo.findById(validUploadSession.fileId, tenantA);
    assert.ok(finalizedFile);
    assert.strictEqual(finalizedFile.status, "ACTIVE");
    assert.strictEqual(finalizedFile.scanStatus, "CLEAN");
    assert.ok(finalizedFile.finalizedAt);
    assert.ok(finalizedFile.scannedAt);

    // Verify resource link created
    const linkedFiles = await linkRepo.listByResource(tenantA, "CUSTOMER", "cust_777");
    assert.strictEqual(linkedFiles.length, 1);
    assert.strictEqual(linkedFiles[0].fileId, finalizedFile.id);
    assert.strictEqual(linkedFiles[0].role, "ID_DOCUMENT_FRONT");

    console.log("  ✓ Magic bytes verified, clean file transitioned to ACTIVE and bound to Customer");
  }

  // ============================================================================
  // TEST 4: MALWARE SCANNER DETECTION & QUARANTINE PIPELINE
  // ============================================================================
  console.log("TEST 4: Malware Threat Detection (EICAR) & Quarantine Isolation");
  {
    // Request intent for a document
    const malwareIntent = await fileUploadService.requestUploadIntent(tenantA, actorA, {
      originalFilename: "clean_looking_invoice.pdf",
      declaredContentType: "application/pdf",
      declaredSizeBytes: 1024,
      resourceType: "EXPENSE",
      resourceId: "exp_999",
      resourceRole: "EXPENSE_RECEIPT",
    });

    // Client uploads binary containing EICAR test string
    const infectedBuffer = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Title (Malware Test) >>\n${EICAR_SIGNATURE}\n%%EOF`
    );

    await storageDriver.simulateClientUpload(
      malwareIntent.uploadUrl,
      infectedBuffer,
      "application/pdf"
    );

    // Finalize upload triggers scanner
    const result = await fileUploadService.finalizeUpload(tenantA, actorA, {
      sessionId: malwareIntent.sessionId,
    });

    assert.strictEqual(result.status, "QUARANTINED");
    assert.strictEqual(result.scanStatus, "INFECTED");
    assert.ok(result.findings && result.findings.length > 0);
    assert.ok(result.findings[0].includes("EICAR"));

    // Verify database record
    const infectedFile = await fileRepo.findById(malwareIntent.fileId, tenantA);
    assert.ok(infectedFile);
    assert.strictEqual(infectedFile.status, "QUARANTINED");
    assert.strictEqual(infectedFile.scanStatus, "INFECTED");

    // Verify outbox recorded FILE_MALWARE_DETECTED
    const outboxRecords = await outboxRepo.fetchPendingBatch(100);
    const malwareEvent = outboxRecords.find((r) => r.eventType === "FILE_MALWARE_DETECTED");
    assert.ok(malwareEvent, "Must record FILE_MALWARE_DETECTED event in outbox");

    console.log("  ✓ EICAR malware signature intercepted; file safely quarantined and alerted");
  }

  // ============================================================================
  // TEST 5: DISGUISED EXECUTABLE DETECTION (MAGIC BYTES ANTI-SPOOFING)
  // ============================================================================
  console.log("TEST 5: Disguised Executable Header Detection (MZ/PE Magic Bytes)");
  {
    const disguisedIntent = await fileUploadService.requestUploadIntent(tenantA, actorA, {
      originalFilename: "funny_cat.png",
      declaredContentType: "image/png",
      declaredSizeBytes: 512,
      resourceType: "VEHICLE",
      resourceId: "veh_101",
      resourceRole: "VEHICLE_PHOTO",
    });

    // Disguised payload starting with Windows PE 'MZ' executable magic bytes
    const disguisedBuffer = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
    ]);

    await storageDriver.simulateClientUpload(
      disguisedIntent.uploadUrl,
      disguisedBuffer,
      "image/png"
    );

    const result = await fileUploadService.finalizeUpload(tenantA, actorA, {
      sessionId: disguisedIntent.sessionId,
    });

    assert.strictEqual(result.status, "QUARANTINED");
    assert.strictEqual(result.scanStatus, "INFECTED");
    assert.ok(result.findings![0].includes("Executable binary header"));
    console.log("  ✓ Disguised executable header intercepted despite innocent .png extension");
  }

  // ============================================================================
  // TEST 6: ZERO-TRUST SIGNED DOWNLOAD ACCESS, AUDIT LOGS & PERMISSION CHECKS
  // ============================================================================
  console.log("TEST 6: Zero-Trust Download URLs & Audit Logging");
  {
    // 1. Attempting to download active file works and logs audit
    const downloadTicket = await fileAccessService.generateDownloadUrl(
      tenantA,
      validUploadSession.fileId,
      { id: actorA, type: "USER" },
      { disposition: "attachment", expiresInSeconds: 600 }
    );

    assert.ok(downloadTicket.downloadUrl.includes("signature="));
    assert.strictEqual(downloadTicket.filename, "driver_license_front.png");

    // Verify audit log entry
    const auditLogs = await accessRepo.listByFileId(validUploadSession.fileId, tenantA);
    assert.ok(auditLogs.length >= 1);
    assert.strictEqual(auditLogs[0].accessType, "DOWNLOAD_URL_ISSUED");
    assert.strictEqual(auditLogs[0].actorId, actorA);

    // 2. Client downloading from signed URL succeeds
    const downloaded = await storageDriver.simulateClientDownload(downloadTicket.downloadUrl);
    assert.strictEqual(downloaded.contentType, "image/png");
    assert.strictEqual(downloaded.disposition, "attachment");

    // 3. Attempting to download non-active (e.g. quarantined) file is forbidden
    const quarantinedFiles = await fileRepo.listByTenant(tenantA, { status: "QUARANTINED" });
    assert.ok(quarantinedFiles.items.length > 0);
    const quarantinedId = quarantinedFiles.items[0].id;

    await assert.rejects(
      () => fileAccessService.generateDownloadUrl(tenantA, quarantinedId, { id: actorA }),
      InvalidFileStateError,
      "Cannot download quarantined file"
    );

    // 4. Confidential document requires DOCUMENT_VIEW_CONFIDENTIAL permission
    const confidentialFile = await fileRepo.create({
      tenantId: tenantA,
      bucket: "carhire-files",
      objectKey: "tenants/tenantA/files/confidential.pdf",
      originalFilename: "board_resolution.pdf",
      sanitizedFilename: "board_resolution.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      status: "ACTIVE",
      scanStatus: "CLEAN",
      classification: "CONFIDENTIAL",
      uploadedBy: actorA,
    });

    // Unauthorized actor without permission fails
    await assert.rejects(
      () =>
        fileAccessService.generateDownloadUrl(
          tenantA,
          confidentialFile.id,
          { id: "unauthorized_user", permissions: ["FILE_READ"] }
        ),
      SensitiveDocumentAccessDeniedError,
      "Unauthorized actor must not download confidential file"
    );

    // Authorized actor with permission succeeds
    const authTicket = await fileAccessService.generateDownloadUrl(
      tenantA,
      confidentialFile.id,
      { id: "authorized_manager", permissions: ["DOCUMENT_VIEW_CONFIDENTIAL"] }
    );
    assert.ok(authTicket.downloadUrl);

    console.log("  ✓ Time-limited signed download tokens issued with strict zero-trust auditing");
  }

  // ============================================================================
  // TEST 7: CROSS-TENANT ISOLATION ENFORCEMENT
  // ============================================================================
  console.log("TEST 7: Cross-Tenant Storage & File Isolation (SEC-001)");
  {
    // Tenant B attempts to read Tenant A's file
    await assert.rejects(
      () => fileAccessService.getFileMetadata(tenantB, validUploadSession.fileId, { id: "actor_b" }),
      /Cross-tenant/i,
      "Tenant B cannot access Tenant A file metadata"
    );

    // Tenant B attempts to generate download URL for Tenant A's file
    await assert.rejects(
      () => fileAccessService.generateDownloadUrl(tenantB, validUploadSession.fileId, { id: "actor_b" }),
      /Cross-tenant/i,
      "Tenant B cannot generate download token for Tenant A file"
    );

    console.log("  ✓ Cross-tenant boundary strictly enforced at storage and repository layer");
  }

  // ============================================================================
  // TEST 8: ENTERPRISE DOCUMENT LIFECYCLE & IMMUTABLE VERSIONING
  // ============================================================================
  console.log("TEST 8: Document Aggregate, Version Tracking & Superseded States");
  {
    // Create initial document linking valid file as Version 1
    const doc = await documentLifecycleService.createDocument(tenantA, actorA, {
      documentType: "INSURANCE_CERTIFICATE",
      resourceType: "VEHICLE",
      resourceId: "veh_202",
      title: "Comprehensive Commercial Policy 2026",
      fileId: validUploadSession.fileId,
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2027-01-01T00:00:00Z",
    });

    assert.ok(doc.id);
    assert.strictEqual(doc.currentVersionNumber, 1);
    assert.strictEqual(doc.status, "ACTIVE");

    // Verify Version 1 record
    const versionsV1 = await versionRepo.listByDocumentId(doc.id, tenantA);
    assert.strictEqual(versionsV1.length, 1);
    assert.strictEqual(versionsV1[0].versionNumber, 1);
    assert.strictEqual(versionsV1[0].fileId, validUploadSession.fileId);

    // Create a new file for Version 2 (Policy renewal endorsement)
    const v2File = await fileRepo.create({
      tenantId: tenantA,
      bucket: "carhire-files",
      objectKey: "tenants/tenantA/files/endorsement_v2.pdf",
      originalFilename: "endorsement_v2.pdf",
      sanitizedFilename: "endorsement_v2.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      status: "ACTIVE",
      scanStatus: "CLEAN",
      uploadedBy: actorA,
    });

    // Upload Version 2 to Document
    const updateResult = await documentLifecycleService.uploadNewVersion(tenantA, actorA, doc.id, {
      fileId: v2File.id,
      changeReason: "Annual policy renewal endorsement",
      expiresAt: "2028-01-01T00:00:00Z",
    });

    assert.strictEqual(updateResult.document.currentVersionNumber, 2);
    assert.strictEqual(updateResult.version.versionNumber, 2);

    // Verify previous version (V1) is marked superseded
    const v1Updated = await versionRepo.findById(versionsV1[0].id, tenantA);
    assert.ok(v1Updated?.supersededAt, "Version 1 must be marked superseded");

    // Fetch document with all versions enriched
    const enrichedDoc = await documentLifecycleService.getDocumentWithVersions(tenantA, doc.id);
    assert.strictEqual(enrichedDoc.versions.length, 2);
    assert.strictEqual(enrichedDoc.versions[0].versionNumber, 2); // newest first
    assert.strictEqual(enrichedDoc.versions[1].versionNumber, 1);

    // Archive Document
    const archivedDoc = await documentLifecycleService.archiveDocument(tenantA, doc.id, actorA);
    assert.strictEqual(archivedDoc.status, "ARCHIVED");
    assert.ok(archivedDoc.archivedAt);

    console.log("  ✓ Document versioning, superseded audit trail, and aggregate root verified");
  }

  // ============================================================================
  // TEST 9: STORAGE RECONCILIATION & DISCREPANCY SWEEPS
  // ============================================================================
  console.log("TEST 9: Storage Reconciliation Sweeps & Discrepancy Reporting");
  {
    // Create an active file record in DB whose object does not exist in storage (Missing object simulation)
    const ghostFile = await fileRepo.create({
      tenantId: tenantA,
      bucket: "carhire-files",
      objectKey: `tenants/${tenantA}/files/non_existent_ghost.pdf`,
      originalFilename: "ghost.pdf",
      sanitizedFilename: "ghost.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      status: "ACTIVE",
      scanStatus: "CLEAN",
      uploadedBy: actorA,
    });

    // Inject an orphan object in storage not referenced in DB
    await storageDriver.putObject({
      bucket: "carhire-files",
      key: `tenants/${tenantA}/files/orphan_stray_file.bin`,
      body: Buffer.from("orphan data"),
      contentType: "application/octet-stream",
    });

    // Run reconciliation
    const reconReport = await storageReconciliationService.reconcileTenantStorage(tenantA);

    assert.ok(reconReport.missingObjectsCount >= 1, "Must detect missing storage object");
    assert.ok(reconReport.orphanObjectsCount >= 1, "Must detect orphan storage object");

    const issues = await reconRepo.listByTenant(tenantA);
    assert.ok(issues.some((i) => i.issueType === "MISSING_OBJECT" && i.fileId === ghostFile.id));
    assert.ok(issues.some((i) => i.issueType === "ORPHAN_OBJECT"));

    console.log("  ✓ Discrepancies, missing objects, and orphan storage files identified");
  }

  // ============================================================================
  // TEST 10: BACKGROUND WORKER JOB: EXPIRED SESSION & PURGE SWEEP
  // ============================================================================
  console.log("TEST 10: Background Worker Job (CLEANUP_ORPHAN_FILES)");
  {
    // Create an unfinalized upload session expired 48 hours ago
    const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const staleFile = await fileRepo.create({
      tenantId: tenantA,
      bucket: "carhire-files",
      objectKey: "tenants/tenantA/stale.pdf",
      originalFilename: "stale.pdf",
      sanitizedFilename: "stale.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      status: "PENDING_UPLOAD",
      uploadedBy: actorA,
    });

    await sessionRepo.create({
      tenantId: tenantA,
      fileId: staleFile.id,
      resourceType: "CUSTOMER",
      resourceId: "cust_1",
      resourceRole: "OTHER",
      originalFilename: "stale.pdf",
      declaredContentType: "application/pdf",
      maxSizeBytes: 1024 * 1024,
      reservedBytes: 1024,
      objectKey: "tenants/tenantA/stale.pdf",
      uploadUrl: "http://storage/upload",
      actorId: actorA,
      expiresAt: pastDate,
    });

    const cleanupResult = await processFileCleanup({
      tenantId: tenantA,
      sessionExpiryCutoffHours: 24,
    });

    assert.ok(cleanupResult.expiredSessionsCleaned >= 1);

    // Verify session cancelled and file transitioned to REJECTED
    const updatedStaleFile = await fileRepo.findById(staleFile.id, tenantA);
    assert.strictEqual(updatedStaleFile?.status, "REJECTED");

    console.log("  ✓ Background file cleanup worker purged stale upload sessions");
  }

  console.log("----------------------------------------------------------------------");
  console.log("ALL SPRINT 27 SECURE FILES & DOCUMENT STORAGE TESTS PASSED SUCCESSFULLY");
  console.log("----------------------------------------------------------------------");
}

runSprint27TestSuite().catch((err) => {
  console.error("Sprint 27 Test Suite FAILED:", err);
  process.exit(1);
});
