import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — DEPOSIT POSITION REPOSITORY (Sprint 19: DOM-003 §28-34)
// Repository for Customer Rental Deposits (Financial Liabilities & Source Facts)
// ============================================================================

import type { DepositPosition, DepositPositionStatus } from "@carhire/types";
import {
  DepositPositionNotFoundError,
  CrossTenantViolationError,
  FinanceConcurrencyConflictError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ListDepositPositionsFilter {
  customerId?: string;
  rentalId?: string;
  status?: DepositPositionStatus;
}

export interface IDepositPositionRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<DepositPosition | null>;
  findByRentalId(rentalId: string, tenantId: string, tx?: TransactionContext): Promise<DepositPosition | null>;
  listByTenant(tenantId: string, filter?: ListDepositPositionsFilter, tx?: TransactionContext): Promise<DepositPosition[]>;
  create(
    data: Omit<DepositPosition, "id" | "version" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<DepositPosition>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<DepositPosition>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<DepositPosition>;
}

export class DepositPositionRepository implements IDepositPositionRepository {
  private static store = createRecordStore<string, DepositPosition>("deposit-position.repository:store");

  static clear() {
    this.store.clear();
  }

  async findById(id: string, tenantId?: string): Promise<DepositPosition | null> {
    const pos = DepositPositionRepository.store.get(id);
    if (!pos) return null;
    if (tenantId && pos.tenantId !== tenantId) {
      throw new CrossTenantViolationError(pos.tenantId, tenantId);
    }
    return JSON.parse(JSON.stringify(pos));
  }

  async findByRentalId(rentalId: string, tenantId: string): Promise<DepositPosition | null> {
    for (const pos of DepositPositionRepository.store.values()) {
      if (pos.tenantId === tenantId && pos.rentalId === rentalId) {
        return JSON.parse(JSON.stringify(pos));
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, filter?: ListDepositPositionsFilter): Promise<DepositPosition[]> {
    const results: DepositPosition[] = [];
    for (const pos of DepositPositionRepository.store.values()) {
      if (pos.tenantId !== tenantId) continue;
      if (filter?.customerId && pos.customerId !== filter.customerId) continue;
      if (filter?.rentalId && pos.rentalId !== filter.rentalId) continue;
      if (filter?.status && pos.status !== filter.status) continue;
      results.push(JSON.parse(JSON.stringify(pos)));
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<DepositPosition, "id" | "version" | "createdAt" | "updatedAt">
  ): Promise<DepositPosition> {
    const id = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const position: DepositPosition = {
      ...data,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    DepositPositionRepository.store.set(id, JSON.parse(JSON.stringify(position)));
    return JSON.parse(JSON.stringify(position));
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<DepositPosition>,
    expectedVersion?: number
  ): Promise<DepositPosition> {
    const existing = DepositPositionRepository.store.get(id);
    if (!existing) {
      throw new DepositPositionNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new FinanceConcurrencyConflictError("DepositPosition", id, expectedVersion, existing.version);
    }

    const updated: DepositPosition = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      rentalId: existing.rentalId,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    DepositPositionRepository.store.set(id, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  }
}
