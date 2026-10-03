import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PARTY DOCUMENT & STATUS HISTORY REPOSITORY (DEV-004, DOM-001)
// KYC Attachments, Driver PSV Credentials & Lifecycle Audit Logs
// ============================================================================

import type { PartyDocumentItem, PartyStatusHistory } from "@carhire/types";
import { CrossTenantViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IPartyDocumentRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<PartyDocumentItem | null>;
  findByParty(partyType: string, partyId: string, tenantId: string): Promise<PartyDocumentItem[]>;
  listForCustomer(customerId: string, tenantId: string): Promise<PartyDocumentItem[]>;
  listForDriver(driverId: string, tenantId: string): Promise<PartyDocumentItem[]>;
  listForCorporate(corporateAccountId: string, tenantId: string): Promise<PartyDocumentItem[]>;
  create(data: Omit<PartyDocumentItem, "id" | "status" | "verificationStatus" | "createdAt" | "updatedAt"> & { status?: PartyDocumentItem["status"]; verificationStatus?: PartyDocumentItem["verificationStatus"] }): Promise<PartyDocumentItem>;
  update(id: string, tenantId: string, data: Partial<PartyDocumentItem>): Promise<PartyDocumentItem>;
  delete(id: string, tenantId: string): Promise<void>;

  // Status History
  recordStatusHistory(data: Omit<PartyStatusHistory, "id" | "timestamp">): Promise<PartyStatusHistory>;
  listStatusHistory(partyType: "CUSTOMER" | "DRIVER" | "CORPORATE_ACCOUNT" | "AGENT", partyId: string, tenantId: string): Promise<PartyStatusHistory[]>;
  getStatusHistory(partyType: "CUSTOMER" | "DRIVER" | "CORPORATE_ACCOUNT" | "AGENT", partyId: string, tenantId: string): Promise<PartyStatusHistory[]>;
}

export class PartyDocumentRepository implements IPartyDocumentRepository {
  private static docStore = createRecordStore<string, PartyDocumentItem>("party-document.repository:docStore");
  private static historyStore = createRecordStore<string, PartyStatusHistory>("party-document.repository:historyStore");

  static clear(): void {
    PartyDocumentRepository.docStore.clear();
    PartyDocumentRepository.historyStore.clear();
    PartyStatusHistoryStore.length = 0;
  }

  async findById(id: string, tenantId: string): Promise<PartyDocumentItem | null> {
    const doc = PartyDocumentRepository.docStore.get(id);
    if (!doc) return null;
    if (doc.tenantId !== tenantId) {
      throw new CrossTenantViolationError(doc.tenantId, tenantId);
    }
    return { ...doc };
  }

  async findByParty(partyType: string, partyId: string, tenantId: string): Promise<PartyDocumentItem[]> {
    return Array.from(PartyDocumentRepository.docStore.values())
      .filter((d) => d.tenantId === tenantId && (d.partyId === partyId || d.customerId === partyId || d.driverId === partyId || d.corporateAccountId === partyId))
      .map((d) => ({ ...d }));
  }

  async listForCustomer(customerId: string, tenantId: string): Promise<PartyDocumentItem[]> {
    return Array.from(PartyDocumentRepository.docStore.values())
      .filter((d) => d.tenantId === tenantId && (d.customerId === customerId || d.partyId === customerId))
      .map((d) => ({ ...d }));
  }

  async listForDriver(driverId: string, tenantId: string): Promise<PartyDocumentItem[]> {
    return Array.from(PartyDocumentRepository.docStore.values())
      .filter((d) => d.tenantId === tenantId && (d.driverId === driverId || d.partyId === driverId))
      .map((d) => ({ ...d }));
  }

  async listForCorporate(corporateAccountId: string, tenantId: string): Promise<PartyDocumentItem[]> {
    return Array.from(PartyDocumentRepository.docStore.values())
      .filter((d) => d.tenantId === tenantId && (d.corporateAccountId === corporateAccountId || d.partyId === corporateAccountId))
      .map((d) => ({ ...d }));
  }

  async create(data: Omit<PartyDocumentItem, "id" | "status" | "verificationStatus" | "createdAt" | "updatedAt"> & { status?: PartyDocumentItem["status"]; verificationStatus?: PartyDocumentItem["verificationStatus"] }): Promise<PartyDocumentItem> {
    const now = new Date().toISOString();
    const newDoc: PartyDocumentItem = {
      ...data,
      id: crypto.randomUUID(),
      status: data.status || "VALID",
      verificationStatus: data.verificationStatus || "PENDING",
      createdAt: now,
      updatedAt: now,
    };
    PartyDocumentRepository.docStore.set(newDoc.id, newDoc);
    return { ...newDoc };
  }

  async update(id: string, tenantId: string, data: Partial<PartyDocumentItem>): Promise<PartyDocumentItem> {
    const doc = PartyDocumentRepository.docStore.get(id);
    if (!doc) {
      throw new RecordNotFoundError("PartyDocumentItem", id);
    }
    if (doc.tenantId !== tenantId) {
      throw new CrossTenantViolationError(doc.tenantId, tenantId);
    }

    const updated: PartyDocumentItem = {
      ...doc,
      ...data,
      id: doc.id,
      tenantId: doc.tenantId,
      updatedAt: new Date().toISOString(),
    };
    PartyDocumentRepository.docStore.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const doc = PartyDocumentRepository.docStore.get(id);
    if (!doc) return;
    if (doc.tenantId !== tenantId) {
      throw new CrossTenantViolationError(doc.tenantId, tenantId);
    }
    PartyDocumentRepository.docStore.delete(id);
  }

  async recordStatusHistory(data: Omit<PartyStatusHistory, "id" | "timestamp">): Promise<PartyStatusHistory> {
    const history: PartyStatusHistory = {
      ...data,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    PartyStatusHistoryStore.push(history);
    return { ...history };
  }

  async listStatusHistory(
    partyType: "CUSTOMER" | "DRIVER" | "CORPORATE_ACCOUNT" | "AGENT",
    partyId: string,
    tenantId: string
  ): Promise<PartyStatusHistory[]> {
    return PartyStatusHistoryStore.filter(
      (h) => h.tenantId === tenantId && h.partyType === partyType && h.partyId === partyId
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getStatusHistory(
    partyType: "CUSTOMER" | "DRIVER" | "CORPORATE_ACCOUNT" | "AGENT",
    partyId: string,
    tenantId: string
  ): Promise<PartyStatusHistory[]> {
    return this.listStatusHistory(partyType, partyId, tenantId);
  }
}

const PartyStatusHistoryStore: PartyStatusHistory[] = [];
