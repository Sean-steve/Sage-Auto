// ============================================================================
// CAR HIRE OS — CUSTOMERS CONTROLLER (DEV-004, DOM-001, SEC-005)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { CustomersService } from "../application/customers.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";

export function createCustomersController(
  customersService: CustomersService,
  permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();

  const getTenantId = (req: Request): string => {
    const tid = (req as any).tenantContext?.tenantId || (req as any).tenantId;
    if (!tid) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tid;
  };

  const getActor = (req: Request, defaultRoleName = "Staff Member"): { actorId: string; actorName: string } => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const actorId = auth?.userId || user?.id || user?.sub;
    if (!actorId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    const actorName = user?.fullName || user?.name || defaultRoleName;
    return { actorId, actorName };
  };

  // List Customers
  router.get(
    "/",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await customersService.listCustomers(tenantId, req.query);
        res.json({ success: true, data: result.customers, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get Customer by ID
  router.get(
    "/:id",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const details = await customersService.getCustomerDetails(req.params.id, tenantId);
        res.json({ success: true, data: details });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create Customer (KYC onboarding)
  router.post(
    "/",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Staff Member");
        const customer = await customersService.createCustomer(tenantId, req.body, actorId, actorName);
        res.status(201).json({ success: true, data: customer });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update Customer
  router.put(
    "/:id",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId } = getActor(req, "Staff Member");
        const updated = await customersService.updateCustomer(req.params.id, tenantId, req.body, actorId);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Change Customer Status (e.g. Block / Reinstate)
  router.patch(
    "/:id/status",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_BLOCK),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Staff Member");
        const updated = await customersService.changeStatus(req.params.id, tenantId, req.body, actorId, actorName);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Verify Customer KYC
  router.patch(
    "/:id/verify",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_VERIFY),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Compliance Officer");
        const updated = await customersService.verifyKYC(req.params.id, tenantId, req.body, actorId, actorName);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
