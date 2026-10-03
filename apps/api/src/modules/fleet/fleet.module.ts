// ============================================================================
// CAR HIRE OS — FLEET MODULE (DOM-001, ENT-001)
// ============================================================================

import { Router } from "express";
import {
  VehicleRepository,
  VehicleOwnershipRepository,
  VehicleOwnerRepository,
  VehicleCategoryRepository,
  VehicleDocumentRepository,
  AuditRepository,
  OutboxRepository,
  RentalRepository,
} from "@carhire/database";
import { FleetService } from "./application/fleet.service";
import { createFleetController } from "./presentation/fleet.controller";
import { EntitlementService } from "../entitlements/application/entitlement.service";
import type { RequestHandler } from "express";

export class FleetModule {
  public readonly router: Router;
  public readonly fleetService: FleetService;

  constructor(
    vehicleRepo: VehicleRepository,
    entitlementService?: EntitlementService,
    permissionGuard?: (perm: string) => RequestHandler
  ) {
    const ownershipRepo = new VehicleOwnershipRepository();
    const ownerRepo = new VehicleOwnerRepository();
    const categoryRepo = new VehicleCategoryRepository();
    const documentRepo = new VehicleDocumentRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.fleetService = new FleetService(
      vehicleRepo,
      ownershipRepo,
      ownerRepo,
      categoryRepo,
      documentRepo,
      auditRepo,
      outboxRepo,
      entitlementService,
      new RentalRepository()
    );

    this.router = createFleetController(this.fleetService, permissionGuard);
  }
}
