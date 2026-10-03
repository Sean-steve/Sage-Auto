// ============================================================================
// CAR HIRE OS — AUTHORIZATION MODULE COMPOSITION (DEV-005)
// Assembles repositories, cache services, use cases, guards, and controllers.
// ============================================================================

import type {
  IRoleRepository,
  ITenantMembershipRoleRepository,
  IPlatformRoleRepository,
  IPlatformMembershipRepository,
  ISupportAccessSessionRepository,
  ITenantMembershipRepository,
  ITenantRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import {
  InMemoryRoleRepository,
  InMemoryTenantMembershipRoleRepository,
  InMemoryPlatformRoleRepository,
  InMemoryPlatformMembershipRepository,
  InMemorySupportAccessSessionRepository,
} from "@carhire/database";
import {
  InMemoryAuthorizationCacheService,
  IAuthorizationCacheService,
} from "./application/cache/authorization-cache.service";
import { AuthorizationService } from "./application/services/authorization.service";
import { RoleManagementService } from "./application/services/role-management.service";
import { PlatformAuthorizationService } from "./application/services/platform-authorization.service";
import { SupportAccessService } from "./application/services/support-access.service";
import { createRoleController } from "./presentation/controllers/role.controller";
import { createAuthorizationController } from "./presentation/controllers/authorization.controller";
import { createPlatformAuthorizationController } from "./presentation/controllers/platform-authorization.controller";
import { createRequirePermissionGuard } from "./presentation/guards/require-permission.guard";
import { createRequirePlatformPermissionGuard } from "./presentation/guards/platform-permission.guard";
import {
  VehicleResourcePolicy,
  BookingResourcePolicy,
  SettlementResourcePolicy,
  UserProfileResourcePolicy,
} from "./domain/policies/domain-policies";

export interface AuthorizationModuleDependencies {
  roleRepository?: IRoleRepository;
  membershipRoleRepository?: ITenantMembershipRoleRepository;
  platformRoleRepository?: IPlatformRoleRepository;
  platformMembershipRepository?: IPlatformMembershipRepository;
  supportSessionRepository?: ISupportAccessSessionRepository;
  membershipRepository: ITenantMembershipRepository;
  tenantRepository: ITenantRepository;
  auditRepository: IAuditRepository;
  outboxRepository: IOutboxRepository;
  cacheService?: IAuthorizationCacheService;
}

export class AuthorizationModule {
  public readonly roleRepository: IRoleRepository;
  public readonly membershipRoleRepository: ITenantMembershipRoleRepository;
  public readonly platformRoleRepository: IPlatformRoleRepository;
  public readonly platformMembershipRepository: IPlatformMembershipRepository;
  public readonly supportSessionRepository: ISupportAccessSessionRepository;
  public readonly cacheService: IAuthorizationCacheService;

  public readonly authorizationService: AuthorizationService;
  public readonly roleManagementService: RoleManagementService;
  public readonly platformAuthorizationService: PlatformAuthorizationService;
  public readonly supportAccessService: SupportAccessService;

  public readonly policies: {
    vehicle: VehicleResourcePolicy;
    booking: BookingResourcePolicy;
    settlement: SettlementResourcePolicy;
    userProfile: UserProfileResourcePolicy;
  };

  constructor(deps: AuthorizationModuleDependencies) {
    this.roleRepository = deps.roleRepository || new InMemoryRoleRepository();
    this.membershipRoleRepository =
      deps.membershipRoleRepository || new InMemoryTenantMembershipRoleRepository(this.roleRepository);
    this.platformRoleRepository = deps.platformRoleRepository || new InMemoryPlatformRoleRepository();
    this.platformMembershipRepository =
      deps.platformMembershipRepository || new InMemoryPlatformMembershipRepository();
    this.supportSessionRepository =
      deps.supportSessionRepository || new InMemorySupportAccessSessionRepository();
    this.cacheService = deps.cacheService || new InMemoryAuthorizationCacheService();

    // Instantiate Application Services
    this.authorizationService = new AuthorizationService(
      this.roleRepository,
      this.membershipRoleRepository,
      this.cacheService
    );

    this.roleManagementService = new RoleManagementService(
      this.roleRepository,
      this.membershipRoleRepository,
      deps.membershipRepository,
      deps.auditRepository,
      deps.outboxRepository,
      this.cacheService
    );

    this.platformAuthorizationService = new PlatformAuthorizationService(
      this.platformRoleRepository,
      deps.auditRepository
    );

    this.supportAccessService = new SupportAccessService(
      this.supportSessionRepository,
      deps.tenantRepository,
      this.platformAuthorizationService,
      deps.auditRepository,
      deps.outboxRepository
    );

    this.policies = {
      vehicle: new VehicleResourcePolicy(),
      booking: new BookingResourcePolicy(),
      settlement: new SettlementResourcePolicy(),
      userProfile: new UserProfileResourcePolicy(),
    };
  }

  createRoleController() {
    return createRoleController(this.roleManagementService, this.authorizationService);
  }

  createAuthorizationController() {
    return createAuthorizationController(this.authorizationService);
  }

  createPlatformAuthorizationController() {
    return createPlatformAuthorizationController(
      this.platformAuthorizationService,
      this.supportAccessService,
      this.platformMembershipRepository
    );
  }

  createPermissionGuard(permission: string, resourceResolver?: (req: any) => any, policy?: any) {
    return createRequirePermissionGuard(this.authorizationService, permission, resourceResolver, policy);
  }

  createPlatformPermissionGuard(permission: string) {
    return createRequirePlatformPermissionGuard(this.platformAuthorizationService, permission);
  }
}
