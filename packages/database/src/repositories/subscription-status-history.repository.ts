// ============================================================================
// CAR HIRE OS — SUBSCRIPTION STATUS HISTORY REPOSITORY (Auditability)
// ============================================================================

import type { SubscriptionStatusHistory, SubscriptionStatus } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface ISubscriptionStatusHistoryRepository {
  record(
    data: Omit<SubscriptionStatusHistory, "id" | "occurredAt">,
    tx?: TransactionContext
  ): Promise<SubscriptionStatusHistory>;
  listBySubscriptionId(
    subscriptionId: string,
    tx?: TransactionContext
  ): Promise<SubscriptionStatusHistory[]>;
  listByTenantId(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<SubscriptionStatusHistory[]>;
}

export class SubscriptionStatusHistoryRepository
  implements ISubscriptionStatusHistoryRepository
{
  private static store: SubscriptionStatusHistory[] = [];

  static initializeSeed(seedHistory?: SubscriptionStatusHistory[]) {
    if (seedHistory) {
      this.store = [...seedHistory];
    }
  }

  async record(
    data: Omit<SubscriptionStatusHistory, "id" | "occurredAt">
  ): Promise<SubscriptionStatusHistory> {
    const entry: SubscriptionStatusHistory = {
      ...data,
      id: `sub-hist-${crypto.randomUUID()}`,
      occurredAt: new Date().toISOString(),
    };

    SubscriptionStatusHistoryRepository.store.push(entry);
    return { ...entry };
  }

  async listBySubscriptionId(
    subscriptionId: string
  ): Promise<SubscriptionStatusHistory[]> {
    return SubscriptionStatusHistoryRepository.store
      .filter((h) => h.subscriptionId === subscriptionId)
      .map((h) => ({ ...h }))
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }

  async listByTenantId(
    tenantId: string
  ): Promise<SubscriptionStatusHistory[]> {
    return SubscriptionStatusHistoryRepository.store
      .filter((h) => h.tenantId === tenantId)
      .map((h) => ({ ...h }))
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }

  static clearStore() {
    this.store = [];
  }
}
