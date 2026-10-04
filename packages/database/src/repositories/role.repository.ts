import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — ROLE & PERMISSION REPOSITORY (DEV-005, SEC-005, ADR-009)
// Manages system roles, custom tenant roles, and role-permission mappings.
// Enforces tenant isolation: Tenant A cannot view or manipulate Tenant B's roles.
// ============================================================================

import type { Role } from "@carhire/types";
import { TENANT_SYSTEM_ROLES } from "@carhire/constants";
import { InternalDatabaseError } from "../errors";

export interface IRoleRepository {
  seedSystemRoles(): Promise<void>;
  findById(id: string, tenantId?: string): Promise<Role | null>;
  findByCode(code: string): Promise<Role | null>;
  findByNameInTenant(tenantId: string, name: string): Promise<Role | null>;
  listForTenant(tenantId: string): Promise<Role[]>;
  createCustomRole(tenantId: string, data: { name: string; description: string; permissions: string[] }): Promise<Role>;
  updateRole(
    id: string,
    tenantId: string,
    data: { name?: string; description?: string; permissions?: string[]; status?: "ACTIVE" | "DISABLED" }
  ): Promise<Role>;
  deleteCustomRole(id: string, tenantId: string): Promise<boolean>;
  getPermissionsForRole(roleId: string): Promise<string[]>;
}

export class InMemoryRoleRepository implements IRoleRepository {
  private roles: Map<string, Role> = createRecordStore("role.repository:roles");
  private initialized = false;

  constructor() {
    this.ensureSeeded();
  }

  private ensureSeeded(): void {
    if (this.initialized) return;
    this.seedSystemRolesSync();
    this.initialized = true;
  }

  private seedSystemRolesSync(): void {
    for (const [code, def] of Object.entries(TENANT_SYSTEM_ROLES)) {
      const roleId = `sys-role-${code.toLowerCase()}`;
      const existing = this.roles.get(roleId);
      if (!existing) {
        this.roles.set(roleId, {
          id: roleId,
          code: def.code,
          name: def.name,
          description: def.description,
          isSystem: true,
          isOwnerRole: Boolean(def.isOwnerRole),
          status: "ACTIVE",
          permissions: [...def.defaultPermissions],
          createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        });
      } else if (existing.isSystem) {
        this.roles.set(roleId, {
          ...existing,
          code: def.code,
          name: def.name,
          description: def.description,
          isOwnerRole: Boolean(def.isOwnerRole),
          status: "ACTIVE",
          permissions: [...def.defaultPermissions],
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  async seedSystemRoles(): Promise<void> {
    this.seedSystemRolesSync();
  }

  async findById(id: string, tenantId?: string): Promise<Role | null> {
    this.ensureSeeded();
    const role = this.roles.get(id);
    if (!role) return null;

    // System roles are globally accessible to any tenant context
    if (role.isSystem) return { ...role, permissions: [...role.permissions] };

    // Custom roles MUST match the requested tenantId (Strict Tenant Isolation)
    if (tenantId && role.tenantId !== tenantId) {
      return null;
    }

    return { ...role, permissions: [...role.permissions] };
  }

  async findByCode(code: string): Promise<Role | null> {
    this.ensureSeeded();
    for (const role of this.roles.values()) {
      if (role.code === code) {
        return { ...role, permissions: [...role.permissions] };
      }
    }
    return null;
  }

  async findByNameInTenant(tenantId: string, name: string): Promise<Role | null> {
    this.ensureSeeded();
    const normalized = name.trim().toLowerCase();
    for (const role of this.roles.values()) {
      if (role.tenantId === tenantId && role.name.trim().toLowerCase() === normalized) {
        return { ...role, permissions: [...role.permissions] };
      }
    }
    return null;
  }

  async listForTenant(tenantId: string): Promise<Role[]> {
    this.ensureSeeded();
    const result: Role[] = [];
    for (const role of this.roles.values()) {
      if (role.isSystem || (role.tenantId === tenantId && role.status === "ACTIVE")) {
        result.push({ ...role, permissions: [...role.permissions] });
      }
    }
    return result;
  }

  async createCustomRole(
    tenantId: string,
    data: { name: string; description: string; permissions: string[] }
  ): Promise<Role> {
    this.ensureSeeded();
    if (!tenantId || tenantId.trim() === "") {
      throw new InternalDatabaseError("Tenant context is required to create a custom role");
    }

    const trimmedName = data.name.trim();
    if (!trimmedName) {
      throw new InternalDatabaseError("Role name cannot be empty");
    }

    // Enforce UNIQUE(tenant_id, normalized_name)
    const existing = await this.findByNameInTenant(tenantId, trimmedName);
    if (existing) {
      throw new InternalDatabaseError(
        `Role with name '${trimmedName}' already exists in this workspace`
      );
    }

    const id = `custom-role-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newRole: Role = {
      id,
      tenantId,
      code: `CUSTOM_${trimmedName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
      name: trimmedName,
      description: data.description?.trim() || "",
      isSystem: false,
      isOwnerRole: false,
      status: "ACTIVE",
      permissions: [...new Set(data.permissions || [])],
      createdAt: now,
      updatedAt: now,
    };

    this.roles.set(id, newRole);
    return { ...newRole, permissions: [...newRole.permissions] };
  }

  async updateRole(
    id: string,
    tenantId: string,
    data: { name?: string; description?: string; permissions?: string[]; status?: "ACTIVE" | "DISABLED" }
  ): Promise<Role> {
    this.ensureSeeded();
    const role = this.roles.get(id);
    if (!role) {
      throw new InternalDatabaseError(`Role '${id}' not found`);
    }

    // System roles are immutable by standard tenant operations
    if (role.isSystem) {
      throw new InternalDatabaseError("Protected system roles cannot be modified");
    }

    // Tenant Isolation Check
    if (role.tenantId !== tenantId) {
      throw new InternalDatabaseError("Cross-tenant role modification prohibited");
    }

    if (data.name && data.name.trim() !== role.name) {
      const trimmedName = data.name.trim();
      const existing = await this.findByNameInTenant(tenantId, trimmedName);
      if (existing && existing.id !== id) {
        throw new InternalDatabaseError(`Role with name '${trimmedName}' already exists`);
      }
      role.name = trimmedName;
    }

    if (data.description !== undefined) {
      role.description = data.description.trim();
    }

    if (data.permissions !== undefined) {
      role.permissions = [...new Set(data.permissions)];
    }

    if (data.status) {
      role.status = data.status;
    }

    role.updatedAt = new Date().toISOString();
    this.roles.set(id, role);
    return { ...role, permissions: [...role.permissions] };
  }

  async deleteCustomRole(id: string, tenantId: string): Promise<boolean> {
    this.ensureSeeded();
    const role = this.roles.get(id);
    if (!role) return false;

    if (role.isSystem) {
      throw new InternalDatabaseError("Protected system roles cannot be deleted");
    }

    if (role.tenantId !== tenantId) {
      throw new InternalDatabaseError("Cross-tenant role deletion prohibited");
    }

    return this.roles.delete(id);
  }

  async getPermissionsForRole(roleId: string): Promise<string[]> {
    this.ensureSeeded();
    const role = this.roles.get(roleId);
    return role ? [...role.permissions] : [];
  }
}
