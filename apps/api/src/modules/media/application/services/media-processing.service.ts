// ============================================================================
// CAR HIRE OS — MEDIA PROCESSING SERVICE (DEV-006, SEC-001, ARCH-001)
// Core orchestration for image inspection, derivative generation, EXIF privacy & idempotency
// ============================================================================

import {
  IMediaAssetRepository,
  IMediaDerivativeRepository,
  IMediaProcessingRequestRepository,
  IFileRepository,
  IOutboxRepository,
} from "@carhire/database";
import {
  MediaAssetRecord,
  MediaDerivativeRecord,
  MediaProcessingRequestRecord,
  FileRecord,
} from "@carhire/types";
import { IObjectStorageDriver } from "../../../files/infrastructure/storage/object-storage.interface";
import { IImageProcessor } from "../../infrastructure/processors/image-processor.interface";
import {
  MediaProfileRegistry,
  MediaProcessingProfile,
  MediaVariantDefinition,
} from "../../domain/profiles/media-profiles";
import {
  MediaAssetNotFoundError,
  SourceFileNotAvailableError,
  PrivateMediaAccessViolationError,
  MediaDomainError,
} from "../../domain/errors/media.errors";

export interface RequestProcessingOptions {
  profileVersion?: number;
  requestedVariants?: string[];
  forceReprocess?: boolean;
}

export class MediaProcessingService {
  constructor(
    private mediaAssetRepo: IMediaAssetRepository,
    private derivativeRepo: IMediaDerivativeRepository,
    private requestRepo: IMediaProcessingRequestRepository,
    private fileRepo: IFileRepository,
    private storageDriver: IObjectStorageDriver,
    private imageProcessor: IImageProcessor,
    private outboxRepo?: IOutboxRepository
  ) {}

  /**
   * Enqueues or registers a media processing request for an available file.
   */
  public async requestProcessing(
    tenantIdOrParams:
      | string
      | {
          tenantId: string;
          sourceFileId: string;
          profileName: string;
          actorId?: string;
          requestedBy?: string;
          options?: RequestProcessingOptions;
        },
    argSourceFileId?: string,
    argProfileName?: string,
    argRequestedBy: string = "SYSTEM",
    argOptions?: RequestProcessingOptions
  ): Promise<{ request: MediaProcessingRequestRecord; mediaAsset: MediaAssetRecord }> {
    let tenantId: string;
    let sourceFileId: string;
    let profileName: string;
    let requestedBy: string;
    let options: RequestProcessingOptions | undefined;

    if (typeof tenantIdOrParams === "object") {
      tenantId = tenantIdOrParams.tenantId;
      sourceFileId = tenantIdOrParams.sourceFileId;
      profileName = tenantIdOrParams.profileName;
      requestedBy = tenantIdOrParams.actorId || tenantIdOrParams.requestedBy || "SYSTEM";
      options = tenantIdOrParams.options;
    } else {
      tenantId = tenantIdOrParams;
      sourceFileId = argSourceFileId!;
      profileName = argProfileName!;
      requestedBy = argRequestedBy;
      options = argOptions;
    }

    const profile = MediaProfileRegistry.get(profileName);

    // 1. Verify source file exists and belongs to tenant
    const file = await this.fileRepo.findById(sourceFileId, tenantId);
    if (!file) {
      throw new MediaAssetNotFoundError(sourceFileId);
    }

    // 2. Validate source file is available and virus-clean
    const validStatuses = ["ACTIVE", "AVAILABLE"];
    const validScanStatuses = ["CLEAN", "SKIPPED"];

    if (
      !validStatuses.includes(file.status) ||
      (file.scanStatus && !validScanStatuses.includes(file.scanStatus))
    ) {
      throw new SourceFileNotAvailableError(file.id, file.status, file.scanStatus);
    }

    const profileVersion = options?.profileVersion || profile.version;

    // 3. Check for in-flight requests (idempotency check)
    if (!options?.forceReprocess) {
      const existingRequest = await this.requestRepo.findLatestBySourceFile(
        sourceFileId,
        profile.name,
        tenantId
      );

      if (
        existingRequest &&
        (existingRequest.status === "PENDING" || existingRequest.status === "PROCESSING")
      ) {
        let existingAsset = await this.mediaAssetRepo.findBySourceFileId(
          sourceFileId,
          profile.name,
          tenantId
        );
        if (!existingAsset) {
          existingAsset = await this.mediaAssetRepo.create({
            tenantId,
            sourceFileId,
            classification: file.classification,
            processingProfile: profile.name,
            profileVersion,
            status: "PROCESSING",
          });
        }
        return { request: existingRequest, mediaAsset: existingAsset };
      }
    }

    // 4. Create or retrieve MediaAsset aggregate
    let mediaAsset = await this.mediaAssetRepo.findBySourceFileId(
      sourceFileId,
      profile.name,
      tenantId
    );

    if (!mediaAsset) {
      mediaAsset = await this.mediaAssetRepo.create({
        tenantId,
        sourceFileId,
        classification: file.classification,
        processingProfile: profile.name,
        profileVersion,
        status: "PENDING",
      });
    }

    // 5. Create processing request record
    const request = await this.requestRepo.create({
      tenantId,
      sourceFileId,
      mediaAssetId: mediaAsset.id,
      profileName: profile.name,
      profileVersion,
      requestedVariants: options?.requestedVariants || profile.variants.map((v) => v.name),
    });

    // 6. Record domain event in transactional outbox
    if (this.outboxRepo) {
      await this.outboxRepo.create({
        eventType: "MEDIA_PROCESSING_REQUESTED",
        aggregateType: "MEDIA_ASSET",
        aggregateId: mediaAsset.id,
        tenantId,
        actorId: requestedBy,
        payload: {
          requestId: request.id,
          mediaAssetId: mediaAsset.id,
          tenantId,
          sourceFileId,
          profileName: profile.name,
          profileVersion,
          requestedVariants: request.requestedVariants,
        },
      });
    }

    return { request, mediaAsset };
  }

  /**
   * Synchronously or asynchronously processes a registered media request.
   */
  public async processRequest(
    requestId: string,
    tenantId: string
  ): Promise<{
    request: MediaProcessingRequestRecord;
    mediaAsset: MediaAssetRecord;
    derivatives: MediaDerivativeRecord[];
  }> {
    const startTime = Date.now();
    const request = await this.requestRepo.findById(requestId, tenantId);
    if (!request) {
      throw new Error(`MediaProcessingRequest '${requestId}' not found.`);
    }

    if (request.status === "COMPLETED") {
      const mediaAsset = await this.mediaAssetRepo.findById(request.mediaAssetId!, tenantId);
      const derivatives = await this.derivativeRepo.listByAssetId(mediaAsset!.id, tenantId);
      return { request, mediaAsset: mediaAsset!, derivatives };
    }

    // Mark request as processing
    await this.requestRepo.update(request.id, {
      status: "PROCESSING",
      startedAt: new Date().toISOString(),
      attempts: request.attempts + 1,
    }, tenantId);

    const profile = MediaProfileRegistry.get(request.profileName);
    const file = await this.fileRepo.findById(request.sourceFileId, tenantId);
    if (!file) {
      throw new MediaAssetNotFoundError(request.sourceFileId);
    }

    let mediaAsset = await this.mediaAssetRepo.findById(request.mediaAssetId!, tenantId);
    if (!mediaAsset) {
      mediaAsset = await this.mediaAssetRepo.create({
        tenantId,
        sourceFileId: file.id,
        classification: file.classification,
        processingProfile: profile.name,
        profileVersion: request.profileVersion,
        status: "PROCESSING",
      });
    } else {
      await this.mediaAssetRepo.update(mediaAsset.id, { status: "PROCESSING" }, tenantId);
    }

    try {
      // 1. Fetch raw binary from immutable object storage
      const obj = await this.storageDriver.getObject({
        bucket: file.bucket,
        key: file.objectKey,
      });

      if (!obj || !obj.body || obj.body.length === 0) {
        throw new Error(`Source file object not found in storage bucket '${file.bucket}' key '${file.objectKey}'.`);
      }

      // 2. Inspect image headers, bounds, and decompression safety
      const meta = await this.imageProcessor.inspect(obj.body, {
        maxPixels: profile.maxSourcePixels,
        maxDimension: profile.maxSourceDimension,
      });

      // 3. Extract dominant color for progressive placeholder
      const dominantColor = meta.dominantColor || (await this.imageProcessor.extractDominantColor(obj.body));

      // 4. Update media asset metadata
      mediaAsset = await this.mediaAssetRepo.update(
        mediaAsset.id,
        {
          width: meta.width,
          height: meta.height,
          dominantColor,
          exifStripped: profile.stripExif,
          status: "PROCESSING",
        },
        tenantId
      );

      // 5. Generate each requested variant
      const createdDerivatives: MediaDerivativeRecord[] = [];
      const targetVariants = profile.variants.filter((v) =>
        request.requestedVariants.length === 0 || request.requestedVariants.includes(v.name)
      );

      for (const variant of targetVariants) {
        const transformed = await this.imageProcessor.transform(obj.body, {
          width: variant.width,
          height: variant.height,
          fit: variant.fit,
          format: variant.format,
          quality: variant.quality,
          stripExif: profile.stripExif,
          normalizeOrientation: profile.normalizeOrientation,
          preserveAlpha: variant.preserveAlpha,
        });

        // Deterministic object key hierarchy:
        // media/<tenantId>/<sourceFileId>/<profileName>/v<profileVersion>/<variantName>.<ext>
        const ext = variant.format.toLowerCase();
        const objectKey = `media/${tenantId}/${file.id}/${profile.name}/v${request.profileVersion}/${variant.name}.${ext}`;

        // Save derivative in storage driver
        await this.storageDriver.putObject({
          bucket: file.bucket,
          key: objectKey,
          body: transformed.buffer,
          contentType: transformed.contentType,
          metadata: {
            tenantId,
            sourceFileId: file.id,
            mediaAssetId: mediaAsset.id,
            profile: profile.name,
            version: String(request.profileVersion),
            variant: variant.name,
            format: variant.format,
          },
        });

        // Privacy rule: Public derivative is allowed ONLY if source file is PUBLIC and profile allows public!
        const isPublic = file.classification === "PUBLIC" && profile.isPublicAllowed;

        // Persist derivative record
        const derivative = await this.derivativeRepo.create({
          tenantId,
          mediaAssetId: mediaAsset.id,
          sourceFileId: file.id,
          profileName: profile.name,
          profileVersion: request.profileVersion,
          variantName: variant.name,
          format: variant.format,
          width: transformed.width,
          height: transformed.height,
          sizeBytes: transformed.sizeBytes,
          objectKey,
          storageBucket: file.bucket,
          storageProvider: file.storageProvider,
          checksum: transformed.checksumSha256,
          contentType: transformed.contentType,
          quality: variant.quality,
          status: "AVAILABLE",
          isPublic,
        });

        createdDerivatives.push(derivative);

        // Emit derivative created event
        if (this.outboxRepo) {
          await this.outboxRepo.create({
            eventType: "MEDIA_DERIVATIVE_CREATED",
            aggregateType: "MEDIA_ASSET",
            aggregateId: mediaAsset.id,
            tenantId,
            actorId: "SYSTEM",
            payload: {
              derivativeId: derivative.id,
              mediaAssetId: mediaAsset.id,
              tenantId,
              sourceFileId: file.id,
              profileName: profile.name,
              profileVersion: request.profileVersion,
              variantName: variant.name,
              format: variant.format,
              width: transformed.width,
              height: transformed.height,
              sizeBytes: transformed.sizeBytes,
              isPublic,
              objectKey,
            },
          });
        }
      }

      // 6. Complete request and mark asset available
      const completedRequest = await this.requestRepo.update(request.id, {
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
      }, tenantId);

      mediaAsset = await this.mediaAssetRepo.update(mediaAsset.id, {
        status: "AVAILABLE",
      }, tenantId);

      // Emit completion event
      if (this.outboxRepo) {
        await this.outboxRepo.create({
          eventType: "MEDIA_PROCESSING_COMPLETED",
          aggregateType: "MEDIA_ASSET",
          aggregateId: mediaAsset.id,
          tenantId,
          actorId: "SYSTEM",
          payload: {
            requestId: request.id,
            mediaAssetId: mediaAsset.id,
            tenantId,
            sourceFileId: file.id,
            profileName: profile.name,
            profileVersion: request.profileVersion,
            generatedVariantsCount: createdDerivatives.length,
            durationMs: Date.now() - startTime,
          },
        });
      }

      return {
        request: completedRequest,
        mediaAsset,
        derivatives: createdDerivatives,
      };
    } catch (err: any) {
      const errorCode = err.code || "MEDIA_PROCESSING_FAILED";
      const errorMessage = err.message || "Unknown error during media processing";

      const failedRequest = await this.requestRepo.update(request.id, {
        status: "FAILED",
        errorCode,
        errorMessage,
      }, tenantId);

      mediaAsset = await this.mediaAssetRepo.update(mediaAsset.id, {
        status: "FAILED",
      }, tenantId);

      if (this.outboxRepo) {
        await this.outboxRepo.create({
          eventType: "MEDIA_PROCESSING_FAILED",
          aggregateType: "MEDIA_ASSET",
          aggregateId: mediaAsset.id,
          tenantId,
          actorId: "SYSTEM",
          payload: {
            requestId: request.id,
            tenantId,
            sourceFileId: file.id,
            profileName: profile.name,
            profileVersion: request.profileVersion,
            errorCode,
            errorMessage,
            attemptsMade: request.attempts + 1,
          },
        });
      }

      throw err;
    }
  }

  /**
   * Triggers derivative regeneration for a newer profile version or updated variant configuration.
   */
  public async regenerateDerivatives(
    tenantId: string,
    sourceFileId: string,
    targetProfileName: string,
    targetVersion?: number
  ): Promise<{
    request: MediaProcessingRequestRecord;
    mediaAsset: MediaAssetRecord;
    derivatives: MediaDerivativeRecord[];
  }> {
    const profile = MediaProfileRegistry.get(targetProfileName);
    const version = targetVersion || profile.version + 1;

    // Enqueue new processing with targetVersion
    const { request } = await this.requestProcessing(
      tenantId,
      sourceFileId,
      profile.name,
      "ADMIN",
      { profileVersion: version, forceReprocess: true }
    );

    // Process immediately
    const result = await this.processRequest(request.id, tenantId);

    // Mark previous version derivatives as SUPERSEDED
    await this.derivativeRepo.markSuperseded(
      tenantId,
      sourceFileId,
      profile.name,
      version
    );

    if (this.outboxRepo) {
      await this.outboxRepo.create({
        eventType: "MEDIA_REGENERATED",
        aggregateType: "MEDIA_ASSET",
        aggregateId: result.mediaAsset.id,
        tenantId,
        actorId: "ADMIN",
        payload: {
          mediaAssetId: result.mediaAsset.id,
          tenantId,
          sourceFileId,
          targetProfileName: profile.name,
          targetVersion: version,
          regeneratedVariantsCount: result.derivatives.length,
        },
      });
    }

    return result;
  }
}
