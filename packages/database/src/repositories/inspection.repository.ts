import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — INSPECTION PERSISTENCE REPOSITORY (DOM-003 §21, DEV-004)
// Bounded Context: Vehicle Inspection Audits, Condition Checklists & Evidence
// ============================================================================

import type {
  Inspection,
  InspectionType,
  InspectionStatus,
  InspectionResponse,
  DamageObservation,
  EvidenceRecord,
  InspectionAcknowledgement,
  InspectionStatusHistory,
  InspectionCorrection,
  InspectionComparison,
  InspectionListQueryDto,
  CreateInspectionDto,
  RecordInspectionResponsesDto,
  RecordDamageObservationDto,
  AddInspectionEvidenceDto,
  CompleteInspectionDto,
  AcknowledgeInspectionDto,
  CorrectInspectionDto,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  InspectionNotFoundError,
  CrossTenantViolationError,
  InspectionAlreadyCompletedError,
  InspectionVoidedError,
  InspectionInvalidStateTransitionError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IInspectionRepository {
  create(
    tenantId: string,
    data: CreateInspectionDto & {
      inspectionNumber?: string;
      performedByMembershipId: string;
      templateVersion?: number;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    tx?: TransactionContext
  ): Promise<Inspection>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Inspection | null>;

  findByInspectionNumber(
    inspectionNumber: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Inspection | null>;

  findByVehicleId(
    vehicleId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Inspection[]>;

  findByRentalId(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Inspection[]>;

  findByBookingId(
    bookingId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Inspection[]>;

  findLatestCompletedForVehicle(
    vehicleId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Inspection | null>;

  findMany(
    tenantId: string,
    query?: InspectionListQueryDto,
    tx?: TransactionContext
  ): Promise<{ items: Inspection[]; total: number }>;

  update(
    id: string,
    tenantId: string,
    data: Partial<Inspection>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<Inspection>;

  recordResponses(
    id: string,
    tenantId: string,
    dto: RecordInspectionResponsesDto,
    tx?: TransactionContext
  ): Promise<Inspection>;

  recordDamageObservation(
    id: string,
    tenantId: string,
    dto: RecordDamageObservationDto,
    tx?: TransactionContext
  ): Promise<DamageObservation>;

  addEvidence(
    id: string,
    tenantId: string,
    dto: AddInspectionEvidenceDto,
    tx?: TransactionContext
  ): Promise<EvidenceRecord>;

  addAcknowledgement(
    id: string,
    tenantId: string,
    dto: AcknowledgeInspectionDto,
    tx?: TransactionContext
  ): Promise<InspectionAcknowledgement>;

  addCorrection(
    id: string,
    tenantId: string,
    dto: CorrectInspectionDto & { correctedByMembershipId: string },
    tx?: TransactionContext
  ): Promise<InspectionCorrection>;

  appendStatusHistory(
    tenantId: string,
    entry: Omit<InspectionStatusHistory, "id">,
    tx?: TransactionContext
  ): Promise<InspectionStatusHistory>;

  getStatusHistory(
    inspectionId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<InspectionStatusHistory[]>;

  saveComparison(
    tenantId: string,
    comparison: InspectionComparison,
    tx?: TransactionContext
  ): Promise<InspectionComparison>;

  getComparisonByRental(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<InspectionComparison | null>;

  generateNextInspectionNumber(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<string>;
}

export class InspectionRepository implements IInspectionRepository {
  private static inspectionStore = createRecordStore<string, Inspection>("inspection.repository:inspectionStore");
  private static statusHistoryStore = createRecordStore<string, InspectionStatusHistory[]>("inspection.repository:statusHistoryStore");
  private static correctionStore = createRecordStore<string, InspectionCorrection[]>("inspection.repository:correctionStore");
  private static comparisonStore = createRecordStore<string, InspectionComparison[]>("inspection.repository:comparisonStore");
  private static sequenceStore = createRecordStore<string, number>("inspection.repository:sequenceStore");

  static clear(): void {
    InspectionRepository.inspectionStore.clear();
    InspectionRepository.statusHistoryStore.clear();
    InspectionRepository.correctionStore.clear();
    InspectionRepository.comparisonStore.clear();
    InspectionRepository.sequenceStore.clear();
  }

  async generateNextInspectionNumber(
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<string> {
    const current = InspectionRepository.sequenceStore.get(tenantId) || 1000;
    const next = current + 1;
    InspectionRepository.sequenceStore.set(tenantId, next);
    return `INS-${next}`;
  }

  async create(
    tenantId: string,
    data: CreateInspectionDto & {
      inspectionNumber?: string;
      performedByMembershipId: string;
      templateVersion?: number;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    _tx?: TransactionContext
  ): Promise<Inspection> {
    const id = `ins_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const inspectionNumber = data.inspectionNumber || (await this.generateNextInspectionNumber(tenantId));
    const now = new Date().toISOString();

    const inspection: Inspection = {
      id,
      tenantId,
      inspectionNumber,
      inspectionType: data.inspectionType,
      status: "DRAFT",
      vehicleId: data.vehicleId,
      bookingId: data.bookingId || null,
      rentalId: data.rentalId || null,
      handoverId: data.handoverId || null,
      performedByMembershipId: data.performedByMembershipId,
      customerId: data.customerId || null,
      driverId: data.driverId || null,
      templateId: data.templateId || "STANDARD_15_POINT",
      templateVersion: data.templateVersion || 1,
      startedAt: null,
      completedAt: null,
      voidedAt: null,
      voidReason: null,
      odometer: data.odometer ?? 0,
      fuelLevel: data.fuelLevel ?? 100,
      overallCondition: data.overallCondition || "EXCELLENT",
      notes: data.notes || null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      responses: [],
      damageObservations: [],
      evidence: [],
      acknowledgements: [],
      statusHistory: [],
      corrections: [],
    };

    InspectionRepository.inspectionStore.set(id, inspection);

    await this.appendStatusHistory(tenantId, {
      inspectionId: id,
      tenantId,
      fromStatus: "DRAFT",
      toStatus: "DRAFT",
      actorType: data.actorType || "USER",
      actorId: data.actorUserId,
      reason: "Draft inspection initialized",
      occurredAt: now,
    });

    return inspection;
  }

  async findById(
    id: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Inspection | null> {
    const record = InspectionRepository.inspectionStore.get(id);
    if (!record) return null;
    if (record.tenantId !== tenantId) {
      throw new CrossTenantViolationError(record.tenantId, tenantId);
    }
    const history = InspectionRepository.statusHistoryStore.get(id) || [];
    const corrections = InspectionRepository.correctionStore.get(id) || [];
    return { ...record, statusHistory: history, corrections };
  }

  async findByInspectionNumber(
    inspectionNumber: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Inspection | null> {
    for (const record of InspectionRepository.inspectionStore.values()) {
      if (record.tenantId === tenantId && record.inspectionNumber === inspectionNumber) {
        const history = InspectionRepository.statusHistoryStore.get(record.id) || [];
        const corrections = InspectionRepository.correctionStore.get(record.id) || [];
        return { ...record, statusHistory: history, corrections };
      }
    }
    return null;
  }

  async findByVehicleId(
    vehicleId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Inspection[]> {
    return Array.from(InspectionRepository.inspectionStore.values()).filter(
      (r) => r.tenantId === tenantId && r.vehicleId === vehicleId
    );
  }

  async findByRentalId(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Inspection[]> {
    return Array.from(InspectionRepository.inspectionStore.values()).filter(
      (r) => r.tenantId === tenantId && r.rentalId === rentalId
    );
  }

  async findByBookingId(
    bookingId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Inspection[]> {
    return Array.from(InspectionRepository.inspectionStore.values()).filter(
      (r) => r.tenantId === tenantId && r.bookingId === bookingId
    );
  }

  async findLatestCompletedForVehicle(
    vehicleId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Inspection | null> {
    const completed = Array.from(InspectionRepository.inspectionStore.values())
      .filter((r) => r.tenantId === tenantId && r.vehicleId === vehicleId && r.status === "COMPLETED")
      .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());

    return completed.length > 0 ? completed[0] : null;
  }

  async findMany(
    tenantId: string,
    query: InspectionListQueryDto = {},
    _tx?: TransactionContext
  ): Promise<{ items: Inspection[]; total: number }> {
    let items = Array.from(InspectionRepository.inspectionStore.values()).filter(
      (r) => r.tenantId === tenantId
    );

    if (query.status) {
      items = items.filter((r) => r.status === query.status);
    }
    if (query.inspectionType) {
      items = items.filter((r) => r.inspectionType === query.inspectionType);
    }
    if (query.vehicleId) {
      items = items.filter((r) => r.vehicleId === query.vehicleId);
    }
    if (query.rentalId) {
      items = items.filter((r) => r.rentalId === query.rentalId);
    }
    if (query.bookingId) {
      items = items.filter((r) => r.bookingId === query.bookingId);
    }
    if (query.search) {
      const s = query.search.toLowerCase();
      items = items.filter(
        (r) =>
          r.inspectionNumber.toLowerCase().includes(s) ||
          (r.notes && r.notes.toLowerCase().includes(s))
      );
    }

    // Sort descending by creation date
    items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = items.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Inspection>,
    expectedVersion?: number,
    _tx?: TransactionContext
  ): Promise<Inspection> {
    const existing = InspectionRepository.inspectionStore.get(id);
    if (!existing) {
      throw new InspectionNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic lock failure on inspection '${id}': expected version ${expectedVersion}, found ${existing.version}.`
      );
    }

    const updated: Inspection = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };

    InspectionRepository.inspectionStore.set(id, updated);
    return updated;
  }

  async recordResponses(
    id: string,
    tenantId: string,
    dto: RecordInspectionResponsesDto,
    _tx?: TransactionContext
  ): Promise<Inspection> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new InspectionNotFoundError(id);
    if (existing.status === "COMPLETED") throw new InspectionAlreadyCompletedError(id);
    if (existing.status === "VOIDED") throw new InspectionVoidedError(id);
    if (dto.expectedVersion !== undefined && existing.version !== dto.expectedVersion) {
      throw new ConcurrencyConflictError(`Version conflict on inspection ${id}`);
    }

    const now = new Date().toISOString();
    const currentResponses = [...existing.responses];

    for (const item of dto.responses) {
      const idx = currentResponses.findIndex(
        (r) =>
          (item.templateItemId && r.templateItemId === item.templateItemId) ||
          (item.itemCode && r.itemCode === item.itemCode)
      );
      const newResponse: InspectionResponse = {
        id: idx >= 0 ? currentResponses[idx].id : `resp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        inspectionId: id,
        templateItemId: item.templateItemId || item.itemCode,
        itemCode: item.itemCode,
        responseValue: item.responseValue,
        condition: item.condition,
        notes: item.notes,
        evidenceIds: item.evidenceIds || [],
        createdAt: now,
      };

      if (idx >= 0) {
        currentResponses[idx] = newResponse;
      } else {
        currentResponses.push(newResponse);
      }
    }

    const updated: Inspection = {
      ...existing,
      status: existing.status === "DRAFT" ? "IN_PROGRESS" : existing.status,
      responses: currentResponses,
      updatedAt: now,
      version: existing.version + 1,
    };

    InspectionRepository.inspectionStore.set(id, updated);
    return updated;
  }

  async recordDamageObservation(
    id: string,
    tenantId: string,
    dto: RecordDamageObservationDto,
    _tx?: TransactionContext
  ): Promise<DamageObservation> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new InspectionNotFoundError(id);
    if (existing.status === "COMPLETED") throw new InspectionAlreadyCompletedError(id);
    if (existing.status === "VOIDED") throw new InspectionVoidedError(id);

    const now = new Date().toISOString();
    const obsId = `obs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const observation: DamageObservation = {
      id: obsId,
      tenantId,
      inspectionId: id,
      damageCaseId: null,
      bodyZone: dto.bodyZone,
      damageType: dto.damageType,
      severity: dto.severity,
      description: dto.description,
      preExisting: dto.preExisting ?? false,
      attribution: dto.attribution || (dto.preExisting ? "PRE_EXISTING" : "RENTAL_PERIOD_OBSERVED"),
      estimatedCost: dto.estimatedCost || 0,
      photoUrls: dto.photoUrls || [],
      evidenceIds: dto.evidenceIds || [],
      observedAt: now,
      createdAt: now,
    };

    const updated: Inspection = {
      ...existing,
      damageObservations: [...existing.damageObservations, observation],
      updatedAt: now,
      version: existing.version + 1,
    };

    InspectionRepository.inspectionStore.set(id, updated);
    return observation;
  }

  async addEvidence(
    id: string,
    tenantId: string,
    dto: AddInspectionEvidenceDto,
    _tx?: TransactionContext
  ): Promise<EvidenceRecord> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new InspectionNotFoundError(id);
    if (existing.status === "COMPLETED") throw new InspectionAlreadyCompletedError(id);
    if (existing.status === "VOIDED") throw new InspectionVoidedError(id);

    const now = new Date().toISOString();
    const evidenceId = `evi_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const evidence: EvidenceRecord = {
      id: evidenceId,
      tenantId,
      inspectionId: id,
      damageObservationId: dto.damageObservationId || null,
      fileId: dto.fileId,
      evidenceType: dto.evidenceType,
      url: dto.url,
      storageReference: dto.storageReference,
      checksumSha256: dto.checksumSha256,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      capturedAt: now,
      source: dto.source || "WEB_PORTAL",
      metadata: dto.metadata,
      createdAt: now,
    };

    const updated: Inspection = {
      ...existing,
      evidence: [...existing.evidence, evidence],
      updatedAt: now,
      version: existing.version + 1,
    };

    InspectionRepository.inspectionStore.set(id, updated);
    return evidence;
  }

  async addAcknowledgement(
    id: string,
    tenantId: string,
    dto: AcknowledgeInspectionDto,
    _tx?: TransactionContext
  ): Promise<InspectionAcknowledgement> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new InspectionNotFoundError(id);

    const now = new Date().toISOString();
    const ackId = `ack_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const ack: InspectionAcknowledgement = {
      id: ackId,
      inspectionId: id,
      inspectionVersion: existing.version,
      signerType: dto.signerType,
      signerId: dto.signerId,
      signerName: dto.signerName,
      signatureMethod: dto.signatureMethod,
      signatureReference: dto.signatureReference,
      acknowledgedAt: now,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
    };

    const updated: Inspection = {
      ...existing,
      acknowledgements: [...existing.acknowledgements, ack],
      updatedAt: now,
      version: existing.version + 1,
    };

    InspectionRepository.inspectionStore.set(id, updated);
    return ack;
  }

  async addCorrection(
    id: string,
    tenantId: string,
    dto: CorrectInspectionDto & { correctedByMembershipId: string },
    _tx?: TransactionContext
  ): Promise<InspectionCorrection> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new InspectionNotFoundError(id);

    const now = new Date().toISOString();
    const corrId = `corr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const previousSnapshot = {
      odometer: existing.odometer,
      fuelLevel: existing.fuelLevel,
      overallCondition: existing.overallCondition,
      notes: existing.notes,
      version: existing.version,
    };

    const correction: InspectionCorrection = {
      id: corrId,
      inspectionId: id,
      tenantId,
      correctionReason: dto.correctionReason,
      correctedFields: dto.correctedFields,
      previousSnapshot,
      correctedByMembershipId: dto.correctedByMembershipId,
      correctedAt: now,
    };

    const list = InspectionRepository.correctionStore.get(id) || [];
    list.push(correction);
    InspectionRepository.correctionStore.set(id, list);

    const updated: Inspection = {
      ...existing,
      odometer: dto.correctedFields.odometer !== undefined ? dto.correctedFields.odometer : existing.odometer,
      fuelLevel: dto.correctedFields.fuelLevel !== undefined ? dto.correctedFields.fuelLevel : existing.fuelLevel,
      overallCondition: dto.correctedFields.overallCondition || existing.overallCondition,
      notes: dto.correctedFields.notes !== undefined ? dto.correctedFields.notes : existing.notes,
      updatedAt: now,
      version: existing.version + 1,
    };

    InspectionRepository.inspectionStore.set(id, updated);
    return correction;
  }

  async appendStatusHistory(
    tenantId: string,
    entry: Omit<InspectionStatusHistory, "id">,
    _tx?: TransactionContext
  ): Promise<InspectionStatusHistory> {
    const id = `ish_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const historyItem: InspectionStatusHistory = {
      ...entry,
      id,
      tenantId,
    };

    const list = InspectionRepository.statusHistoryStore.get(entry.inspectionId) || [];
    list.push(historyItem);
    InspectionRepository.statusHistoryStore.set(entry.inspectionId, list);

    return historyItem;
  }

  async getStatusHistory(
    inspectionId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<InspectionStatusHistory[]> {
    const list = InspectionRepository.statusHistoryStore.get(inspectionId) || [];
    return list.filter((h) => h.tenantId === tenantId);
  }

  async saveComparison(
    tenantId: string,
    comparison: InspectionComparison,
    _tx?: TransactionContext
  ): Promise<InspectionComparison> {
    const key = comparison.rentalId || comparison.vehicleId;
    const list = InspectionRepository.comparisonStore.get(key) || [];
    list.push(comparison);
    InspectionRepository.comparisonStore.set(key, list);
    return comparison;
  }

  async getComparisonByRental(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<InspectionComparison | null> {
    const list = InspectionRepository.comparisonStore.get(rentalId) || [];
    const item = list.find((c) => c.tenantId === tenantId);
    return item || null;
  }
}
