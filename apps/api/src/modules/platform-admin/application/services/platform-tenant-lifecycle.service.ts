// ============================================================================
// CAR HIRE OS — PLATFORM TENANT LIFECYCLE SERVICE (Sprint 37: TEN-001..005, SEC-005)
// Master control-plane service for multi-tenant fleet operator administration.
// Provides authoritative provisioning, suspension, reactivation, offboarding,
// and cross-tenant intelligence summaries.
// ============================================================================

import { ERROR_CODES, PLATFORM_PERMISSIONS } from "@carhire/constants";
import type {
  Tenant,
  PlatformAuthorizationContext,
  Plan,
  Subscription,
  Vehicle,
  Booking,
} from "@carhire/types";
import type {
  ITenantRepository,
  ISubscriptionRepository,
  IPlanRepository,
  IVehicleRepository,
  IBookingRepository,
  IAuditRepository,
  IOutboxRepository,
  IUserRepository,
} from "@carhire/database";
import type { PlatformAuthorizationService } from "../../../authorization/application/services/platform-authorization.service";

export interface TenantSummaryView {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "PROVISIONING" | "OFFBOARDED" | "DECOMMISSIONED";
  country: string;
  currency: string;
  planName: string;
  planTier: string;
  subscriptionStatus: string;
  fleetCount: number;
  activeBookingsCount: number;
  monthlyRevenueEst: number;
  createdAt: string;
  ownerEmail?: string;
  suspendedReason?: string;
}

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  country: string;
  currency: string;
  timezone?: string;
  planId?: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
}

export class PlatformTenantLifecycleService {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly planRepo: IPlanRepository,
    private readonly vehicleRepo: IVehicleRepository,
    private readonly bookingRepo: IBookingRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly outboxRepo: IOutboxRepository,
    private readonly userRepo: IUserRepository,
    private readonly platformAuthService: PlatformAuthorizationService
  ) {}

  /**
   * Lists all tenants with aggregated fleet, booking, and subscription metrics.
   */
  async listTenantSummaries(
    platformContext: PlatformAuthorizationContext,
    filters?: {
      status?: string;
      country?: string;
      search?: string;
    }
  ): Promise<TenantSummaryView[]> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_TENANT_READ);

    const allTenants = await this.tenantRepo.listAll();
    const plans = await this.planRepo.listAll();
    const planMap = new Map(plans.map((p) => [p.id, p]));

    const summaries: TenantSummaryView[] = [];

    for (const tenant of allTenants) {
      // Apply filters
      if (filters?.status && tenant.status !== filters.status) continue;
      if (filters?.country && tenant.country !== filters.country) continue;
      if (filters?.search) {
        const query = filters.search.toLowerCase();
        const matchesName = tenant.name.toLowerCase().includes(query);
        const matchesSlug = tenant.slug.toLowerCase().includes(query);
        if (!matchesName && !matchesSlug) continue;
      }

      // Fetch subscription
      const sub = await this.subscriptionRepo.findByTenantId(tenant.id);
      const plan = sub ? planMap.get(sub.planId) : null;

      // Aggregated fleet and bookings
      let fleetCount = 0;
      let activeBookingsCount = 0;
      try {
        const vehicles = await this.vehicleRepo.listByTenant(tenant.id);
        fleetCount = vehicles.length;
      } catch {
        // Fallback for isolated in-memory or empty states
      }

      try {
        const bookingRes = await this.bookingRepo.findMany(tenant.id);
        activeBookingsCount = bookingRes.items.filter((b) => ["CONFIRMED", "ACTIVE", "IN_PROGRESS"].includes(b.status)).length;
      } catch {
        // Fallback
      }

      summaries.push({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: (tenant.status as any) || "ACTIVE",
        country: tenant.country || "KE",
        currency: tenant.currency || "KES",
        planName: plan?.name || "Standard Starter",
        planTier: plan?.code || "STARTER",
        subscriptionStatus: sub?.status || sub?.state || "ACTIVE",
        fleetCount,
        activeBookingsCount,
        monthlyRevenueEst: plan ? (plan.monthlyPrice || 0) : 15000,
        createdAt: tenant.createdAt || new Date().toISOString(),
      });
    }

    return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Retrieves detailed single tenant profile and operational metadata.
   */
  async getTenantDetail(
    platformContext: PlatformAuthorizationContext,
    tenantId: string
  ): Promise<any> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_TENANT_READ);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      const error: any = new Error(`Tenant '${tenantId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.TENANT_NOT_FOUND;
      throw error;
    }

    const subscription = await this.subscriptionRepo.findByTenantId(tenantId);
    let plan: Plan | null = null;
    if (subscription) {
      plan = await this.planRepo.findById(subscription.planId);
    }

    let fleet: Vehicle[] = [];
    let bookings: Booking[] = [];
    try {
      fleet = await this.vehicleRepo.listByTenant(tenantId);
    } catch {}

    try {
      const bookingRes = await this.bookingRepo.findMany(tenantId);
      bookings = bookingRes.items;
    } catch {}

    return {
      tenant,
      subscription,
      plan,
      fleetSummary: {
        total: fleet.length,
        available: fleet.filter((v) => (v.availabilityStatus as any) === "AVAILABLE" || (v as any).status === "AVAILABLE").length,
        rented: fleet.filter((v) => (v.availabilityStatus as any) === "RENTED" || (v as any).status === "RENTED").length,
        maintenance: fleet.filter((v) => (v.availabilityStatus as any) === "MAINTENANCE" || (v as any).status === "MAINTENANCE").length,
      },
      bookingsSummary: {
        total: bookings.length,
        active: bookings.filter((b) => ["CONFIRMED", "ACTIVE"].includes(b.status)).length,
        completed: bookings.filter((b) => b.status === "COMPLETED").length,
      },
    };
  }

  /**
   * Provisions a new tenant company with default workspace settings and owner.
   */
  async provisionTenant(
    platformContext: PlatformAuthorizationContext,
    input: ProvisionTenantInput
  ): Promise<{ tenant: Tenant; subscriptionId?: string }> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_TENANT_PROVISION);

    if (!input.name || !input.slug || !input.ownerEmail) {
      const error: any = new Error("Tenant name, slug, and ownerEmail are mandatory");
      error.statusCode = 400;
      error.code = "INVALID_INPUT";
      throw error;
    }

    // Check slug uniqueness
    const existing = await this.tenantRepo.findBySlug(input.slug);
    if (existing) {
      const error: any = new Error(`Tenant with slug '${input.slug}' already exists`);
      error.statusCode = 409;
      error.code = "SLUG_ALREADY_EXISTS";
      throw error;
    }

    // Resolve target plan
    const plans = await this.planRepo.listAll();
    const targetPlan = input.planId
      ? await this.planRepo.findById(input.planId)
      : plans.find((p) => p.code === "STARTER") || plans[0];

    const planId = targetPlan?.id || "plan-starter";

    // 1. Create Tenant
    const tenant = await this.tenantRepo.create({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      status: "ACTIVE",
      country: input.country || "KE",
      currency: input.currency || "KES",
      timezone: input.timezone || "Africa/Nairobi",
      planId,
    });

    // 2. Provision Subscription
    let sub: Subscription | null = null;
    if (targetPlan) {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      sub = await this.subscriptionRepo.create({
        tenantId: tenant.id,
        planId: targetPlan.id,
        status: "ACTIVE",
        state: "ACTIVE",
        amount: targetPlan.monthlyPrice || 0,
        currency: targetPlan.currency || "KES",
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        billingCycle: "MONTHLY",
        autoRenew: true,
        cancelAtPeriodEnd: false,
      });
    }

    // 3. Audit Log
    await this.auditRepo.append({
      tenantId: tenant.id,
      actorId: platformContext.userId,
      actorType: "PLATFORM_STAFF",
      action: "TENANT_PROVISIONED",
      resourceType: "tenant",
      resourceId: tenant.id,
      requestId: platformContext.requestId,
      metadata: {
        slug: tenant.slug,
        ownerEmail: input.ownerEmail,
        planId: targetPlan?.id,
      },
    });

    // 4. Outbox Event
    const nowIso = new Date().toISOString();
    await this.outboxRepo.create({
      tenantId: tenant.id,
      eventType: "TENANT_PROVISIONED",
      eventVersion: "v1",
      aggregateType: "Tenant",
      aggregateId: tenant.id,
      actorId: platformContext.userId,
      correlationId: platformContext.requestId,
      payload: {
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        ownerEmail: input.ownerEmail,
        country: tenant.country,
      },
      occurredAt: nowIso,
      status: "PENDING",
      availableAt: nowIso,
    });

    return { tenant, subscriptionId: sub ? sub.id : undefined };
  }

  /**
   * Governed Suspension of a tenant workspace.
   */
  async suspendTenant(
    platformContext: PlatformAuthorizationContext,
    tenantId: string,
    reason: string,
    category = "ADMIN_ACTION"
  ): Promise<Tenant> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_TENANT_SUSPEND);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      const error: any = new Error(`Tenant '${tenantId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.TENANT_NOT_FOUND;
      throw error;
    }

    const updated = await this.tenantRepo.update(tenantId, {
      status: "SUSPENDED",
      updatedAt: new Date().toISOString(),
    });

    await this.auditRepo.append({
      tenantId,
      actorId: platformContext.userId,
      actorType: "PLATFORM_STAFF",
      action: "TENANT_SUSPENDED",
      resourceType: "tenant",
      resourceId: tenantId,
      requestId: platformContext.requestId,
      metadata: { reason, category },
    });

    const nowIso = new Date().toISOString();
    await this.outboxRepo.create({
      tenantId,
      eventType: "TENANT_SUSPENDED",
      eventVersion: "v1",
      aggregateType: "Tenant",
      aggregateId: tenantId,
      actorId: platformContext.userId,
      correlationId: platformContext.requestId,
      payload: { tenantId, reason, category },
      occurredAt: nowIso,
      status: "PENDING",
      availableAt: nowIso,
    });

    return updated;
  }

  /**
   * Governed Reactivation of a suspended tenant workspace.
   */
  async reactivateTenant(
    platformContext: PlatformAuthorizationContext,
    tenantId: string,
    reason: string
  ): Promise<Tenant> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_TENANT_SUSPEND);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      const error: any = new Error(`Tenant '${tenantId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.TENANT_NOT_FOUND;
      throw error;
    }

    const updated = await this.tenantRepo.update(tenantId, {
      status: "ACTIVE",
      updatedAt: new Date().toISOString(),
    });

    await this.auditRepo.append({
      tenantId,
      actorId: platformContext.userId,
      actorType: "PLATFORM_STAFF",
      action: "TENANT_REACTIVATED",
      resourceType: "tenant",
      resourceId: tenantId,
      requestId: platformContext.requestId,
      metadata: { reason },
    });

    const nowIso = new Date().toISOString();
    await this.outboxRepo.create({
      tenantId,
      eventType: "TENANT_REACTIVATED",
      eventVersion: "v1",
      aggregateType: "Tenant",
      aggregateId: tenantId,
      actorId: platformContext.userId,
      correlationId: platformContext.requestId,
      payload: { tenantId, reason },
      occurredAt: nowIso,
      status: "PENDING",
      availableAt: nowIso,
    });

    return updated;
  }

  /**
   * Governed Offboarding and decommissioning of a tenant workspace.
   */
  async offboardTenant(
    platformContext: PlatformAuthorizationContext,
    tenantId: string,
    reason: string
  ): Promise<Tenant> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_TENANT_SUSPEND);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      const error: any = new Error(`Tenant '${tenantId}' not found`);
      error.statusCode = 404;
      error.code = ERROR_CODES.TENANT_NOT_FOUND;
      throw error;
    }

    const updated = await this.tenantRepo.update(tenantId, {
      status: "DECOMMISSIONED" as any,
      updatedAt: new Date().toISOString(),
    });

    await this.auditRepo.append({
      tenantId,
      actorId: platformContext.userId,
      actorType: "PLATFORM_STAFF",
      action: "TENANT_OFFBOARDED",
      resourceType: "tenant",
      resourceId: tenantId,
      requestId: platformContext.requestId,
      metadata: { reason, state: "DECOMMISSIONED" },
    });

    const nowIso = new Date().toISOString();
    await this.outboxRepo.create({
      tenantId,
      eventType: "TENANT_OFFBOARDED",
      eventVersion: "v1",
      aggregateType: "Tenant",
      aggregateId: tenantId,
      actorId: platformContext.userId,
      correlationId: platformContext.requestId,
      payload: { tenantId, reason },
      occurredAt: nowIso,
      status: "PENDING",
      availableAt: nowIso,
    });

    return updated;
  }
}
