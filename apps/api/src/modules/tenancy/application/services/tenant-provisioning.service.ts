import type { SubscriptionService } from "../../../subscriptions/application/subscription.service";
// ============================================================================
// CAR HIRE OS — ATOMIC TENANT PROVISIONING SERVICE (DEV-004, DATA-002)
// Transactionally provisions Tenant, Settings, Owner Membership, Outbox & Audit.
// ============================================================================

import { ERROR_CODES } from "@carhire/constants";
import type { CreateTenantDto, Tenant, TenantSetting, TenantMembership } from "@carhire/types";
import type {
  ITenantRepository,
  ITenantSettingsRepository,
  ITenantMembershipRepository,
  IAuditRepository,
  IOutboxRepository,
  ITenantMembershipRoleRepository,
  IRoleRepository,
} from "@carhire/database";
import { TenantSlug } from "../../domain/tenant-slug.vo";

export interface ProvisionTenantResult {
  tenant: Tenant;
  settings: TenantSetting;
  membership: TenantMembership;
}

export class TenantProvisioningService {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly settingsRepository: ITenantSettingsRepository,
    private readonly membershipRepository: ITenantMembershipRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository,
    private readonly membershipRoleRepository?: ITenantMembershipRoleRepository,
    private readonly roleRepository?: IRoleRepository,
    private readonly subscriptionService?: SubscriptionService
  ) {}

  /**
   * Transactionally provisions a new Tenant workspace with initial settings,
   * owner membership, outbox event, and audit record.
   */
  async provisionTenant(
    creatorUserId: string,
    dto: CreateTenantDto,
    requestId?: string
  ): Promise<ProvisionTenantResult> {
    if (!creatorUserId || typeof creatorUserId !== "string" || creatorUserId.trim() === "") {
      const error: any = new Error("Authenticated user ID is required to provision a tenant");
      error.statusCode = 401;
      error.code = ERROR_CODES.UNAUTHORIZED;
      throw error;
    }

    if (!dto.name || typeof dto.name !== "string" || dto.name.trim().length < 2) {
      const error: any = new Error("Tenant name is required and must be at least 2 characters");
      error.statusCode = 400;
      error.code = "INVALID_TENANT_NAME";
      throw error;
    }

    // 1. Slug Validation & Normalization
    let slugVO: TenantSlug;
    try {
      slugVO = dto.slug ? new TenantSlug(dto.slug) : TenantSlug.fromName(dto.name);
    } catch (err: any) {
      const error: any = new Error(`Invalid tenant slug: ${err.message}`);
      error.statusCode = 400;
      error.code = ERROR_CODES.TENANT_SLUG_INVALID;
      throw error;
    }

    const slug = slugVO.getValue();

    // 2. Slug Uniqueness Check
    const existing = await this.tenantRepository.findBySlug(slug);
    if (existing) {
      const error: any = new Error(`Tenant slug '${slug}' is already registered`);
      error.statusCode = 409;
      error.code = ERROR_CODES.TENANT_SLUG_CONFLICT;
      throw error;
    }

    const currency = dto.defaultCurrency || "KES";
    const currencySymbol = dto.currencySymbol || "KSh";
    const timezone = dto.timezone || "Africa/Nairobi";
    const countryCode = dto.countryCode || "KE";

    // 3. Create Tenant
    const tenant = await this.tenantRepository.create({
      name: dto.name.trim(),
      slug,
      status: "ACTIVE",
      planId: "plan-growth",
      currency,
      defaultCurrency: currency,
      currencySymbol,
      timezone,
      countryCode,
    });

    // 4. Create Tenant Settings
    const settings = await this.settingsRepository.upsert(tenant.id, {
      vatRatePercent: dto.initialSettings?.vatRatePercent ?? 16,
      mpesaPaybill: dto.initialSettings?.mpesaPaybill,
      mpesaShortcode: dto.initialSettings?.mpesaShortcode,
      mpesaPasskey: dto.initialSettings?.mpesaPasskey,
      mpesaSandbox: dto.initialSettings?.mpesaSandbox ?? true,
      allowedDailyKm: dto.initialSettings?.allowedDailyKm ?? 250,
      excessKmRate: dto.initialSettings?.excessKmRate ?? 25,
      depositDefaultAmount: dto.initialSettings?.depositDefaultAmount ?? 25000,
      cdwDailyRate: dto.initialSettings?.cdwDailyRate ?? 1500,
      enableGpsTracking: dto.initialSettings?.enableGpsTracking ?? false,
      requirePreauthDeposit: dto.initialSettings?.requirePreauthDeposit ?? true,
      flexibleConfig: dto.initialSettings?.flexibleConfig,
    });

    // 5. Create Owner Membership
    const membership = await this.membershipRepository.create({
      tenantId: tenant.id,
      userId: creatorUserId,
      role: "COMPANY_OWNER",
      roleName: "Company Owner",
      status: "ACTIVE",
    });

    // 5b. Assign COMPANY_OWNER System Role
    if (this.membershipRoleRepository) {
      const ownerRoleId = "sys-role-company_owner";
      await this.membershipRoleRepository.assignRole(tenant.id, membership.id, ownerRoleId, creatorUserId);
    }

    await this.subscriptionService?.createSubscription({tenantId:tenant.id,planId:tenant.planId,startAsTrial:true});

    // 6. Record Outbox Event
    const now = new Date().toISOString();
    await this.outboxRepository.create({
      eventType: "TenantProvisioned",
      eventVersion: "v1",
      aggregateType: "Tenant",
      aggregateId: tenant.id,
      tenantId: tenant.id,
      actorId: creatorUserId,
      payload: {
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        creatorUserId,
        currency,
        timezone,
        occurredAt: now,
      },
      occurredAt: now,
      status: "PENDING",
      availableAt: now,
    });

    // 7. Record Audit Log
    await this.auditRepository.create({
      tenantId: tenant.id,
      actorType: "USER",
      actorId: creatorUserId,
      action: "tenant.provision",
      resourceType: "Tenant",
      resourceId: tenant.id,
      requestId,
      beforeSnapshot: undefined,
      afterSnapshot: {
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
      metadata: {
        membershipId: membership.id,
        role: membership.role,
      },
    });

    return {
      tenant,
      settings,
      membership,
    };
  }
}
