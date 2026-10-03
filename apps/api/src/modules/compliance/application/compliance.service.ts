// ============================================================================
// CAR HIRE OS — COMPLIANCE APPLICATION SERVICE (DEV-006, DEV-007, DEV-009, DOM-003)
// Document Verification Lifecycle, Outbox Events & Multi-Blocker Coordination
// ============================================================================

import type {
  ComplianceIssue,
  ComplianceOverride,
  ComplianceRecord,
  ComplianceRecordHistoryItem,
  ComplianceRequirement,
  CreateComplianceRecordDto,
  CreateComplianceRequirementDto,
  OverrideComplianceIssueDto,
  RejectComplianceRecordDto,
  RenewComplianceRecordDto,
  RevokeComplianceRecordDto,
  UpdateComplianceRequirementDto,
  VerifyComplianceRecordDto,
} from "@carhire/types";
import {
  ComplianceRequirementRepository,
  ComplianceRecordRepository,
  ComplianceIssueRepository,
  ComplianceOverrideRepository,
  VehicleRepository,
  VehicleBlockRepository,
  DriverRepository,
  AuditRepository,
  OutboxRepository,
  IdempotencyRepository,
  RecordNotFoundError,
} from "@carhire/database";
import { IClock, SystemClock } from "../domain/clock";
import { ComplianceStateMachine } from "../domain/compliance-state-machine";

export class ComplianceService {
  constructor(
    private readonly requirementRepo: ComplianceRequirementRepository,
    private readonly recordRepo: ComplianceRecordRepository,
    private readonly issueRepo: ComplianceIssueRepository,
    private readonly overrideRepo: ComplianceOverrideRepository,
    private readonly vehicleRepo: VehicleRepository,
    private readonly vehicleBlockRepo: VehicleBlockRepository,
    private readonly driverRepo: DriverRepository,
    private readonly auditRepo: AuditRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly idempotencyRepo: IdempotencyRepository,
    private readonly clock: IClock = new SystemClock()
  ) {}

  // --------------------------------------------------------------------------
  // REQUIREMENTS CATALOG
  // --------------------------------------------------------------------------

  async listRequirements(
    tenantId: string,
    subjectType?: any,
    activeOnly: boolean = false
  ): Promise<ComplianceRequirement[]> {
    return this.requirementRepo.list(tenantId, subjectType, activeOnly);
  }

  async getRequirementByCode(code: string, tenantId: string): Promise<ComplianceRequirement | null> {
    return this.requirementRepo.findByCode(code, tenantId);
  }

  async createRequirement(
    tenantId: string,
    dto: CreateComplianceRequirementDto,
    actorId?: string
  ): Promise<ComplianceRequirement> {
    const existing = await this.requirementRepo.findByCode(dto.code, tenantId);
    if (existing && existing.tenantId === tenantId) {
      throw new Error(`Requirement with code ${dto.code} already exists for this tenant.`);
    }

    const requirement = await this.requirementRepo.create({
      ...dto,
      tenantId,
      mandatory: dto.mandatory ?? true,
      blockingPolicy: dto.blockingPolicy ?? "BLOCK_RENTAL_START",
      verificationRequired: dto.verificationRequired ?? true,
      expiryRequired: dto.expiryRequired ?? true,
      warningThresholdDays: dto.warningThresholdDays ?? 30,
      isActive: dto.isActive ?? true,
    });

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.requirement_created",
      resource: "compliance_requirement",
      resourceId: requirement.id,
      metadata: { code: requirement.code, name: requirement.name },
    });

    await this.outboxRepo.create({
      tenantId,
      eventType: "compliance.requirement_created",
      aggregateType: "ComplianceRequirement",
      aggregateId: requirement.id,
      payload: { requirementId: requirement.id, code: requirement.code },
    });

    return requirement;
  }

  async updateRequirement(
    tenantId: string,
    id: string,
    dto: UpdateComplianceRequirementDto,
    actorId?: string
  ): Promise<ComplianceRequirement> {
    const updated = await this.requirementRepo.update(id, tenantId, dto);

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.requirement_updated",
      resource: "compliance_requirement",
      resourceId: updated.id,
      metadata: { code: updated.code },
    });

    return updated;
  }

  // --------------------------------------------------------------------------
  // COMPLIANCE RECORDS LIFECYCLE
  // --------------------------------------------------------------------------

  async getRecordById(tenantId: string, id: string): Promise<ComplianceRecord | null> {
    return this.recordRepo.findById(id, tenantId);
  }

  async listRecords(tenantId: string, filters?: any): Promise<ComplianceRecord[]> {
    return this.recordRepo.list(tenantId, filters);
  }

  async getRecordsForSubject(
    tenantId: string,
    subjectType: any,
    subjectId: string
  ): Promise<ComplianceRecord[]> {
    return this.recordRepo.findBySubject(subjectType, subjectId, tenantId);
  }

  async getRecordHistory(
    tenantId: string,
    recordId: string
  ): Promise<ComplianceRecordHistoryItem[]> {
    return this.recordRepo.getHistory(recordId, tenantId);
  }

  /**
   * Submits a new compliance record.
   */
  async submitRecord(
    tenantId: string,
    dto: CreateComplianceRecordDto,
    actorId?: string
  ): Promise<ComplianceRecord> {
    if (dto.idempotencyKey) {
      const existingKey = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (existingKey?.responseBody) {
        return existingKey.responseBody as unknown as ComplianceRecord;
      }
    }

    // Resolve requirement definition
    let requirement: ComplianceRequirement | null = null;
    if (dto.requirementId) {
      requirement = await this.requirementRepo.findById(dto.requirementId, tenantId);
    } else {
      requirement = await this.requirementRepo.findByCode(dto.requirementCode, tenantId);
    }

    if (!requirement) {
      throw new RecordNotFoundError("compliance_requirements", dto.requirementCode);
    }

    // Verify subject existence in tenant
    if (dto.subjectType === "VEHICLE") {
      const vehicle = await this.vehicleRepo.findById(dto.subjectId, tenantId);
      if (!vehicle) throw new RecordNotFoundError("vehicles", dto.subjectId);
    } else if (dto.subjectType === "DRIVER") {
      const driver = await this.driverRepo.findById(dto.subjectId, tenantId);
      if (!driver) throw new RecordNotFoundError("drivers", dto.subjectId);
    }

    const record = await this.recordRepo.create({
      tenantId,
      requirementId: requirement.id,
      requirementCode: requirement.code,
      subjectType: dto.subjectType,
      subjectId: dto.subjectId,
      documentReference: dto.documentReference,
      fileId: dto.fileId,
      identifierNumber: dto.identifierNumber,
      issuedAt: dto.issuedAt,
      validFrom: dto.validFrom,
      expiresAt: dto.expiresAt,
      issuer: dto.issuer,
      jurisdiction: dto.jurisdiction,
      notes: dto.notes,
      status: "PENDING",
      verificationStatus: requirement.verificationRequired ? "UNVERIFIED" : "VERIFIED",
    });

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.record_submitted",
      resource: "compliance_record",
      resourceId: record.id,
      metadata: {
        requirementCode: record.requirementCode,
        subjectType: record.subjectType,
        subjectId: record.subjectId,
      },
    });

    await this.outboxRepo.create({
      tenantId,
      eventType: "compliance.record_submitted",
      aggregateType: "ComplianceRecord",
      aggregateId: record.id,
      payload: {
        recordId: record.id,
        requirementCode: record.requirementCode,
        subjectType: record.subjectType,
        subjectId: record.subjectId,
      },
    });

    // If auto-verified because requirement doesn't require verification, update status
    if (!requirement.verificationRequired) {
      await this.verifyRecord(tenantId, record.id, { verificationMethod: "AUTO_SYSTEM_ACCEPTED" }, actorId);
    }

    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "COMPLIANCE_RECORD",
        resourceId: record.id,
        responseStatus: 201,
        responseBody: record as unknown as Record<string, unknown>,
      });
    }

    return record;
  }

  /**
   * Verifies a compliance record (Four-eyes compliance audit).
   */
  async verifyRecord(
    tenantId: string,
    recordId: string,
    dto: VerifyComplianceRecordDto,
    actorId?: string
  ): Promise<ComplianceRecord> {
    const record = await this.recordRepo.findById(recordId, tenantId);
    if (!record) {
      throw new RecordNotFoundError("compliance_records", recordId);
    }

    const requirement = await this.requirementRepo.findById(record.requirementId, tenantId);
    if (!requirement) {
      throw new RecordNotFoundError("compliance_requirements", record.requirementId);
    }

    const now = this.clock.now();
    const transition = ComplianceStateMachine.applyVerification(
      record,
      requirement,
      {
        verifiedBy: actorId || "SYSTEM",
        verificationMethod: dto.verificationMethod,
        notes: dto.notes,
      },
      now
    );

    const updated = await this.recordRepo.update(recordId, tenantId, transition, record.version);

    await this.recordRepo.addHistory({
      tenantId,
      recordId: updated.id,
      action: "VERIFIED",
      previousStatus: record.status,
      newStatus: updated.status,
      previousVerificationStatus: record.verificationStatus,
      newVerificationStatus: updated.verificationStatus,
      actorId,
      reason: dto.notes,
    });

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.record_verified",
      resource: "compliance_record",
      resourceId: updated.id,
      metadata: {
        requirementCode: updated.requirementCode,
        subjectId: updated.subjectId,
        status: updated.status,
      },
    });

    await this.outboxRepo.create({
      tenantId,
      eventType: "compliance.record_verified",
      aggregateType: "ComplianceRecord",
      aggregateId: updated.id,
      payload: {
        recordId: updated.id,
        requirementCode: updated.requirementCode,
        subjectType: updated.subjectType,
        subjectId: updated.subjectId,
        status: updated.status,
      },
    });

    // Run compliance sweep for this subject to clear any associated open issues
    await this.evaluateSubjectCompliance(tenantId, updated.subjectType, updated.subjectId);

    return updated;
  }

  /**
   * Rejects a submitted compliance record.
   */
  async rejectRecord(
    tenantId: string,
    recordId: string,
    dto: RejectComplianceRecordDto,
    actorId?: string
  ): Promise<ComplianceRecord> {
    const record = await this.recordRepo.findById(recordId, tenantId);
    if (!record) {
      throw new RecordNotFoundError("compliance_records", recordId);
    }

    const transition = ComplianceStateMachine.applyRejection(record, {
      rejectedBy: actorId || "SYSTEM",
      reason: dto.reason,
      notes: dto.notes,
    });

    const updated = await this.recordRepo.update(recordId, tenantId, transition, record.version);

    await this.recordRepo.addHistory({
      tenantId,
      recordId: updated.id,
      action: "REJECTED",
      previousStatus: record.status,
      newStatus: updated.status,
      previousVerificationStatus: record.verificationStatus,
      newVerificationStatus: updated.verificationStatus,
      actorId,
      reason: dto.reason,
    });

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.record_rejected",
      resource: "compliance_record",
      resourceId: updated.id,
      metadata: { reason: dto.reason },
    });

    await this.outboxRepo.create({
      tenantId,
      eventType: "compliance.record_rejected",
      aggregateType: "ComplianceRecord",
      aggregateId: updated.id,
      payload: {
        recordId: updated.id,
        requirementCode: updated.requirementCode,
        subjectId: updated.subjectId,
        reason: dto.reason,
      },
    });

    await this.evaluateSubjectCompliance(tenantId, updated.subjectType, updated.subjectId);

    return updated;
  }

  /**
   * Revokes a previously verified compliance record.
   */
  async revokeRecord(
    tenantId: string,
    recordId: string,
    dto: RevokeComplianceRecordDto,
    actorId?: string
  ): Promise<ComplianceRecord> {
    const record = await this.recordRepo.findById(recordId, tenantId);
    if (!record) {
      throw new RecordNotFoundError("compliance_records", recordId);
    }

    const now = this.clock.now();
    const transition = ComplianceStateMachine.applyRevocation(
      record,
      {
        revokedBy: actorId || "SYSTEM",
        reason: dto.reason,
        effectiveRevocationAt: dto.effectiveRevocationAt,
        notes: dto.notes,
      },
      now
    );

    const updated = await this.recordRepo.update(recordId, tenantId, transition, record.version);

    await this.recordRepo.addHistory({
      tenantId,
      recordId: updated.id,
      action: "REVOKED",
      previousStatus: record.status,
      newStatus: updated.status,
      previousVerificationStatus: record.verificationStatus,
      newVerificationStatus: updated.verificationStatus,
      actorId,
      reason: dto.reason,
    });

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.record_revoked",
      resource: "compliance_record",
      resourceId: updated.id,
      metadata: { reason: dto.reason },
    });

    await this.outboxRepo.create({
      tenantId,
      eventType: "compliance.record_revoked",
      aggregateType: "ComplianceRecord",
      aggregateId: updated.id,
      payload: {
        recordId: updated.id,
        requirementCode: updated.requirementCode,
        subjectId: updated.subjectId,
        reason: dto.reason,
      },
    });

    await this.evaluateSubjectCompliance(tenantId, updated.subjectType, updated.subjectId);

    return updated;
  }

  /**
   * Renews a compliance record by submitting a successor record linked to the previous one.
   */
  async renewRecord(
    tenantId: string,
    recordId: string,
    dto: RenewComplianceRecordDto,
    actorId?: string
  ): Promise<ComplianceRecord> {
    const oldRecord = await this.recordRepo.findById(recordId, tenantId);
    if (!oldRecord) {
      throw new RecordNotFoundError("compliance_records", recordId);
    }

    const requirement = await this.requirementRepo.findById(oldRecord.requirementId, tenantId);
    if (!requirement) {
      throw new RecordNotFoundError("compliance_requirements", oldRecord.requirementId);
    }

    const newRecord = await this.recordRepo.create({
      tenantId,
      requirementId: oldRecord.requirementId,
      requirementCode: oldRecord.requirementCode,
      subjectType: oldRecord.subjectType,
      subjectId: oldRecord.subjectId,
      documentReference: dto.documentReference || oldRecord.documentReference,
      fileId: dto.fileId,
      identifierNumber: dto.identifierNumber || oldRecord.identifierNumber,
      validFrom: dto.validFrom,
      expiresAt: dto.expiresAt,
      issuer: dto.issuer || oldRecord.issuer,
      jurisdiction: dto.jurisdiction || oldRecord.jurisdiction,
      notes: dto.notes,
      renewalOfRecordId: oldRecord.id,
      status: "PENDING",
      verificationStatus: requirement.verificationRequired ? "UNVERIFIED" : "VERIFIED",
    });

    await this.recordRepo.addHistory({
      tenantId,
      recordId: oldRecord.id,
      action: "RENEWED",
      newStatus: oldRecord.status,
      newVerificationStatus: oldRecord.verificationStatus,
      actorId,
      reason: `Renewed by new record ${newRecord.id}`,
    });

    await this.outboxRepo.create({
      tenantId,
      eventType: "compliance.record_renewed",
      aggregateType: "ComplianceRecord",
      aggregateId: newRecord.id,
      payload: {
        previousRecordId: oldRecord.id,
        newRecordId: newRecord.id,
        subjectType: newRecord.subjectType,
        subjectId: newRecord.subjectId,
      },
    });

    if (!requirement.verificationRequired) {
      await this.verifyRecord(tenantId, newRecord.id, { verificationMethod: "AUTO_SYSTEM_ACCEPTED" }, actorId);
    }

    return newRecord;
  }

  // --------------------------------------------------------------------------
  // ISSUES & EMERGENCY OVERRIDES
  // --------------------------------------------------------------------------

  async listIssues(tenantId: string, filters?: any): Promise<ComplianceIssue[]> {
    return this.issueRepo.list(tenantId, filters);
  }

  async resolveIssue(
    tenantId: string,
    issueId: string,
    resolutionNotes: string,
    actorId?: string
  ): Promise<ComplianceIssue> {
    const issue = await this.issueRepo.findById(issueId, tenantId);
    if (!issue) {
      throw new RecordNotFoundError("compliance_issues", issueId);
    }

    const updated = await this.issueRepo.update(issueId, tenantId, {
      status: "RESOLVED",
      resolvedAt: this.clock.nowIso(),
      resolutionNotes,
    });

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.issue_resolved",
      resource: "compliance_issue",
      resourceId: issueId,
      metadata: { requirementCode: updated.requirementCode, subjectId: updated.subjectId },
    });

    await this.outboxRepo.create({
      tenantId,
      eventType: "compliance.issue_resolved",
      aggregateType: "ComplianceIssue",
      aggregateId: issueId,
      payload: { issueId, requirementCode: updated.requirementCode, subjectId: updated.subjectId },
    });

    // Check if vehicle unblocking is triggered
    if (updated.subjectType === "VEHICLE") {
      await this.syncVehicleBlockStatus(tenantId, updated.subjectId);
    }

    return updated;
  }

  async createOverride(
    tenantId: string,
    subjectType: any,
    subjectId: string,
    requirementCode: string,
    dto: OverrideComplianceIssueDto,
    actorId: string
  ): Promise<ComplianceOverride> {
    const validUntil = dto.validUntil || new Date(this.clock.now().getTime() + 24 * 3600000).toISOString();

    const override = await this.overrideRepo.create({
      tenantId,
      subjectType,
      subjectId,
      requirementCode,
      operationContext: dto.operationContext,
      approvedBy: actorId,
      reason: dto.reason,
      validUntil,
    });

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.override_approved",
      resource: "compliance_override",
      resourceId: override.id,
      metadata: {
        subjectType,
        subjectId,
        requirementCode,
        operationContext: dto.operationContext,
        reason: dto.reason,
      },
    });

    await this.outboxRepo.create({
      tenantId,
      eventType: "compliance.override_approved",
      aggregateType: "ComplianceOverride",
      aggregateId: override.id,
      payload: {
        overrideId: override.id,
        subjectType,
        subjectId,
        requirementCode,
        operationContext: dto.operationContext,
      },
    });

    return override;
  }

  async listOverrides(tenantId: string): Promise<ComplianceOverride[]> {
    return this.overrideRepo.list(tenantId);
  }

  async deleteOverride(tenantId: string, overrideId: string, actorId?: string): Promise<void> {
    const override = await this.overrideRepo.findById(overrideId, tenantId);
    if (!override) return;

    await this.overrideRepo.delete(overrideId, tenantId);

    await this.auditRepo.create({
      tenantId,
      userId: actorId,
      action: "compliance.override_revoked",
      resource: "compliance_override",
      resourceId: overrideId,
      metadata: { requirementCode: override.requirementCode, subjectId: override.subjectId },
    });
  }

  // --------------------------------------------------------------------------
  // PERIODIC COMPLIANCE SWEEP & VEHICLE BLOCK ORCHESTRATION
  // --------------------------------------------------------------------------

  /**
   * Sweeps compliance for an individual subject (recalculates record statuses,
   * updates issues, and synchronizes fleet availability blocks).
   */
  async evaluateSubjectCompliance(
    tenantId: string,
    subjectType: any,
    subjectId: string
  ): Promise<void> {
    const now = this.clock.now();
    const requirements = await this.requirementRepo.list(tenantId, subjectType, true);
    const records = await this.recordRepo.findBySubject(subjectType, subjectId, tenantId);
    const existingIssues = await this.issueRepo.findBySubject(subjectType, subjectId, tenantId);

    // 1. Recalculate dynamic status for all active records
    for (const record of records) {
      const req = requirements.find((r) => r.code === record.requirementCode || r.id === record.requirementId);
      if (!req) continue;

      const { status: newStatus } = ComplianceStateMachine.recalculateStatus(record, req, now);
      if (newStatus !== record.status) {
        await this.recordRepo.update(record.id, tenantId, { status: newStatus }, record.version);
        record.status = newStatus;
        await this.recordRepo.addHistory({
          tenantId,
          recordId: record.id,
          action: "STATUS_RECALCULATED",
          previousStatus: record.status,
          newStatus,
          previousVerificationStatus: record.verificationStatus,
          newVerificationStatus: record.verificationStatus,
          reason: `Automatic evaluation sweep at ${now.toISOString()}`,
        });
      }
    }

    // 2. Identify issues for mandatory requirements
    for (const req of requirements) {
      const matching = records.filter((r) => r.requirementCode === req.code || r.requirementId === req.id);
      const verified = matching.filter((r) => r.verificationStatus === "VERIFIED");
      const activeVerified = verified.filter((r) => r.status === "VALID" || r.status === "DUE_SOON");

      const existingIssue = existingIssues.find(
        (i) => i.requirementCode === req.code && (i.status === "OPEN" || i.status === "IN_REMEDIATION")
      );

      if (req.mandatory && activeVerified.length === 0) {
        // Missing, expired, or unverified mandatory requirement
        const latest = matching[0];
        let issueType: any = "MISSING";
        let severity: any = "CRITICAL";

        if (latest) {
          if (latest.verificationStatus === "REVOKED") {
            issueType = "REVOKED";
          } else if (latest.verificationStatus === "REJECTED") {
            issueType = "REJECTED";
          } else if (latest.status === "EXPIRED") {
            issueType = "EXPIRED";
          } else {
            issueType = "UNVERIFIED";
            severity = "HIGH";
          }
        }

        if (!existingIssue) {
          await this.issueRepo.create({
            tenantId,
            subjectType,
            subjectId,
            requirementCode: req.code,
            requirementName: req.name,
            issueType,
            severity,
            blockingPolicy: req.blockingPolicy,
            status: "OPEN",
            detectedAt: now.toISOString(),
            notes: `Auto-flagged during evaluation: ${issueType} requirement ${req.name}`,
          });

          await this.outboxRepo.create({
            tenantId,
            eventType: "compliance.issue_opened",
            aggregateType: "ComplianceIssue",
            aggregateId: `${subjectType}-${subjectId}-${req.code}`,
            payload: { subjectType, subjectId, requirementCode: req.code, issueType },
          });
        }
      } else if (existingIssue && activeVerified.length > 0) {
        // Requirement is now verified and valid! Auto-resolve previous issue
        await this.issueRepo.update(existingIssue.id, tenantId, {
          status: "RESOLVED",
          resolvedAt: now.toISOString(),
          resolutionNotes: "Resolved automatically by valid verified document upload/renewal.",
        });

        await this.outboxRepo.create({
          tenantId,
          eventType: "compliance.issue_resolved",
          aggregateType: "ComplianceIssue",
          aggregateId: existingIssue.id,
          payload: { issueId: existingIssue.id, requirementCode: req.code, subjectId },
        });
      }
    }

    // 3. Synchronize vehicle availability blocks if subject is a vehicle
    if (subjectType === "VEHICLE") {
      await this.syncVehicleBlockStatus(tenantId, subjectId);
    }
  }

  /**
   * Synchronizes vehicle block status based on active compliance issues.
   * Ensures multi-blocker coordination: only unblocks when NO other blockers exist!
   */
  private async syncVehicleBlockStatus(tenantId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
    if (!vehicle) return;

    const blockingIssues = await this.issueRepo.findOpenBlockingIssues("VEHICLE", vehicleId, tenantId);
    const activeBlocks = await this.vehicleBlockRepo.findByVehicleId(vehicleId, tenantId);
    const complianceBlocks = activeBlocks.filter(
      (b) => b.status === "ACTIVE" && (b.blockType === "COMPLIANCE" || b.reason?.includes("COMPLIANCE_LOCK"))
    );

    if (blockingIssues.length > 0) {
      // Vehicle must be blocked!
      if (complianceBlocks.length === 0) {
        const topIssue = blockingIssues[0];
        await this.vehicleBlockRepo.create({
          tenantId,
          vehicleId,
          blockType: "COMPLIANCE",
          status: "ACTIVE",
          reason: `COMPLIANCE_LOCK: ${topIssue.requirementName || topIssue.requirementCode} (${topIssue.issueType})`,
          blockedFrom: this.clock.nowIso(),
        });

        if (vehicle.availabilityStatus !== "BLOCKED" && vehicle.availabilityStatus !== "MAINTENANCE") {
          await this.vehicleRepo.update(vehicleId, tenantId, {
            availabilityStatus: "BLOCKED",
          });
        }

        await this.outboxRepo.create({
          tenantId,
          eventType: "compliance.vehicle_blocked",
          aggregateType: "Vehicle",
          aggregateId: vehicleId,
          payload: { vehicleId, reason: topIssue.requirementCode },
        });
      }
    } else {
      // No active compliance blockers!
      // Release any active compliance blocks
      for (const block of complianceBlocks) {
        await this.vehicleBlockRepo.update(block.id, tenantId, {
          status: "RELEASED",
          releasedAt: this.clock.nowIso(),
        });
      }

      // Check if ANY other active blocks remain (e.g. MAINTENANCE, DAMAGE, ADMINISTRATIVE)
      const remainingBlocks = await this.vehicleBlockRepo.findByVehicleId(vehicleId, tenantId);
      const otherActiveBlocks = remainingBlocks.filter(
        (b) => b.status === "ACTIVE" && b.id !== complianceBlocks[0]?.id
      );

      // Only restore to AVAILABLE if vehicle was BLOCKED and has NO other active blocks
      if (otherActiveBlocks.length === 0 && vehicle.availabilityStatus === "BLOCKED") {
        await this.vehicleRepo.update(vehicleId, tenantId, {
          availabilityStatus: "AVAILABLE",
        });

        await this.outboxRepo.create({
          tenantId,
          eventType: "compliance.vehicle_restored",
          aggregateType: "Vehicle",
          aggregateId: vehicleId,
          payload: { vehicleId },
        });
      }
    }
  }

  /**
   * Sweeps all vehicles and drivers for the tenant.
   */
  async evaluateTenantCompliance(tenantId: string): Promise<{ vehiclesEvaluated: number; driversEvaluated: number }> {
    const vRes = (this.vehicleRepo as any).findAll
      ? await (this.vehicleRepo as any).findAll(tenantId)
      : { vehicles: await (this.vehicleRepo as any).list(tenantId) };
    const vehicles: any[] = vRes.vehicles || (Array.isArray(vRes) ? vRes : []);

    for (const v of vehicles) {
      await this.evaluateSubjectCompliance(tenantId, "VEHICLE", v.id);
    }

    const dRes = (this.driverRepo as any).findAll
      ? await (this.driverRepo as any).findAll(tenantId)
      : { drivers: await (this.driverRepo as any).list(tenantId) };
    const drivers: any[] = dRes.drivers || (Array.isArray(dRes) ? dRes : []);

    for (const d of drivers) {
      await this.evaluateSubjectCompliance(tenantId, "DRIVER", d.id);
    }

    return {
      vehiclesEvaluated: vehicles.length,
      driversEvaluated: drivers.length,
    };
  }
}
