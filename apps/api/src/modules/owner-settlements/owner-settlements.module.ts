// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENTS MODULE (Sprint 21: DOM-003 §41-45)
// Bounded Context: Vehicle Owner Settlements, Revenue Sharing & Payout Obligations
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  OwnerSettlementRepository,
  OwnerSettlementPeriodRepository,
  OwnerSettlementBatchRepository,
  VehicleOwnerRepository,
  VehicleOwnershipRepository,
  VehicleRepository,
  RentalRepository,
  ExpenseRepository,
  AuditRepository,
} from "@carhire/database";
import { OwnerSettlementsService } from "./application/owner-settlements.service";
import { createOwnerSettlementsController } from "./presentation/owner-settlements.controller";
import { LedgerService } from "../ledger/application/ledger.service";

export class OwnerSettlementsModule {
  public readonly settlementService: OwnerSettlementsService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void,
    ledgerService?: LedgerService,
    overrides?: {
      settlementRepo?: OwnerSettlementRepository;
      periodRepo?: OwnerSettlementPeriodRepository;
      batchRepo?: OwnerSettlementBatchRepository;
      ownerRepo?: VehicleOwnerRepository;
      ownershipRepo?: VehicleOwnershipRepository;
      vehicleRepo?: VehicleRepository;
      rentalRepo?: RentalRepository;
      expenseRepo?: ExpenseRepository;
      auditRepo?: AuditRepository;
    }
  ) {
    const settlementRepo = overrides?.settlementRepo || new OwnerSettlementRepository();
    const periodRepo = overrides?.periodRepo || new OwnerSettlementPeriodRepository();
    const batchRepo = overrides?.batchRepo || new OwnerSettlementBatchRepository();
    const ownerRepo = overrides?.ownerRepo || new VehicleOwnerRepository();
    const ownershipRepo = overrides?.ownershipRepo || new VehicleOwnershipRepository();
    const vehicleRepo = overrides?.vehicleRepo || new VehicleRepository();
    const rentalRepo = overrides?.rentalRepo || new RentalRepository();
    const expenseRepo = overrides?.expenseRepo || new ExpenseRepository();
    const auditRepo = overrides?.auditRepo || new AuditRepository();

    this.settlementService = new OwnerSettlementsService(
      settlementRepo,
      periodRepo,
      batchRepo,
      ownerRepo,
      ownershipRepo,
      vehicleRepo,
      rentalRepo,
      expenseRepo,
      ledgerService,
      auditRepo
    );

    this.router = createOwnerSettlementsController(this.settlementService, permissionGuard);
  }
}
