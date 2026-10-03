import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PLATFORM MEMBERSHIP REPOSITORY (Sprint 37: SEC-005, SEC-007)
// Dedicated global control-plane staff identity & membership persistence.
// Decoupled from tenant-scoped memberships.
// ============================================================================

import type { PlatformMembership } from "@carhire/types";
import { PLATFORM_ROLES } from "@carhire/constants";
import { RecordNotFoundError } from "../errors";

export interface IPlatformMembershipRepository {
  create(membership: Omit<PlatformMembership, "id"> & { id?: string }): Promise<PlatformMembership>;
  findById(id: string): Promise<PlatformMembership | null>;
  findByUserId(userId: string): Promise<PlatformMembership | null>;
  listAll(): Promise<PlatformMembership[]>;
  update(id: string, updates: Partial<PlatformMembership>): Promise<PlatformMembership>;
  delete(id: string): Promise<boolean>;
  seedDefaultStaff(): Promise<void>;
}

export class InMemoryPlatformMembershipRepository implements IPlatformMembershipRepository {
  private memberships: Map<string, PlatformMembership> = createRecordStore("platform-membership.repository:memberships");
  private initialized = false;

  constructor() {
    this.ensureSeeded();
  }

  private ensureSeeded(): void {
    if (this.initialized) return;
    this.initialized = true;
  }

  private seedDefaultStaffSync(): void {
    const defaultStaff: PlatformMembership[] = [
      {
        id: "plt-mem-owner-1",
        userId: "usr-platform-owner",
        email: "superadmin@carhireos.platform",
        name: "CarHire Global Owner",
        role: "PLATFORM_OWNER",
        status: "ACTIVE",
        permissions: PLATFORM_ROLES.PLATFORM_OWNER?.defaultPermissions || [],
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
      {
        id: "plt-mem-support-1",
        userId: "usr-support-specialist",
        email: "support@carhireos.platform",
        name: "L3 Technical Support Specialist",
        role: "SUPPORT_ADMIN",
        status: "ACTIVE",
        permissions: PLATFORM_ROLES.SUPPORT_ADMIN?.defaultPermissions || [],
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
      {
        id: "plt-mem-billing-1",
        userId: "usr-billing-admin",
        email: "finance@carhireos.platform",
        name: "SaaS Billing Operations",
        role: "BILLING_ADMIN",
        status: "ACTIVE",
        permissions: PLATFORM_ROLES.BILLING_ADMIN?.defaultPermissions || [],
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
      {
        id: "plt-mem-compliance-1",
        userId: "usr-compliance-officer",
        email: "compliance@carhireos.platform",
        name: "Regulatory & Compliance Officer",
        role: "COMPLIANCE_ADMIN",
        status: "ACTIVE",
        permissions: PLATFORM_ROLES.COMPLIANCE_ADMIN?.defaultPermissions || [],
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
    ];

    for (const staff of defaultStaff) {
      if (!this.memberships.has(staff.id)) {
        this.memberships.set(staff.id, staff);
      }
    }
  }

  async seedDefaultStaff(): Promise<void> {
    this.seedDefaultStaffSync();
  }

  async create(membership: Omit<PlatformMembership, "id"> & { id?: string }): Promise<PlatformMembership> {
    this.ensureSeeded();
    const id = membership.id || `plt-mem-${crypto.randomUUID()}`;
    const roleDef = PLATFORM_ROLES[membership.role];
    const permissions = membership.permissions && membership.permissions.length > 0
      ? membership.permissions
      : (roleDef?.defaultPermissions || []);

    const record: PlatformMembership = {
      ...membership,
      id,
      permissions,
      status: membership.status || "ACTIVE",
      createdAt: membership.createdAt || new Date().toISOString(),
      updatedAt: membership.updatedAt || new Date().toISOString(),
    };

    this.memberships.set(id, record);
    return { ...record, permissions: [...record.permissions] };
  }

  async findById(id: string): Promise<PlatformMembership | null> {
    this.ensureSeeded();
    const m = this.memberships.get(id);
    return m ? { ...m, permissions: [...m.permissions] } : null;
  }

  async findByUserId(userId: string): Promise<PlatformMembership | null> {
    this.ensureSeeded();
    for (const m of this.memberships.values()) {
      if (m.userId === userId) {
        return { ...m, permissions: [...m.permissions] };
      }
    }
    return null;
  }

  async listAll(): Promise<PlatformMembership[]> {
    this.ensureSeeded();
    return Array.from(this.memberships.values()).map((m) => ({
      ...m,
      permissions: [...m.permissions],
    }));
  }

  async update(id: string, updates: Partial<PlatformMembership>): Promise<PlatformMembership> {
    this.ensureSeeded();
    const existing = this.memberships.get(id);
    if (!existing) {
      throw new RecordNotFoundError("PlatformMembership", id);
    }

    let permissions = existing.permissions;
    if (updates.role && updates.role !== existing.role && !updates.permissions) {
      const roleDef = PLATFORM_ROLES[updates.role];
      if (roleDef) permissions = [...roleDef.defaultPermissions];
    } else if (updates.permissions) {
      permissions = [...updates.permissions];
    }

    const updated: PlatformMembership = {
      ...existing,
      ...updates,
      id,
      permissions,
      updatedAt: new Date().toISOString(),
    };

    this.memberships.set(id, updated);
    return { ...updated, permissions: [...updated.permissions] };
  }

  async delete(id: string): Promise<boolean> {
    this.ensureSeeded();
    return this.memberships.delete(id);
  }
}
