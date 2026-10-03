// ============================================================================
// CAR HIRE OS — INSPECTION & DAMAGE APPLICATION SERVICE (DOM-003 §21-22, DEV-004, DEV-007)
// Bounded Context: Vehicle Inspection Audits, Condition Checklists, Damage Cases & Evidence
// ============================================================================

import type {
  Inspection,
  InspectionTemplate,
  InspectionResponse,
  DamageObservation,
  EvidenceRecord,
  InspectionAcknowledgement,
  InspectionCorrection,
  InspectionComparison,
  InspectionReadinessResult,
  DamageCase,
  CreateInspectionDto,
  StartInspectionDto,
  RecordInspectionResponsesDto,
  RecordDamageObservationDto,
  AddInspectionEvidenceDto,
  CompleteInspectionDto,
  VoidInspectionDto,
  CorrectInspectionDto,
  AcknowledgeInspectionDto,
  CreateInspectionTemplateDto,
  CreateDamageCaseDto,
  UpdateDamageCaseDto,
  InspectionListQueryDto,
  DamageCaseListQueryDto,
} from "@carhire/types";
import {
  IInspectionRepository,
  IDamageRepository,
  IInspectionTemplateRepository,
  IVehicleRepository,
  IBookingRepository,
  IRentalRepository,
  IAuditRepository,
  IOutboxRepository,
  IIdempotencyRepository,
  InspectionNotFoundError,
  DamageCaseNotFoundError,
  InspectionTemplateNotFoundError,
  InspectionAlreadyCompletedError,
  InspectionVoidedError,
  InspectionOdometerRegressionError,
  InspectionInvalidFuelLevelError,
  InspectionMissingRequiredResponsesError,
  InspectionMissingRequiredEvidenceError,
  VehicleNotFoundError,
} from "@carhire/database";
import { InspectionStateMachine } from "../domain/inspection-state-machine";
import { InspectionComparisonEngine } from "../domain/inspection-comparison";

export interface ActorContext {
  userId?: string;
  membershipId?: string;
  actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
  ipAddress?: string;
  userAgent?: string;
}

function toAuditActorType(
  actorType?: string
): "USER" | "SYSTEM" | "SUPPORT" | "API_KEY" | "ANONYMOUS" | "PLATFORM_STAFF" {
  if (actorType === "SYSTEM" || actorType === "PLATFORM_STAFF" || actorType === "SUPPORT" || actorType === "API_KEY" || actorType === "ANONYMOUS") {
    return actorType;
  }
  return "USER";
}

export class InspectionService {
  constructor(
    private readonly inspectionRepo: IInspectionRepository,
    private readonly damageRepo: IDamageRepository,
    private readonly templateRepo: IInspectionTemplateRepository,
    private readonly vehicleRepo: IVehicleRepository,
    private readonly bookingRepo: IBookingRepository,
    private readonly rentalRepo: IRentalRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly outboxRepo: IOutboxRepository,
    private readonly idempotencyRepo: IIdempotencyRepository
  ) {}

  // --------------------------------------------------------------------------
  // TEMPLATES
  // --------------------------------------------------------------------------

  async listTemplates(tenantId: string): Promise<InspectionTemplate[]> {
    return this.templateRepo.listTemplates(tenantId);
  }

  async getTemplate(tenantId: string, idOrCode: string): Promise<InspectionTemplate> {
    let template = await this.templateRepo.findById(idOrCode, tenantId);
    if (!template) {
      template = await this.templateRepo.findByCode(idOrCode, tenantId);
    }
    if (!template) {
      throw new InspectionTemplateNotFoundError(idOrCode);
    }
    return template;
  }

  async createTemplate(
    tenantId: string,
    dto: CreateInspectionTemplateDto
  ): Promise<InspectionTemplate> {
    return this.templateRepo.create(tenantId, dto);
  }

  // --------------------------------------------------------------------------
  // INSPECTIONS LIFECYCLE
  // --------------------------------------------------------------------------

  async createInspection(
    tenantId: string,
    dto: CreateInspectionDto,
    actor: ActorContext
  ): Promise<Inspection> {
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (cached?.responseBody) return cached.responseBody as unknown as Inspection;
    }

    const vehicle = await this.vehicleRepo.findById(dto.vehicleId, tenantId);
    if (!vehicle) {
      throw new VehicleNotFoundError(dto.vehicleId);
    }

    // Resolve template
    let template: InspectionTemplate | null = null;
    if (dto.templateId) {
      template = await this.templateRepo.findById(dto.templateId, tenantId);
      if (!template) {
        template = await this.templateRepo.findByCode(dto.templateId, tenantId);
      }
    }
    if (!template) {
      template = await this.templateRepo.findDefault(tenantId);
    }

    // Use vehicle's current odometer/fuel if not specified in DTO
    const odometer = dto.odometer !== undefined ? dto.odometer : (vehicle.odometer || 0);
    const fuelLevel = dto.fuelLevel !== undefined ? dto.fuelLevel : (vehicle.fuelLevel ?? 100);

    const inspection = await this.inspectionRepo.create(tenantId, {
      ...dto,
      odometer,
      fuelLevel,
      templateId: template?.id || "STANDARD_15_POINT",
      templateVersion: template?.version || 1,
      performedByMembershipId: actor.membershipId || "mbr_system",
      actorUserId: actor.userId,
      actorType: actor.actorType || "USER",
    });

    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "INSPECTION",
        resourceId: inspection.id,
        responseStatus: 200,
        responseBody: inspection as unknown as Record<string, unknown>,
      });
    }

    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor.actorType),
      actorId: actor.userId || "usr_system",
      action: "INSPECTION_CREATED",
      resourceType: "INSPECTION",
      resourceId: inspection.id,
      metadata: { vehicleId: vehicle.id, inspectionNumber: inspection.inspectionNumber },
    });

    await this.outboxRepo.record({
      eventType: "inspection.created",
      aggregateType: "INSPECTION",
      aggregateId: inspection.id,
      tenantId,
      payload: {
        inspectionId: inspection.id,
        inspectionNumber: inspection.inspectionNumber,
        inspectionType: inspection.inspectionType,
        vehicleId: vehicle.id,
        bookingId: inspection.bookingId,
        rentalId: inspection.rentalId,
      },
    });

    return inspection;
  }

  async startInspection(
    tenantId: string,
    id: string,
    dto: StartInspectionDto = {},
    actor: ActorContext
  ): Promise<Inspection> {
    const inspection = await this.inspectionRepo.findById(id, tenantId);
    if (!inspection) throw new InspectionNotFoundError(id);

    if (inspection.status !== "DRAFT") {
      return inspection; // Already started
    }

    InspectionStateMachine.assertCanTransition("DRAFT", "IN_PROGRESS");

    const startedAt = dto.startedAt || new Date().toISOString();
    const updated = await this.inspectionRepo.update(
      id,
      tenantId,
      {
        status: "IN_PROGRESS",
        startedAt,
      },
      dto.expectedVersion
    );

    await this.inspectionRepo.appendStatusHistory(tenantId, {
      inspectionId: id,
      tenantId,
      fromStatus: "DRAFT",
      toStatus: "IN_PROGRESS",
      actorType: actor.actorType || "USER",
      actorId: actor.userId,
      reason: "Inspector began digital vehicle walkaround audit",
      occurredAt: startedAt,
    });

    return updated;
  }

  async recordResponses(
    tenantId: string,
    id: string,
    dto: RecordInspectionResponsesDto,
    _actor: ActorContext
  ): Promise<Inspection> {
    return this.inspectionRepo.recordResponses(id, tenantId, dto);
  }

  async recordDamageObservation(
    tenantId: string,
    id: string,
    dto: RecordDamageObservationDto,
    actor: ActorContext
  ): Promise<DamageObservation> {
    const inspection = await this.inspectionRepo.findById(id, tenantId);
    if (!inspection) throw new InspectionNotFoundError(id);

    const observation = await this.inspectionRepo.recordDamageObservation(id, tenantId, dto);

    // Auto-create DamageCase if newly observed during rental or major/critical
    let damageCase: DamageCase | null = null;
    const sev = String(dto.severity).toUpperCase();
    if (!dto.preExisting || sev === "MAJOR" || sev === "CRITICAL" || sev === "SEVERE") {
      damageCase = await this.damageRepo.create(tenantId, {
        vehicleId: inspection.vehicleId,
        inspectionId: id,
        rentalId: inspection.rentalId || undefined,
        bookingId: inspection.bookingId || undefined,
        damageType: dto.damageType,
        severity: dto.severity,
        bodyZone: dto.bodyZone,
        description: dto.description,
        estimatedRepairCost: dto.estimatedCost || 0,
        preExisting: dto.preExisting ?? false,
        responsibleParty: dto.preExisting ? "OPERATOR" : "CUSTOMER",
        actorUserId: actor.userId,
        actorType: actor.actorType || "USER",
      });
      observation.damageCaseId = damageCase.id;
    }

    await this.outboxRepo.record({
      eventType: "damage.observed",
      aggregateType: "INSPECTION",
      aggregateId: id,
      tenantId,
      payload: {
        inspectionId: id,
        observationId: observation.id,
        damageCaseId: damageCase?.id || null,
        bodyZone: dto.bodyZone,
        damageType: dto.damageType,
        severity: dto.severity,
      },
    });

    return observation;
  }

  async addEvidence(
    tenantId: string,
    id: string,
    dto: AddInspectionEvidenceDto,
    _actor: ActorContext
  ): Promise<EvidenceRecord> {
    return this.inspectionRepo.addEvidence(id, tenantId, dto);
  }

  async addAcknowledgement(
    tenantId: string,
    id: string,
    dto: AcknowledgeInspectionDto,
    _actor: ActorContext
  ): Promise<InspectionAcknowledgement> {
    return this.inspectionRepo.addAcknowledgement(id, tenantId, dto);
  }

  async checkReadiness(tenantId: string, id: string): Promise<InspectionReadinessResult> {
    const inspection = await this.inspectionRepo.findById(id, tenantId);
    if (!inspection) throw new InspectionNotFoundError(id);

    const template = await this.templateRepo.findById(inspection.templateId, tenantId) ||
      await this.templateRepo.findByCode(inspection.templateId, tenantId) ||
      await this.templateRepo.findDefault(tenantId);

    const vehicle = await this.vehicleRepo.findById(inspection.vehicleId, tenantId);

    const blockers: string[] = [];
    const warnings: string[] = [];

    // Odometer validation
    let isOdometerValid = true;
    if (inspection.odometer < 0) {
      blockers.push("Odometer reading cannot be negative");
      isOdometerValid = false;
    }
    if (vehicle && inspection.odometer < (vehicle.odometer || 0)) {
      blockers.push(
        `Inspection odometer (${inspection.odometer} km) is lower than vehicle's registered baseline (${vehicle.odometer} km)`
      );
      isOdometerValid = false;
    }

    // Fuel level validation
    let isFuelLevelValid = true;
    if (inspection.fuelLevel < 0 || inspection.fuelLevel > 100) {
      blockers.push(`Fuel level (${inspection.fuelLevel}%) must be between 0% and 100%`);
      isFuelLevelValid = false;
    }

    // Checklist responses
    const allRequiredItems = template?.sections.flatMap((s) => s.items.filter((i) => i.required)) || [];
    const answeredCodes = new Set(inspection.responses.map((r) => r.itemCode));
    const missingRequired = allRequiredItems.filter((i) => !answeredCodes.has(i.code));

    if (missingRequired.length > 0) {
      blockers.push(
        `Mandatory checklist items remaining: ${missingRequired.map((i) => i.label).join(", ")}`
      );
    }

    // Evidence checks for items requiring evidence
    const evidenceRequiredItems = template?.sections.flatMap((s) => s.items.filter((i) => i.requiresEvidence)) || [];
    for (const reqItem of evidenceRequiredItems) {
      const resp = inspection.responses.find((r) => r.itemCode === reqItem.code);
      if (resp && (!resp.evidenceIds || resp.evidenceIds.length === 0)) {
        blockers.push(`Checklist item '${reqItem.label}' requires at least one photographic evidence record`);
      }
    }

    if (inspection.damageObservations.length > 0 && inspection.evidence.length === 0) {
      warnings.push("Damage observations recorded without photographic evidence attachments");
    }

    if (inspection.acknowledgements.length === 0) {
      warnings.push("Inspection not yet acknowledged by customer or inspector signature");
    }

    return {
      isReady: blockers.length === 0,
      blockers,
      warnings,
      answeredItemsCount: inspection.responses.length,
      requiredItemsCount: allRequiredItems.length,
      evidenceItemsCount: inspection.evidence.length,
      damageObservationsCount: inspection.damageObservations.length,
      isOdometerValid,
      isFuelLevelValid,
    };
  }

  async completeInspection(
    tenantId: string,
    id: string,
    dto: CompleteInspectionDto,
    actor: ActorContext
  ): Promise<Inspection> {
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (cached?.responseBody) return cached.responseBody as unknown as Inspection;
    }

    const inspection = await this.inspectionRepo.findById(id, tenantId);
    if (!inspection) throw new InspectionNotFoundError(id);

    if (inspection.status === "COMPLETED") {
      return inspection; // Already sealed
    }
    if (inspection.status === "VOIDED") {
      throw new InspectionVoidedError(id);
    }

    InspectionStateMachine.assertCanTransition(inspection.status, "COMPLETED");

    // Validate odometer & fuel
    if (dto.fuelLevel < 0 || dto.fuelLevel > 100) {
      throw new InspectionInvalidFuelLevelError(dto.fuelLevel);
    }

    const vehicle = await this.vehicleRepo.findById(inspection.vehicleId, tenantId);
    if (vehicle && dto.odometer < (vehicle.odometer || 0)) {
      throw new InspectionOdometerRegressionError(dto.odometer, vehicle.odometer);
    }

    const now = new Date().toISOString();

    const completed = await this.inspectionRepo.update(
      id,
      tenantId,
      {
        status: "COMPLETED",
        odometer: dto.odometer,
        fuelLevel: dto.fuelLevel,
        overallCondition: dto.overallCondition || inspection.overallCondition,
        notes: dto.notes !== undefined ? dto.notes : inspection.notes,
        completedAt: now,
      },
      dto.expectedVersion
    );

    // Update vehicle odometer and fuel
    if (vehicle) {
      await this.vehicleRepo.update(
        vehicle.id,
        tenantId,
        {
          odometer: dto.odometer,
          fuelLevel: dto.fuelLevel,
        }
      );
    }

    await this.inspectionRepo.appendStatusHistory(tenantId, {
      inspectionId: id,
      tenantId,
      fromStatus: inspection.status,
      toStatus: "COMPLETED",
      actorType: actor.actorType || "USER",
      actorId: actor.userId,
      reason: "Inspection audit sealed and locked as immutable record",
      occurredAt: now,
    });

    // If this is a return inspection, auto-run comparison if baseline inspection exists
    if (inspection.inspectionType === "RETURN" && inspection.rentalId) {
      const priorInspections = await this.inspectionRepo.findByRentalId(inspection.rentalId, tenantId);
      const baseline = priorInspections.find(
        (i) => i.inspectionType === "PRE_RENTAL" && i.status === "COMPLETED"
      );
      if (baseline) {
        const comparison = InspectionComparisonEngine.compare(baseline, completed, actor.membershipId);
        await this.inspectionRepo.saveComparison(tenantId, comparison);
      }
    }

    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "INSPECTION",
        resourceId: completed.id,
        responseStatus: 200,
        responseBody: completed as unknown as Record<string, unknown>,
      });
    }

    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor.actorType),
      actorId: actor.userId || "usr_system",
      action: "INSPECTION_COMPLETED",
      resourceType: "INSPECTION",
      resourceId: completed.id,
      metadata: {
        odometer: completed.odometer,
        fuelLevel: completed.fuelLevel,
        damagesCount: completed.damageObservations.length,
      },
    });

    await this.outboxRepo.record({
      eventType: "inspection.completed",
      aggregateType: "INSPECTION",
      aggregateId: completed.id,
      tenantId,
      payload: {
        inspectionId: completed.id,
        inspectionNumber: completed.inspectionNumber,
        inspectionType: completed.inspectionType,
        vehicleId: completed.vehicleId,
        rentalId: completed.rentalId,
        odometer: completed.odometer,
        fuelLevel: completed.fuelLevel,
        damageCount: completed.damageObservations.length,
      },
    });

    return completed;
  }

  async voidInspection(
    tenantId: string,
    id: string,
    dto: VoidInspectionDto,
    actor: ActorContext
  ): Promise<Inspection> {
    const inspection = await this.inspectionRepo.findById(id, tenantId);
    if (!inspection) throw new InspectionNotFoundError(id);

    if (inspection.status === "VOIDED") return inspection;

    InspectionStateMachine.assertCanTransition(inspection.status, "VOIDED");

    const now = new Date().toISOString();
    const updated = await this.inspectionRepo.update(
      id,
      tenantId,
      {
        status: "VOIDED",
        voidedAt: now,
        voidReason: dto.voidReason,
      },
      dto.expectedVersion
    );

    await this.inspectionRepo.appendStatusHistory(tenantId, {
      inspectionId: id,
      tenantId,
      fromStatus: inspection.status,
      toStatus: "VOIDED",
      actorType: actor.actorType || "USER",
      actorId: actor.userId,
      reason: dto.voidReason,
      occurredAt: now,
    });

    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor.actorType),
      actorId: actor.userId || "usr_system",
      action: "INSPECTION_VOIDED",
      resourceType: "INSPECTION",
      resourceId: id,
      metadata: { voidReason: dto.voidReason },
    });

    return updated;
  }

  async correctInspection(
    tenantId: string,
    id: string,
    dto: CorrectInspectionDto,
    actor: ActorContext
  ): Promise<InspectionCorrection> {
    const inspection = await this.inspectionRepo.findById(id, tenantId);
    if (!inspection) throw new InspectionNotFoundError(id);

    const correction = await this.inspectionRepo.addCorrection(id, tenantId, {
      ...dto,
      correctedByMembershipId: actor.membershipId || "mbr_system",
    });

    // If odometer updated, keep vehicle in sync
    if (dto.correctedFields.odometer !== undefined) {
      await this.vehicleRepo.update(inspection.vehicleId, tenantId, {
        odometer: dto.correctedFields.odometer,
      });
    }

    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor.actorType),
      actorId: actor.userId || "usr_system",
      action: "INSPECTION_CORRECTED",
      resourceType: "INSPECTION",
      resourceId: id,
      metadata: { correctedFields: dto.correctedFields, correctionReason: dto.correctionReason },
    });

    return correction;
  }

  async compareInspections(
    tenantId: string,
    baselineId: string,
    returnId: string,
    actor: ActorContext
  ): Promise<InspectionComparison> {
    const baseline = await this.inspectionRepo.findById(baselineId, tenantId);
    if (!baseline) throw new InspectionNotFoundError(baselineId);

    const returned = await this.inspectionRepo.findById(returnId, tenantId);
    if (!returned) throw new InspectionNotFoundError(returnId);

    const comparison = InspectionComparisonEngine.compare(baseline, returned, actor.membershipId);
    await this.inspectionRepo.saveComparison(tenantId, comparison);
    return comparison;
  }

  async getComparisonByRental(
    tenantId: string,
    rentalId: string
  ): Promise<InspectionComparison | null> {
    return this.inspectionRepo.getComparisonByRental(rentalId, tenantId);
  }

  async getInspection(tenantId: string, id: string): Promise<Inspection> {
    const inspection = await this.inspectionRepo.findById(id, tenantId);
    if (!inspection) throw new InspectionNotFoundError(id);
    return inspection;
  }

  async listInspections(
    tenantId: string,
    query: InspectionListQueryDto = {}
  ): Promise<{ items: Inspection[]; total: number }> {
    return this.inspectionRepo.findMany(tenantId, query);
  }

  // --------------------------------------------------------------------------
  // DAMAGE CASES
  // --------------------------------------------------------------------------

  async listDamageCases(
    tenantId: string,
    query: DamageCaseListQueryDto = {}
  ): Promise<{ items: DamageCase[]; total: number }> {
    return this.damageRepo.findMany(tenantId, query);
  }

  async getDamageCase(tenantId: string, id: string): Promise<DamageCase> {
    const damageCase = await this.damageRepo.findById(id, tenantId);
    if (!damageCase) throw new DamageCaseNotFoundError(id);
    return damageCase;
  }

  async createDamageCase(
    tenantId: string,
    dto: CreateDamageCaseDto,
    actor: ActorContext
  ): Promise<DamageCase> {
    return this.damageRepo.create(tenantId, {
      ...dto,
      actorUserId: actor.userId,
      actorType: actor.actorType || "USER",
    });
  }

  async updateDamageCase(
    tenantId: string,
    id: string,
    dto: UpdateDamageCaseDto,
    actor: ActorContext
  ): Promise<DamageCase> {
    return this.damageRepo.update(
      id,
      tenantId,
      {
        ...dto,
        actorUserId: actor.userId,
        actorType: actor.actorType || "USER",
      },
      dto.expectedVersion
    );
  }
}
