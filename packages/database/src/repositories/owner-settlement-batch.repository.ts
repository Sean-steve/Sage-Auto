import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENT BATCH REPOSITORY (Sprint 21: DOM-003 §41-45)
// Multi-Tenant Repository for Idempotent Settlement Batches & Bulk Processing
// ============================================================================

import type { OwnerSettlementBatch } from "@carhire/types";
import { CrossTenantViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IOwnerSettlementBatchRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<OwnerSettlementBatch | null>;
  findByIdempotencyKey(key: string, tenantId: string, tx?: TransactionContext): Promise<OwnerSettlementBatch | null>;
  listByTenant(tenantId: string, periodId?: string, tx?: TransactionContext): Promise<OwnerSettlementBatch[]>;
  create(
    data: Omit<OwnerSettlementBatch, "id" | "batchNumber" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      batchNumber?: string;
    },
    tx?: TransactionContext
  ): Promise<OwnerSettlementBatch>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<OwnerSettlementBatch>,
    tx?: TransactionContext
  ): Promise<OwnerSettlementBatch>;
  nextBatchNumber(tenantId: string, tx?: TransactionContext): Promise<string>;
}

export class OwnerSettlementBatchRepository implements IOwnerSettlementBatchRepository {
  private static store = createRecordStore<string, OwnerSettlementBatch>("owner-settlement-batch.repository:store");
  private static sequences = createRecordStore<string, number>("owner-settlement-batch.repository:sequences");

  static clear(): void {
    OwnerSettlementBatchRepository.store.clear();
    OwnerSettlementBatchRepository.sequences.clear();
  }

  async nextBatchNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}`;
    const seq = (OwnerSettlementBatchRepository.sequences.get(key) || 0) + 1;
    OwnerSettlementBatchRepository.sequences.set(key, seq);
    return `BAT-${year}-${String(seq).padStart(4, "0")}`;
  }

  async findById(id: string, tenantId?: string): Promise<OwnerSettlementBatch | null> {
    const batch = OwnerSettlementBatchRepository.store.get(id);
    if (!batch) return null;
    if (tenantId && batch.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, batch.tenantId);
    }
    return { ...batch };
  }

  async findByIdempotencyKey(key: string, tenantId: string): Promise<OwnerSettlementBatch | null> {
    for (const batch of OwnerSettlementBatchRepository.store.values()) {
      if (batch.tenantId === tenantId && batch.idempotencyKey === key) {
        return { ...batch };
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, periodId?: string): Promise<OwnerSettlementBatch[]> {
    const results: OwnerSettlementBatch[] = [];

    for (const batch of OwnerSettlementBatchRepository.store.values()) {
      if (batch.tenantId !== tenantId) continue;
      if (periodId && batch.periodId !== periodId) continue;
      results.push({ ...batch });
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<OwnerSettlementBatch, "id" | "batchNumber" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      batchNumber?: string;
    }
  ): Promise<OwnerSettlementBatch> {
    const id = data.id || `bat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const batchNumber = data.batchNumber || (await this.nextBatchNumber(data.tenantId));
    const now = new Date().toISOString();

    const batch: OwnerSettlementBatch = {
      ...data,
      id,
      batchNumber,
      totalSettlements: data.totalSettlements ?? 0,
      totalEligibleRevenue: data.totalEligibleRevenue ?? "0.0000",
      totalOwnerShare: data.totalOwnerShare ?? "0.0000",
      totalOperatorShare: data.totalOperatorShare ?? "0.0000",
      totalDeductions: data.totalDeductions ?? "0.0000",
      totalNetPayout: data.totalNetPayout ?? "0.0000",
      currency: data.currency || "KES",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    OwnerSettlementBatchRepository.store.set(id, batch);
    return { ...batch };
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<OwnerSettlementBatch>
  ): Promise<OwnerSettlementBatch> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("OwnerSettlementBatch", id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, existing.tenantId);
    }

    const updated: OwnerSettlementBatch = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    OwnerSettlementBatchRepository.store.set(id, updated);
    return { ...updated };
  }
}
