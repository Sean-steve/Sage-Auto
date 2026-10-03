// ============================================================================
// CAR HIRE OS — MEDIA PROCESSING BACKGROUND JOBS (DEV-011, BRS-003, DEV-006)
// BullMQ command processors for asynchronous image processing, derivative generation & reconciliation
// ============================================================================

import { CommandJobPayload } from "@carhire/contracts";
import {
  FileRepository,
  MediaAssetRepository,
  MediaDerivativeRepository,
  MediaProcessingRequestRepository,
  MediaReconciliationRepository,
  OutboxRepository,
} from "@carhire/database";
import {
  MediaProcessingJobPayload,
  MediaRegenerateJobPayload,
  MediaReconciliationJobPayload,
} from "@carhire/types";
import { InMemoryObjectStorageDriver } from "../../../api/src/modules/files/infrastructure/storage/in-memory-storage.driver";
import { S3CompatibleStorageDriver } from "../../../api/src/modules/files/infrastructure/storage/s3-storage.driver";
import { SharpImageProcessor } from "../../../api/src/modules/media/infrastructure/processors/sharp-image-processor.adapter";
import { MediaProcessingService } from "../../../api/src/modules/media/application/services/media-processing.service";
import { MediaReconciliationService } from "../../../api/src/modules/media/application/services/media-reconciliation.service";

function createMediaServices() {
  const fileRepo = new FileRepository();
  const mediaAssetRepo = new MediaAssetRepository();
  const derivativeRepo = new MediaDerivativeRepository();
  const requestRepo = new MediaProcessingRequestRepository();
  const reconciliationRepo = new MediaReconciliationRepository();
  const outboxRepo = new OutboxRepository();

  const storageDriver =
    process.env.STORAGE_DRIVER === "s3" || process.env.S3_ENDPOINT
      ? new S3CompatibleStorageDriver()
      : new InMemoryObjectStorageDriver();

  const imageProcessor = new SharpImageProcessor();

  const processingService = new MediaProcessingService(
    mediaAssetRepo,
    derivativeRepo,
    requestRepo,
    fileRepo,
    storageDriver,
    imageProcessor,
    outboxRepo
  );

  const reconciliationService = new MediaReconciliationService(
    derivativeRepo,
    requestRepo,
    reconciliationRepo,
    storageDriver,
    processingService
  );

  return { processingService, reconciliationService };
}

/**
 * BullMQ processor for MEDIA_PROCESSING jobs.
 */
export async function handleProcessMediaCommand(
  job: CommandJobPayload<MediaProcessingJobPayload>
): Promise<{ success: boolean; requestId: string; variantsGenerated: number }> {
  const { tenantId, requestId } = job.data;
  const { processingService } = createMediaServices();

  const result = await processingService.processRequest(requestId, tenantId);

  return {
    success: true,
    requestId: result.request.id,
    variantsGenerated: result.derivatives.length,
  };
}

/**
 * BullMQ processor for MEDIA_REGENERATE jobs.
 */
export async function handleRegenerateMediaCommand(
  job: CommandJobPayload<MediaRegenerateJobPayload>
): Promise<{ success: boolean; assetId: string; regeneratedCount: number }> {
  const { tenantId, sourceFileId, targetProfileName, targetVersion } = job.data;
  const { processingService } = createMediaServices();

  const result = await processingService.regenerateDerivatives(
    tenantId,
    sourceFileId,
    targetProfileName,
    targetVersion
  );

  return {
    success: true,
    assetId: result.mediaAsset.id,
    regeneratedCount: result.derivatives.length,
  };
}

/**
 * BullMQ processor for MEDIA_RECONCILIATION jobs.
 */
export async function handleReconcileMediaCommand(
  job: CommandJobPayload<MediaReconciliationJobPayload>
): Promise<{ success: boolean; scannedCount: number; missingCount: number }> {
  const { tenantId } = job.data;
  const { reconciliationService } = createMediaServices();

  const report = await reconciliationService.reconcile(tenantId);

  return {
    success: true,
    scannedCount: report.scannedDerivativesCount,
    missingCount: report.missingDerivativesCount,
  };
}
