// ============================================================================
// CAR HIRE OS — COMPLIANCE MODULE (DEV-006, DEV-007, DEV-009, DOM-003)
// Bounded Context: Regulatory Compliance, Expiry Tracking & Operational Gatekeeping
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  ComplianceRequirementRepository,
  ComplianceRecordRepository,
  ComplianceIssueRepository,
  ComplianceOverrideRepository,
  VehicleRepository,
  VehicleBlockRepository,
  DriverRepository,
  CustomerRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
} from "@carhire/database";
import { ComplianceService } from "./application/compliance.service";
import { ComplianceReadinessService } from "./application/compliance-readiness.service";
import { createComplianceController } from "./presentation/compliance.controller";
import { SystemClock } from "./domain/clock";

export class ComplianceModule {
  public readonly complianceService: ComplianceService;
  public readonly readinessService: ComplianceReadinessService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const requirementRepo = new ComplianceRequirementRepository();
    const recordRepo = new ComplianceRecordRepository();
    const issueRepo = new ComplianceIssueRepository();
    const overrideRepo = new ComplianceOverrideRepository();
    const vehicleRepo = new VehicleRepository();
    const vehicleBlockRepo = new VehicleBlockRepository();
    const driverRepo = new DriverRepository();
    const customerRepo = new CustomerRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();
    const idempotencyRepo = new IdempotencyRepository();
    const clock = new SystemClock();

    this.complianceService = new ComplianceService(
      requirementRepo,
      recordRepo,
      issueRepo,
      overrideRepo,
      vehicleRepo,
      vehicleBlockRepo,
      driverRepo,
      auditRepo,
      outboxRepo,
      idempotencyRepo,
      clock
    );

    this.readinessService = new ComplianceReadinessService(
      requirementRepo,
      recordRepo,
      issueRepo,
      overrideRepo,
      vehicleRepo,
      driverRepo,
      customerRepo,
      clock
    );

    this.router = createComplianceController(
      this.complianceService,
      this.readinessService,
      permissionGuard
    );
  }
}
