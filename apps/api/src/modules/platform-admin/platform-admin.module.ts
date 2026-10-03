// ============================================================================
// CAR HIRE OS — PLATFORM ADMIN MODULE (Sprint 37)
// Aggregates control-plane tenant lifecycle, provider health, DLQ operations,
// and platform configuration into a unified router module.
// ============================================================================

import { Router } from "express";
import type {
  ITenantRepository,
  ISubscriptionRepository,
  IPlanRepository,
  IVehicleRepository,
  IBookingRepository,
  IAuditRepository,
  IOutboxRepository,
  IUserRepository,
} from "@carhire/database";
import type { PlatformAuthorizationService } from "../authorization/application/services/platform-authorization.service";
import { PlatformTenantLifecycleService } from "./application/services/platform-tenant-lifecycle.service";
import { PlatformOperationsService } from "./application/services/platform-operations.service";
import { createPlatformTenantsController } from "./presentation/platform-tenants.controller";
import { createPlatformOperationsController } from "./presentation/platform-operations.controller";

export interface PlatformAdminModuleDependencies {
  tenantRepo: ITenantRepository;
  subscriptionRepo: ISubscriptionRepository;
  planRepo: IPlanRepository;
  vehicleRepo: IVehicleRepository;
  bookingRepo: IBookingRepository;
  auditRepo: IAuditRepository;
  outboxRepo: IOutboxRepository;
  userRepo: IUserRepository;
  platformAuthService: PlatformAuthorizationService;
}

export interface PlatformAdminModule {
  router: Router;
  tenantLifecycleService: PlatformTenantLifecycleService;
  operationsService: PlatformOperationsService;
}

export function createPlatformAdminModule(
  deps: PlatformAdminModuleDependencies
): PlatformAdminModule {
  const tenantLifecycleService = new PlatformTenantLifecycleService(
    deps.tenantRepo,
    deps.subscriptionRepo,
    deps.planRepo,
    deps.vehicleRepo,
    deps.bookingRepo,
    deps.auditRepo,
    deps.outboxRepo,
    deps.userRepo,
    deps.platformAuthService
  );

  const operationsService = new PlatformOperationsService(
    deps.outboxRepo,
    deps.auditRepo,
    deps.tenantRepo,
    deps.platformAuthService
  );

  const tenantsRouter = createPlatformTenantsController(
    tenantLifecycleService,
    deps.platformAuthService
  );

  const operationsRouter = createPlatformOperationsController(
    operationsService,
    deps.platformAuthService
  );

  const router = Router();
  router.use("/tenants", tenantsRouter);
  router.use("/operations", operationsRouter);

  return {
    router,
    tenantLifecycleService,
    operationsService,
  };
}
