// ============================================================================
// CAR HIRE OS — SUPPORT ACCESS SERVICE (DEV-005 §22-23, SEC-007)
// Manages time-bounded, audited support access impersonation into tenants.
// ============================================================================

import { ERROR_CODES, PLATFORM_PERMISSIONS } from "@carhire/constants";
import type { SupportAccessSession } from "@carhire/types";
import type {
  ISupportAccessSessionRepository,
  ITenantRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import type { PlatformAuthorizationService } from "./platform-authorization.service";
import type { PlatformAuthorizationContext } from "@carhire/types";

export class SupportAccessService {
  constructor(
    private readonly supportSessionRepository: ISupportAccessSessionRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly platformAuthService: PlatformAuthorizationService,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  /**
   * Initiates a time-bounded, audited support access session into a tenant workspace.
   */
  async startSupportSession(
    platformContext: PlatformAuthorizationContext,
    targetTenantId: string,
    reason: string,
    durationMinutes = 60
  ): Promise<SupportAccessSession> {
    // 1. Enforce Platform Support Permission
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_SUPPORT_SESSION_START);

    if (!reason || reason.trim().length < 5) {
      const error: any = new Error("A valid business or support reason (min 5 chars) is required for tenant access");
      error.statusCode = 400;
      error.code = "INVALID_INPUT";
      throw error;
    }

    // 2. Verify Target Tenant exists
    const tenant = await this.tenantRepository.findById(targetTenantId);
    if (!tenant) {
      const error: any = new Error(`Target tenant '${targetTenantId}' does not exist`);
      error.statusCode = 404;
      error.code = ERROR_CODES.TENANT_NOT_FOUND;
      throw error;
    }

    // 3. Create Session Record
    const session = await this.supportSessionRepository.createSession({
      platformUserId: platformContext.userId,
      targetTenantId,
      reason,
      expiresInMinutes: Math.max(1,Math.min(120,Number(durationMinutes)||60)),
    });

    // 4. Audit Log (AUD-001, SEC-007)
    await this.auditRepository.append({
      tenantId: targetTenantId,
      actorId: platformContext.userId,
      actorType: "SUPPORT",
      action: "SUPPORT_SESSION_STARTED",
      resourceType: "support_access_session",
      resourceId: session.id,
      requestId: platformContext.requestId,
      metadata: {
        targetTenantName: tenant.name,
        reason,
        expiresAt: session.expiresAt,
        actorEmail: platformContext.userId,
      },
    });

    // 5. Outbox Event
    const nowIso = new Date().toISOString();
    await this.outboxRepository.create({
      tenantId: targetTenantId,
      eventType: "SUPPORT_SESSION_STARTED",
      eventVersion: "v1",
      aggregateType: "SupportAccessSession",
      aggregateId: session.id,
      actorId: platformContext.userId,
      correlationId: platformContext.requestId,
      payload: {
        sessionId: session.id,
        platformUserId: platformContext.userId,
        targetTenantId,
        expiresAt: session.expiresAt,
      },
      occurredAt: nowIso,
      status: "PENDING",
      availableAt: nowIso,
    });

    return session;
  }

  /**
   * Validates if a support session is active, valid for target tenant, and unexpired.
   */
  async validateSupportSession(
    sessionId: string,
    targetTenantId: string,
    platformUserId: string
  ): Promise<SupportAccessSession> {
    const session = await this.supportSessionRepository.findById(sessionId);
    if (!session) {
      const error: any = new Error("Support access session not found");
      error.statusCode = 403;
      error.code = ERROR_CODES.SUPPORT_ACCESS_REQUIRED;
      throw error;
    }

    if (session.targetTenantId !== targetTenantId) {
      const error: any = new Error("Support access session is not valid for this tenant workspace");
      error.statusCode = 403;
      error.code = ERROR_CODES.SUPPORT_ACCESS_REQUIRED;
      throw error;
    }

    if (session.platformUserId !== platformUserId) {
      const error: any = new Error("Support access session does not belong to this platform operator");
      error.statusCode = 403;
      error.code = ERROR_CODES.SUPPORT_ACCESS_REQUIRED;
      throw error;
    }

    const now = new Date().toISOString();
    if (!session.isActive || session.expiresAt <= now) {
      const error: any = new Error("Support access session has expired or been revoked");
      error.statusCode = 403;
      error.code = ERROR_CODES.SUPPORT_SESSION_EXPIRED;
      throw error;
    }

    return session;
  }

  /**
   * Ends an active support access session.
   */
  async endSupportSession(
    platformContext: PlatformAuthorizationContext,
    sessionId: string
  ): Promise<SupportAccessSession> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_SUPPORT_SESSION_END);

    const endedSession = await this.supportSessionRepository.endSession(sessionId, platformContext.userId);

    await this.auditRepository.append({
      tenantId: endedSession.targetTenantId,
      actorId: platformContext.userId,
      actorType: "SUPPORT",
      action: "SUPPORT_SESSION_ENDED",
      resourceType: "support_access_session",
      resourceId: sessionId,
      requestId: platformContext.requestId,
      metadata: {
        endedAt: endedSession.endedAt,
        actorEmail: platformContext.userId,
      },
    });

    return endedSession;
  }

  /**
   * Lists support access sessions, optionally filtered by target tenant.
   */
  async listSessions(
    platformContext: PlatformAuthorizationContext,
    targetTenantId?: string
  ): Promise<SupportAccessSession[]> {
    this.platformAuthService.require(platformContext, PLATFORM_PERMISSIONS.PLATFORM_SUPPORT_ACCESS);

    if (targetTenantId) {
      return this.supportSessionRepository.listSessionsForTenant(targetTenantId);
    }
    return this.supportSessionRepository.listAll();
  }
}
