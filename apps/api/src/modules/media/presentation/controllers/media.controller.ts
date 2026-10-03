// ============================================================================
// CAR HIRE OS — MEDIA PRESENTATION CONTROLLER (ARCH-001, SEC-001, DEV-006)
// HTTP routes for media processing, responsive assets, secure URLs & public CDN proxy
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { MediaProcessingService } from "../../application/services/media-processing.service";
import { MediaQueryService } from "../../application/services/media-query.service";
import { MediaReconciliationService } from "../../application/services/media-reconciliation.service";
import { IMediaDerivativeRepository } from "@carhire/database";
import { IObjectStorageDriver } from "../../../files/infrastructure/storage/object-storage.interface";
import { MediaProfileRegistry } from "../../domain/profiles/media-profiles";
import {
  ArbitraryTransformProhibitedError,
  PrivateMediaAccessViolationError,
  MediaDerivativeNotFoundError,
} from "../../domain/errors/media.errors";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import { MediaDerivativeFormat } from "@carhire/types";

export function createMediaController(
  processingService: MediaProcessingService,
  queryService: MediaQueryService,
  reconciliationService: MediaReconciliationService,
  derivativeRepo: IMediaDerivativeRepository,
  storageDriver: IObjectStorageDriver,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActorId = (req: Request): string => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return userId;
  };

  const getTenantId = (req: Request): string => {
    const ctx = (req as any).tenantContext;
    const tenantId = ctx?.tenantId;
    if (!tenantId) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tenantId;
  };

  // --------------------------------------------------------------------------
  // 1. Enqueue Media Processing
  // --------------------------------------------------------------------------
  router.post(
    "/process",
    guard(TENANT_PERMISSIONS.MEDIA_UPLOAD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const { sourceFileId, profileName, requestedVariants, forceReprocess, executeSync } = req.body;

        if (!sourceFileId || !profileName) {
          return res.status(400).json({
            success: false,
            error: "Missing required fields 'sourceFileId' and 'profileName'.",
          });
        }

        const { request, mediaAsset } = await processingService.requestProcessing(
          tenantId,
          sourceFileId,
          profileName,
          actorId,
          { requestedVariants, forceReprocess }
        );

        if (executeSync) {
          const result = await processingService.processRequest(request.id, tenantId);
          return res.status(200).json({
            success: true,
            data: {
              requestId: result.request.id,
              mediaAsset: result.mediaAsset,
              derivatives: result.derivatives,
              status: result.request.status,
            },
          });
        }

        return res.status(202).json({
          success: true,
          data: {
            requestId: request.id,
            mediaAssetId: mediaAsset.id,
            status: request.status,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 2. Query Media Asset Details & Active Variants
  // --------------------------------------------------------------------------
  router.get(
    "/assets/:id",
    guard(TENANT_PERMISSIONS.MEDIA_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const asset = await queryService.getMediaAsset(req.params.id, tenantId);
        res.json({ success: true, data: asset });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 3. Responsive Srcset Resolution (Rejects arbitrary resize query params)
  // --------------------------------------------------------------------------
  router.get(
    "/assets/:id/responsive",
    guard(TENANT_PERMISSIONS.MEDIA_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);

        // Security check: strictly reject arbitrary client-provided dimensions
        if (req.query.w || req.query.width || req.query.h || req.query.height || req.query.resize) {
          throw new ArbitraryTransformProhibitedError(
            "Arbitrary w/h/resize query params are forbidden. Use canonical registered media profiles."
          );
        }

        const preferredFormat = (req.query.format as MediaDerivativeFormat) || "WEBP";
        const srcset = await queryService.getResponsiveSrcset(req.params.id, tenantId, preferredFormat);
        res.json({ success: true, data: srcset });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 4. Secure Temporary Download URL for Private Derivatives
  // --------------------------------------------------------------------------
  router.get(
    "/derivatives/:id/download-url",
    guard(TENANT_PERMISSIONS.MEDIA_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const expiresInSeconds = req.query.expiresInSeconds
          ? parseInt(req.query.expiresInSeconds as string, 10)
          : undefined;

        const result = await queryService.getDerivativeDeliveryUrl(req.params.id, tenantId, {
          expiresInSeconds,
        });

        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 5. Public CDN Proxy Endpoint (No auth required, strictly checks isPublic)
  // --------------------------------------------------------------------------
  router.get(
    "/public/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const derivative = await derivativeRepo.findById(req.params.id);
        if (!derivative) {
          throw new MediaDerivativeNotFoundError(req.params.id);
        }

        // Privacy firewall: reject access to private or evidence media
        if (!derivative.isPublic || derivative.status !== "AVAILABLE") {
          throw new PrivateMediaAccessViolationError(
            derivative.id,
            "Media derivative is private or evidence classified. Public unauthenticated access is forbidden."
          );
        }

        // Fetch buffer from storage
        const obj = await storageDriver.getObject({
          bucket: derivative.storageBucket,
          key: derivative.objectKey,
        });

        if (!obj || !obj.body) {
          return res.status(404).json({ success: false, error: "Media file not found in storage." });
        }

        // Long-term immutable caching headers for CDN
        res.setHeader("Content-Type", derivative.contentType);
        res.setHeader("Content-Length", derivative.sizeBytes);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("ETag", `"${derivative.checksum}"`);

        return res.status(200).send(obj.body);
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 6. Bulk / Targeted Derivative Regeneration
  // --------------------------------------------------------------------------
  router.post(
    "/regenerate",
    guard(TENANT_PERMISSIONS.MEDIA_REGENERATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { sourceFileId, targetProfileName, targetVersion } = req.body;

        if (!sourceFileId || !targetProfileName) {
          return res.status(400).json({
            success: false,
            error: "Missing required fields 'sourceFileId' and 'targetProfileName'.",
          });
        }

        const result = await processingService.regenerateDerivatives(
          tenantId,
          sourceFileId,
          targetProfileName,
          targetVersion
        );

        res.json({
          success: true,
          data: {
            mediaAssetId: result.mediaAsset.id,
            regeneratedDerivativesCount: result.derivatives.length,
            status: result.mediaAsset.status,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 7. Storage and Metadata Reconciliation
  // --------------------------------------------------------------------------
  router.post(
    "/reconcile",
    guard(TENANT_PERMISSIONS.MEDIA_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const report = await reconciliationService.reconcile(tenantId);
        res.json({ success: true, data: report });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 8. Profiles Discovery
  // --------------------------------------------------------------------------
  router.get(
    "/profiles",
    (_req: Request, res: Response) => {
      const profiles = MediaProfileRegistry.list();
      res.json({ success: true, data: profiles });
    }
  );

  return router;
}
