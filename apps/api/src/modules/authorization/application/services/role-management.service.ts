// ============================================================================
// CAR HIRE OS — ROLE MANAGEMENT SERVICE (DEV-005 §24-29, SEC-005)
// Handles custom role CRUD, role assignments, audit trails, and outbox events.
// Enforces P0 Invariants: System Role Protection & Last-Owner Invariant.
// ============================================================================

import { ERROR_CODES, TENANT_PERMISSIONS } from "@carhire/constants";
import type { Role, CreateRoleDto, UpdateRoleDto } from "@carhire/types";
import type {
  IRoleRepository,
  ITenantMembershipRoleRepository,
  IAuditRepository,
  IOutboxRepository,
  ITenantMembershipRepository,
} from "@carhire/database";
import type { IAuthorizationCacheService } from "../cache/authorization-cache.service";
import type { TrustedTenantContext } from "../../../tenancy/application/context/tenant-context.interface";

export class RoleManagementService {
  constructor(
    private readonly roleRepository: IRoleRepository,
    private readonly membershipRoleRepository: ITenantMembershipRoleRepository,
    private readonly membershipRepository: ITenantMembershipRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository,
    private readonly cacheService: IAuthorizationCacheService
  ) {}

  /**
   * Creates a new custom tenant role.
   * Invariant: All permissions must be legal TENANT permissions (no platform permissions allowed).
   */
  async createCustomRole(context: TrustedTenantContext, dto: CreateRoleDto): Promise<Role> {
    if (!dto.name || dto.name.trim() === "") {
      const error: any = new Error("Role name is required");
      error.statusCode = 400;
      error.code = "INVALID_INPUT";
      throw error;
    }

    // 1. Validate permissions against canonical Tenant Permission list (Privilege Escalation Prevention)
    const validTenantPerms = new Set(Object.values(TENANT_PERMISSIONS));
    for (const p of dto.permissions || []) {
      if (!validTenantPerms.has(p as any)) {
        const error: any = new Error(
          `Permission '${p}' is invalid or cannot be included in a tenant custom role. Platform permissions cannot be assigned to tenant roles.`
        );
        error.statusCode = 400;
        error.code = ERROR_CODES.INVALID_PERMISSION;
        throw error;
      }
    }

    // 2. Create in repository
    const role = await this.roleRepository.createCustomRole(context.tenantId, {
      name: dto.name.trim(),
      description: dto.description || "",
      permissions: dto.permissions || [],
    });

    // 3. Audit Log (SEC-005)
    await this.auditRepository.append({
      tenantId: context.tenantId,
      actorId: context.userId,
      actorType: "USER",
      action: "ROLE_CREATED",
      resourceType: "role",
      resourceId: role.id,
      requestId: crypto.randomUUID(),
      metadata: {
        roleName: role.name,
        permissionCount: role.permissions.length,
        permissions: role.permissions,
        actorEmail: context.userId,
      },
    });

    // 4. Outbox Event
    const now = new Date().toISOString();
    await this.outboxRepository.create({
      tenantId: context.tenantId,
      eventType: "ROLE_CREATED",
      eventVersion: "v1",
      aggregateType: "Role",
      aggregateId: role.id,
      actorId: context.userId,
      correlationId: crypto.randomUUID(),
      payload: { roleId: role.id, name: role.name, permissions: role.permissions },
      occurredAt: now,
      status: "PENDING",
      availableAt: now,
    });

    return role;
  }

  /**
   * Updates an existing role's name, description, or permissions.
   * Invariant: System roles cannot be modified by tenant users.
   */
  async updateRole(context: TrustedTenantContext, roleId: string, dto: UpdateRoleDto): Promise<Role> {
    const existing = await this.roleRepository.findById(roleId, context.tenantId);
    if (!existing) {
      const error: any = new Error(`Role '${roleId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.ROLE_NOT_FOUND;
      throw error;
    }

    if (existing.isSystem) {
      const error: any = new Error("Protected system roles cannot be modified or customized");
      error.statusCode = 403;
      error.code = ERROR_CODES.ROLE_PROTECTED;
      throw error;
    }

    if (dto.permissions) {
      const validTenantPerms = new Set(Object.values(TENANT_PERMISSIONS));
      for (const p of dto.permissions) {
        if (!validTenantPerms.has(p as any)) {
          const error: any = new Error(`Permission '${p}' is invalid or belongs to platform scope`);
          error.statusCode = 400;
          error.code = ERROR_CODES.INVALID_PERMISSION;
          throw error;
        }
      }
    }

    const updated = await this.roleRepository.updateRole(roleId, context.tenantId, dto);

    // Invalidate Cache for all members in tenant
    await this.cacheService.invalidateTenant(context.tenantId);

    // Audit Log
    await this.auditRepository.append({
      tenantId: context.tenantId,
      actorId: context.userId,
      actorType: "USER",
      action: "ROLE_UPDATED",
      resourceType: "role",
      resourceId: roleId,
      requestId: crypto.randomUUID(),
      metadata: {
        roleName: updated.name,
        permissionCount: updated.permissions.length,
        actorEmail: context.userId,
      },
    });

    // Outbox Event
    const updateNow = new Date().toISOString();
    await this.outboxRepository.create({
      tenantId: context.tenantId,
      eventType: "ROLE_UPDATED",
      eventVersion: "v1",
      aggregateType: "Role",
      aggregateId: roleId,
      actorId: context.userId,
      correlationId: crypto.randomUUID(),
      payload: { roleId, name: updated.name, permissions: updated.permissions },
      occurredAt: updateNow,
      status: "PENDING",
      availableAt: updateNow,
    });

    return updated;
  }

  /**
   * Deletes a custom role.
   * Invariant: System roles cannot be deleted.
   */
  async deleteRole(context: TrustedTenantContext, roleId: string): Promise<boolean> {
    const existing = await this.roleRepository.findById(roleId, context.tenantId);
    if (!existing) {
      const error: any = new Error(`Role '${roleId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.ROLE_NOT_FOUND;
      throw error;
    }

    if (existing.isSystem) {
      const error: any = new Error("Protected system roles cannot be deleted");
      error.statusCode = 403;
      error.code = ERROR_CODES.ROLE_PROTECTED;
      throw error;
    }

    const success = await this.roleRepository.deleteCustomRole(roleId, context.tenantId);
    if (success) {
      await this.cacheService.invalidateTenant(context.tenantId);

      await this.auditRepository.append({
        tenantId: context.tenantId,
        actorId: context.userId,
        actorType: "USER",
        action: "ROLE_DELETED",
        resourceType: "role",
        resourceId: roleId,
        requestId: crypto.randomUUID(),
        metadata: { roleName: existing.name, actorEmail: context.userId },
      });

      const deleteNow = new Date().toISOString();
      await this.outboxRepository.create({
        tenantId: context.tenantId,
        eventType: "ROLE_DELETED",
        eventVersion: "v1",
        aggregateType: "Role",
        aggregateId: roleId,
        actorId: context.userId,
        correlationId: crypto.randomUUID(),
        payload: { roleId, name: existing.name },
        occurredAt: deleteNow,
        status: "PENDING",
        availableAt: deleteNow,
      });
    }

    return success;
  }

  /**
   * Assigns a role to a tenant membership.
   * Invariant: Role must exist within current tenant context; invalidates user cache.
   */
  async assignRoleToMember(
    context: TrustedTenantContext,
    targetMembershipId: string,
    roleId: string
  ): Promise<void> {
    // 1. Verify Target Membership belongs to same tenant
    const membership = await this.membershipRepository.findById(targetMembershipId);
    if (!membership || membership.tenantId !== context.tenantId) {
      const error: any = new Error(`Tenant membership '${targetMembershipId}' not found in this workspace`);
      error.statusCode = 404;
      error.code = ERROR_CODES.ROLE_NOT_ASSIGNABLE;
      throw error;
    }

    // 2. Verify Role is accessible
    const role = await this.roleRepository.findById(roleId, context.tenantId);
    if (!role) {
      const error: any = new Error(`Role '${roleId}' not found or inaccessible in this workspace`);
      error.statusCode = 404;
      error.code = ERROR_CODES.ROLE_NOT_FOUND;
      throw error;
    }

    // 3. Assign Role in DB
    await this.membershipRoleRepository.assignRole(context.tenantId, targetMembershipId, role.id, context.userId);

    // 4. Invalidate Cache immediately (P0: Changes take effect without re-login)
    await this.cacheService.invalidate(context.tenantId, targetMembershipId);

    // 5. Audit Log
    await this.auditRepository.append({
      tenantId: context.tenantId,
      actorId: context.userId,
      actorType: "USER",
      action: "ROLE_ASSIGNED",
      resourceType: "tenant_membership",
      resourceId: targetMembershipId,
      requestId: crypto.randomUUID(),
      metadata: {
        roleId: role.id,
        roleName: role.name,
        targetUserId: membership.userId,
        actorEmail: context.userId,
      },
    });

    // 6. Outbox Event
    const assignNow = new Date().toISOString();
    await this.outboxRepository.create({
      tenantId: context.tenantId,
      eventType: "ROLE_ASSIGNED",
      eventVersion: "v1",
      aggregateType: "TenantMembership",
      aggregateId: targetMembershipId,
      actorId: context.userId,
      correlationId: crypto.randomUUID(),
      payload: { membershipId: targetMembershipId, roleId: role.id, roleName: role.name },
      occurredAt: assignNow,
      status: "PENDING",
      availableAt: assignNow,
    });
  }

  /**
   * Removes a role from a tenant membership.
   * INVARIANT: LAST-OWNER PROTECTION.
   * Every active tenant must retain at least one valid owner-level membership.
   * If this removal would demote/remove the last remaining active owner, REJECT atomically.
   */
  async removeRoleFromMember(
    context: TrustedTenantContext,
    targetMembershipId: string,
    roleId: string
  ): Promise<void> {
    const membership = await this.membershipRepository.findById(targetMembershipId);
    if (!membership || membership.tenantId !== context.tenantId) {
      const error: any = new Error(`Tenant membership '${targetMembershipId}' not found in this workspace`);
      error.statusCode = 404;
      error.code = ERROR_CODES.ROLE_NOT_FOUND;
      throw error;
    }

    const role = await this.roleRepository.findById(roleId, context.tenantId);
    if (!role) {
      const error: any = new Error(`Role '${roleId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.ROLE_NOT_FOUND;
      throw error;
    }

    // P0 INVARIANT: LAST-OWNER PROTECTION CHECK
    if (role.isOwnerRole || role.code === "COMPANY_OWNER") {
      const activeOwnerCount = await this.membershipRoleRepository.countOwnersForTenant(context.tenantId);
      if (activeOwnerCount <= 1) {
        const isTargetAnOwner = await this.membershipRoleRepository.isMembershipOwner(
          context.tenantId,
          targetMembershipId
        );
        if (isTargetAnOwner) {
          const error: any = new Error(
            "Cannot remove owner role: Every active workspace must retain at least one active Company Owner."
          );
          error.statusCode = 400;
          error.code = ERROR_CODES.LAST_OWNER_REQUIRED;
          throw error;
        }
      }
    }

    const removed = await this.membershipRoleRepository.removeRole(context.tenantId, targetMembershipId, role.id);
    if (!removed) {
      return;
    }

    // Invalidate Cache
    await this.cacheService.invalidate(context.tenantId, targetMembershipId);

    // Audit Log
    await this.auditRepository.append({
      tenantId: context.tenantId,
      actorId: context.userId,
      actorType: "USER",
      action: "ROLE_REMOVED",
      resourceType: "tenant_membership",
      resourceId: targetMembershipId,
      requestId: crypto.randomUUID(),
      metadata: {
        roleId: role.id,
        roleName: role.name,
        targetUserId: membership.userId,
        actorEmail: context.userId,
      },
    });

    // Outbox Event
    const removeNow = new Date().toISOString();
    await this.outboxRepository.create({
      tenantId: context.tenantId,
      eventType: "ROLE_REMOVED",
      eventVersion: "v1",
      aggregateType: "TenantMembership",
      aggregateId: targetMembershipId,
      actorId: context.userId,
      correlationId: crypto.randomUUID(),
      payload: { membershipId: targetMembershipId, roleId: role.id, roleName: role.name },
      occurredAt: removeNow,
      status: "PENDING",
      availableAt: removeNow,
    });
  }

  /**
   * List all roles applicable to the current workspace (System Roles + Custom Roles).
   */
  async listRoles(context: TrustedTenantContext): Promise<Role[]> {
    return this.roleRepository.listForTenant(context.tenantId);
  }

  /**
   * Get details for a single role.
   */
  async getRole(context: TrustedTenantContext, roleId: string): Promise<Role> {
    const role = await this.roleRepository.findById(roleId, context.tenantId);
    if (!role) {
      const error: any = new Error(`Role '${roleId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.ROLE_NOT_FOUND;
      throw error;
    }
    return role;
  }
}
