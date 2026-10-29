// ============================================================================
// CAR HIRE OS — PLATFORM OPERATIONS & DIAGNOSTICS SERVICE (Sprint 37: OPS-001..004)
// Gateway health telemetry, Outbox DLQ management, cross-tenant audit
// investigation, and platform global configuration.
// ============================================================================

import { PLATFORM_PERMISSIONS } from "@carhire/constants";
import type { PlatformAuthorizationContext } from "@carhire/types";
import type {
  IOutboxRepository,
  IAuditRepository,
  ITenantRepository,
} from "@carhire/database";
import type { PlatformAuthorizationService } from "../../../authorization/application/services/platform-authorization.service";

export interface ProviderHealthStatus {
  providerId: string;
  name: string;
  category: "PAYMENT_GATEWAY" | "COMMUNICATION" | "STORAGE" | "INFRASTRUCTURE";
  status: "OPERATIONAL" | "DEGRADED" | "DOWN" | "STANDBY";
  latencyMs: number;
  lastCheckedAt: string;
  endpoint: string;
  activeTenantsCount: number;
  errorRate24h: number; // percentage
  message?: string;
}

export interface PlatformGlobalConfig {
  maintenanceMode: boolean;
  maintenanceReason?: string;
  maintenanceEstimatedEndTime?: string;
  announcementBanner?: {
    enabled: boolean;
    severity: "INFO" | "WARNING" | "CRITICAL";
    message: string;
    dismissible: boolean;
  };
  globalRateLimitMultiplier: number;
  maxFileUploadMb: number;
  sandboxMode: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface DomainDiagnosticRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  domain: string;
  status: "VERIFIED" | "PENDING_DNS" | "SSL_ISSUED" | "FAILED" | "EXPIRED";
  dnsTarget: string;
  sslProvider: string;
  sslExpiresAt: string;
  lastCheckedAt: string;
}

export class PlatformOperationsService {
  private globalConfig: PlatformGlobalConfig = {
    maintenanceMode: false,
    maintenanceReason: "",
    globalRateLimitMultiplier: 1.0,
    maxFileUploadMb: 25,
    sandboxMode: false,
    announcementBanner: {
      enabled: false,
      severity: "INFO",
      message: "Platform running normal operations",
      dismissible: true,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: "SYSTEM",
  };

  constructor(
    private readonly outboxRepo: IOutboxRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly platformAuthService: PlatformAuthorizationService
  ) {}

  /**
   * Evaluates and returns provider connectivity telemetry across payment,
   * messaging, and cloud infrastructure gateways.
   */
  async getProviderHealth(
    platformContext: PlatformAuthorizationContext
  ): Promise<ProviderHealthStatus[]> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_PAYMENT_READ);

    // No authenticated provider telemetry adapter is registered yet. Returning an
    // empty set is safer than inventing successful gateway checks or latencies.
    // Future provider probes must record real observed timestamps and failures.
    return [];
  }

  async getQueueStats(platformContext: PlatformAuthorizationContext): Promise<any> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_JOB_READ);

    // The transactional outbox is the only operational queue with verified
    // repository statistics here. Other BullMQ queues require real instrumentation.
    if (!this.outboxRepo.getStats) return { queues: [], aggregated: null };
    const stats = await this.outboxRepo.getStats();
    return {
      queues: [{
        name: "transactional-outbox",
        description: "Authoritative outbox repository status counts",
        pending: stats.pending,
        claimed: stats.claimed,
        published: stats.published,
        failed: stats.failed,
        deadLetter: stats.deadLetter,
        health: stats.deadLetter > 0 ? "DEGRADED" : "HEALTHY",
      }],
      aggregated: stats,
    };
  }

  async listDeadLetters(platformContext: PlatformAuthorizationContext, limit = 50): Promise<any[]> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_JOB_READ);

    if (this.outboxRepo.findDeadLetters) {
      return this.outboxRepo.findDeadLetters(undefined, limit);
    }
    return [];
  }

  /**
   * Replays a dead letter item back to pending status for retry.
   */
  async retryDeadLetter(
    platformContext: PlatformAuthorizationContext,
    recordId: string
  ): Promise<{ success: boolean; message: string }> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_JOB_RETRY);

    let success = false;
    if (this.outboxRepo.retryDeadLetter) {
      success = await this.outboxRepo.retryDeadLetter(recordId);
    }

    await this.auditRepo.append({
      tenantId: "platform-control-plane",
      actorId: platformContext.userId,
      actorType: "PLATFORM_STAFF",
      action: "DEAD_LETTER_RETRY_INITIATED",
      resourceType: "outbox_record",
      resourceId: recordId,
      requestId: platformContext.requestId,
      metadata: { success },
    });

    return {
      success,
      message: success
        ? `Outbox record '${recordId}' successfully requeued for redelivery.`
        : `Record '${recordId}' could not be replayed or was not found in DLQ.`,
    };
  }

  /**
   * Cross-tenant audit investigations.
   */
  async searchAuditLogs(
    platformContext: PlatformAuthorizationContext,
    filters?: {
      tenantId?: string;
      action?: string;
      limit?: number;
    }
  ): Promise<any[]> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_AUDIT_READ);

    const limit = filters?.limit || 100;
    if (filters?.tenantId) {
      return this.auditRepo.findByTenant(filters.tenantId, limit);
    }
    if (filters?.action) {
      return this.auditRepo.findRecentByAction(filters.action, limit);
    }
    return this.auditRepo.listAll(limit);
  }

  /**
   * Custom domain and SSL diagnostics across all tenants.
   */
  async listDomainDiagnostics(
    platformContext: PlatformAuthorizationContext
  ): Promise<DomainDiagnosticRecord[]> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_DOMAIN_READ);
    // Domain verification/SSL evidence must come from the actual domain service
    // and certificate provider. No probe is wired into this operations adapter.
    return [];
  }

  /**
   * Gets platform global configuration. Runtime-only until persisted.
   */
  

  getGlobalConfig(): PlatformGlobalConfig {
    return { ...this.globalConfig };
  }

  /**
   * Updates platform global configuration with audit logging.
   */
  async updateGlobalConfig(
    platformContext: PlatformAuthorizationContext,
    updates: Partial<PlatformGlobalConfig>
  ): Promise<PlatformGlobalConfig> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_CONFIG_MANAGE);

    this.globalConfig = {
      ...this.globalConfig,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: platformContext.userId,
    };

    await this.auditRepo.append({
      tenantId: "platform-control-plane",
      actorId: platformContext.userId,
      actorType: "PLATFORM_STAFF",
      action: "PLATFORM_GLOBAL_CONFIG_UPDATED",
      resourceType: "platform_config",
      resourceId: "global-config",
      requestId: platformContext.requestId,
      metadata: { updates },
    });

    return { ...this.globalConfig };
  }
}
