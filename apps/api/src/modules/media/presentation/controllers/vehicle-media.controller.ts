// ============================================================================
// CAR HIRE OS — VEHICLE MEDIA CONTROLLER (ARCH-001, FLEET-001, DEV-006)
// HTTP routes for vehicle image galleries, primary photo selection, and ordering
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { VehicleMediaService } from "../../application/services/vehicle-media.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";

export function createVehicleMediaController(
  vehicleMediaService: VehicleMediaService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router({ mergeParams: true });
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

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

  // 1. Attach Media Asset to Vehicle
  router.post(
    "/:vehicleId/media",
    guard(TENANT_PERMISSIONS.VEHICLE_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId } = req.params;
        const { mediaAssetId, isPrimary, sortOrder } = req.body;

        if (!mediaAssetId) {
          return res.status(400).json({
            success: false,
            error: "Missing required field 'mediaAssetId'.",
          });
        }

        const result = await vehicleMediaService.attachMediaToVehicle(
          tenantId,
          vehicleId,
          mediaAssetId,
          isPrimary,
          sortOrder
        );

        res.status(201).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // 2. List Vehicle Gallery Photos
  router.get(
    "/:vehicleId/media",
    guard(TENANT_PERMISSIONS.VEHICLE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId } = req.params;
        const media = await vehicleMediaService.listVehicleMedia(tenantId, vehicleId);
        res.json({ success: true, data: media });
      } catch (err) {
        next(err);
      }
    }
  );

  // 3. Get Vehicle Primary Thumbnail
  router.get(
    "/:vehicleId/media/primary",
    guard(TENANT_PERMISSIONS.VEHICLE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId } = req.params;
        const primary = await vehicleMediaService.getPrimaryVehiclePhoto(tenantId, vehicleId);
        if (!primary) {
          return res.status(404).json({ success: false, error: "No primary photo found for vehicle." });
        }
        res.json({ success: true, data: primary });
      } catch (err) {
        next(err);
      }
    }
  );

  // 4. Set Primary Photo
  router.put(
    "/:vehicleId/media/:mediaAssetId/primary",
    guard(TENANT_PERMISSIONS.VEHICLE_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId, mediaAssetId } = req.params;
        const updated = await vehicleMediaService.setPrimaryVehicleMedia(
          tenantId,
          vehicleId,
          mediaAssetId
        );
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // 5. Reorder Photos
  router.put(
    "/:vehicleId/media/reorder",
    guard(TENANT_PERMISSIONS.VEHICLE_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId } = req.params;
        const { orderedMediaAssetIds } = req.body;

        if (!Array.isArray(orderedMediaAssetIds)) {
          return res.status(400).json({
            success: false,
            error: "Field 'orderedMediaAssetIds' must be an array of asset IDs.",
          });
        }

        const reordered = await vehicleMediaService.reorderVehicleMedia(
          tenantId,
          vehicleId,
          orderedMediaAssetIds
        );
        res.json({ success: true, data: reordered });
      } catch (err) {
        next(err);
      }
    }
  );

  // 6. Delete Media Association
  router.delete(
    "/:vehicleId/media/:mediaAssetId",
    guard(TENANT_PERMISSIONS.VEHICLE_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId, mediaAssetId } = req.params;
        const deleted = await vehicleMediaService.removeVehicleMedia(
          tenantId,
          vehicleId,
          mediaAssetId
        );
        res.json({ success: true, data: { deleted } });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
