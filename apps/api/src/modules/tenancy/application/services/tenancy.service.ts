// ============================================================================
// CAR HIRE OS — TENANCY APPLICATION SERVICE (DEV-004, DEV-007, DOM-003 §4-6)
// ============================================================================

import { ERROR_CODES } from "@carhire/constants";
import type {
  Tenant,
  TenantSetting,
  TenantMembership,
  UserTenantMembershipDto,
  UpdateTenantSettingsDto,
  TenantStatus,
  MembershipStatus,
} from "@carhire/types";
import type {
  ITenantRepository,
  ITenantSettingsRepository,
  ITenantMembershipRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";

export class TenancyService {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly settingsRepository: ITenantSettingsRepository,
    private readonly membershipRepository: ITenantMembershipRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  /**
   * Retrieves all active tenant memberships for an authenticated user.
   */
  async listUserTenants(userId: string): Promise<UserTenantMembershipDto[]> {
    if (!userId) {
      throw new Error("User ID is required to list tenant memberships");
    }

    const memberships = await this.membershipRepository.listByUserId(userId);
    const results: UserTenantMembershipDto[] = [];

    for (const m of memberships) {
      if (m.status === "REVOKED" || m.status === "REMOVED") {
        continue;
      }

      const tenant = await this.tenantRepository.findById(m.tenantId);
      if (tenant && !tenant.deletedAt) {
        results.push({
          membershipId: m.id,
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
          role: m.role || "TENANT_OPERATOR",
          status: m.status,
          joinedAt: m.joinedAt,
        });
      }
    }

    return results;
  }

  /**
   * Retrieves tenant information and settings for an authorized tenant context.
   */
  async getTenantDetails(tenantId: string): Promise<{ tenant: Tenant; settings: TenantSetting | null }> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      const error: any = new Error(`Tenant '${tenantId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.TENANT_NOT_FOUND;
      throw error;
    }

    const settings = await this.settingsRepository.findByTenantId(tenantId);
    return { tenant, settings };
  }

  /**
   * Updates tenant settings within an authorized tenant context.
   */
  async updateTenantSettings(
    tenantId: string,
    actorUserId: string,
    updates: UpdateTenantSettingsDto,
    requestId?: string
  ): Promise<TenantSetting> {
    const before = await this.settingsRepository.findByTenantId(tenantId);
    const updated = await this.settingsRepository.upsert(tenantId, updates);

    const now = new Date().toISOString();
    await this.auditRepository.create({
      tenantId,
      actorType: "USER",
      actorId: actorUserId,
      action: "settings.update",
      resourceType: "TenantSetting",
      resourceId: updated.id,
      requestId,
      beforeSnapshot: (before as unknown as Record<string, unknown>) || undefined,
      afterSnapshot: updated as unknown as Record<string, unknown>,
      metadata: { changedKeys: Object.keys(updates) },
    });

    await this.outboxRepository.create({
      eventType: "TenantSettingsUpdated",
      eventVersion: "v1",
      aggregateType: "TenantSetting",
      aggregateId: updated.id,
      tenantId,
      actorId: actorUserId,
      payload: {
        tenantId,
        updatedByUserId: actorUserId,
        changedFields: Object.keys(updates),
        occurredAt: now,
      },
      occurredAt: now,
      status: "PENDING",
      availableAt: now,
    });

    return updated;
  }

  /**
   * Updates the lifecycle status of a tenant (e.g. SUSPENDED, ACTIVE).
   */
  async updateTenantStatus(
    tenantId: string,
    newStatus: TenantStatus,
    adminUserId: string,
    requestId?: string
  ): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      const error: any = new Error(`Tenant '${tenantId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.TENANT_NOT_FOUND;
      throw error;
    }

    const beforeStatus = tenant.status;
    const updated = await this.tenantRepository.update(tenantId, { status: newStatus });

    const now = new Date().toISOString();
    await this.auditRepository.create({
      tenantId,
      actorType: "USER",
      actorId: adminUserId,
      action: "tenant.status_change",
      resourceType: "Tenant",
      resourceId: tenantId,
      requestId,
      beforeSnapshot: { status: beforeStatus },
      afterSnapshot: { status: newStatus },
      metadata: { previousStatus: beforeStatus, newStatus },
    });

    return updated;
  }

  /**
   * Grants membership to a user within a tenant.
   */
  async grantMembership(
    tenantId: string,
    targetUserId: string,
    role: string,
    grantedByUserId: string,
    requestId?: string
  ): Promise<TenantMembership> {
    const existing = await this.membershipRepository.findByTenantAndUser(tenantId, targetUserId);
    if (existing) {
      if (existing.status !== "ACTIVE") {
        return await this.membershipRepository.updateStatus(existing.id, "ACTIVE");
      }
      return existing;
    }

    const membership = await this.membershipRepository.create({
      tenantId,
      userId: targetUserId,
      role: role || "TENANT_OPERATOR",
      status: "ACTIVE",
    });

    const now = new Date().toISOString();
    await this.auditRepository.create({
      tenantId,
      actorType: "USER",
      actorId: grantedByUserId,
      action: "membership.grant",
      resourceType: "TenantMembership",
      resourceId: membership.id,
      requestId,
      beforeSnapshot: undefined,
      afterSnapshot: membership as unknown as Record<string, unknown>,
      metadata: { targetUserId, role },
    });

    return membership;
  }

  /**
   * Revokes a user's membership in a tenant.
   */
  async revokeMembership(
    membershipId: string,
    revokedByUserId: string,
    requestId?: string
  ): Promise<TenantMembership> {
    const membership = await this.membershipRepository.findById(membershipId);
    if (!membership) {
      const error: any = new Error(`Membership '${membershipId}' not found`);
      error.statusCode = 404;
      error.code = "MEMBERSHIP_NOT_FOUND";
      throw error;
    }

    const updated = await this.membershipRepository.updateStatus(membershipId, "REVOKED");

    const now = new Date().toISOString();
    await this.auditRepository.create({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: revokedByUserId,
      action: "membership.revoke",
      resourceType: "TenantMembership",
      resourceId: membershipId,
      requestId,
      beforeSnapshot: { status: membership.status },
      afterSnapshot: { status: "REVOKED" },
      metadata: { targetUserId: membership.userId },
    });

    return updated;
  }
}
