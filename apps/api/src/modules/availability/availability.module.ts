// ============================================================================
// CAR HIRE OS — AVAILABILITY & CONCURRENCY-SAFE ALLOCATION MODULE (DEV-006, DEV-007)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  VehicleAllocationRepository,
  VehicleBlockRepository,
  VehicleRepository,
  SubscriptionRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { AvailabilityService } from "./application/availability.service";
import { createAvailabilityController } from "./presentation/availability.controller";

export class AvailabilityModule {
  public readonly availabilityService: AvailabilityService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const allocationRepo = new VehicleAllocationRepository();
    const blockRepo = new VehicleBlockRepository();
    const vehicleRepo = new VehicleRepository();
    const subscriptionRepo = new SubscriptionRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.availabilityService = new AvailabilityService(
      allocationRepo,
      blockRepo,
      vehicleRepo,
      subscriptionRepo,
      auditRepo,
      outboxRepo
    );

    this.router = createAvailabilityController(this.availabilityService, permissionGuard);
  }
}
