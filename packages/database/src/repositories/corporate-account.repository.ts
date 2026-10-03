import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — CORPORATE ACCOUNT PERSISTENCE REPOSITORY (DEV-004, DOM-001, DOM-003)
// Corporate B2B Account & Fleet Client Partner Management
// ============================================================================

import type {
  CorporateAccount,
  CorporateAccountFilterQueryDto,
  AuthorizedCorporateDriver,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ICorporateAccountRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<CorporateAccount | null>;
  findByRegistrationNumber(registrationNumber: string, tenantId: string, tx?: TransactionContext): Promise<CorporateAccount | null>;
  findByAccountNumber(accountNumber: string, tenantId: string, tx?: TransactionContext): Promise<CorporateAccount | null>;
  findAll(tenantId: string, filter?: CorporateAccountFilterQueryDto, tx?: TransactionContext): Promise<{ accounts: CorporateAccount[]; total: number }>;
  list(tenantId: string, tx?: TransactionContext): Promise<CorporateAccount[]>;
  listByTenant(tenantId: string, tx?: TransactionContext): Promise<CorporateAccount[]>;
  create(data: Omit<CorporateAccount, "id" | "accountNumber" | "version" | "createdAt" | "updatedAt"> & { accountNumber?: string }, tx?: TransactionContext): Promise<CorporateAccount>;
  update(id: string, tenantId: string, data: Partial<CorporateAccount>, expectedVersion?: number, tx?: TransactionContext): Promise<CorporateAccount>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;

  // Authorized Corporate Drivers
  listAuthorizedDrivers(corporateAccountId: string, tenantId: string): Promise<AuthorizedCorporateDriver[]>;
  addAuthorizedDriver(data: Omit<AuthorizedCorporateDriver, "id" | "createdAt" | "updatedAt">): Promise<AuthorizedCorporateDriver>;
  removeAuthorizedDriver(id: string, tenantId: string): Promise<void>;
}

export class CorporateAccountRepository implements ICorporateAccountRepository {
  private static accountStore = createRecordStore<string, CorporateAccount>("corporate-account.repository:accountStore");
  private static authorizedDriverStore = createRecordStore<string, AuthorizedCorporateDriver>("corporate-account.repository:authorizedDriverStore");
  private static accountSequence = 50;

  static clear(): void {
    CorporateAccountRepository.accountStore.clear();
    CorporateAccountRepository.authorizedDriverStore.clear();
    CorporateAccountRepository.accountSequence = 50;
  }

  static seed(accounts: CorporateAccount[]): void {
    for (const a of accounts) {
      CorporateAccountRepository.accountStore.set(a.id, { ...a });
    }
  }

  async findById(id: string, tenantId: string): Promise<CorporateAccount | null> {
    const account = CorporateAccountRepository.accountStore.get(id);
    if (!account) return null;
    if (account.tenantId !== tenantId) {
      throw new CrossTenantViolationError(account.tenantId, tenantId);
    }
    return { ...account };
  }

  async findByRegistrationNumber(registrationNumber: string, tenantId: string): Promise<CorporateAccount | null> {
    const normalized = registrationNumber.trim().toLowerCase();
    for (const account of CorporateAccountRepository.accountStore.values()) {
      if (account.tenantId === tenantId && account.registrationNumber.trim().toLowerCase() === normalized) {
        return { ...account };
      }
    }
    return null;
  }

  async findByAccountNumber(accountNumber: string, tenantId: string): Promise<CorporateAccount | null> {
    const normalized = accountNumber.trim().toUpperCase();
    for (const account of CorporateAccountRepository.accountStore.values()) {
      if (account.tenantId === tenantId && account.accountNumber.trim().toUpperCase() === normalized) {
        return { ...account };
      }
    }
    return null;
  }

  async findAll(
    tenantId: string,
    filter?: CorporateAccountFilterQueryDto
  ): Promise<{ accounts: CorporateAccount[]; total: number }> {
    let results = Array.from(CorporateAccountRepository.accountStore.values()).filter(
      (a) => a.tenantId === tenantId
    );

    if (filter) {
      if (filter.status) {
        results = results.filter((a) => a.status === filter.status);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        results = results.filter(
          (a) =>
            a.companyName.toLowerCase().includes(q) ||
            a.accountNumber.toLowerCase().includes(q) ||
            a.registrationNumber.toLowerCase().includes(q) ||
            a.contactPerson.toLowerCase().includes(q) ||
            a.email.toLowerCase().includes(q) ||
            a.phone.includes(q)
        );
      }
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = results.length;
    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    const startIndex = (page - 1) * limit;
    const paginated = results.slice(startIndex, startIndex + limit);

    return { accounts: paginated.map((a) => ({ ...a })), total };
  }

  async list(tenantId: string): Promise<CorporateAccount[]> {
    const res = await this.findAll(tenantId, { limit: 1000 });
    return res.accounts;
  }

  async listByTenant(tenantId: string): Promise<CorporateAccount[]> {
    return this.list(tenantId);
  }

  async create(
    data: Omit<CorporateAccount, "id" | "accountNumber" | "version" | "createdAt" | "updatedAt"> & { accountNumber?: string }
  ): Promise<CorporateAccount> {
    const now = new Date().toISOString();
    CorporateAccountRepository.accountSequence++;
    const num = String(CorporateAccountRepository.accountSequence).padStart(6, "0");
    const accountNumber = data.accountNumber || `CORP-${new Date().getFullYear()}-${num}`;

    const newAccount: CorporateAccount = {
      ...data,
      id: crypto.randomUUID(),
      accountNumber,
      creditLimit: data.creditLimit ?? 0,
      paymentTermsDays: data.paymentTermsDays ?? 30,
      discountRatePercent: data.discountRatePercent ?? 0,
      status: data.status || "ACTIVE",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    CorporateAccountRepository.accountStore.set(newAccount.id, newAccount);
    return { ...newAccount };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<CorporateAccount>,
    expectedVersion?: number
  ): Promise<CorporateAccount> {
    const account = CorporateAccountRepository.accountStore.get(id);
    if (!account) {
      throw new RecordNotFoundError("CorporateAccount", id);
    }
    if (account.tenantId !== tenantId) {
      throw new CrossTenantViolationError(account.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && account.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`CorporateAccount ${id} version mismatch: expected ${expectedVersion}, actual ${account.version}`);
    }

    const updatedAccount: CorporateAccount = {
      ...account,
      ...data,
      id: account.id,
      tenantId: account.tenantId,
      accountNumber: account.accountNumber,
      version: account.version + 1,
      updatedAt: new Date().toISOString(),
    };

    CorporateAccountRepository.accountStore.set(id, updatedAccount);
    return { ...updatedAccount };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const account = CorporateAccountRepository.accountStore.get(id);
    if (!account) return;
    if (account.tenantId !== tenantId) {
      throw new CrossTenantViolationError(account.tenantId, tenantId);
    }
    CorporateAccountRepository.accountStore.delete(id);
  }

  async listAuthorizedDrivers(corporateAccountId: string, tenantId: string): Promise<AuthorizedCorporateDriver[]> {
    return Array.from(CorporateAccountRepository.authorizedDriverStore.values())
      .filter((d) => d.tenantId === tenantId && d.corporateAccountId === corporateAccountId)
      .map((d) => ({ ...d }));
  }

  async addAuthorizedDriver(
    data: Omit<AuthorizedCorporateDriver, "id" | "createdAt" | "updatedAt">
  ): Promise<AuthorizedCorporateDriver> {
    const now = new Date().toISOString();
    const newEntry: AuthorizedCorporateDriver = {
      ...data,
      id: crypto.randomUUID(),
      status: data.status || "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    CorporateAccountRepository.authorizedDriverStore.set(newEntry.id, newEntry);
    return { ...newEntry };
  }

  async removeAuthorizedDriver(id: string, tenantId: string): Promise<void> {
    const entry = CorporateAccountRepository.authorizedDriverStore.get(id);
    if (!entry) return;
    if (entry.tenantId !== tenantId) {
      throw new CrossTenantViolationError(entry.tenantId, tenantId);
    }
    CorporateAccountRepository.authorizedDriverStore.delete(id);
  }
}
