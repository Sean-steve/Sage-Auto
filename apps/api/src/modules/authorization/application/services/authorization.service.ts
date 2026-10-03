// ============================================================================
// CAR HIRE OS — CENTRAL AUTHORIZATION SERVICE (DEV-005 §13-14, SEC-005)
// Evaluates server-authoritative effective permissions and resource policies.
// Invariant: Permissions are authoritative; No hardcoded 'if (user.role === "ADMIN")'.
// ============================================================================

import { ERROR_CODES } from "@carhire/constants";
import type { Role, EffectiveAuthorization } from "@carhire/types";
import type { IRoleRepository } from "@carhire/database";
import type { ITenantMembershipRoleRepository } from "@carhire/database";
import type { IAuthorizationCacheService } from "../cache/authorization-cache.service";
import type { ResourcePolicy } from "../../domain/policies/resource-policy.interface";
import type { TrustedTenantContext } from "../../../tenancy/application/context/tenant-context.interface";

export class AuthorizationService {
  constructor(
    private readonly roleRepository: IRoleRepository,
    private readonly membershipRoleRepository: ITenantMembershipRoleRepository,
    private readonly cacheService: IAuthorizationCacheService
  ) {}

  /**
   * Resolves effective permissions for a tenant membership.
   * Leverages cache with automatic fallback to authoritative database.
   */
  async resolveEffectivePermissions(
    tenantId: string,
    membershipId: string
  ): Promise<{ roles: Role[]; permissions: string[]; isOwner: boolean }> {
    // Resolve live grants so revocations apply across API processes immediately.
    // 2. Database Authority Resolution
    const roles = await this.membershipRoleRepository.getRolesForMembership(tenantId, membershipId);

    const permissionSet = new Set<string>();
    let isOwner = false;

    for (const role of roles) {
      if (role.status !== "ACTIVE") continue;

      if (role.isOwnerRole || role.code === "COMPANY_OWNER") {
        isOwner = true;
      }

      for (const p of role.permissions) {
        permissionSet.add(p);
      }
    }

    const permissions = Array.from(permissionSet);

    return { roles, permissions, isOwner };
  }

  /**
   * Evaluates if the current context possesses the requested permission.
   * Optionally checks a resource policy (ABAC) if a resource is supplied.
   */
  async can<TResource = any>(
    context: TrustedTenantContext,
    requiredPermission: string,
    resource?: TResource,
    policy?: ResourcePolicy<TrustedTenantContext, TResource>
  ): Promise<boolean> {
    if (!context || !context.tenantId) return false;

    // Platform Superadmin / Bypass (Audited Support Only)
    if (context.isPlatformBypass && context.permissions.includes("*")) {
      return true;
    }

    // 1. RBAC Evaluation
    const hasRbacPermission =
      context.permissions.includes(requiredPermission) ||
      context.permissions.includes("*");

    // If resource is provided with a policy, evaluate ABAC
    if (resource && policy) {
      // If resource belongs to another tenant -> STRICT FAIL (Tenant Isolation Invariant)
      if ((resource as any).tenantId && (resource as any).tenantId !== context.tenantId) {
        return false;
      }

      // Check policy method depending on permission action
      if (requiredPermission.endsWith(".read")) {
        return Boolean(await policy.canRead(context, resource));
      }
      if (requiredPermission.endsWith(".update") || requiredPermission.endsWith(".modify")) {
        return hasRbacPermission && Boolean(await policy.canUpdate(context, resource));
      }
      if (requiredPermission.endsWith(".delete") || requiredPermission.endsWith(".cancel")) {
        return hasRbacPermission && Boolean(await policy.canDelete(context, resource));
      }
    }

    return hasRbacPermission;
  }

  /**
   * Enforces that the current context has the requested permission.
   * Throws HTTP 403 / Domain error if unauthorized.
   */
  async require<TResource = any>(
    context: TrustedTenantContext,
    requiredPermission: string,
    resource?: TResource,
    policy?: ResourcePolicy<TrustedTenantContext, TResource>
  ): Promise<void> {
    const isAllowed = await this.can(context, requiredPermission, resource, policy);
    if (!isAllowed) {
      const error: any = new Error(
        `Permission denied. Required permission: '${requiredPermission}' for action on workspace '${context.tenantName}'`
      );
      error.statusCode = 403;
      error.code = resource ? ERROR_CODES.RESOURCE_ACCESS_DENIED : ERROR_CODES.PERMISSION_DENIED;
      error.details = {
        requiredPermission,
        tenantId: context.tenantId,
        membershipId: context.membershipId,
      };
      throw error;
    }
  }

  /**
   * Compiles the effective authorization payload for UI bootstrap /me endpoint.
   */
  async getEffectiveAuthorization(
    tenantId: string,
    membershipId: string,
    userId: string,
    isPlatformStaff = false
  ): Promise<EffectiveAuthorization> {
    const { roles, permissions, isOwner } = await this.resolveEffectivePermissions(tenantId, membershipId);

    return {
      userId,
      tenantId,
      membershipId,
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        isSystem: r.isSystem,
        isOwnerRole: r.isOwnerRole,
      })),
      permissions,
      isOwner,
      isPlatformStaff,
    };
  }
}
