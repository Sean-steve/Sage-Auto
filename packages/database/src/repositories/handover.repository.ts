import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — HANDOVER PERSISTENCE REPOSITORY (DOM-003 §18, DEV-004, DEV-007)
// Bounded Context: Vehicle Handover & Physical Dispatch Checklist
// Concurrency-safe, multi-tenant persistence with sequential workflow validation
// ============================================================================

import type {
  VehicleHandover,
  HandoverStatus,
  HandoverStatusHistory,
  HandoverListQueryDto,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  HandoverNotFoundError,
  CrossTenantViolationError,
  HandoverInvalidStateTransitionError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IHandoverRepository {
  create(
    tenantId: string,
    data: {
      handoverNumber: string;
      bookingId: string;
      contractId: string;
      rentalId?: string | null;
      vehicleId: string;
      customerId: string;
      primaryDriverId: string;
      scheduledAt: string;
      status?: HandoverStatus;
      checkoutOdometer?: number;
      checkoutFuelLevel?: number;
      performedByMembershipId?: string | null;
      notes?: string | null;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    tx?: TransactionContext
  ): Promise<VehicleHandover>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleHandover | null>;

  findByHandoverNumber(
    handoverNumber: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleHandover | null>;

  findByBookingId(
    bookingId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleHandover[]>;

  findMany(
    tenantId: string,
    query?: HandoverListQueryDto,
    tx?: TransactionContext
  ): Promise<{ items: VehicleHandover[]; total: number }>;

  update(
    id: string,
    tenantId: string,
    data: Partial<VehicleHandover>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<VehicleHandover>;

  appendStatusHistory(
    tenantId: string,
    entry: Omit<HandoverStatusHistory, "id">,
    tx?: TransactionContext
  ): Promise<HandoverStatusHistory>;

  getStatusHistory(
    handoverId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<HandoverStatusHistory[]>;

  generateNextHandoverNumber(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<string>;
}

export class HandoverRepository implements IHandoverRepository {
  private static handoverStore = createRecordStore<string, VehicleHandover>("handover.repository:handoverStore");
  private static statusHistoryStore = createRecordStore<string, HandoverStatusHistory[]>("handover.repository:statusHistoryStore");
  private static sequenceStore = createRecordStore<string, number>("handover.repository:sequenceStore");

  static clear(): void {
    HandoverRepository.handoverStore.clear();
    HandoverRepository.statusHistoryStore.clear();
    HandoverRepository.sequenceStore.clear();
  }

  async generateNextHandoverNumber(
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}`;
    const currentSeq = (HandoverRepository.sequenceStore.get(key) || 0) + 1;
    HandoverRepository.sequenceStore.set(key, currentSeq);
    const padded = String(currentSeq).padStart(6, "0");
    return `HND-${year}-${padded}`;
  }

  async create(
    tenantId: string,
    data: {
      handoverNumber: string;
      bookingId: string;
      contractId: string;
      rentalId?: string | null;
      vehicleId: string;
      customerId: string;
      primaryDriverId: string;
      scheduledAt: string;
      status?: HandoverStatus;
      checkoutOdometer?: number;
      checkoutFuelLevel?: number;
      performedByMembershipId?: string | null;
      notes?: string | null;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    _tx?: TransactionContext
  ): Promise<VehicleHandover> {
    const id = `hnd-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const status: HandoverStatus = data.status || "SCHEDULED";
    const actorId = data.actorUserId || "system";
    const actorType = data.actorType || "USER";

    const newHandover: VehicleHandover = {
      id,
      tenantId,
      handoverNumber: data.handoverNumber,
      bookingId: data.bookingId,
      contractId: data.contractId,
      rentalId: data.rentalId || null,
      vehicleId: data.vehicleId,
      customerId: data.customerId,
      primaryDriverId: data.primaryDriverId,
      status,
      scheduledAt: data.scheduledAt || now,
      checkoutOdometer: data.checkoutOdometer || 0,
      checkoutFuelLevel: data.checkoutFuelLevel || 100,
      performedByMembershipId: data.performedByMembershipId || null,
      notes: data.notes || null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      statusHistory: [],
    };

    HandoverRepository.handoverStore.set(id, newHandover);

    // Initial status history
    const historyEntry: HandoverStatusHistory = {
      id: `hsh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      handoverId: id,
      tenantId,
      fromStatus: "SCHEDULED",
      toStatus: status,
      actorType,
      actorId,
      actorName: "System/Operator",
      reason: "Handover workflow scheduled",
      occurredAt: now,
    };
    HandoverRepository.statusHistoryStore.set(id, [historyEntry]);
    newHandover.statusHistory = [historyEntry];

    return JSON.parse(JSON.stringify(newHandover));
  }

  async findById(
    id: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<VehicleHandover | null> {
    const handover = HandoverRepository.handoverStore.get(id);
    if (!handover) return null;
    if (handover.tenantId !== tenantId) {
      throw new CrossTenantViolationError(handover.tenantId, tenantId);
    }
    const hydrated = this.hydrateHandover(handover);
    return JSON.parse(JSON.stringify(hydrated));
  }

  async findByHandoverNumber(
    handoverNumber: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<VehicleHandover | null> {
    for (const handover of HandoverRepository.handoverStore.values()) {
      if (handover.handoverNumber === handoverNumber && handover.tenantId === tenantId) {
        return JSON.parse(JSON.stringify(this.hydrateHandover(handover)));
      }
    }
    return null;
  }

  async findByBookingId(
    bookingId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<VehicleHandover[]> {
    const results: VehicleHandover[] = [];
    for (const handover of HandoverRepository.handoverStore.values()) {
      if (handover.bookingId === bookingId && handover.tenantId === tenantId) {
        results.push(this.hydrateHandover(handover));
      }
    }
    return JSON.parse(JSON.stringify(results));
  }

  async findMany(
    tenantId: string,
    query: HandoverListQueryDto = {},
    _tx?: TransactionContext
  ): Promise<{ items: VehicleHandover[]; total: number }> {
    let items = Array.from(HandoverRepository.handoverStore.values()).filter(
      (h) => h.tenantId === tenantId
    );

    if (query.status) {
      items = items.filter((h) => h.status === query.status);
    }
    if (query.bookingId) {
      items = items.filter((h) => h.bookingId === query.bookingId);
    }
    if (query.vehicleId) {
      items = items.filter((h) => h.vehicleId === query.vehicleId);
    }
    if (query.customerId) {
      items = items.filter((h) => h.customerId === query.customerId);
    }
    if (query.search) {
      const s = query.search.toLowerCase();
      items = items.filter(
        (h) =>
          h.handoverNumber.toLowerCase().includes(s) ||
          h.notes?.toLowerCase().includes(s)
      );
    }

    const total = items.length;
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginated = items.slice(offset, offset + limit).map((h) => this.hydrateHandover(h));

    return { items: JSON.parse(JSON.stringify(paginated)), total };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<VehicleHandover>,
    expectedVersion?: number,
    _tx?: TransactionContext
  ): Promise<VehicleHandover> {
    const existing = HandoverRepository.handoverStore.get(id);
    if (!existing) {
      throw new HandoverNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Handover optimistic lock failure: expected version ${expectedVersion}, but found ${existing.version}.`
      );
    }

    const updated: VehicleHandover = {
      ...existing,
      ...data,
      id: existing.id,
      tenantId: existing.tenantId,
      handoverNumber: existing.handoverNumber,
      version: (existing.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    HandoverRepository.handoverStore.set(id, updated);
    return JSON.parse(JSON.stringify(this.hydrateHandover(updated)));
  }

  async appendStatusHistory(
    tenantId: string,
    entry: Omit<HandoverStatusHistory, "id">,
    _tx?: TransactionContext
  ): Promise<HandoverStatusHistory> {
    const history: HandoverStatusHistory = {
      ...entry,
      id: `hsh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      occurredAt: entry.occurredAt || new Date().toISOString(),
    };

    const existing = HandoverRepository.statusHistoryStore.get(entry.handoverId) || [];
    existing.push(history);
    HandoverRepository.statusHistoryStore.set(entry.handoverId, existing);

    return JSON.parse(JSON.stringify(history));
  }

  async getStatusHistory(
    handoverId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<HandoverStatusHistory[]> {
    await this.findById(handoverId, tenantId);
    const history = HandoverRepository.statusHistoryStore.get(handoverId) || [];
    return JSON.parse(JSON.stringify(history));
  }

  private hydrateHandover(handover: VehicleHandover): VehicleHandover {
    const statusHistory = HandoverRepository.statusHistoryStore.get(handover.id) || [];
    return {
      ...handover,
      statusHistory,
    };
  }
}
