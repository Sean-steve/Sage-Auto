import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — DAMAGE CASE PERSISTENCE REPOSITORY (DOM-003 §22, DEV-004)
// Bounded Context: Damage Attribution, Lifecycle & Estimation
// ============================================================================

import type {
  DamageCase,
  DamageStatusHistory,
  DamageCaseStatus,
  DamageCaseListQueryDto,
  CreateDamageCaseDto,
  UpdateDamageCaseDto,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  DamageCaseNotFoundError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IDamageRepository {
  create(
    tenantId: string,
    data: CreateDamageCaseDto & {
      damageNumber?: string;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    tx?: TransactionContext
  ): Promise<DamageCase>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<DamageCase | null>;

  findByDamageNumber(
    damageNumber: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<DamageCase | null>;

  findByVehicleId(
    vehicleId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<DamageCase[]>;

  findByRentalId(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<DamageCase[]>;

  findByInspectionId(
    inspectionId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<DamageCase[]>;

  findMany(
    tenantId: string,
    query?: DamageCaseListQueryDto,
    tx?: TransactionContext
  ): Promise<{ items: DamageCase[]; total: number }>;

  update(
    id: string,
    tenantId: string,
    data: UpdateDamageCaseDto & {
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
      transitionReason?: string;
    },
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<DamageCase>;

  appendStatusHistory(
    tenantId: string,
    entry: Omit<DamageStatusHistory, "id">,
    tx?: TransactionContext
  ): Promise<DamageStatusHistory>;

  getStatusHistory(
    damageCaseId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<DamageStatusHistory[]>;

  generateNextDamageNumber(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<string>;
}

export class DamageRepository implements IDamageRepository {
  private static damageStore = createRecordStore<string, DamageCase>("damage.repository:damageStore");
  private static statusHistoryStore = createRecordStore<string, DamageStatusHistory[]>("damage.repository:statusHistoryStore");
  private static sequenceStore = createRecordStore<string, number>("damage.repository:sequenceStore");

  static clear(): void {
    DamageRepository.damageStore.clear();
    DamageRepository.statusHistoryStore.clear();
    DamageRepository.sequenceStore.clear();
  }

  async generateNextDamageNumber(
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<string> {
    const current = DamageRepository.sequenceStore.get(tenantId) || 1000;
    const next = current + 1;
    DamageRepository.sequenceStore.set(tenantId, next);
    return `DMG-${next}`;
  }

  async create(
    tenantId: string,
    data: CreateDamageCaseDto & {
      damageNumber?: string;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    _tx?: TransactionContext
  ): Promise<DamageCase> {
    const id = `dmg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const damageNumber = data.damageNumber || (await this.generateNextDamageNumber(tenantId));
    const now = new Date().toISOString();

    const damageCase: DamageCase = {
      id,
      tenantId,
      damageNumber,
      vehicleId: data.vehicleId,
      rentalId: data.rentalId || null,
      bookingId: data.bookingId || null,
      inspectionId: data.inspectionId,
      status: "OPEN",
      damageType: data.damageType,
      severity: data.severity,
      bodyZone: data.bodyZone,
      description: data.description,
      estimatedRepairCost: data.estimatedRepairCost || 0,
      actualRepairCost: 0,
      responsibleParty: data.responsibleParty || "UNASSIGNED",
      firstObservedAt: now,
      preExisting: data.preExisting ?? false,
      isRepaired: false,
      notes: "",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    DamageRepository.damageStore.set(id, damageCase);

    await this.appendStatusHistory(tenantId, {
      damageCaseId: id,
      tenantId,
      fromStatus: "OPEN",
      toStatus: "OPEN",
      actorType: data.actorType || "USER",
      actorId: data.actorUserId,
      reason: "Initial damage case logging",
      occurredAt: now,
    });

    return damageCase;
  }

  async findById(
    id: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<DamageCase | null> {
    const record = DamageRepository.damageStore.get(id);
    if (!record) return null;
    if (record.tenantId !== tenantId) {
      throw new CrossTenantViolationError(record.tenantId, tenantId);
    }
    const history = DamageRepository.statusHistoryStore.get(id) || [];
    return { ...record, statusHistory: history };
  }

  async findByDamageNumber(
    damageNumber: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<DamageCase | null> {
    for (const record of DamageRepository.damageStore.values()) {
      if (record.tenantId === tenantId && record.damageNumber === damageNumber) {
        const history = DamageRepository.statusHistoryStore.get(record.id) || [];
        return { ...record, statusHistory: history };
      }
    }
    return null;
  }

  async findByVehicleId(
    vehicleId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<DamageCase[]> {
    return Array.from(DamageRepository.damageStore.values()).filter(
      (r) => r.tenantId === tenantId && r.vehicleId === vehicleId
    );
  }

  async findByRentalId(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<DamageCase[]> {
    return Array.from(DamageRepository.damageStore.values()).filter(
      (r) => r.tenantId === tenantId && r.rentalId === rentalId
    );
  }

  async findByInspectionId(
    inspectionId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<DamageCase[]> {
    return Array.from(DamageRepository.damageStore.values()).filter(
      (r) => r.tenantId === tenantId && r.inspectionId === inspectionId
    );
  }

  async findMany(
    tenantId: string,
    query: DamageCaseListQueryDto = {},
    _tx?: TransactionContext
  ): Promise<{ items: DamageCase[]; total: number }> {
    let items = Array.from(DamageRepository.damageStore.values()).filter(
      (r) => r.tenantId === tenantId
    );

    if (query.status) {
      items = items.filter((r) => r.status === query.status);
    }
    if (query.severity) {
      items = items.filter((r) => r.severity === query.severity);
    }
    if (query.bodyZone) {
      items = items.filter((r) => r.bodyZone === query.bodyZone);
    }
    if (query.vehicleId) {
      items = items.filter((r) => r.vehicleId === query.vehicleId);
    }
    if (query.rentalId) {
      items = items.filter((r) => r.rentalId === query.rentalId);
    }
    if (query.search) {
      const s = query.search.toLowerCase();
      items = items.filter(
        (r) =>
          r.damageNumber.toLowerCase().includes(s) ||
          r.description.toLowerCase().includes(s) ||
          r.bodyZone.toLowerCase().includes(s)
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
    data: UpdateDamageCaseDto & {
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
      transitionReason?: string;
    },
    expectedVersion?: number,
    _tx?: TransactionContext
  ): Promise<DamageCase> {
    const existing = DamageRepository.damageStore.get(id);
    if (!existing) {
      throw new DamageCaseNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic lock failure on damage case '${id}': expected version ${expectedVersion}, found ${existing.version}.`
      );
    }

    const previousStatus = existing.status;
    const newStatus = data.status || existing.status;
    const now = new Date().toISOString();

    const updated: DamageCase = {
      ...existing,
      status: newStatus,
      damageType: data.damageType || existing.damageType,
      severity: data.severity || existing.severity,
      description: data.description !== undefined ? data.description : existing.description,
      estimatedRepairCost:
        data.estimatedRepairCost !== undefined
          ? data.estimatedRepairCost
          : existing.estimatedRepairCost,
      actualRepairCost:
        data.actualRepairCost !== undefined
          ? data.actualRepairCost
          : existing.actualRepairCost,
      responsibleParty: data.responsibleParty || existing.responsibleParty,
      isRepaired: data.isRepaired !== undefined ? data.isRepaired : existing.isRepaired,
      repairedAt: data.isRepaired ? (existing.repairedAt || now) : existing.repairedAt,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      updatedAt: now,
      version: existing.version + 1,
    };

    DamageRepository.damageStore.set(id, updated);

    if (previousStatus !== newStatus) {
      await this.appendStatusHistory(tenantId, {
        damageCaseId: id,
        tenantId,
        fromStatus: previousStatus,
        toStatus: newStatus,
        actorType: data.actorType || "USER",
        actorId: data.actorUserId,
        reason: data.transitionReason || `Status transition from ${previousStatus} to ${newStatus}`,
        occurredAt: now,
      });
    }

    return updated;
  }

  async appendStatusHistory(
    tenantId: string,
    entry: Omit<DamageStatusHistory, "id">,
    _tx?: TransactionContext
  ): Promise<DamageStatusHistory> {
    const id = `dsh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const historyItem: DamageStatusHistory = {
      ...entry,
      id,
      tenantId,
    };

    const list = DamageRepository.statusHistoryStore.get(entry.damageCaseId) || [];
    list.push(historyItem);
    DamageRepository.statusHistoryStore.set(entry.damageCaseId, list);

    return historyItem;
  }

  async getStatusHistory(
    damageCaseId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<DamageStatusHistory[]> {
    const list = DamageRepository.statusHistoryStore.get(damageCaseId) || [];
    return list.filter((h) => h.tenantId === tenantId);
  }
}
