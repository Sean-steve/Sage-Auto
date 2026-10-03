// ============================================================================
// CAR HIRE OS — FILES PRESENTATION CONTROLLER (ARCH-001, SEC-001, SEC-002)
// Secure HTTP endpoints for upload intent, finalization, access & zero-trust auditing
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { FileUploadService } from "../../application/services/file-upload.service";
import { FileAccessService } from "../../application/services/file-access.service";
import { StorageReconciliationService } from "../../application/services/storage-reconciliation.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import { FileResourceType, FileResourceRole } from "@carhire/types";

export function createFilesController(
  fileUploadService: FileUploadService,
  fileAccessService: FileAccessService,
  storageReconciliationService: StorageReconciliationService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request) => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return {
      id: userId,
      type: "USER" as const,
      ipAddress: req.ip || (req.headers["x-forwarded-for"] as string),
      userAgent: req.headers["user-agent"] as string,
      permissions: user?.permissions || auth?.claims?.permissions || [],
    };
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
  // UPLOAD WORKFLOW
  // --------------------------------------------------------------------------

  // 1. Request Upload Intent
  router.post(
    "/upload-intent",
    guard(TENANT_PERMISSIONS.FILE_UPLOAD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const result = await fileUploadService.requestUploadIntent(tenantId, actor.id, req.body);
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // 2. Finalize Upload
  router.post(
    "/finalize-upload",
    guard(TENANT_PERMISSIONS.FILE_UPLOAD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const result = await fileUploadService.finalizeUpload(tenantId, actor.id, req.body);
        res.status(200).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // 3. Cancel Upload
  router.post(
    "/cancel-upload",
    guard(TENANT_PERMISSIONS.FILE_UPLOAD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        await fileUploadService.cancelUpload(tenantId, req.body.sessionId, actor.id);
        res.status(200).json({ success: true, message: "Upload session cancelled successfully." });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // FILE ACCESS & DOWNLOAD
  // --------------------------------------------------------------------------

  // 4. Get File Metadata
  router.get(
    "/:id",
    guard(TENANT_PERMISSIONS.FILE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const file = await fileAccessService.getFileMetadata(tenantId, req.params.id, actor);
        res.status(200).json({ success: true, data: file });
      } catch (err) {
        next(err);
      }
    }
  );

  // 5. Generate Signed Download URL
  router.get(
    "/:id/download-url",
    guard(TENANT_PERMISSIONS.FILE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const disposition = (req.query.disposition as "inline" | "attachment") || "attachment";
        const expiresInSeconds = req.query.expiresInSeconds ? Number(req.query.expiresInSeconds) : undefined;

        const ticket = await fileAccessService.generateDownloadUrl(tenantId, req.params.id, actor, {
          disposition,
          expiresInSeconds,
        });

        res.status(200).json({ success: true, data: ticket });
      } catch (err) {
        next(err);
      }
    }
  );

  // 6. Soft Delete File
  router.delete(
    "/:id",
    guard(TENANT_PERMISSIONS.FILE_DELETE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        await fileAccessService.softDeleteFile(tenantId, req.params.id, actor.id);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  // 7. List Files Attached to Resource
  router.get(
    "/resource/:resourceType/:resourceId",
    guard(TENANT_PERMISSIONS.FILE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const resourceType = req.params.resourceType as FileResourceType;
        const resourceId = req.params.resourceId;
        const role = req.query.role as FileResourceRole | undefined;

        const files = await fileAccessService.listFilesByResource(tenantId, resourceType, resourceId, role);
        res.status(200).json({ success: true, data: files });
      } catch (err) {
        next(err);
      }
    }
  );

  // 8. Trigger Storage Reconciliation Sweep
  router.post(
    "/reconciliation",
    guard(TENANT_PERMISSIONS.FILE_ARCHIVE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const report = await storageReconciliationService.reconcileTenantStorage(tenantId);
        res.status(200).json({ success: true, data: report });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
