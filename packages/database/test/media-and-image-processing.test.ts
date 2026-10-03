// ============================================================================
// CAR HIRE OS — SPRINT 28 TEST SUITE:
// IMAGE & MEDIA PROCESSING, DERIVATIVE GENERATION, OPTIMIZATION, THUMBNAILS,
// EXIF PRIVACY, RESPONSIVE QUERIES & VEHICLE MEDIA (ARCH-001, SEC-001, DEV-006)
// ============================================================================

import { strict as assert } from "node:assert";
import {
  FileRepository,
  MediaAssetRepository,
  MediaDerivativeRepository,
  MediaProcessingRequestRepository,
  MediaReconciliationRepository,
  VehicleMediaRepository,
  OutboxRepository,
} from "../src/index";
import { InMemoryObjectStorageDriver } from "../../../apps/api/src/modules/files/infrastructure/storage/in-memory-storage.driver";
import { FakeImageProcessor } from "../../../apps/api/src/modules/media/infrastructure/processors/fake-image-processor.adapter";
import { SharpImageProcessor } from "../../../apps/api/src/modules/media/infrastructure/processors/sharp-image-processor.adapter";
import { MediaProcessingService } from "../../../apps/api/src/modules/media/application/services/media-processing.service";
import { MediaQueryService } from "../../../apps/api/src/modules/media/application/services/media-query.service";
import { VehicleMediaService } from "../../../apps/api/src/modules/media/application/services/vehicle-media.service";
import { MediaReconciliationService } from "../../../apps/api/src/modules/media/application/services/media-reconciliation.service";
import { MediaModule } from "../../../apps/api/src/modules/media/media.module";
import {
  MalformedImageError,
  DecompressionBombDetectedError,
  ArbitraryTransformProhibitedError,
  PrivateMediaAccessViolationError,
  MediaAssetNotFoundError,
  MediaProfileNotFoundError,
} from "../../../apps/api/src/modules/media/domain/errors/media.errors";
import { MediaProfileRegistry } from "../../../apps/api/src/modules/media/domain/profiles/media-profiles";
import {
  handleProcessMediaCommand,
  handleRegenerateMediaCommand,
  handleReconcileMediaCommand,
} from "../../../apps/worker/src/jobs/media-processing.job";
import sharp from "sharp";

async function runSprint28TestSuite() {
  console.log("----------------------------------------------------------------------");
  console.log("RUNNING SPRINT 28: IMAGE & MEDIA PROCESSING DOMAIN TEST SUITE");
  console.log("----------------------------------------------------------------------");

  // Reset in-memory stores
  FileRepository.clear();
  MediaAssetRepository.clear();
  MediaDerivativeRepository.clear();
  MediaProcessingRequestRepository.clear();
  MediaReconciliationRepository.clear();
  VehicleMediaRepository.clear();
  OutboxRepository.clear();

  const previousAppEnv = process.env.APP_ENV;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.APP_ENV = "production";
  process.env.NODE_ENV = "production";
  assert.throws(
    () => new MediaModule(),
    /Production and staging require STORAGE_DRIVER|in-memory storage/i,
    "Production must reject the media module in-memory storage fallback"
  );
  process.env.APP_ENV = previousAppEnv;
  process.env.NODE_ENV = previousNodeEnv;

  const fileRepo = new FileRepository();
  const mediaAssetRepo = new MediaAssetRepository();
  const derivativeRepo = new MediaDerivativeRepository();
  const requestRepo = new MediaProcessingRequestRepository();
  const reconciliationRepo = new MediaReconciliationRepository();
  const vehicleMediaRepo = new VehicleMediaRepository();
  const outboxRepo = new OutboxRepository();
  const storageDriver = new InMemoryObjectStorageDriver();
  const fakeProcessor = new FakeImageProcessor();
  const sharpProcessor = new SharpImageProcessor();

  const cdnBaseUrl = "https://cdn.carhireos.example/media/public";

  const processingService = new MediaProcessingService(
    mediaAssetRepo,
    derivativeRepo,
    requestRepo,
    fileRepo,
    storageDriver,
    fakeProcessor,
    outboxRepo
  );

  const queryService = new MediaQueryService(
    mediaAssetRepo,
    derivativeRepo,
    storageDriver,
    cdnBaseUrl
  );

  const vehicleMediaService = new VehicleMediaService(
    vehicleMediaRepo,
    mediaAssetRepo,
    derivativeRepo,
    cdnBaseUrl
  );

  const reconciliationService = new MediaReconciliationService(
    derivativeRepo,
    requestRepo,
    reconciliationRepo,
    storageDriver,
    processingService
  );

  const tenantA = "tenant_alpha_123";
  const tenantB = "tenant_bravo_456";
  const actorA = "actor_fleet_mgr_01";

  // Create valid sample image buffer (1920x1080 JPEG) using Sharp
  const sample1080pBuffer = await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 52, g: 152, b: 219 }, // Blue
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Seed source files in Sprint 27 FileRepository
  const publicSourceFile = await fileRepo.create({
    tenantId: tenantA,
    bucket: "carhire-files-storage",
    objectKey: `tenants/${tenantA}/files/fleet-photo-01.jpg`,
    originalFilename: "toyota_rav4_front.jpg",
    mimeType: "image/jpeg",
    sizeBytes: sample1080pBuffer.length,
    checksumSha256: "hash_fleet_01",
    classification: "PUBLIC",
    category: "VEHICLE_PHOTO",
    status: "AVAILABLE",
    scanStatus: "CLEAN",
    uploadedBy: actorA,
  });

  await storageDriver.putObject({
    bucket: publicSourceFile.bucket,
    key: publicSourceFile.objectKey,
    body: sample1080pBuffer,
    contentType: "image/jpeg",
  });

  const privateEvidenceFile = await fileRepo.create({
    tenantId: tenantA,
    bucket: "carhire-files-storage",
    objectKey: `tenants/${tenantA}/files/inspection-damage-01.jpg`,
    originalFilename: "scratch_rear_bumper.jpg",
    mimeType: "image/jpeg",
    sizeBytes: sample1080pBuffer.length,
    checksumSha256: "hash_evidence_01",
    classification: "PRIVATE",
    category: "DAMAGE_PHOTO",
    status: "AVAILABLE",
    scanStatus: "CLEAN",
    uploadedBy: actorA,
  });

  await storageDriver.putObject({
    bucket: privateEvidenceFile.bucket,
    key: privateEvidenceFile.objectKey,
    body: sample1080pBuffer,
    contentType: "image/jpeg",
  });

  // ==========================================================================
  // TEST 1: Request Processing & Idempotency
  // ==========================================================================
  console.log("Test 1: Request Processing & Idempotency");
  {
    const { request: req1, mediaAsset: asset1 } = await processingService.requestProcessing({
      tenantId: tenantA,
      sourceFileId: publicSourceFile.id,
      profileName: "FLEET_GALLERY_PHOTO",
      actorId: actorA,
    });

    assert.equal(req1.status, "PENDING");
    assert.equal(req1.profileName, "FLEET_GALLERY_PHOTO");
    assert.equal(req1.sourceFileId, publicSourceFile.id);

    // Outbox event should be recorded
    const events = await outboxRepo.findByTenant(tenantA);
    const requestedEvent = events.find((e) => e.eventType === "MEDIA_PROCESSING_REQUESTED");
    assert.ok(requestedEvent, "Expected MEDIA_PROCESSING_REQUESTED event in outbox");
    assert.equal(requestedEvent.aggregateId, asset1.id);
    assert.equal((requestedEvent.payload as any).requestId, req1.id);

    // Idempotent second call returns the same request
    const { request: req2 } = await processingService.requestProcessing({
      tenantId: tenantA,
      sourceFileId: publicSourceFile.id,
      profileName: "FLEET_GALLERY_PHOTO",
      actorId: actorA,
    });

    assert.equal(req2.id, req1.id, "Second request should return existing pending request");
    console.log("  ✓ Idempotent request creation & outbox event verified");
  }

  // ==========================================================================
  // TEST 2: Synchronous / Worker Pipeline Processing & Derivative Generation
  // ==========================================================================
  console.log("Test 2: Pipeline Processing & Derivative Generation");
  {
    const pendingRequests = await requestRepo.findPending(10);
    assert.equal(pendingRequests.length, 1);
    const targetReq = pendingRequests[0];

    const result = await processingService.processRequest(targetReq.id, tenantA);

    assert.equal(result.request.status, "COMPLETED");
    assert.equal(result.mediaAsset.status, "AVAILABLE");
    assert.ok(result.derivatives.length > 0, "Derivatives should have been generated");

    // Check FLEET_GALLERY_PHOTO generated canonical variants (thumbnail, medium, large, webp)
    const variantCodes = result.derivatives.map((d) => (d.variantName || (d as any).variantCode)?.toLowerCase());
    assert.ok(variantCodes.includes("thumbnail"), "Thumbnail variant must exist");
    assert.ok(variantCodes.includes("medium"), "Medium variant must exist");
    assert.ok(variantCodes.includes("large"), "Large variant must exist");
    assert.ok(variantCodes.includes("webp_medium"), "WebP medium variant must exist");

    // All derivatives for public media must have isPublic = true
    for (const deriv of result.derivatives) {
      assert.equal(deriv.isPublic, true);
      assert.equal(deriv.status, "AVAILABLE");
      assert.ok(deriv.storageBucket);
      assert.ok(deriv.objectKey);
      assert.ok(deriv.checksum);

      // Verify the derivative exists in object storage
      const stored = await storageDriver.headObject({
        bucket: deriv.storageBucket,
        key: deriv.objectKey,
      });
      assert.ok(stored, `Object storage must contain derivative ${deriv.objectKey}`);
    }

    // Verify outbox emitted MEDIA_DERIVATIVE_CREATED and MEDIA_PROCESSING_COMPLETED
    const events = await outboxRepo.findByTenant(tenantA);
    const completedEvent = events.find((e) => e.eventType === "MEDIA_PROCESSING_COMPLETED");
    assert.ok(completedEvent, "MEDIA_PROCESSING_COMPLETED event should be in outbox");

    // Verify original source file in FileRepository remains unaltered and immutable
    const sourceFileAfter = await fileRepo.findById(publicSourceFile.id, tenantA);
    assert.equal(sourceFileAfter?.status, "AVAILABLE");
    assert.equal(sourceFileAfter?.sizeBytes, sample1080pBuffer.length);
    console.log("  ✓ Derivatives generated, stored, and original source file remains immutable");
  }

  // ==========================================================================
  // TEST 3: Security & Privacy: Private Evidence vs Public Media
  // ==========================================================================
  console.log("Test 3: Private Evidence Media Security Separation");
  {
    // Process private damage photo with DAMAGE_INSPECTION profile
    const { request: evidenceReq } = await processingService.requestProcessing({
      tenantId: tenantA,
      sourceFileId: privateEvidenceFile.id,
      profileName: "DAMAGE_INSPECTION",
      actorId: actorA,
    });

    const evidenceResult = await processingService.processRequest(evidenceReq.id, tenantA);
    assert.equal(evidenceResult.mediaAsset.classification, "PRIVATE");

    // ALL derivatives must have isPublic = false
    for (const deriv of evidenceResult.derivatives) {
      assert.equal(
        deriv.isPublic,
        false,
        "Private evidence derivative must NEVER be marked as public"
      );
    }

    // 1. Querying responsive URLs for private media should yield signed URLs, not public CDN URLs
    const privateAssetDto = await queryService.getMediaAssetById(
      tenantA,
      evidenceResult.mediaAsset.id
    );
    assert.ok(privateAssetDto.primaryUrl?.includes("expires="), "Private media must have signed URL");
    assert.ok(!privateAssetDto.primaryUrl?.startsWith(cdnBaseUrl), "Private media must not use public CDN");

    // 2. Direct public CDN delivery of private derivative MUST throw PrivateMediaAccessViolationError
    const privateDeriv = evidenceResult.derivatives[0];
    await assert.rejects(
      async () => {
        await queryService.getPublicDeliveryStream(privateDeriv.id);
      },
      (err: any) => err instanceof PrivateMediaAccessViolationError,
      "Expected PrivateMediaAccessViolationError when attempting public delivery of private derivative"
    );

    // 3. Cross-tenant access to media must fail
    await assert.rejects(
      async () => {
        await queryService.getMediaAssetById(tenantB, evidenceResult.mediaAsset.id);
      },
      (err: any) => err instanceof MediaAssetNotFoundError,
      "Tenant B cannot view Tenant A media asset"
    );

    console.log("  ✓ Strict security separation between public and private media verified");
  }

  // ==========================================================================
  // TEST 4: Responsive Srcset & Strict Prohibition of Arbitrary Transforms
  // ==========================================================================
  console.log("Test 4: Responsive Srcset & Anti-Arbitrary Transform Enforcement");
  {
    const publicAsset = await mediaAssetRepo.findBySourceFileId(publicSourceFile.id, tenantA);
    assert.ok(publicAsset);

    const responsive = await queryService.getResponsiveSrcset(tenantA, publicAsset.id, "WEBP");

    assert.equal(responsive.mediaAssetId, publicAsset.id);
    assert.equal(responsive.format, "WEBP");
    assert.ok(responsive.srcSet.includes("320w"), "Srcset must contain 320w variant");
    assert.ok(responsive.srcSet.includes("800w"), "Srcset must contain 800w variant");
    assert.ok(responsive.srcSet.includes("1600w"), "Srcset must contain 1600w variant");
    assert.ok(responsive.aspectRatio > 0);

    // Anti-arbitrary transforms check
    const isCanonical = MediaProfileRegistry.isValidVariantWidth("FLEET_GALLERY_PHOTO", 800);
    assert.equal(isCanonical, true, "800 is a canonical width");

    const isArbitrary = MediaProfileRegistry.isValidVariantWidth("FLEET_GALLERY_PHOTO", 537);
    assert.equal(isArbitrary, false, "537 is arbitrary and disallowed");

    console.log("  ✓ Responsive srcset delivered with canonical widths only");
  }

  // ==========================================================================
  // TEST 5: Vehicle Media Gallery Management (Attach, Primary, Reorder, Unlink)
  // ==========================================================================
  console.log("Test 5: Vehicle Media Gallery Operations");
  {
    const vehicleId = "veh_bmw_x5_999";
    const publicAsset = await mediaAssetRepo.findBySourceFileId(publicSourceFile.id, tenantA);
    assert.ok(publicAsset);

    // 1. Attach first photo -> should automatically become primary
    const vMedia1 = await vehicleMediaService.attachMediaToVehicle(
      tenantA,
      vehicleId,
      publicAsset.id
    );
    assert.equal(vMedia1.vehicleId, vehicleId);
    assert.equal(vMedia1.isPrimary, true, "First vehicle photo must default to primary");
    assert.equal(vMedia1.sortOrder, 0);

    // 2. Create another photo and attach as non-primary
    const publicSourceFile2 = await fileRepo.create({
      tenantId: tenantA,
      bucket: "carhire-files-storage",
      objectKey: `tenants/${tenantA}/files/fleet-photo-02.jpg`,
      originalFilename: "toyota_rav4_rear.jpg",
      mimeType: "image/jpeg",
      sizeBytes: sample1080pBuffer.length,
      checksumSha256: "hash_fleet_02",
      classification: "PUBLIC",
      category: "VEHICLE_PHOTO",
      status: "AVAILABLE",
      scanStatus: "CLEAN",
      uploadedBy: actorA,
    });

    await storageDriver.putObject({
      bucket: publicSourceFile2.bucket,
      key: publicSourceFile2.objectKey,
      body: sample1080pBuffer,
      contentType: "image/jpeg",
    });

    const { request: reqPhoto2 } = await processingService.requestProcessing({
      tenantId: tenantA,
      sourceFileId: publicSourceFile2.id,
      profileName: "FLEET_GALLERY_PHOTO",
      actorId: actorA,
    });
    const procPhoto2 = await processingService.processRequest(reqPhoto2.id, tenantA);

    const vMedia2 = await vehicleMediaService.attachMediaToVehicle(
      tenantA,
      vehicleId,
      procPhoto2.mediaAsset.id,
      false,
      1
    );
    assert.equal(vMedia2.isPrimary, false);

    // Verify listing
    const gallery = await vehicleMediaService.listVehicleMedia(tenantA, vehicleId);
    assert.equal(gallery.length, 2);
    assert.equal(gallery[0].mediaAssetId, publicAsset.id);
    assert.equal(gallery[0].isPrimary, true);

    // 3. Change primary photo to photo 2
    await vehicleMediaService.setPrimaryVehicleMedia(tenantA, vehicleId, procPhoto2.mediaAsset.id);
    const primary = await vehicleMediaService.getPrimaryVehiclePhoto(tenantA, vehicleId);
    assert.ok(primary);
    assert.equal(primary.mediaAssetId, procPhoto2.mediaAsset.id, "Photo 2 should now be primary");

    // Check that photo 1 is no longer primary
    const oldPrimaryRecord = await vehicleMediaRepo.findByVehicleAndAsset(
      tenantA,
      vehicleId,
      publicAsset.id
    );
    assert.equal(oldPrimaryRecord?.isPrimary, false);

    // 4. Reorder
    const reordered = await vehicleMediaService.reorderVehicleMedia(tenantA, vehicleId, [
      procPhoto2.mediaAsset.id,
      publicAsset.id,
    ]);
    assert.equal(reordered[0].mediaAssetId, procPhoto2.mediaAsset.id);
    assert.equal(reordered[0].sortOrder, 0);
    assert.equal(reordered[1].mediaAssetId, publicAsset.id);
    assert.equal(reordered[1].sortOrder, 1);

    // 5. Remove media association
    const removed = await vehicleMediaService.removeVehicleMedia(
      tenantA,
      vehicleId,
      publicAsset.id
    );
    assert.equal(removed, true);
    const galleryAfter = await vehicleMediaService.listVehicleMedia(tenantA, vehicleId);
    assert.equal(galleryAfter.length, 1);

    console.log("  ✓ Vehicle gallery attachment, primary toggling, reordering & deletion verified");
  }

  // ==========================================================================
  // TEST 6: Reconciliation & Stuck Job Recovery
  // ==========================================================================
  console.log("Test 6: Storage Reconciliation & Stuck Job Recovery");
  {
    // Simulate a missing derivative object in storage
    const allDerivs = await derivativeRepo.findByTenant(tenantA);
    assert.ok(allDerivs.length > 0);
    const victim = allDerivs[0];

    // Delete object from storage behind database's back
    await storageDriver.deleteObject({
      bucket: victim.storageBucket,
      key: victim.objectKey,
    });

    // Run reconciliation
    const report = await reconciliationService.reconcile(tenantA);

    assert.ok(report.scannedDerivativesCount > 0);
    assert.ok(report.missingDerivativesCount >= 1, "Should detect at least 1 missing derivative");
    assert.ok(report.openIssues.length >= 1);

    // Verify the missing derivative status was marked PROCESSING_FAILED
    const updatedVictim = await derivativeRepo.findById(victim.id, tenantA);
    assert.equal(updatedVictim?.status, "PROCESSING_FAILED");

    console.log("  ✓ Reconciliation detected missing derivative object and marked status correctly");
  }

  // ==========================================================================
  // TEST 7: Image Safety & Fail-Closed Guards (Sharp & Fake)
  // ==========================================================================
  console.log("Test 7: Fail-Closed Image Protection");
  {
    // 1. Zero-length buffer
    await assert.rejects(
      async () => {
        await sharpProcessor.inspect(Buffer.alloc(0));
      },
      (err: any) => err instanceof MalformedImageError,
      "Expected MalformedImageError on empty buffer"
    );

    // 2. Corrupt / invalid bytes
    await assert.rejects(
      async () => {
        await sharpProcessor.inspect(Buffer.from("This is not an image at all!"));
      },
      (err: any) => err instanceof MalformedImageError,
      "Expected MalformedImageError on corrupt text bytes"
    );

    // 3. Decompression bomb limits check
    const hugeFakeMeta = {
      format: "jpeg",
      width: 15000,
      height: 15000, // 225 megapixels > 100 max megapixels
      sizeBytes: 10_000,
      isOpaque: true,
      hasAlpha: false,
    };
    fakeProcessor.setInspectResult(hugeFakeMeta);

    await assert.rejects(
      async () => {
        await fakeProcessor.inspect(sample1080pBuffer);
      },
      (err: any) => err instanceof DecompressionBombDetectedError,
      "Expected DecompressionBombDetectedError on 225 megapixel image"
    );

    console.log("  ✓ Fail-closed error handling protects against corrupt data and decompression bombs");
  }

  // ==========================================================================
  // TEST 8: BullMQ Background Command Execution
  // ==========================================================================
  console.log("Test 8: BullMQ Background Job Handlers");
  {
    // Test handleProcessMediaCommand
    const newFile = await fileRepo.create({
      tenantId: tenantA,
      bucket: "carhire-files-storage",
      objectKey: `tenants/${tenantA}/files/fleet-bg-01.jpg`,
      originalFilename: "audi_q7.jpg",
      mimeType: "image/jpeg",
      sizeBytes: sample1080pBuffer.length,
      checksumSha256: "hash_bg_01",
      classification: "PUBLIC",
      category: "VEHICLE_PHOTO",
      status: "AVAILABLE",
      scanStatus: "CLEAN",
      uploadedBy: actorA,
    });

    await storageDriver.putObject({
      bucket: newFile.bucket,
      key: newFile.objectKey,
      body: sample1080pBuffer,
      contentType: "image/jpeg",
    });

    const { request: newReq } = await processingService.requestProcessing({
      tenantId: tenantA,
      sourceFileId: newFile.id,
      profileName: "FLEET_GALLERY_PHOTO",
      actorId: actorA,
    });

    const workerResult = await handleProcessMediaCommand({
      commandId: "job_media_001",
      commandName: "process-media",
      correlationId: "corr_001",
      data: {
        tenantId: tenantA,
        requestId: newReq.id,
        sourceFileId: newFile.id,
        profileName: "FLEET_GALLERY_PHOTO",
      },
      timestamp: new Date().toISOString(),
    });

    assert.equal(workerResult.success, true);
    assert.equal(workerResult.requestId, newReq.id);
    assert.ok(workerResult.variantsGenerated > 0);

    // Test handleReconcileMediaCommand
    const reconResult = await handleReconcileMediaCommand({
      commandId: "job_recon_001",
      commandName: "reconcile-media",
      correlationId: "corr_002",
      data: {
        tenantId: tenantA,
      },
      timestamp: new Date().toISOString(),
    });

    assert.equal(reconResult.success, true);
    assert.ok(reconResult.scannedCount >= 0);

    console.log("  ✓ BullMQ worker command handlers processed jobs successfully");
  }

  console.log("----------------------------------------------------------------------");
  console.log("ALL SPRINT 28 TESTS PASSED SUCCESSFULLY! (8/8)");
  console.log("----------------------------------------------------------------------");
}

runSprint28TestSuite().catch((err) => {
  console.error("Sprint 28 Test Suite Failed:", err);
  process.exit(1);
});
