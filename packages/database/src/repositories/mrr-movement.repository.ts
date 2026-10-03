// ============================================================================
// CAR HIRE OS — MRR MOVEMENT REPOSITORY (Sprint 35)
// Immutable ledger of all SaaS subscription MRR movement events
// ============================================================================

import type { MrrMovementRecord, MrrMovementType } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface IMrrMovementRepository {
  recordMovement(
    movement: Omit<MrrMovementRecord, "id" | "createdAt">,
    tx?: TransactionContext
  ): Promise<MrrMovementRecord>;
  getMovements(params?: {
    tenantId?: string;
    subscriptionId?: string;
    movementType?: MrrMovementType;
    from?: string;
    to?: string;
    currency?: string;
    limit?: number;
  }, tx?: TransactionContext): Promise<MrrMovementRecord[]>;
  getNetMrrDeltaForPeriod(
    from: string,
    to: string,
    currency?: string,
    tx?: TransactionContext
  ): Promise<{
    newMrr: number;
    expansionMrr: number;
    contractionMrr: number;
    churnMrr: number;
    reactivationMrr: number;
    netMrrDelta: number;
  }>;
  clear(): void;
}

export class MrrMovementRepository implements IMrrMovementRepository {
  private static store: MrrMovementRecord[] = [];

  static clear(): void {
    MrrMovementRepository.store = [];
  }

  clear(): void {
    MrrMovementRepository.store = [];
  }

  async recordMovement(
    data: Omit<MrrMovementRecord, "id" | "createdAt">,
    _tx?: TransactionContext
  ): Promise<MrrMovementRecord> {
    const id = `mrr-mov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const record: MrrMovementRecord = {
      ...data,
      id,
      createdAt: now,
    };

    MrrMovementRepository.store.push(record);
    return { ...record };
  }

  async getMovements(params?: {
    tenantId?: string;
    subscriptionId?: string;
    movementType?: MrrMovementType;
    from?: string;
    to?: string;
    currency?: string;
    limit?: number;
  }, _tx?: TransactionContext): Promise<MrrMovementRecord[]> {
    let list = [...MrrMovementRepository.store];

    if (params?.tenantId) {
      list = list.filter((m) => m.tenantId === params.tenantId);
    }
    if (params?.subscriptionId) {
      list = list.filter((m) => m.subscriptionId === params.subscriptionId);
    }
    if (params?.movementType) {
      list = list.filter((m) => m.movementType === params.movementType);
    }
    if (params?.currency) {
      const cur = params.currency.toUpperCase();
      list = list.filter((m) => m.currency.toUpperCase() === cur);
    }
    if (params?.from) {
      list = list.filter((m) => m.occurredAt >= params.from!);
    }
    if (params?.to) {
      const toBound = params.to.length === 10 ? `${params.to}T23:59:59.999Z` : params.to;
      list = list.filter((m) => m.occurredAt <= toBound);
    }

    // Sort descending by occurredAt
    list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    if (params?.limit && params.limit > 0) {
      list = list.slice(0, params.limit);
    }

    return list.map((m) => ({ ...m }));
  }

  async getNetMrrDeltaForPeriod(
    from: string,
    to: string,
    currency = "KES",
    _tx?: TransactionContext
  ): Promise<{
    newMrr: number;
    expansionMrr: number;
    contractionMrr: number;
    churnMrr: number;
    reactivationMrr: number;
    netMrrDelta: number;
  }> {
    const cur = currency.toUpperCase();
    const toBound = to.length === 10 ? `${to}T23:59:59.999Z` : to;
    const movements = MrrMovementRepository.store.filter(
      (m) =>
        m.currency.toUpperCase() === cur &&
        m.occurredAt >= from &&
        m.occurredAt <= toBound
    );

    let newMrr = 0;
    let expansionMrr = 0;
    let contractionMrr = 0;
    let churnMrr = 0;
    let reactivationMrr = 0;

    for (const m of movements) {
      switch (m.movementType) {
        case "NEW":
          newMrr += m.mrrDelta;
          break;
        case "EXPANSION":
          expansionMrr += m.mrrDelta;
          break;
        case "CONTRACTION":
          contractionMrr += Math.abs(m.mrrDelta);
          break;
        case "CHURN":
          churnMrr += Math.abs(m.mrrDelta);
          break;
        case "REACTIVATION":
          reactivationMrr += m.mrrDelta;
          break;
      }
    }

    const netMrrDelta = newMrr + expansionMrr + reactivationMrr - contractionMrr - churnMrr;

    return {
      newMrr,
      expansionMrr,
      contractionMrr,
      churnMrr,
      reactivationMrr,
      netMrrDelta,
    };
  }
}
