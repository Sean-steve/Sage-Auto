import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENT REPOSITORY (Sprint 21: DOM-003 §41-45)
// Multi-Tenant Repository for Owner Settlements, Rental & Expense Lines,
// Commercial Terms Snapshots, Adjustments, and Payable Obligations
// ============================================================================

import type {
  OwnerSettlement,
  OwnerSettlementRentalLine,
  OwnerSettlementExpenseLine,
  OwnerSettlementAdjustmentLine,
  OwnerSettlementPayable,
  ListOwnerSettlementsFilter,
} from "@carhire/types";
import {
  SettlementNotFoundError,
  CrossTenantViolationError,
  SettlementAlreadyApprovedError,
  SettlementAlreadyPaidError,
  ConcurrencyConflictError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IOwnerSettlementRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<OwnerSettlement | null>;
  findBySettlementNumber(settlementNumber: string, tenantId?: string, tx?: TransactionContext): Promise<OwnerSettlement | null>;
  findByOwnerAndPeriod(
    ownerId: string,
    periodStart: string,
    periodEnd: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<OwnerSettlement | null>;
  listByTenant(tenantId: string, filter?: ListOwnerSettlementsFilter, tx?: TransactionContext): Promise<OwnerSettlement[]>;
  listPeriods?(tenantId: string, tx?: TransactionContext): Promise<any[]>;
  create(
    data: Omit<OwnerSettlement, "id" | "settlementNumber" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      settlementNumber?: string;
    },
    tx?: TransactionContext
  ): Promise<OwnerSettlement>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<OwnerSettlement>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<OwnerSettlement>;
  addAdjustment(
    settlementId: string,
    tenantId: string,
    adjustment: Omit<OwnerSettlementAdjustmentLine, "id" | "settlementId" | "createdAt">,
    tx?: TransactionContext
  ): Promise<OwnerSettlementAdjustmentLine>;
  createPayable(
    payable: Omit<OwnerSettlementPayable, "id" | "version" | "createdAt" | "updatedAt"> & { id?: string },
    tx?: TransactionContext
  ): Promise<OwnerSettlementPayable>;
  updatePayable(
    id: string,
    tenantId: string,
    updates: Partial<OwnerSettlementPayable>,
    tx?: TransactionContext
  ): Promise<OwnerSettlementPayable>;
  findPayableBySettlementId(settlementId: string, tenantId: string, tx?: TransactionContext): Promise<OwnerSettlementPayable | null>;
  findPayableById(id: string, tenantId?: string, tx?: TransactionContext): Promise<OwnerSettlementPayable | null>;
  updatePayableStatus(
    id: string,
    tenantId: string,
    status: OwnerSettlementPayable["status"],
    externalPayoutReference?: string,
    payoutCompletedAt?: string,
    tx?: TransactionContext
  ): Promise<OwnerSettlementPayable>;
  listPayables(
    tenantId: string,
    filter?: { ownerId?: string; settlementId?: string; status?: string },
    tx?: TransactionContext
  ): Promise<OwnerSettlementPayable[]>;
  nextSettlementNumber(tenantId: string, tx?: TransactionContext): Promise<string>;
}

export class OwnerSettlementRepository implements IOwnerSettlementRepository {
  private static store = createRecordStore<string, OwnerSettlement>("owner-settlement.repository:store");
  private static rentalLines = createRecordStore<string, OwnerSettlementRentalLine[]>("owner-settlement.repository:rentalLines");
  private static expenseLines = createRecordStore<string, OwnerSettlementExpenseLine[]>("owner-settlement.repository:expenseLines");
  private static adjustmentLines = createRecordStore<string, OwnerSettlementAdjustmentLine[]>("owner-settlement.repository:adjustmentLines");
  private static payables = createRecordStore<string, OwnerSettlementPayable>("owner-settlement.repository:payables");
  private static sequenceMap = createRecordStore<string, number>("owner-settlement.repository:sequenceMap");

  static clear(): void {
    OwnerSettlementRepository.store.clear();
    OwnerSettlementRepository.rentalLines.clear();
    OwnerSettlementRepository.expenseLines.clear();
    OwnerSettlementRepository.adjustmentLines.clear();
    OwnerSettlementRepository.payables.clear();
    OwnerSettlementRepository.sequenceMap.clear();
  }

  async nextSettlementNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}`;
    const seq = (OwnerSettlementRepository.sequenceMap.get(key) || 0) + 1;
    OwnerSettlementRepository.sequenceMap.set(key, seq);
    return `SET-${year}-${String(seq).padStart(5, "0")}`;
  }

  async findById(id: string, tenantId?: string): Promise<OwnerSettlement | null> {
    const settlement = OwnerSettlementRepository.store.get(id);
    if (!settlement) return null;
    if (tenantId && settlement.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, settlement.tenantId);
    }

    // Attach nested lines
    const rentalLines = OwnerSettlementRepository.rentalLines.get(id) || [];
    const expenseLines = OwnerSettlementRepository.expenseLines.get(id) || [];
    const adjustments = OwnerSettlementRepository.adjustmentLines.get(id) || [];
    const payable = Array.from(OwnerSettlementRepository.payables.values()).find(
      (p) => p.settlementId === id && p.tenantId === settlement.tenantId
    );

    return {
      ...settlement,
      rentalLines: [...rentalLines],
      expenseLines: [...expenseLines],
      adjustmentLines: [...adjustments],
      payable: payable ? { ...payable } : undefined,
    };
  }

  async findBySettlementNumber(settlementNumber: string, tenantId?: string): Promise<OwnerSettlement | null> {
    for (const settlement of OwnerSettlementRepository.store.values()) {
      if (settlement.settlementNumber === settlementNumber) {
        if (tenantId && settlement.tenantId !== tenantId) {
          throw new CrossTenantViolationError(tenantId, settlement.tenantId);
        }
        return this.findById(settlement.id, tenantId);
      }
    }
    return null;
  }

  async findByOwnerAndPeriod(
    ownerId: string,
    periodStart: string,
    periodEnd: string,
    tenantId: string
  ): Promise<OwnerSettlement | null> {
    for (const settlement of OwnerSettlementRepository.store.values()) {
      if (
        settlement.tenantId === tenantId &&
        settlement.ownerId === ownerId &&
        settlement.periodStart === periodStart &&
        settlement.periodEnd === periodEnd
      ) {
        return this.findById(settlement.id, tenantId);
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, filter?: ListOwnerSettlementsFilter): Promise<OwnerSettlement[]> {
    const results: OwnerSettlement[] = [];

    for (const settlement of OwnerSettlementRepository.store.values()) {
      if (settlement.tenantId !== tenantId) continue;
      if (filter?.ownerId && settlement.ownerId !== filter.ownerId) continue;
      if (filter?.periodId && settlement.periodId !== filter.periodId) continue;
      if (filter?.batchId && settlement.batchId !== filter.batchId) continue;
      if (filter?.status && settlement.status !== filter.status) continue;
      if (filter?.fromDate && settlement.periodStart < filter.fromDate) continue;
      if (filter?.toDate && settlement.periodEnd > filter.toDate) continue;

      const full = await this.findById(settlement.id, tenantId);
      if (full) results.push(full);
    }

    return results.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async listPeriods(tenantId: string): Promise<any[]> {
    return this.listByTenant(tenantId);
  }

  async create(
    data: Omit<OwnerSettlement, "id" | "settlementNumber" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      settlementNumber?: string;
    }
  ): Promise<OwnerSettlement> {
    const id = data.id || `set_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const settlementNumber = data.settlementNumber || (await this.nextSettlementNumber(data.tenantId));
    const now = new Date().toISOString();

    const settlement: OwnerSettlement = {
      ...data,
      id,
      settlementNumber,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Store rental lines if provided
    if (data.rentalLines && data.rentalLines.length > 0) {
      OwnerSettlementRepository.rentalLines.set(
        id,
        data.rentalLines.map((line, idx) => ({
          ...line,
          id: line.id || `srl_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          settlementId: id,
          sortOrder: line.sortOrder ?? idx,
        }))
      );
    } else {
      OwnerSettlementRepository.rentalLines.set(id, []);
    }

    // Store expense lines if provided
    if (data.expenseLines && data.expenseLines.length > 0) {
      OwnerSettlementRepository.expenseLines.set(
        id,
        data.expenseLines.map((line, idx) => ({
          ...line,
          id: line.id || `sel_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          settlementId: id,
          sortOrder: line.sortOrder ?? idx,
        }))
      );
    } else {
      OwnerSettlementRepository.expenseLines.set(id, []);
    }

    // Store adjustment lines if provided
    if (data.adjustmentLines && data.adjustmentLines.length > 0) {
      OwnerSettlementRepository.adjustmentLines.set(
        id,
        data.adjustmentLines.map((line, idx) => ({
          ...line,
          id: line.id || `sadj_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          settlementId: id,
          createdAt: line.createdAt || now,
        }))
      );
    } else {
      OwnerSettlementRepository.adjustmentLines.set(id, []);
    }

    OwnerSettlementRepository.store.set(id, settlement);
    return (await this.findById(id, data.tenantId))!;
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<OwnerSettlement>,
    expectedVersion?: number
  ): Promise<OwnerSettlement> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new SettlementNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, existing.tenantId);
    }
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Owner settlement ${existing.settlementNumber} was modified by another transaction. Expected version ${expectedVersion}, got ${existing.version}.`
      );
    }

    // Immutability checks: once APPROVED, financial numbers cannot be modified directly
    if (existing.status === "APPROVED" && updates.status === undefined && updates.notes === undefined) {
      // Trying to modify approved settlement without status transition
      if (
        updates.grossRevenue !== undefined ||
        updates.netPayoutAmount !== undefined ||
        updates.totalDeductions !== undefined
      ) {
        throw new SettlementAlreadyApprovedError(existing.settlementNumber);
      }
    }

    if (existing.status === "PAID" && updates.status && updates.status !== "PAID") {
      throw new SettlementAlreadyPaidError(existing.settlementNumber);
    }

    const updated: OwnerSettlement = {
      ...existing,
      ...updates,
      version: (existing.version ?? 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    // Nested settlement lines are part of the aggregate calculation snapshot.
    // Recalculation must replace them atomically with the new totals rather than
    // leave stale line stores attached to the updated header.
    if (updates.rentalLines) {
      OwnerSettlementRepository.rentalLines.set(
        id,
        updates.rentalLines.map((line, idx) => ({
          ...line,
          id: line.id || `srl_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          settlementId: id,
          sortOrder: line.sortOrder ?? idx,
        }))
      );
    }
    if (updates.expenseLines) {
      OwnerSettlementRepository.expenseLines.set(
        id,
        updates.expenseLines.map((line, idx) => ({
          ...line,
          id: line.id || `sel_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          settlementId: id,
          sortOrder: line.sortOrder ?? idx,
        }))
      );
    }
    if (updates.adjustmentLines) {
      OwnerSettlementRepository.adjustmentLines.set(
        id,
        updates.adjustmentLines.map((line, idx) => ({
          ...line,
          id: line.id || `sadj_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          settlementId: id,
          createdAt: line.createdAt || new Date().toISOString(),
        }))
      );
    }

    OwnerSettlementRepository.store.set(id, updated);
    return (await this.findById(id, tenantId))!;
  }

  async addAdjustment(
    settlementId: string,
    tenantId: string,
    adjustment: Omit<OwnerSettlementAdjustmentLine, "id" | "settlementId" | "createdAt">
  ): Promise<OwnerSettlementAdjustmentLine> {
    const existing = await this.findById(settlementId, tenantId);
    if (!existing) {
      throw new SettlementNotFoundError(settlementId);
    }

    const adjLine: OwnerSettlementAdjustmentLine = {
      ...adjustment,
      id: `sadj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      settlementId,
      createdAt: new Date().toISOString(),
    };

    const lines = OwnerSettlementRepository.adjustmentLines.get(settlementId) || [];
    lines.push(adjLine);
    OwnerSettlementRepository.adjustmentLines.set(settlementId, lines);

    return adjLine;
  }

  async createPayable(
    payableData: Omit<OwnerSettlementPayable, "id" | "version" | "createdAt" | "updatedAt"> & { id?: string }
  ): Promise<OwnerSettlementPayable> {
    const id = payableData.id || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const payable: OwnerSettlementPayable = {
      ...payableData,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    OwnerSettlementRepository.payables.set(id, payable);
    return payable;
  }

  async updatePayable(
    id: string,
    tenantId: string,
    updates: Partial<OwnerSettlementPayable>
  ): Promise<OwnerSettlementPayable> {
    const existing = OwnerSettlementRepository.payables.get(id);
    if (!existing) {
      throw new SettlementNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, existing.tenantId);
    }

    const updated: OwnerSettlementPayable = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    OwnerSettlementRepository.payables.set(id, updated);
    return updated;
  }

  async findPayableById(id: string, tenantId?: string): Promise<OwnerSettlementPayable | null> {
    const payable = OwnerSettlementRepository.payables.get(id);
    if (!payable) return null;
    if (tenantId && payable.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, payable.tenantId);
    }
    return { ...payable };
  }

  async updatePayableStatus(
    id: string,
    tenantId: string,
    status: OwnerSettlementPayable["status"],
    externalPayoutReference?: string,
    payoutCompletedAt?: string
  ): Promise<OwnerSettlementPayable> {
    return this.updatePayable(id, tenantId, {
      status,
      externalPayoutReference,
      payoutCompletedAt,
    });
  }

  async findPayableBySettlementId(settlementId: string, tenantId: string): Promise<OwnerSettlementPayable | null> {
    for (const payable of OwnerSettlementRepository.payables.values()) {
      if (payable.settlementId === settlementId && payable.tenantId === tenantId) {
        return { ...payable };
      }
    }
    return null;
  }

  async listPayables(
    tenantId: string,
    filter?: { ownerId?: string; settlementId?: string; status?: string }
  ): Promise<OwnerSettlementPayable[]> {
    const results: OwnerSettlementPayable[] = [];
    for (const payable of OwnerSettlementRepository.payables.values()) {
      if (payable.tenantId !== tenantId) continue;
      if (filter?.ownerId && payable.ownerId !== filter.ownerId) continue;
      if (filter?.settlementId && payable.settlementId !== filter.settlementId) continue;
      if (filter?.status && payable.status !== filter.status) continue;
      results.push({ ...payable });
    }
    return results;
  }
}
