import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — VEHICLE DOCUMENT PERSISTENCE REPOSITORY (DEV-004, DOM-001)
// Insurance, Inspection, and Compliance Document Records
// ============================================================================

import type { VehicleDocumentItem } from "@carhire/types";
import { RecordNotFoundError, CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IVehicleDocumentRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<VehicleDocumentItem | null>;
  findByVehicleId(vehicleId: string, tenantId: string, tx?: TransactionContext): Promise<VehicleDocumentItem[]>;
  create(data: Omit<VehicleDocumentItem, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<VehicleDocumentItem>;
  update(id: string, tenantId: string, data: Partial<VehicleDocumentItem>, tx?: TransactionContext): Promise<VehicleDocumentItem>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class VehicleDocumentRepository implements IVehicleDocumentRepository {
  private static documentStore = createRecordStore<string, VehicleDocumentItem>("vehicle-document.repository:documentStore");

  async findById(id: string, tenantId: string): Promise<VehicleDocumentItem | null> {
    const doc = VehicleDocumentRepository.documentStore.get(id);
    if (!doc) return null;
    if (doc.tenantId !== tenantId) {
      throw new CrossTenantViolationError(doc.tenantId, tenantId);
    }
    return { ...doc };
  }

  async findByVehicleId(vehicleId: string, tenantId: string): Promise<VehicleDocumentItem[]> {
    return Array.from(VehicleDocumentRepository.documentStore.values())
      .filter((d) => d.tenantId === tenantId && d.vehicleId === vehicleId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((d) => ({ ...d }));
  }

  async create(data: Omit<VehicleDocumentItem, "id" | "createdAt" | "updatedAt">): Promise<VehicleDocumentItem> {
    const now = new Date().toISOString();
    const newDoc: VehicleDocumentItem = {
      ...data,
      id: crypto.randomUUID(),
      status: data.status || "VALID",
      verificationStatus: data.verificationStatus || "PENDING",
      createdAt: now,
      updatedAt: now,
    };

    VehicleDocumentRepository.documentStore.set(newDoc.id, newDoc);
    return { ...newDoc };
  }

  async update(id: string, tenantId: string, data: Partial<VehicleDocumentItem>): Promise<VehicleDocumentItem> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("vehicle_documents", id);
    }

    const updated: VehicleDocumentItem = {
      ...existing,
      ...data,
      id,
      tenantId,
      updatedAt: new Date().toISOString(),
    };

    VehicleDocumentRepository.documentStore.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("vehicle_documents", id);
    }
    VehicleDocumentRepository.documentStore.delete(id);
  }

  // Test utility
  public static clear(): void {
    VehicleDocumentRepository.documentStore.clear();
  }
}
