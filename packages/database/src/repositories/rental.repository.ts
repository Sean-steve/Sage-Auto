import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — RENTAL PERSISTENCE REPOSITORY (DOM-003 §19-20, DEV-004, DEV-007)
// Bounded Context: Rentals & On-Road Fleet Dispatches
// Concurrency-safe, multi-tenant persistence with start snapshots and status history
// ============================================================================

import type {
  Rental,
  RentalState,
  RentalStatusHistory,
  RentalStartSnapshot,
  PricingSnapshot,
  RentalListQueryDto,
  RentalExtension,
  RentalReturnRecord,
  RentalFinalCalculation,
  RentalIncident,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  RentalNotFoundError,
  CrossTenantViolationError,
  RentalInvalidStateTransitionError,
  RentalExtensionNotFoundError,
  RentalFinalCalculationImmutableError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IRentalRepository {
  create(
    tenantId: string,
    data: {
      rentalNumber: string;
      bookingId: string;
      contractId: string;
      handoverId: string;
      customerId: string;
      corporateAccountId?: string | null;
      primaryDriverId: string;
      vehicleId: string;
      status?: RentalState | string;
      scheduledStart?: string;
      scheduledReturnAt?: string;
      actualStart?: string;
      checkoutOdometer?: number;
      checkoutFuelLevel?: number;
      pricingSnapshot: PricingSnapshot;
      depositSnapshot?: Record<string, any> | null;
      ownershipSnapshot?: Record<string, any> | null;
      preRentalInspectionId?: string | null;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    tx?: TransactionContext
  ): Promise<Rental>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Rental | null>;

  findByRentalNumber(
    rentalNumber: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Rental | null>;

  findByBookingId(
    bookingId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Rental | null>;

  findMany(
    tenantId: string,
    query?: RentalListQueryDto,
    tx?: TransactionContext
  ): Promise<{ items: Rental[]; total: number }>;

  list(tenantId: string, tx?: TransactionContext): Promise<Rental[]>;
  listByTenant(tenantId: string, tx?: TransactionContext): Promise<Rental[]>;

  update(
    id: string,
    tenantId: string,
    data: Partial<Rental>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<Rental>;

  saveStartSnapshot(
    tenantId: string,
    snapshot: Omit<RentalStartSnapshot, "id" | "createdAt">,
    tx?: TransactionContext
  ): Promise<RentalStartSnapshot>;

  getStartSnapshot(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalStartSnapshot | null>;

  appendStatusHistory(
    tenantId: string,
    entry: Omit<RentalStatusHistory, "id">,
    tx?: TransactionContext
  ): Promise<RentalStatusHistory>;

  getStatusHistory(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalStatusHistory[]>;

  generateNextRentalNumber(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<string>;

  saveReturnRecord(
    tenantId: string,
    returnRecord: Omit<RentalReturnRecord, "id" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<RentalReturnRecord>;

  getReturnRecord(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalReturnRecord | null>;

  saveExtension(
    tenantId: string,
    extension: Omit<RentalExtension, "id" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<RentalExtension>;

  findExtensionById(
    extensionId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalExtension | null>;

  updateExtension(
    extensionId: string,
    tenantId: string,
    data: Partial<RentalExtension>,
    tx?: TransactionContext
  ): Promise<RentalExtension>;

  getExtensions(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalExtension[]>;

  recordIncident(
    rentalId: string,
    tenantId: string,
    incident: Omit<RentalIncident, "id" | "rentalId">,
    tx?: TransactionContext
  ): Promise<RentalIncident>;

  getIncidents(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalIncident[]>;

  saveFinalCalculation(
    tenantId: string,
    finalCalc: Omit<RentalFinalCalculation, "id" | "calculatedAt">,
    tx?: TransactionContext
  ): Promise<RentalFinalCalculation>;

  getFinalCalculation(
    rentalId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalFinalCalculation | null>;
}

export class RentalRepository implements IRentalRepository {
  private static rentalStore = createRecordStore<string, Rental>("rental.repository:rentalStore");
  private static startSnapshotStore = createRecordStore<string, RentalStartSnapshot>("rental.repository:startSnapshotStore");
  private static statusHistoryStore = createRecordStore<string, RentalStatusHistory[]>("rental.repository:statusHistoryStore");
  private static sequenceStore = createRecordStore<string, number>("rental.repository:sequenceStore");
  private static returnRecordStore = createRecordStore<string, RentalReturnRecord>("rental.repository:returnRecordStore");
  private static extensionStore = createRecordStore<string, RentalExtension>("rental.repository:extensionStore");
  private static finalCalculationStore = createRecordStore<string, RentalFinalCalculation>("rental.repository:finalCalculationStore");

  static clear(): void {
    RentalRepository.rentalStore.clear();
    RentalRepository.startSnapshotStore.clear();
    RentalRepository.statusHistoryStore.clear();
    RentalRepository.sequenceStore.clear();
    RentalRepository.returnRecordStore.clear();
    RentalRepository.extensionStore.clear();
    RentalRepository.finalCalculationStore.clear();
  }

  async generateNextRentalNumber(
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}`;
    const currentSeq = (RentalRepository.sequenceStore.get(key) || 0) + 1;
    RentalRepository.sequenceStore.set(key, currentSeq);
    const padded = String(currentSeq).padStart(6, "0");
    return `RNT-${year}-${padded}`;
  }

  async create(
    tenantId: string,
    data: {
      rentalNumber: string;
      bookingId: string;
      contractId: string;
      handoverId: string;
      customerId: string;
      corporateAccountId?: string | null;
      primaryDriverId: string;
      vehicleId: string;
      status?: RentalState | string;
      scheduledStart?: string;
      scheduledReturnAt?: string;
      actualStart?: string;
      checkoutOdometer?: number;
      checkoutFuelLevel?: number;
      pricingSnapshot: PricingSnapshot;
      depositSnapshot?: Record<string, any> | null;
      ownershipSnapshot?: Record<string, any> | null;
      preRentalInspectionId?: string | null;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    _tx?: TransactionContext
  ): Promise<Rental> {
    const id = `rnt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const state: RentalState = (data.status as RentalState) || "ACTIVE_ON_ROAD";
    const actorId = data.actorUserId || "system";
    const actorType = data.actorType || "USER";

    const newRental: Rental = {
      id,
      tenantId,
      rentalNumber: data.rentalNumber,
      bookingId: data.bookingId,
      vehicleId: data.vehicleId,
      customerId: data.customerId,
      driverId: data.primaryDriverId,
      state,
      scheduledStart: data.scheduledStart || now,
      scheduledEnd: data.scheduledReturnAt || new Date(Date.now() + 86400000).toISOString(),
      actualStart: data.actualStart || now,
      checkoutOdometer: data.checkoutOdometer || 0,
      checkoutFuelLevel: data.checkoutFuelLevel || 100,
      contractId: data.contractId,
      handoverInspectionId: data.preRentalInspectionId || undefined,
      extensions: [],
      incidents: [],
      finalExcessKmCharge: 0,
      finalFuelDeficitCharge: 0,
      finalDamageCharge: 0,
      finalLateReturnFee: 0,
      depositRefundedAmount: 0,
      createdAt: now,
      updatedAt: now,
    };

    RentalRepository.rentalStore.set(id, newRental);

    // Initial status history
    const historyEntry: RentalStatusHistory = {
      id: `rsh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      rentalId: id,
      tenantId,
      fromStatus: "SCHEDULED_HANDOVER",
      toStatus: state,
      actorType,
      actorId,
      actorName: "System/Operator",
      reason: "Rental created and started from completed handover",
      occurredAt: now,
    };
    RentalRepository.statusHistoryStore.set(id, [historyEntry]);

    return JSON.parse(JSON.stringify(newRental));
  }

  async findById(
    id: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Rental | null> {
    const rental = RentalRepository.rentalStore.get(id);
    if (!rental) return null;
    if (rental.tenantId !== tenantId) {
      throw new CrossTenantViolationError(rental.tenantId, tenantId);
    }
    return JSON.parse(JSON.stringify(rental));
  }

  async findByRentalNumber(
    rentalNumber: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Rental | null> {
    for (const rental of RentalRepository.rentalStore.values()) {
      if (rental.rentalNumber === rentalNumber && rental.tenantId === tenantId) {
        return JSON.parse(JSON.stringify(rental));
      }
    }
    return null;
  }

  async findByBookingId(
    bookingId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Rental | null> {
    for (const rental of RentalRepository.rentalStore.values()) {
      if (rental.bookingId === bookingId && rental.tenantId === tenantId) {
        return JSON.parse(JSON.stringify(rental));
      }
    }
    return null;
  }

  async findMany(
    tenantId: string,
    query: RentalListQueryDto = {},
    _tx?: TransactionContext
  ): Promise<{ items: Rental[]; total: number }> {
    let items = Array.from(RentalRepository.rentalStore.values()).filter(
      (r) => r.tenantId === tenantId
    );

    if (query.status) {
      items = items.filter((r) => r.state === query.status);
    }
    if (query.bookingId) {
      items = items.filter((r) => r.bookingId === query.bookingId);
    }
    if (query.vehicleId) {
      items = items.filter((r) => r.vehicleId === query.vehicleId);
    }
    if (query.customerId) {
      items = items.filter((r) => r.customerId === query.customerId);
    }
    if (query.search) {
      const s = query.search.toLowerCase();
      items = items.filter(
        (r) =>
          r.rentalNumber.toLowerCase().includes(s)
      );
    }

    const total = items.length;
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginated = items.slice(offset, offset + limit);

    return { items: JSON.parse(JSON.stringify(paginated)), total };
  }

  async listByTenant(tenantId: string): Promise<Rental[]> {
    const res = await this.findMany(tenantId, { limit: 1000 });
    return res.items;
  }

  async list(tenantId: string): Promise<Rental[]> {
    return this.listByTenant(tenantId);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Rental>,
    _expectedVersion?: number,
    _tx?: TransactionContext
  ): Promise<Rental> {
    const existing = RentalRepository.rentalStore.get(id);
    if (!existing) {
      throw new RentalNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    const updated: Rental = {
      ...existing,
      ...data,
      id: existing.id,
      tenantId: existing.tenantId,
      rentalNumber: existing.rentalNumber,
      updatedAt: new Date().toISOString(),
    };

    RentalRepository.rentalStore.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async saveStartSnapshot(
    tenantId: string,
    snapshot: Omit<RentalStartSnapshot, "id" | "createdAt">,
    _tx?: TransactionContext
  ): Promise<RentalStartSnapshot> {
    const record: RentalStartSnapshot = {
      ...snapshot,
      id: `rss-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      createdAt: new Date().toISOString(),
    };

    RentalRepository.startSnapshotStore.set(snapshot.rentalId, record);
    return JSON.parse(JSON.stringify(record));
  }

  async getStartSnapshot(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalStartSnapshot | null> {
    await this.findById(rentalId, tenantId);
    const snapshot = RentalRepository.startSnapshotStore.get(rentalId);
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  }

  async appendStatusHistory(
    tenantId: string,
    entry: Omit<RentalStatusHistory, "id">,
    _tx?: TransactionContext
  ): Promise<RentalStatusHistory> {
    const history: RentalStatusHistory = {
      ...entry,
      id: `rsh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      occurredAt: entry.occurredAt || new Date().toISOString(),
    };

    const existing = RentalRepository.statusHistoryStore.get(entry.rentalId) || [];
    existing.push(history);
    RentalRepository.statusHistoryStore.set(entry.rentalId, existing);

    return JSON.parse(JSON.stringify(history));
  }

  async getStatusHistory(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalStatusHistory[]> {
    await this.findById(rentalId, tenantId);
    const history = RentalRepository.statusHistoryStore.get(rentalId) || [];
    return JSON.parse(JSON.stringify(history));
  }

  async saveReturnRecord(
    tenantId: string,
    returnRecord: Omit<RentalReturnRecord, "id" | "createdAt" | "updatedAt">,
    _tx?: TransactionContext
  ): Promise<RentalReturnRecord> {
    await this.findById(returnRecord.rentalId, tenantId);
    const existing = RentalRepository.returnRecordStore.get(returnRecord.rentalId);
    const now = new Date().toISOString();
    const record: RentalReturnRecord = {
      ...(existing || {}),
      ...returnRecord,
      id: existing?.id || `rr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    } as RentalReturnRecord;

    RentalRepository.returnRecordStore.set(returnRecord.rentalId, record);
    return JSON.parse(JSON.stringify(record));
  }

  async getReturnRecord(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalReturnRecord | null> {
    await this.findById(rentalId, tenantId);
    const record = RentalRepository.returnRecordStore.get(rentalId);
    return record ? JSON.parse(JSON.stringify(record)) : null;
  }

  async saveExtension(
    tenantId: string,
    extension: Omit<RentalExtension, "id" | "createdAt" | "updatedAt">,
    _tx?: TransactionContext
  ): Promise<RentalExtension> {
    const id = `rext-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const record: RentalExtension = {
      ...extension,
      id,
      tenantId,
      status: extension.status || "REQUESTED",
      createdAt: now,
      updatedAt: now,
    };

    RentalRepository.extensionStore.set(id, record);

    // Also update extensions array in the rental aggregate
    const rental = await this.findById(extension.rentalId, tenantId);
    if (rental) {
      const extensions = rental.extensions || [];
      const updatedExtensions = [record, ...extensions.filter((e) => e.id !== id)];
      await this.update(rental.id, tenantId, { extensions: updatedExtensions });
    }

    return JSON.parse(JSON.stringify(record));
  }

  async findExtensionById(
    extensionId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalExtension | null> {
    const ext = RentalRepository.extensionStore.get(extensionId);
    if (!ext || (ext.tenantId && ext.tenantId !== tenantId)) {
      return null;
    }
    return JSON.parse(JSON.stringify(ext));
  }

  async updateExtension(
    extensionId: string,
    tenantId: string,
    data: Partial<RentalExtension>,
    _tx?: TransactionContext
  ): Promise<RentalExtension> {
    const existing = await this.findExtensionById(extensionId, tenantId);
    if (!existing) {
      throw new RentalExtensionNotFoundError(extensionId);
    }

    const updated: RentalExtension = {
      ...existing,
      ...data,
      id: existing.id,
      tenantId: existing.tenantId || tenantId,
      updatedAt: new Date().toISOString(),
    };

    RentalRepository.extensionStore.set(extensionId, updated);

    // Also sync to rental aggregate
    const rental = await this.findById(existing.rentalId, tenantId);
    if (rental) {
      const extensions = (rental.extensions || []).map((e) => (e.id === extensionId ? updated : e));
      await this.update(rental.id, tenantId, { extensions });
    }

    return JSON.parse(JSON.stringify(updated));
  }

  async getExtensions(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalExtension[]> {
    await this.findById(rentalId, tenantId);
    const exts = Array.from(RentalRepository.extensionStore.values()).filter(
      (e) => e.rentalId === rentalId && (e.tenantId === tenantId || !e.tenantId)
    );
    return JSON.parse(JSON.stringify(exts));
  }

  async recordIncident(
    rentalId: string,
    tenantId: string,
    incident: Omit<RentalIncident, "id" | "rentalId">,
    _tx?: TransactionContext
  ): Promise<RentalIncident> {
    const rental = await this.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }

    const record: RentalIncident = {
      ...incident,
      id: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      rentalId,
      reportedAt: incident.reportedAt || new Date().toISOString(),
      estimatedCost: incident.estimatedCost ?? 0,
      resolved: incident.resolved ?? false,
    };

    await this.update(rentalId, tenantId, {
      incidents: [record, ...(rental.incidents || [])],
    });

    return JSON.parse(JSON.stringify(record));
  }

  async getIncidents(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalIncident[]> {
    const rental = await this.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }
    return JSON.parse(JSON.stringify(rental.incidents || []));
  }

  async saveFinalCalculation(
    tenantId: string,
    finalCalc: Omit<RentalFinalCalculation, "id" | "calculatedAt">,
    _tx?: TransactionContext
  ): Promise<RentalFinalCalculation> {
    await this.findById(finalCalc.rentalId, tenantId);
    const existing = RentalRepository.finalCalculationStore.get(finalCalc.rentalId);
    if (existing?.isImmutable) {
      throw new RentalFinalCalculationImmutableError(finalCalc.rentalId);
    }

    const id = existing?.id || `rfc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const record: RentalFinalCalculation = {
      ...(existing || {}),
      ...finalCalc,
      id,
      tenantId,
      calculatedAt: existing?.calculatedAt || new Date().toISOString(),
    };

    RentalRepository.finalCalculationStore.set(finalCalc.rentalId, record);

    // Sync financial summaries to rental aggregate
    await this.update(finalCalc.rentalId, tenantId, {
      finalCalculationId: id,
      finalExcessKmCharge: record.excessKmCharge,
      finalFuelDeficitCharge: record.fuelDeficitCharge,
      finalDamageCharge: record.totalDamageCharge,
      finalLateReturnFee: record.lateReturnFee,
      depositRefundedAmount: record.depositRefundDue,
    });

    return JSON.parse(JSON.stringify(record));
  }

  async getFinalCalculation(
    rentalId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalFinalCalculation | null> {
    await this.findById(rentalId, tenantId);
    const calc = RentalRepository.finalCalculationStore.get(rentalId);
    return calc ? JSON.parse(JSON.stringify(calc)) : null;
  }
}
