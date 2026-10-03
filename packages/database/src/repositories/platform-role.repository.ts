import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PLATFORM ROLE REPOSITORY (DEV-005 §9, SEC-005)
// Dedicated global control-plane authorization persistence.
// Strictly decoupled from tenant-scoped tables and RLS boundaries.
// ============================================================================

import type { PlatformRole, PlatformMembershipRole } from "@carhire/types";
import { PLATFORM_ROLES } from "@carhire/constants";
import { InternalDatabaseError } from "../errors";

export interface IPlatformRoleRepository {
  seedPlatformRoles(): Promise<void>;
  findById(id: string): Promise<PlatformRole | null>;
  findByCode(code: string): Promise<PlatformRole | null>;
  listAll(): Promise<PlatformRole[]>;
  assignRoleToStaff(platformMembershipId: string, roleCodeOrId: string, assignedBy?: string): Promise<PlatformMembershipRole>;
  removeRoleFromStaff(platformMembershipId: string, roleCodeOrId: string): Promise<boolean>;
  getRolesForStaff(platformMembershipId: string): Promise<PlatformRole[]>;
  getPermissionsForStaff(platformMembershipId: string): Promise<string[]>;
}

export class InMemoryPlatformRoleRepository implements IPlatformRoleRepository {
  private roles: Map<string, PlatformRole> = createRecordStore("platform-role.repository:roles");
  private staffAssignments: Map<string, PlatformMembershipRole> = createRecordStore("platform-role.repository:staffAssignments");
  private initialized = false;

  constructor() {
    this.ensureSeeded();
  }

  private ensureSeeded(): void {
    if (this.initialized) return;
    this.seedPlatformRolesSync();
    this.initialized = true;
  }

  private seedPlatformRolesSync(): void {
    for (const [code, def] of Object.entries(PLATFORM_ROLES)) {
      const id = `plt-role-${code.toLowerCase()}`;
      if (!this.roles.has(id)) {
        this.roles.set(id, {
          id,
          code: def.code,
          name: def.name,
          description: def.description,
          isSystem: true,
          permissions: [...def.defaultPermissions],
          createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        });
      }
    }
  }

  async seedPlatformRoles(): Promise<void> {
    this.seedPlatformRolesSync();
  }

  async findById(id: string): Promise<PlatformRole | null> {
    this.ensureSeeded();
    const role = this.roles.get(id);
    return role ? { ...role, permissions: [...role.permissions] } : null;
  }

  async findByCode(code: string): Promise<PlatformRole | null> {
    this.ensureSeeded();
    for (const role of this.roles.values()) {
      if (role.code === code) {
        return { ...role, permissions: [...role.permissions] };
      }
    }
    return null;
  }

  async listAll(): Promise<PlatformRole[]> {
    this.ensureSeeded();
    return Array.from(this.roles.values()).map((r) => ({ ...r, permissions: [...r.permissions] }));
  }

  async assignRoleToStaff(
    platformMembershipId: string,
    roleCodeOrId: string,
    assignedBy?: string
  ): Promise<PlatformMembershipRole> {
    this.ensureSeeded();
    const role = (await this.findById(roleCodeOrId)) || (await this.findByCode(roleCodeOrId));
    if (!role) {
      throw new InternalDatabaseError(`Platform role '${roleCodeOrId}' does not exist`);
    }

    const key = `${platformMembershipId}::${role.id}`;
    if (this.staffAssignments.has(key)) {
      return this.staffAssignments.get(key)!;
    }

    const record: PlatformMembershipRole = {
      id: `pmr-${crypto.randomUUID()}`,
      platformMembershipId,
      platformRoleId: role.id,
      assignedBy,
      assignedAt: new Date().toISOString(),
    };

    this.staffAssignments.set(key, record);
    return record;
  }

  async removeRoleFromStaff(platformMembershipId: string, roleCodeOrId: string): Promise<boolean> {
    this.ensureSeeded();
    const role = (await this.findById(roleCodeOrId)) || (await this.findByCode(roleCodeOrId));
    const roleId = role ? role.id : roleCodeOrId;
    const key = `${platformMembershipId}::${roleId}`;
    return this.staffAssignments.delete(key);
  }

  async getRolesForStaff(platformMembershipId: string): Promise<PlatformRole[]> {
    this.ensureSeeded();
    const roles: PlatformRole[] = [];
    for (const assignment of this.staffAssignments.values()) {
      if (assignment.platformMembershipId === platformMembershipId) {
        const r = this.roles.get(assignment.platformRoleId);
        if (r) roles.push({ ...r, permissions: [...r.permissions] });
      }
    }
    return roles;
  }

  async getPermissionsForStaff(platformMembershipId: string): Promise<string[]> {
    const roles = await this.getRolesForStaff(platformMembershipId);
    const permissions = new Set<string>();
    for (const r of roles) {
      for (const p of r.permissions) {
        permissions.add(p);
      }
    }
    return Array.from(permissions);
  }
}
