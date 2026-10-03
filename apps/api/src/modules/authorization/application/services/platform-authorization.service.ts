// ============================================================================
// CAR HIRE OS — PLATFORM AUTHORIZATION SERVICE (DEV-005 §9, §20-21, SEC-005)
// Strictly decouples Platform Authorization from Tenant RBAC.
// Invariant: Platform Admin does NOT automatically bypass tenant RBAC.
// ============================================================================

import { ERROR_CODES, PLATFORM_PERMISSIONS } from "@carhire/constants";
import type { PlatformRole, PlatformAuthorizationContext } from "@carhire/types";
import type { IPlatformRoleRepository, IAuditRepository } from "@carhire/database";

export class PlatformAuthorizationService {
  constructor(
    private readonly platformRoleRepository: IPlatformRoleRepository,
    private readonly auditRepository: IAuditRepository
  ) {}

  /**
   * Resolves platform permissions for a platform staff member.
   */
  async resolvePlatformPermissions(
    platformMembershipId: string,
    userId: string,
    requestId: string
  ): Promise<PlatformAuthorizationContext> {
    const roles = await this.platformRoleRepository.getRolesForStaff(platformMembershipId);
    const permissions = await this.platformRoleRepository.getPermissionsForStaff(platformMembershipId);

    return {
      userId,
      platformMembershipId,
      platformRoles: roles.map((r) => r.code),
      permissions,
      requestId,
      resolvedAt: new Date().toISOString(),
    };
  }

  /**
   * Checks if platform context has the required platform permission.
   */
  can(context: PlatformAuthorizationContext, requiredPlatformPermission: string): boolean {
    if (!context) return false;
    return context.permissions.includes(requiredPlatformPermission) || context.permissions.includes("*");
  }

  /**
   * Enforces that the platform context has the required platform permission.
   */
  require(context: PlatformAuthorizationContext, requiredPlatformPermission: string): void {
    if (!this.can(context, requiredPlatformPermission)) {
      const error: any = new Error(
        `Platform permission denied. Required platform permission: '${requiredPlatformPermission}'`
      );
      error.statusCode = 403;
      error.code = ERROR_CODES.PLATFORM_PERMISSION_DENIED;
      error.details = {
        requiredPlatformPermission,
        userId: context.userId,
        platformMembershipId: context.platformMembershipId,
      };
      throw error;
    }
  }

  /**
   * Assigns a platform role to platform staff.
   */
  async assignPlatformRole(
    adminContext: PlatformAuthorizationContext,
    targetPlatformMembershipId: string,
    roleCodeOrId: string
  ): Promise<void> {
    this.require(adminContext, PLATFORM_PERMISSIONS.PLATFORM_USER_MANAGE);

    await this.platformRoleRepository.assignRoleToStaff(targetPlatformMembershipId, roleCodeOrId, adminContext.userId);

    await this.auditRepository.append({
      tenantId: "platform-control-plane",
      actorId: adminContext.userId,
      actorType: "SUPPORT",
      action: "PLATFORM_ROLE_ASSIGNED",
      resourceType: "platform_membership",
      resourceId: targetPlatformMembershipId,
      requestId: adminContext.requestId,
      metadata: { roleCodeOrId, actorEmail: adminContext.userId },
    });
  }

  /**
   * Removes a platform role from platform staff.
   */
  async removePlatformRole(
    adminContext: PlatformAuthorizationContext,
    targetPlatformMembershipId: string,
    roleCodeOrId: string
  ): Promise<void> {
    this.require(adminContext, PLATFORM_PERMISSIONS.PLATFORM_USER_MANAGE);

    await this.platformRoleRepository.removeRoleFromStaff(targetPlatformMembershipId, roleCodeOrId);

    await this.auditRepository.append({
      tenantId: "platform-control-plane",
      actorId: adminContext.userId,
      actorType: "SUPPORT",
      action: "PLATFORM_ROLE_REMOVED",
      resourceType: "platform_membership",
      resourceId: targetPlatformMembershipId,
      requestId: adminContext.requestId,
      metadata: { roleCodeOrId, actorEmail: adminContext.userId },
    });
  }

  /**
   * List all platform roles.
   */
  async listRoles(context: PlatformAuthorizationContext): Promise<PlatformRole[]> {
    return this.platformRoleRepository.listAll();
  }
}
