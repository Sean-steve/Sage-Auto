import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — TENANT MEMBERSHIP ROLE REPOSITORY (DEV-005, SEC-005)
// Tracks M:N relationships between TenantMemberships and Roles.
// Provides transaction-safe queries for Last-Owner policy verification.
// ============================================================================

import type { TenantMembershipRole, Role } from "@carhire/types";
import { InternalDatabaseError } from "../errors";
import type { IRoleRepository } from "./role.repository";

export interface ITenantMembershipRoleRepository {
  assignRole(tenantId: string, membershipId: string, roleId: string, assignedBy?: string): Promise<TenantMembershipRole>;
  removeRole(tenantId: string, membershipId: string, roleId: string): Promise<boolean>;
  getRolesForMembership(tenantId: string, membershipId: string): Promise<Role[]>;
  getMembershipRoles(tenantId: string, membershipId: string): Promise<TenantMembershipRole[]>;
  countOwnersForTenant(tenantId: string): Promise<number>;
  hasRole(tenantId: string, membershipId: string, roleCodeOrId: string): Promise<boolean>;
  isMembershipOwner(tenantId: string, membershipId: string): Promise<boolean>;
  removeAllRolesForMembership(tenantId: string, membershipId: string): Promise<void>;
}

export class InMemoryTenantMembershipRoleRepository implements ITenantMembershipRoleRepository {
  private assignments: Map<string, TenantMembershipRole> = createRecordStore("tenant-membership-role.repository:assignments");

  constructor(private readonly roleRepository: IRoleRepository) {}

  private makeKey(membershipId: string, roleId: string): string {
    return `${membershipId}::${roleId}`;
  }

  async assignRole(
    tenantId: string,
    membershipId: string,
    roleId: string,
    assignedBy?: string
  ): Promise<TenantMembershipRole> {
    if (!tenantId || !membershipId || !roleId) {
      throw new InternalDatabaseError("tenantId, membershipId, and roleId are all required");
    }

    // Verify role exists and is accessible within tenant
    const role = await this.roleRepository.findById(roleId, tenantId);
    if (!role) {
      throw new InternalDatabaseError(`Role '${roleId}' not found or inaccessible for this workspace`);
    }

    const key = this.makeKey(membershipId, roleId);
    if (this.assignments.has(key)) {
      return this.assignments.get(key)!;
    }

    const record: TenantMembershipRole = {
      id: `tmr-${crypto.randomUUID()}`,
      tenantId,
      membershipId,
      roleId: role.id,
      assignedBy,
      assignedAt: new Date().toISOString(),
    };

    this.assignments.set(key, record);
    return record;
  }

  async removeRole(tenantId: string, membershipId: string, roleId: string): Promise<boolean> {
    const key = this.makeKey(membershipId, roleId);
    const existing = this.assignments.get(key);
    if (!existing) {
      // Try resolving by matching role ID
      for (const [k, v] of this.assignments.entries()) {
        if (v.membershipId === membershipId && (v.roleId === roleId || k.endsWith(`::${roleId}`))) {
          this.assignments.delete(k);
          return true;
        }
      }
      return false;
    }

    if (existing.tenantId !== tenantId) {
      throw new InternalDatabaseError("Cross-tenant role assignment removal prohibited");
    }

    return this.assignments.delete(key);
  }

  async getMembershipRoles(tenantId: string, membershipId: string): Promise<TenantMembershipRole[]> {
    const result: TenantMembershipRole[] = [];
    for (const assignment of this.assignments.values()) {
      if (assignment.membershipId === membershipId && assignment.tenantId === tenantId) {
        result.push({ ...assignment });
      }
    }
    return result;
  }

  async getRolesForMembership(tenantId: string, membershipId: string): Promise<Role[]> {
    const roles: Role[] = [];
    for (const assignment of this.assignments.values()) {
      if (assignment.membershipId === membershipId && assignment.tenantId === tenantId) {
        const role = await this.roleRepository.findById(assignment.roleId, tenantId);
        if (role && role.status === "ACTIVE") {
          roles.push(role);
        }
      }
    }
    return roles;
  }

  async countOwnersForTenant(tenantId: string): Promise<number> {
    const ownerMemberships = new Set<string>();

    for (const assignment of this.assignments.values()) {
      if (assignment.tenantId === tenantId) {
        const role = await this.roleRepository.findById(assignment.roleId, tenantId);
        if (role && (role.isOwnerRole || role.code === "COMPANY_OWNER")) {
          ownerMemberships.add(assignment.membershipId);
        }
      }
    }

    return ownerMemberships.size;
  }

  async hasRole(tenantId: string, membershipId: string, roleCodeOrId: string): Promise<boolean> {
    const roles = await this.getRolesForMembership(tenantId, membershipId);
    return roles.some((r) => r.id === roleCodeOrId || r.code === roleCodeOrId);
  }

  async isMembershipOwner(tenantId: string, membershipId: string): Promise<boolean> {
    const roles = await this.getRolesForMembership(tenantId, membershipId);
    return roles.some((r) => r.isOwnerRole || r.code === "COMPANY_OWNER");
  }

  async removeAllRolesForMembership(tenantId: string, membershipId: string): Promise<void> {
    for (const [k, v] of this.assignments.entries()) {
      if (v.membershipId === membershipId && v.tenantId === tenantId) {
        this.assignments.delete(k);
      }
    }
  }
}
