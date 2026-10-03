// ============================================================================
// CAR HIRE OS — CONTRACTS MODULE (DOM-003 §17, DEV-006, DEV-007)
// Bounded Context: Contracts & Legal Instruments
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  ContractRepository,
  BookingRepository,
  CustomerRepository,
  DriverRepository,
  VehicleRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
} from "@carhire/database";
import { ContractService } from "./application/contract.service";
import { createContractController } from "./presentation/contract.controller";

export class ContractsModule {
  public readonly contractService: ContractService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const contractRepo = new ContractRepository();
    const bookingRepo = new BookingRepository();
    const customerRepo = new CustomerRepository();
    const driverRepo = new DriverRepository();
    const vehicleRepo = new VehicleRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();
    const idempotencyRepo = new IdempotencyRepository();

    this.contractService = new ContractService(
      contractRepo,
      bookingRepo,
      customerRepo,
      driverRepo,
      vehicleRepo,
      auditRepo,
      outboxRepo,
      idempotencyRepo
    );

    this.router = createContractController(this.contractService, permissionGuard);
  }
}
