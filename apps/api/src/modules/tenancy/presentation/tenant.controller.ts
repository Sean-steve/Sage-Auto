// ============================================================================
// CAR HIRE OS — TENANCY CONTROLLER (DEV-004, DEV-007)
// ============================================================================

import { Request, Response } from "express";
import { ERROR_CODES } from "@carhire/constants";
import type { TenancyService } from "../application/services/tenancy.service";
import type { TenantProvisioningService } from "../application/services/tenant-provisioning.service";

export class TenantController {
  constructor(
    private readonly tenancyService: TenancyService,
    private readonly provisioningService: TenantProvisioningService
  ) {}

  /**
   * GET /api/v1/tenants
   * Returns list of tenants where the authenticated user holds an active membership.
   */
  listUserTenants = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const userId = req.auth?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: "Authentication required",
          requestId,
        },
      });
      return;
    }

    try {
      const tenants = await this.tenancyService.listUserTenants(userId);
      res.status(200).json({
        data: tenants,
        meta: {
          total: tenants.length,
          requestId,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: err.message || "Failed to list tenant workspaces",
          requestId,
        },
      });
    }
  };

  /**
   * GET /api/v1/tenant/context
   * Returns trusted TenantContext metadata for active X-Tenant-ID.
   */
  getActiveContext = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const context = req.tenantContext;

    if (!context) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_TENANT_CONTEXT,
          message: "No active tenant context found for this request",
          requestId,
        },
      });
      return;
    }

    res.status(200).json({
      data: context,
      meta: { requestId },
    });
  };

  /**
   * POST /api/v1/tenants
   * Atomically provisions a new Tenant workspace.
   */
  provisionTenant = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const userId = req.auth?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: "Authentication required to create a tenant",
          requestId,
        },
      });
      return;
    }

    try {
      const result = await this.provisionService(userId, req.body, requestId);
      res.status(201).json({
        data: {
          tenant: result.tenant,
          settings: result.settings,
          membership: result.membership,
        },
        meta: { requestId },
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      const code = err.code || "TENANT_PROVISIONING_FAILED";

      res.status(statusCode).json({
        error: {
          code,
          message: err.message || "Failed to provision tenant workspace",
          requestId,
        },
      });
    }
  };

  private async provisionService(userId: string, body: any, requestId: string) {
    return this.provisioningService.provisionTenant(userId, body, requestId);
  }

  /**
   * GET /api/v1/tenant/details
   * Retrieves full tenant info and settings for the active context.
   */
  getTenantDetails = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.TENANT_REQUIRED,
          message: "Tenant context required",
          requestId,
        },
      });
      return;
    }

    try {
      const details = await this.tenancyService.getTenantDetails(tenantId);
      res.status(200).json({
        data: details,
        meta: { requestId },
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: {
          code: err.code || "FAILED_TO_LOAD_TENANT",
          message: err.message,
          requestId,
        },
      });
    }
  };

  /**
   * PATCH /api/v1/tenant/settings
   * Updates tenant settings for the active tenant context.
   */
  updateTenantSettings = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;
    const userId = req.auth?.userId;

    if (!tenantId || !userId) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.TENANT_REQUIRED,
          message: "Tenant context required",
          requestId,
        },
      });
      return;
    }

    try {
      const updated = await this.tenancyService.updateTenantSettings(
        tenantId,
        userId,
        req.body,
        requestId
      );

      res.status(200).json({
        data: updated,
        meta: { requestId },
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: {
          code: err.code || "SETTINGS_UPDATE_FAILED",
          message: err.message,
          requestId,
        },
      });
    }
  };
}
