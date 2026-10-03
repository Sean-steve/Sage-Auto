import { SubscriptionService } from "../subscriptions/application/subscription.service";
// ============================================================================
// CAR HIRE OS — TENANCY MODULE (DEV-004, DEV-007)
// ============================================================================

import { Router } from "express";
import {
  TenantRepository,
  TenantSettingsRepository,
  TenantMembershipRepository,
  AuditRepository,
  OutboxRepository,
  TenantMembershipRoleRepository,
  RoleRepository,
  SupportAccessSessionRepository,
} from "@carhire/database";
import { TokenService } from "../identity/application/security/token.service";
import { createAuthGuard } from "../identity/presentation/auth.guard";
import {
  TenantContextResolverService,
  IEffectivePermissionResolver,
} from "./application/context/tenant-context-resolver.service";
import { TenantProvisioningService } from "./application/services/tenant-provisioning.service";
import { TenancyService } from "./application/services/tenancy.service";
import { TenantController } from "./presentation/tenant.controller";
import { createTenantGuard } from "./presentation/tenant.guard";

export class TenancyModule {
  public readonly router: Router;
  public readonly tenancyService: TenancyService;
  public readonly provisioningService: TenantProvisioningService;
  public readonly resolverService: TenantContextResolverService;
  public readonly tenantGuard: ReturnType<typeof createTenantGuard>;

  constructor(
    tenantRepo = new TenantRepository(),
    settingsRepo = new TenantSettingsRepository(),
    membershipRepo = new TenantMembershipRepository(),
    auditRepo = new AuditRepository(),
    outboxRepo = new OutboxRepository(),
    tokenService = new TokenService(),
    membershipRoleRepo?: TenantMembershipRoleRepository,
    roleRepo?: RoleRepository,
    authzResolver?: IEffectivePermissionResolver,
    supportSessionRepo = new SupportAccessSessionRepository()
  ) {
    this.resolverService = new TenantContextResolverService(tenantRepo, membershipRepo, authzResolver, supportSessionRepo);
    this.provisioningService = new TenantProvisioningService(
      tenantRepo,
      settingsRepo,
      membershipRepo,
      auditRepo,
      outboxRepo,
      membershipRoleRepo,
      roleRepo,
      new SubscriptionService()
    );
    this.tenancyService = new TenancyService(
      tenantRepo,
      settingsRepo,
      membershipRepo,
      auditRepo,
      outboxRepo
    );

    const authGuard = createAuthGuard(tokenService);
    this.tenantGuard = createTenantGuard(this.resolverService);

    const controller = new TenantController(this.tenancyService, this.provisioningService);

    this.router = Router();

    // 1. User Tenancy Endpoints (Auth required, no specific Tenant ID required)
    this.router.get("/tenants", authGuard, controller.listUserTenants);
    this.router.post("/tenants", authGuard, controller.provisionTenant);

    // 2. Active Tenant Context Endpoints (Auth + Validated X-Tenant-ID required)
    this.router.get("/tenant/context", authGuard, this.tenantGuard, controller.getActiveContext);
    this.router.get("/tenant/details", authGuard, this.tenantGuard, controller.getTenantDetails);
    this.router.patch("/tenant/settings", authGuard, this.tenantGuard, (req,res,next)=>{
      if(!req.tenantContext?.roles.includes('COMPANY_OWNER')) {res.status(403).json({error:{message:'Company owner access required'}});return;}
      next();
    }, controller.updateTenantSettings);
  }
}
