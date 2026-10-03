// ============================================================================
// CAR HIRE OS — HANDOVERS MODULE (DOM-003 §18, DEV-006, DEV-007)
// Bounded Context: Vehicle Handover & Physical Dispatch Checklist
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  HandoverRepository,
  BookingRepository,
  ContractRepository,
  VehicleRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
} from "@carhire/database";
import { HandoverService } from "./application/handover.service";
import { createHandoverController } from "./presentation/handover.controller";

export class HandoversModule {
  public readonly handoverService: HandoverService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void,
    complianceReadinessService?: any
  ) {
    const handoverRepo = new HandoverRepository();
    const bookingRepo = new BookingRepository();
    const contractRepo = new ContractRepository();
    const vehicleRepo = new VehicleRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();
    const idempotencyRepo = new IdempotencyRepository();

    this.handoverService = new HandoverService(
      handoverRepo,
      bookingRepo,
      contractRepo,
      vehicleRepo,
      auditRepo,
      outboxRepo,
      idempotencyRepo,
      undefined,
      complianceReadinessService
    );

    this.router = createHandoverController(this.handoverService, permissionGuard);
  }
}
