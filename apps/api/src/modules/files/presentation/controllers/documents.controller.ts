// ============================================================================
// CAR HIRE OS — DOCUMENTS PRESENTATION CONTROLLER (DOM-001, ARCH-001, SEC-001)
// Enterprise document aggregate endpoints for lifecycle, versioning, and compliance
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { DocumentLifecycleService } from "../../application/services/document-lifecycle.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import { FileResourceType } from "@carhire/types";

export function createDocumentsController(
  documentLifecycleService: DocumentLifecycleService,
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

  // 1. Create Document (with optional initial version)
  router.post(
    "/",
    guard(TENANT_PERMISSIONS.DOCUMENT_UPLOAD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const doc = await documentLifecycleService.createDocument(tenantId, actorId, req.body);
        res.status(201).json({ success: true, data: doc });
      } catch (err) {
        next(err);
      }
    }
  );

  // 2. List Documents with filters
  router.get(
    "/",
    guard(TENANT_PERMISSIONS.DOCUMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { documentType, status, limit, offset } = req.query;
        const result = await documentLifecycleService.listDocuments(tenantId, {
          documentType: documentType as string,
          status: status as any,
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        });
        res.status(200).json({ success: true, data: result.items, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  // 3. Get Document with full version history
  router.get(
    "/:id",
    guard(TENANT_PERMISSIONS.DOCUMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const doc = await documentLifecycleService.getDocumentWithVersions(tenantId, req.params.id);
        res.status(200).json({ success: true, data: doc });
      } catch (err) {
        next(err);
      }
    }
  );

  // 4. Upload New Version
  router.post(
    "/:id/versions",
    guard(TENANT_PERMISSIONS.DOCUMENT_UPLOAD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const result = await documentLifecycleService.uploadNewVersion(
          tenantId,
          actorId,
          req.params.id,
          req.body
        );
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // 5. Archive Document
  router.post(
    "/:id/archive",
    guard(TENANT_PERMISSIONS.DOCUMENT_REPLACE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const doc = await documentLifecycleService.archiveDocument(tenantId, req.params.id, actorId);
        res.status(200).json({ success: true, data: doc });
      } catch (err) {
        next(err);
      }
    }
  );

  // 6. List Documents by Resource
  router.get(
    "/resource/:resourceType/:resourceId",
    guard(TENANT_PERMISSIONS.DOCUMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const resourceType = req.params.resourceType as FileResourceType;
        const resourceId = req.params.resourceId;
        const docs = await documentLifecycleService.listByResource(tenantId, resourceType, resourceId);
        res.status(200).json({ success: true, data: docs });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
