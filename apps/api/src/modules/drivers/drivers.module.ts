// ============================================================================
// CAR HIRE OS — DRIVERS MODULE (DEV-004, DOM-001, DOM-003)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  DriverRepository,
  PartyDocumentRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { DriversService } from "./application/drivers.service";
import { createDriversController } from "./presentation/drivers.controller";

export class DriversModule {
  public readonly driversService: DriversService;
  public readonly router: Router;

  constructor(
    permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const driverRepo = new DriverRepository();
    const docRepo = new PartyDocumentRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.driversService = new DriversService(
      driverRepo,
      docRepo,
      auditRepo,
      outboxRepo
    );

    this.router = createDriversController(this.driversService, permissionGuard);
  }
}
