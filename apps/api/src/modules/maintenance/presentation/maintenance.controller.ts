// ============================================================================
// CAR HIRE OS — MAINTENANCE PRESENTATION CONTROLLER (SPRINT 17)
// Bounded Context: Maintenance Management (DOM-003 §21-24)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { MaintenanceService, ServiceActor } from "../application/maintenance.service";

export function createMaintenanceController(
  maintenanceService: MaintenanceService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request): ServiceActor => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return {
      userId,
      userEmail: user?.email,
      role: user?.role,
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
  // WORK ORDERS
  // --------------------------------------------------------------------------

  // List work orders
  router.get(
    "/work-orders",
    guard("maintenance.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId, status, maintenanceType, priority, garageId, search } = req.query;
        const workOrders = await maintenanceService.listWorkOrders(tenantId, {
          vehicleId: vehicleId as string,
          status: status as any,
          maintenanceType: maintenanceType as any,
          priority: priority as any,
          garageId: garageId as string,
          search: search as string,
        });
        res.json({ success: true, data: workOrders });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create maintenance request
  router.post(
    "/work-orders",
    guard("maintenance.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const workOrder = await maintenanceService.createMaintenanceRequest(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: workOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get work order by ID
  router.get(
    "/work-orders/:id",
    guard("maintenance.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const workOrder = await maintenanceService.getById(tenantId, req.params.id);
        res.json({ success: true, data: workOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  // Schedule maintenance
  router.post(
    "/work-orders/:id/schedule",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const workOrder = await maintenanceService.scheduleMaintenance(tenantId, req.params.id, req.body, actor);
        res.json({ success: true, data: workOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  // Start maintenance
  router.post(
    "/work-orders/:id/start",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const workOrder = await maintenanceService.startMaintenance(tenantId, req.params.id, req.body, actor);
        res.json({ success: true, data: workOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  // Add task to work order
  router.post(
    "/work-orders/:id/tasks",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const task = await maintenanceService.addTask(tenantId, req.params.id, req.body, actor);
        res.status(201).json({ success: true, data: task });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update task
  router.patch(
    "/work-orders/:id/tasks/:taskId",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const task = await maintenanceService.updateTask(
          tenantId,
          req.params.id,
          req.params.taskId,
          req.body,
          actor
        );
        res.json({ success: true, data: task });
      } catch (err) {
        next(err);
      }
    }
  );

  // Add part item
  router.post(
    "/work-orders/:id/parts",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const part = await maintenanceService.addPartItem(tenantId, req.params.id, req.body, actor);
        res.status(201).json({ success: true, data: part });
      } catch (err) {
        next(err);
      }
    }
  );

  // Record cost item
  router.post(
    "/work-orders/:id/costs",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const costItem = await maintenanceService.recordCostItem(tenantId, req.params.id, req.body, actor);
        res.status(201).json({ success: true, data: costItem });
      } catch (err) {
        next(err);
      }
    }
  );

  // Add evidence
  router.post(
    "/work-orders/:id/evidence",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const evidence = await maintenanceService.addEvidence(tenantId, req.params.id, req.body, actor);
        res.status(201).json({ success: true, data: evidence });
      } catch (err) {
        next(err);
      }
    }
  );

  // Complete maintenance
  router.post(
    "/work-orders/:id/complete",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const workOrder = await maintenanceService.completeMaintenance(tenantId, req.params.id, req.body, actor);
        res.json({ success: true, data: workOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  // Verify maintenance (QA Sign-off)
  router.post(
    "/work-orders/:id/verify",
    guard("maintenance.verify"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const workOrder = await maintenanceService.verifyMaintenance(tenantId, req.params.id, req.body, actor);
        res.json({ success: true, data: workOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  // Cancel maintenance
  router.post(
    "/work-orders/:id/cancel",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const workOrder = await maintenanceService.cancelMaintenance(tenantId, req.params.id, req.body, actor);
        res.json({ success: true, data: workOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // SCHEDULES & PREVENTIVE INTERVALS
  // --------------------------------------------------------------------------

  // List schedules
  router.get(
    "/schedules",
    guard("maintenance.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId, vehicleCategoryId, maintenanceType, status } = req.query;
        const schedules = await maintenanceService.listSchedules(tenantId, {
          vehicleId: vehicleId as string,
          vehicleCategoryId: vehicleCategoryId as string,
          maintenanceType: maintenanceType as any,
          status: status as any,
        });
        res.json({ success: true, data: schedules });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create schedule
  router.post(
    "/schedules",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const schedule = await maintenanceService.createSchedule(tenantId, req.body);
        res.status(201).json({ success: true, data: schedule });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get schedule by ID
  router.get(
    "/schedules/:id",
    guard("maintenance.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const schedule = await maintenanceService.getScheduleById(tenantId, req.params.id);
        res.json({ success: true, data: schedule });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update schedule
  router.patch(
    "/schedules/:id",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const schedule = await maintenanceService.updateSchedule(tenantId, req.params.id, req.body);
        res.json({ success: true, data: schedule });
      } catch (err) {
        next(err);
      }
    }
  );

  // Fleet Due Evaluations
  router.get(
    "/due-evaluations",
    guard("maintenance.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId } = req.query;
        const evaluations = await maintenanceService.evaluateDueSchedules(
          tenantId,
          vehicleId as string
        );
        res.json({ success: true, data: evaluations });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // SERVICE PROVIDERS / GARAGES
  // --------------------------------------------------------------------------

  // List service providers
  router.get(
    "/providers",
    guard("maintenance.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { status, serviceType, search } = req.query;
        const providers = await maintenanceService.listServiceProviders(tenantId, {
          status: status as any,
          serviceType: serviceType as any,
          search: search as string,
        });
        res.json({ success: true, data: providers });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create service provider
  router.post(
    "/providers",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const provider = await maintenanceService.createServiceProvider(tenantId, req.body);
        res.status(201).json({ success: true, data: provider });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get provider by ID
  router.get(
    "/providers/:id",
    guard("maintenance.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const provider = await maintenanceService.getServiceProviderById(tenantId, req.params.id);
        res.json({ success: true, data: provider });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update provider
  router.patch(
    "/providers/:id",
    guard("maintenance.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const provider = await maintenanceService.updateServiceProvider(tenantId, req.params.id, req.body);
        res.json({ success: true, data: provider });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
