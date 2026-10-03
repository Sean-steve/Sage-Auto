// ============================================================================
// CAR HIRE OS — INSPECTIONS MODULE (DOM-003 §21-22, DEV-006, DEV-007)
// Bounded Context: Vehicle Inspection Audits, Condition Checklists, Damage & Evidence
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  InspectionRepository,
  DamageRepository,
  InspectionTemplateRepository,
  VehicleRepository,
  BookingRepository,
  RentalRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
} from "@carhire/database";
import { InspectionService } from "./application/inspection.service";
import { createInspectionController } from "./presentation/inspection.controller";

export class InspectionsModule {
  public readonly inspectionService: InspectionService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const inspectionRepo = new InspectionRepository();
    const damageRepo = new DamageRepository();
    const templateRepo = new InspectionTemplateRepository();
    const vehicleRepo = new VehicleRepository();
    const bookingRepo = new BookingRepository();
    const rentalRepo = new RentalRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();
    const idempotencyRepo = new IdempotencyRepository();

    this.inspectionService = new InspectionService(
      inspectionRepo,
      damageRepo,
      templateRepo,
      vehicleRepo,
      bookingRepo,
      rentalRepo,
      auditRepo,
      outboxRepo,
      idempotencyRepo
    );

    this.router = createInspectionController(this.inspectionService, permissionGuard);
  }
}
