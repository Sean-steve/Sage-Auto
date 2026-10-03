import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — SAAS BILLING ACCOUNT REPOSITORY
// ============================================================================

import type { BillingAccount } from "@carhire/types";
import { RecordNotFoundError, UniqueConstraintViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IBillingAccountRepository {
  findById(id: string, tx?: TransactionContext): Promise<BillingAccount | null>;
  findByTenantId(tenantId: string, tx?: TransactionContext): Promise<BillingAccount | null>;
  create(
    data: Omit<BillingAccount, "id" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<BillingAccount>;
  update(
    id: string,
    updates: Partial<BillingAccount>,
    tx?: TransactionContext
  ): Promise<BillingAccount>;
}

export class BillingAccountRepository implements IBillingAccountRepository {
  private static store = createRecordStore<string, BillingAccount>("billing-account.repository:store");

  static initializeSeed(seedAccounts?: BillingAccount[]) {
    if (seedAccounts) {
      seedAccounts.forEach((acc) => {
        this.store.set(acc.id, { ...acc });
      });
    }
  }

  async findById(id: string): Promise<BillingAccount | null> {
    const acc = BillingAccountRepository.store.get(id);
    return acc ? { ...acc } : null;
  }

  async findByTenantId(tenantId: string): Promise<BillingAccount | null> {
    for (const acc of BillingAccountRepository.store.values()) {
      if (acc.tenantId === tenantId) {
        return { ...acc };
      }
    }
    return null;
  }

  async create(
    data: Omit<BillingAccount, "id" | "createdAt" | "updatedAt">
  ): Promise<BillingAccount> {
    const existing = await this.findByTenantId(data.tenantId);
    if (existing) {
      throw new UniqueConstraintViolationError("tenantId", data.tenantId);
    }

    const now = new Date().toISOString();
    const newAccount: BillingAccount = {
      ...data,
      id: `bill-acc-${crypto.randomUUID()}`,
      status: data.status || "ACTIVE",
      currency: data.currency || "KES",
      createdAt: now,
      updatedAt: now,
    };

    BillingAccountRepository.store.set(newAccount.id, newAccount);
    return { ...newAccount };
  }

  async update(
    id: string,
    updates: Partial<BillingAccount>
  ): Promise<BillingAccount> {
    const acc = await this.findById(id);
    if (!acc) {
      throw new RecordNotFoundError("BillingAccount", id);
    }

    const updated: BillingAccount = {
      ...acc,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    BillingAccountRepository.store.set(id, updated);
    return { ...updated };
  }

  static clearStore() {
    this.store.clear();
  }
}
