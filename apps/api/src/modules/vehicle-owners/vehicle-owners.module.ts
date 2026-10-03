// ============================================================================
// CAR HIRE OS — VEHICLE OWNERS MODULE (DOM-001, DOM-003)
// ============================================================================

import { Router } from "express";
import {
  VehicleOwnerRepository,
  VehicleOwnershipRepository,
  VehicleRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { VehicleOwnersService } from "./application/vehicle-owners.service";
import { createVehicleOwnersController } from "./presentation/vehicle-owners.controller";
import type { RequestHandler } from "express";

export class VehicleOwnersModule {
  public readonly router: Router;
  public readonly vehicleOwnersService: VehicleOwnersService;

  constructor(permissionGuard?: (perm: string) => RequestHandler) {
    const ownerRepo = new VehicleOwnerRepository();
    const ownershipRepo = new VehicleOwnershipRepository();
    const vehicleRepo = new VehicleRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.vehicleOwnersService = new VehicleOwnersService(
      ownerRepo,
      ownershipRepo,
      vehicleRepo,
      auditRepo,
      outboxRepo
    );

    this.router = createVehicleOwnersController(this.vehicleOwnersService, permissionGuard);
  }
}
