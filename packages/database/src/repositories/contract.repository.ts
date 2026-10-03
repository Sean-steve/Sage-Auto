import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — CONTRACT PERSISTENCE REPOSITORY (DOM-003 §17, DEV-004, DEV-007)
// Bounded Context: Contracts & Legal Instruments
// Concurrency-safe, multi-tenant persistence with version snapshots & digital signatures
// ============================================================================

import type {
  RentalContract,
  ContractStatus,
  ContractStatusHistory,
  ContractSignature,
  ContractVersionRecord,
  ContractTermsSnapshot,
  PricingSnapshot,
  ContractListQueryDto,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  ContractNotFoundError,
  CrossTenantViolationError,
  ContractImmutableError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IContractRepository {
  create(
    tenantId: string,
    data: {
      contractNumber: string;
      bookingId: string;
      rentalId?: string | null;
      customerId: string;
      corporateAccountId?: string | null;
      primaryDriverId: string;
      vehicleId: string;
      status?: ContractStatus;
      templateVersion?: string;
      termsSnapshot: ContractTermsSnapshot;
      pricingSnapshot: PricingSnapshot;
      ownershipTermsSnapshot?: Record<string, any> | null;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    tx?: TransactionContext
  ): Promise<RentalContract>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalContract | null>;

  findByContractNumber(
    contractNumber: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalContract | null>;

  findByBookingId(
    bookingId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<RentalContract[]>;

  findMany(
    tenantId: string,
    query?: ContractListQueryDto,
    tx?: TransactionContext
  ): Promise<{ items: RentalContract[]; total: number }>;

  update(
    id: string,
    tenantId: string,
    data: Partial<RentalContract>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<RentalContract>;

  addSignature(
    tenantId: string,
    contractId: string,
    signature: Omit<ContractSignature, "id">,
    tx?: TransactionContext
  ): Promise<ContractSignature>;

  getSignatures(
    contractId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ContractSignature[]>;

  createVersion(
    tenantId: string,
    versionRecord: Omit<ContractVersionRecord, "id">,
    tx?: TransactionContext
  ): Promise<ContractVersionRecord>;

  getVersions(
    contractId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ContractVersionRecord[]>;

  appendStatusHistory(
    tenantId: string,
    entry: Omit<ContractStatusHistory, "id">,
    tx?: TransactionContext
  ): Promise<ContractStatusHistory>;

  getStatusHistory(
    contractId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ContractStatusHistory[]>;

  generateNextContractNumber(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<string>;
}

export class ContractRepository implements IContractRepository {
  private static contractStore = createRecordStore<string, RentalContract>("contract.repository:contractStore");
  private static signatureStore = createRecordStore<string, ContractSignature[]>("contract.repository:signatureStore");
  private static versionStore = createRecordStore<string, ContractVersionRecord[]>("contract.repository:versionStore");
  private static statusHistoryStore = createRecordStore<string, ContractStatusHistory[]>("contract.repository:statusHistoryStore");
  private static sequenceStore = createRecordStore<string, number>("contract.repository:sequenceStore");

  static clear(): void {
    ContractRepository.contractStore.clear();
    ContractRepository.signatureStore.clear();
    ContractRepository.versionStore.clear();
    ContractRepository.statusHistoryStore.clear();
    ContractRepository.sequenceStore.clear();
  }

  async generateNextContractNumber(
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}`;
    const currentSeq = (ContractRepository.sequenceStore.get(key) || 0) + 1;
    ContractRepository.sequenceStore.set(key, currentSeq);
    const padded = String(currentSeq).padStart(6, "0");
    return `CTR-${year}-${padded}`;
  }

  async create(
    tenantId: string,
    data: {
      contractNumber: string;
      bookingId: string;
      rentalId?: string | null;
      customerId: string;
      corporateAccountId?: string | null;
      primaryDriverId: string;
      vehicleId: string;
      status?: ContractStatus;
      templateVersion?: string;
      termsSnapshot: ContractTermsSnapshot;
      pricingSnapshot: PricingSnapshot;
      ownershipTermsSnapshot?: Record<string, any> | null;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
    },
    _tx?: TransactionContext
  ): Promise<RentalContract> {
    const id = `ctr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const status: ContractStatus = data.status || "GENERATED";
    const actorId = data.actorUserId || "system";
    const actorType = data.actorType || "USER";

    const newContract: RentalContract = {
      id,
      tenantId,
      contractNumber: data.contractNumber,
      bookingId: data.bookingId,
      rentalId: data.rentalId || null,
      customerId: data.customerId,
      corporateAccountId: data.corporateAccountId || null,
      primaryDriverId: data.primaryDriverId,
      vehicleId: data.vehicleId,
      status,
      templateVersion: data.templateVersion || "1.0.0",
      contractVersion: 1,
      termsSnapshot: data.termsSnapshot,
      pricingSnapshot: data.pricingSnapshot,
      ownershipTermsSnapshot: data.ownershipTermsSnapshot || null,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
      signatures: [],
      versions: [],
      statusHistory: [],
    };

    ContractRepository.contractStore.set(id, newContract);

    // Record initial version
    const initialVersion: ContractVersionRecord = {
      id: `ctrv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      contractId: id,
      tenantId,
      version: 1,
      termsSnapshot: data.termsSnapshot,
      pricingSnapshot: data.pricingSnapshot,
      vehicleId: data.vehicleId,
      customerId: data.customerId,
      primaryDriverId: data.primaryDriverId,
      isCurrent: true,
      createdAt: now,
      createdBy: actorId,
      changeReason: "Initial contract generation",
    };
    ContractRepository.versionStore.set(id, [initialVersion]);
    newContract.versions = [initialVersion];

    // Record initial status history
    const historyEntry: ContractStatusHistory = {
      id: `csh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      contractId: id,
      tenantId,
      fromStatus: "DRAFT",
      toStatus: status,
      actorType,
      actorId,
      actorName: "System/Operator",
      reason: "Contract generated from confirmed booking",
      occurredAt: now,
    };
    ContractRepository.statusHistoryStore.set(id, [historyEntry]);
    newContract.statusHistory = [historyEntry];

    return JSON.parse(JSON.stringify(newContract));
  }

  async findById(
    id: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalContract | null> {
    const contract = ContractRepository.contractStore.get(id);
    if (!contract) return null;
    if (contract.tenantId !== tenantId) {
      throw new CrossTenantViolationError(contract.tenantId, tenantId);
    }
    const hydrated = this.hydrateContract(contract);
    return JSON.parse(JSON.stringify(hydrated));
  }

  async findByContractNumber(
    contractNumber: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalContract | null> {
    for (const contract of ContractRepository.contractStore.values()) {
      if (contract.contractNumber === contractNumber && contract.tenantId === tenantId) {
        return JSON.parse(JSON.stringify(this.hydrateContract(contract)));
      }
    }
    return null;
  }

  async findByBookingId(
    bookingId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<RentalContract[]> {
    const results: RentalContract[] = [];
    for (const contract of ContractRepository.contractStore.values()) {
      if (contract.bookingId === bookingId && contract.tenantId === tenantId) {
        results.push(this.hydrateContract(contract));
      }
    }
    return JSON.parse(JSON.stringify(results));
  }

  async findMany(
    tenantId: string,
    query: ContractListQueryDto = {},
    _tx?: TransactionContext
  ): Promise<{ items: RentalContract[]; total: number }> {
    let items = Array.from(ContractRepository.contractStore.values()).filter(
      (c) => c.tenantId === tenantId
    );

    if (query.status) {
      items = items.filter((c) => c.status === query.status);
    }
    if (query.bookingId) {
      items = items.filter((c) => c.bookingId === query.bookingId);
    }
    if (query.customerId) {
      items = items.filter((c) => c.customerId === query.customerId);
    }
    if (query.vehicleId) {
      items = items.filter((c) => c.vehicleId === query.vehicleId);
    }
    if (query.search) {
      const s = query.search.toLowerCase();
      items = items.filter(
        (c) =>
          c.contractNumber.toLowerCase().includes(s) ||
          c.termsSnapshot?.customerFullName?.toLowerCase().includes(s) ||
          c.termsSnapshot?.vehicleRegistrationPlate?.toLowerCase().includes(s)
      );
    }

    const total = items.length;
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginated = items.slice(offset, offset + limit).map((c) => this.hydrateContract(c));

    return { items: JSON.parse(JSON.stringify(paginated)), total };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<RentalContract>,
    expectedVersion?: number,
    _tx?: TransactionContext
  ): Promise<RentalContract> {
    const existing = ContractRepository.contractStore.get(id);
    if (!existing) {
      throw new ContractNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Contract optimistic lock failure: expected version ${expectedVersion}, but found ${existing.version}.`
      );
    }

    const updated: RentalContract = {
      ...existing,
      ...data,
      id: existing.id,
      tenantId: existing.tenantId,
      contractNumber: existing.contractNumber,
      version: (existing.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    ContractRepository.contractStore.set(id, updated);
    return JSON.parse(JSON.stringify(this.hydrateContract(updated)));
  }

  async addSignature(
    tenantId: string,
    contractId: string,
    signature: Omit<ContractSignature, "id">,
    _tx?: TransactionContext
  ): Promise<ContractSignature> {
    const contract = await this.findById(contractId, tenantId);
    if (!contract) {
      throw new ContractNotFoundError(contractId);
    }

    const sigRecord: ContractSignature = {
      ...signature,
      id: `sig-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };

    const existingSigs = ContractRepository.signatureStore.get(contractId) || [];
    existingSigs.push(sigRecord);
    ContractRepository.signatureStore.set(contractId, existingSigs);

    return JSON.parse(JSON.stringify(sigRecord));
  }

  async getSignatures(
    contractId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<ContractSignature[]> {
    await this.findById(contractId, tenantId);
    const sigs = ContractRepository.signatureStore.get(contractId) || [];
    return JSON.parse(JSON.stringify(sigs));
  }

  async createVersion(
    tenantId: string,
    versionRecord: Omit<ContractVersionRecord, "id">,
    _tx?: TransactionContext
  ): Promise<ContractVersionRecord> {
    const contract = await this.findById(versionRecord.contractId, tenantId);
    if (!contract) {
      throw new ContractNotFoundError(versionRecord.contractId);
    }

    const record: ContractVersionRecord = {
      ...versionRecord,
      id: `ctrv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    const versions = ContractRepository.versionStore.get(versionRecord.contractId) || [];
    // Mark previous current as non-current
    for (const v of versions) {
      v.isCurrent = false;
    }
    versions.push(record);
    ContractRepository.versionStore.set(versionRecord.contractId, versions);

    return JSON.parse(JSON.stringify(record));
  }

  async getVersions(
    contractId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<ContractVersionRecord[]> {
    await this.findById(contractId, tenantId);
    const versions = ContractRepository.versionStore.get(contractId) || [];
    return JSON.parse(JSON.stringify(versions));
  }

  async appendStatusHistory(
    tenantId: string,
    entry: Omit<ContractStatusHistory, "id">,
    _tx?: TransactionContext
  ): Promise<ContractStatusHistory> {
    const history: ContractStatusHistory = {
      ...entry,
      id: `csh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      occurredAt: entry.occurredAt || new Date().toISOString(),
    };

    const existing = ContractRepository.statusHistoryStore.get(entry.contractId) || [];
    existing.push(history);
    ContractRepository.statusHistoryStore.set(entry.contractId, existing);

    return JSON.parse(JSON.stringify(history));
  }

  async getStatusHistory(
    contractId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<ContractStatusHistory[]> {
    await this.findById(contractId, tenantId);
    const history = ContractRepository.statusHistoryStore.get(contractId) || [];
    return JSON.parse(JSON.stringify(history));
  }

  private hydrateContract(contract: RentalContract): RentalContract {
    const signatures = ContractRepository.signatureStore.get(contract.id) || [];
    const versions = ContractRepository.versionStore.get(contract.id) || [];
    const statusHistory = ContractRepository.statusHistoryStore.get(contract.id) || [];

    return {
      ...contract,
      signatures,
      versions,
      statusHistory,
    };
  }
}
