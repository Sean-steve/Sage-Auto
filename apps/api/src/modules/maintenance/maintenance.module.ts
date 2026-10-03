// ============================================================================
// CAR HIRE OS — MAINTENANCE MODULE (DOM-003 §21-24, DEV-006, DEV-007)
// Bounded Context: Maintenance Management, Servicing & Fleet Quality
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  MaintenanceRepository,
  MaintenanceScheduleRepository,
  ServiceProviderRepository,
  VehicleRepository,
  VehicleAllocationRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
} from "@carhire/database";
import { MaintenanceService } from "./application/maintenance.service";
import { createMaintenanceController } from "./presentation/maintenance.controller";

export class MaintenanceModule {
  public readonly maintenanceService: MaintenanceService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const maintenanceRepo = new MaintenanceRepository();
    const scheduleRepo = new MaintenanceScheduleRepository();
    const providerRepo = new ServiceProviderRepository();
    const vehicleRepo = new VehicleRepository();
    const allocationRepo = new VehicleAllocationRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();
    const idempotencyRepo = new IdempotencyRepository();

    this.maintenanceService = new MaintenanceService(
      maintenanceRepo,
      scheduleRepo,
      providerRepo,
      vehicleRepo,
      allocationRepo,
      auditRepo,
      outboxRepo,
      idempotencyRepo
    );

    this.router = createMaintenanceController(this.maintenanceService, permissionGuard);
  }
}
