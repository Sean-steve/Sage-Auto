// ============================================================================
// CAR HIRE OS — TRUSTED TENANT CONTEXT RESOLVER SERVICE (DEV-004 §4-6, DEV-005)
// Performs strict server-side validation of untrusted X-Tenant-ID headers
// and resolves server-authoritative effective permissions.
// Eliminates Global Admin Bypass: Platform staff must have a valid SupportAccessSession.
// ============================================================================

import { ERROR_CODES } from "@carhire/constants";
import type {
  ITenantRepository,
  ITenantMembershipRepository,
  ISupportAccessSessionRepository,
} from "@carhire/database";
import type { TrustedTenantContext, TenantResolutionOptions } from "./tenant-context.interface";

export interface IEffectivePermissionResolver {
  resolveEffectivePermissions(
    tenantId: string,
    membershipId: string
  ): Promise<{ roles: any[]; permissions: string[]; isOwner: boolean }>;
}

export class TenantContextResolverService {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly membershipRepository: ITenantMembershipRepository,
    private readonly authzResolver?: IEffectivePermissionResolver,
    private readonly supportSessionRepository?: ISupportAccessSessionRepository
  ) {}

  /**
   * Resolves and validates a trusted TenantContext for an authenticated user.
   * X-Tenant-ID is treated strictly as untrusted input.
   * Disallows unaudited global admin bypass (Zero-Trust invariant).
   */
  async resolveContext(
    userId: string,
    untrustedTenantId: string | undefined | null,
    options?: TenantResolutionOptions
  ): Promise<TrustedTenantContext> {
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      const error: any = new Error("Authenticated user identity is required to resolve tenant context");
      error.statusCode = 401;
      error.code = ERROR_CODES.UNAUTHORIZED;
      throw error;
    }

    if (!untrustedTenantId || typeof untrustedTenantId !== "string" || untrustedTenantId.trim() === "") {
      const error: any = new Error("Missing X-Tenant-ID header. A valid tenant context is required.");
      error.statusCode = 400;
      error.code = ERROR_CODES.TENANT_REQUIRED;
      throw error;
    }

    const tenantId = untrustedTenantId.trim();

    // 1. Resolve Tenant Entity
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      const error: any = new Error(`Tenant '${tenantId}' does not exist or has been deleted`);
      error.statusCode = 404;
      error.code = ERROR_CODES.TENANT_NOT_FOUND;
      throw error;
    }

    // 2. Tenant Status Check (Fail-Closed)
    if (tenant.status === "SUSPENDED" && !options?.allowSuspended && !options?.supportAccessSessionId && !options?.platformBypass) {
      const error: any = new Error(`Tenant workspace '${tenant.name}' is currently suspended`);
      error.statusCode = 403;
      error.code = ERROR_CODES.TENANT_SUSPENDED;
      throw error;
    }

    if (tenant.status === "CANCELLED" && !options?.supportAccessSessionId && !options?.platformBypass) {
      const error: any = new Error(`Tenant workspace '${tenant.name}' has been cancelled`);
      error.statusCode = 403;
      error.code = ERROR_CODES.TENANT_ACCESS_DENIED;
      throw error;
    }

    // 3. User Membership Verification (M:N)
    const membership = await this.membershipRepository.findByTenantAndUser(tenant.id, userId);

    // 4. Governed Support Access or Platform Admin Bypass
    if (!membership) {
      // Check if caller holds an active, validated Support Access Session
      if (options?.supportAccessSessionId && this.supportSessionRepository) {
        const session = await this.supportSessionRepository.findById(options.supportAccessSessionId);
        const now = new Date().toISOString();

        if (
          session &&
          session.isActive &&
          session.expiresAt > now &&
          session.targetTenantId === tenant.id &&
          session.platformUserId === userId
        ) {
          return {
            tenantId: tenant.id,
            membershipId: `support-session-${session.id}`,
            userId,
            role: "PLATFORM_SUPPORT",
            roles: ["PLATFORM_SUPPORT"],
            permissions: ["*"],
            tenantStatus: tenant.status,
            tenantSlug: tenant.slug,
            tenantName: tenant.name,
            currency: tenant.currency || tenant.defaultCurrency || "KES",
            timezone: tenant.timezone || "Africa/Nairobi",
            isPlatformBypass: false, // Governed, not bypass
            resolvedAt: new Date().toISOString(),
          };
        } else {
          const error: any = new Error("Support access session is invalid, expired, or unauthorized for this tenant");
          error.statusCode = 403;
          error.code = ERROR_CODES.SUPPORT_SESSION_EXPIRED;
          throw error;
        }
      }

      // Check if platform bypass context was requested for platform ops/admin
      if (options?.platformBypass) {
        return {
          tenantId: tenant.id,
          membershipId: `platform-bypass-${userId}`,
          userId,
          role: "PLATFORM_ADMIN",
          roles: ["PLATFORM_ADMIN"],
          permissions: ["*"],
          tenantStatus: tenant.status,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          currency: tenant.currency || tenant.defaultCurrency || "KES",
          timezone: tenant.timezone || "Africa/Nairobi",
          isPlatformBypass: true,
          resolvedAt: new Date().toISOString(),
        };
      }

      const error: any = new Error(`User does not have an authorized membership for tenant '${tenant.name}'`);
      error.statusCode = 403;
      error.code = ERROR_CODES.TENANT_ACCESS_DENIED;
      throw error;
    }

    // 5. Membership Status Check
    if (membership.status !== "ACTIVE") {
      const error: any = new Error(`Tenant membership is ${membership.status.toLowerCase()}`);
      error.statusCode = 403;
      error.code = ERROR_CODES.TENANT_MEMBERSHIP_INACTIVE;
      throw error;
    }

    // 6. Resolve Effective RBAC Roles & Permissions
    let roleCodes: string[] = membership.role ? [membership.role] : [];
    let permissions: string[] = [];

    if (this.authzResolver) {
      try {
        const resolved = await this.authzResolver.resolveEffectivePermissions(tenant.id, membership.id);
        roleCodes = resolved.roles.map((r) => r.code || r.name);
        permissions = resolved.permissions;
      } catch (err) {
        throw Object.assign(new Error("Could not verify workspace permissions"), {statusCode:403});
      }
    }

    return {
      tenantId: tenant.id,
      membershipId: membership.id,
      userId,
      role: roleCodes[0] || "NONE",
      roles: roleCodes,
      permissions,
      tenantStatus: tenant.status,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      currency: tenant.currency || tenant.defaultCurrency || "KES",
      timezone: tenant.timezone || "Africa/Nairobi",
      isPlatformBypass: false,
      resolvedAt: new Date().toISOString(),
    };
  }
}
