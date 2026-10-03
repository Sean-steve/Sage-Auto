// ============================================================================
// CAR HIRE OS — MEDIA MODULE (ARCH-001, SEC-001, DEV-006, FLEET-001)
// Enterprise bounded context module for image processing, EXIF privacy & responsive media
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  IMediaAssetRepository,
  MediaAssetRepository,
  IMediaDerivativeRepository,
  MediaDerivativeRepository,
  IMediaProcessingRequestRepository,
  MediaProcessingRequestRepository,
  IMediaReconciliationRepository,
  MediaReconciliationRepository,
  IVehicleMediaRepository,
  VehicleMediaRepository,
  IFileRepository,
  FileRepository,
  IOutboxRepository,
} from "@carhire/database";
import { IObjectStorageDriver } from "../files/infrastructure/storage/object-storage.interface";
import { InMemoryObjectStorageDriver } from "../files/infrastructure/storage/in-memory-storage.driver";
import { S3CompatibleStorageDriver } from "../files/infrastructure/storage/s3-storage.driver";
import { IImageProcessor } from "./infrastructure/processors/image-processor.interface";
import { SharpImageProcessor } from "./infrastructure/processors/sharp-image-processor.adapter";
import { MediaProcessingService } from "./application/services/media-processing.service";
import { MediaQueryService } from "./application/services/media-query.service";
import { VehicleMediaService } from "./application/services/vehicle-media.service";
import { MediaReconciliationService } from "./application/services/media-reconciliation.service";
import { createMediaController } from "./presentation/controllers/media.controller";
import { createVehicleMediaController } from "./presentation/controllers/vehicle-media.controller";
import {
  MediaDerivativeNotFoundError,
  PrivateMediaAccessViolationError,
} from "./domain/errors/media.errors";

export interface MediaModuleDependencies {
  mediaAssetRepo?: IMediaAssetRepository;
  derivativeRepo?: IMediaDerivativeRepository;
  requestRepo?: IMediaProcessingRequestRepository;
  reconciliationRepo?: IMediaReconciliationRepository;
  vehicleMediaRepo?: IVehicleMediaRepository;
  fileRepo?: IFileRepository;
  storageDriver?: IObjectStorageDriver;
  imageProcessor?: IImageProcessor;
  outboxRepo?: IOutboxRepository;
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void;
  cdnBaseUrl?: string;
}

export class MediaModule {
  public readonly mediaAssetRepo: IMediaAssetRepository;
  public readonly derivativeRepo: IMediaDerivativeRepository;
  public readonly requestRepo: IMediaProcessingRequestRepository;
  public readonly reconciliationRepo: IMediaReconciliationRepository;
  public readonly vehicleMediaRepo: IVehicleMediaRepository;
  public readonly fileRepo: IFileRepository;
  public readonly storageDriver: IObjectStorageDriver;
  public readonly imageProcessor: IImageProcessor;

  public readonly processingService: MediaProcessingService;
  public readonly queryService: MediaQueryService;
  public readonly vehicleMediaService: VehicleMediaService;
  public readonly reconciliationService: MediaReconciliationService;

  public readonly mediaRouter: Router;
  public readonly vehicleMediaRouter: Router;

  constructor(deps: MediaModuleDependencies = {}) {
    this.mediaAssetRepo = deps.mediaAssetRepo || new MediaAssetRepository();
    this.derivativeRepo = deps.derivativeRepo || new MediaDerivativeRepository();
    this.requestRepo = deps.requestRepo || new MediaProcessingRequestRepository();
    this.reconciliationRepo = deps.reconciliationRepo || new MediaReconciliationRepository();
    this.vehicleMediaRepo = deps.vehicleMediaRepo || new VehicleMediaRepository();
    this.fileRepo = deps.fileRepo || new FileRepository();

    const isProductionLike = process.env.APP_ENV === "production" || process.env.APP_ENV === "staging" ||
      process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";

    if (deps.storageDriver) {
      this.storageDriver = deps.storageDriver;
    } else if (process.env.STORAGE_DRIVER === "s3" || process.env.S3_ENDPOINT) {
      this.storageDriver = new S3CompatibleStorageDriver();
    } else if (isProductionLike) {
      throw new Error("Production and staging require STORAGE_DRIVER=s3 or STORAGE_DRIVER=minio; in-memory storage is not permitted.");
    } else {
      this.storageDriver = new InMemoryObjectStorageDriver();
    }

    this.imageProcessor = deps.imageProcessor || new SharpImageProcessor();

    const cdnBaseUrl = deps.cdnBaseUrl || process.env.CDN_BASE_URL || "/api/v1/media/public";

    // Instantiate application services
    this.processingService = new MediaProcessingService(
      this.mediaAssetRepo,
      this.derivativeRepo,
      this.requestRepo,
      this.fileRepo,
      this.storageDriver,
      this.imageProcessor,
      deps.outboxRepo
    );

    this.queryService = new MediaQueryService(
      this.mediaAssetRepo,
      this.derivativeRepo,
      this.storageDriver,
      cdnBaseUrl
    );

    this.vehicleMediaService = new VehicleMediaService(
      this.vehicleMediaRepo,
      this.mediaAssetRepo,
      this.derivativeRepo,
      cdnBaseUrl
    );

    this.reconciliationService = new MediaReconciliationService(
      this.derivativeRepo,
      this.requestRepo,
      this.reconciliationRepo,
      this.storageDriver,
      this.processingService
    );

    // Presentation routers
    this.mediaRouter = createMediaController(
      this.processingService,
      this.queryService,
      this.reconciliationService,
      this.derivativeRepo,
      this.storageDriver,
      deps.permissionGuard
    );

    this.vehicleMediaRouter = createVehicleMediaController(
      this.vehicleMediaService,
      deps.permissionGuard
    );
  }

  public readonly handlePublicDerivativeDelivery = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const derivative = await this.derivativeRepo.findById(req.params.id);
      if (!derivative) {
        throw new MediaDerivativeNotFoundError(req.params.id);
      }

      if (!derivative.isPublic || derivative.status !== "AVAILABLE") {
        throw new PrivateMediaAccessViolationError(
          derivative.id,
          "Media derivative is private or evidence classified. Public unauthenticated access is forbidden."
        );
      }

      const obj = await this.storageDriver.getObject({
        bucket: derivative.storageBucket,
        key: derivative.objectKey,
      });

      if (!obj || !obj.body) {
        res.status(404).json({ success: false, error: "Media file not found in storage." });
        return;
      }

      res.setHeader("Content-Type", derivative.contentType);
      res.setHeader("Content-Length", derivative.sizeBytes);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("ETag", `"${derivative.checksum}"`);
      res.status(200).send(obj.body);
    } catch (err) {
      next(err);
    }
  };
}
