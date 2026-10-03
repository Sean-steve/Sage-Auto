// ============================================================================
// CAR HIRE OS — RENTALS MODULE (DOM-003 §19-20, DEV-006, DEV-007)
// Bounded Context: Rentals & On-Road Fleet Dispatches
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  RentalRepository,
  BookingRepository,
  ContractRepository,
  HandoverRepository,
  VehicleRepository,
  VehicleAllocationRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
} from "@carhire/database";
import { RentalService } from "./application/rental.service";
import { createRentalController } from "./presentation/rental.controller";

export class RentalsModule {
  public readonly rentalService: RentalService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void,
    complianceReadinessService?: any
  ) {
    const rentalRepo = new RentalRepository();
    const bookingRepo = new BookingRepository();
    const contractRepo = new ContractRepository();
    const handoverRepo = new HandoverRepository();
    const vehicleRepo = new VehicleRepository();
    const allocationRepo = new VehicleAllocationRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();
    const idempotencyRepo = new IdempotencyRepository();

    this.rentalService = new RentalService(
      rentalRepo,
      bookingRepo,
      contractRepo,
      handoverRepo,
      vehicleRepo,
      allocationRepo,
      auditRepo,
      outboxRepo,
      idempotencyRepo,
      undefined,
      undefined,
      complianceReadinessService
    );

    this.router = createRentalController(this.rentalService, permissionGuard);
  }
}
