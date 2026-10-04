import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — VEHICLE OWNER PERSISTENCE REPOSITORY (DEV-004, DOM-001, DOM-003)
// Vehicle Owner / Fleet Partner Asset Investor Management
// ============================================================================

import type { VehicleOwner, VehicleOwnerFilterQueryDto } from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  CrossTenantViolationError,
  UniqueConstraintViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IVehicleOwnerRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<VehicleOwner | null>;
  findByEmail(email: string, tenantId: string, tx?: TransactionContext): Promise<VehicleOwner | null>;
  findAll(tenantId: string, filter?: VehicleOwnerFilterQueryDto, tx?: TransactionContext): Promise<{ owners: VehicleOwner[]; total: number }>;
  create(data: Omit<VehicleOwner, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<VehicleOwner>;
  update(id: string, tenantId: string, data: Partial<VehicleOwner>, expectedVersion?: number, tx?: TransactionContext): Promise<VehicleOwner>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class VehicleOwnerRepository implements IVehicleOwnerRepository {
  private static ownerStore = createRecordStore<string, VehicleOwner>("vehicle-owner.repository:ownerStore");

  async findById(id: string, tenantId: string): Promise<VehicleOwner | null> {
    const owner = VehicleOwnerRepository.ownerStore.get(id);
    if (!owner) return null;
    if (owner.tenantId !== tenantId) {
      throw new CrossTenantViolationError(owner.tenantId, tenantId);
    }
    return { ...owner };
  }

  async findByEmail(email: string, tenantId: string): Promise<VehicleOwner | null> {
    const normalized = email.trim().toLowerCase();
    for (const owner of VehicleOwnerRepository.ownerStore.values()) {
      if (owner.tenantId === tenantId && owner.email.trim().toLowerCase() === normalized) {
        return { ...owner };
      }
    }
    return null;
  }

  async findAll(
    tenantId: string,
    filter?: VehicleOwnerFilterQueryDto
  ): Promise<{ owners: VehicleOwner[]; total: number }> {
    let results = Array.from(VehicleOwnerRepository.ownerStore.values()).filter(
      (o) => o.tenantId === tenantId
    );

    if (filter) {
      if (filter.status) {
        results = results.filter((o) => o.status === filter.status);
      }
      if (filter.ownershipType) {
        results = results.filter((o) => o.ownershipType === filter.ownershipType);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        results = results.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            (o.companyName && o.companyName.toLowerCase().includes(q)) ||
            o.email.toLowerCase().includes(q) ||
            o.phone.includes(q) ||
            (o.taxPinNumber && o.taxPinNumber.toLowerCase().includes(q))
        );
      }
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = results.length;
    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    const startIndex = (page - 1) * limit;
    const paginated = results.slice(startIndex, startIndex + limit);

    return { owners: paginated.map((o) => ({ ...o })), total };
  }

  async create(data: Omit<VehicleOwner, "id" | "createdAt" | "updatedAt">): Promise<VehicleOwner> {
    const email=data.email.trim().toLowerCase();
    const phone=data.phone.replace(/[^0-9]/g,"");
    const identity=data.idOrPassportNumber?.trim().toLowerCase();
    const taxPin=data.taxPinNumber?.trim().toLowerCase();
    for(const existing of VehicleOwnerRepository.ownerStore.values()){
      if(existing.tenantId!==data.tenantId)continue;
      if(existing.email.trim().toLowerCase()===email)throw new UniqueConstraintViolationError("vehicle-owner email");
      if(existing.phone.replace(/[^0-9]/g,"")===phone)throw new UniqueConstraintViolationError("vehicle-owner phone number");
      if(identity&&existing.idOrPassportNumber?.trim().toLowerCase()===identity)throw new UniqueConstraintViolationError("vehicle-owner ID / passport");
      if(taxPin&&existing.taxPinNumber?.trim().toLowerCase()===taxPin)throw new UniqueConstraintViolationError("vehicle-owner tax PIN");
    }
    const now = new Date().toISOString();
    const newOwner: VehicleOwner = {
      ...data,
      id: crypto.randomUUID(),
      ownerType: data.ownerType || "INDIVIDUAL",
      status: data.status || "ACTIVE",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    VehicleOwnerRepository.ownerStore.set(newOwner.id, newOwner);
    return { ...newOwner };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<VehicleOwner>,
    expectedVersion?: number
  ): Promise<VehicleOwner> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("vehicle_owners", id);
    }

    if (expectedVersion !== undefined && existing.version !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic lock violation: Expected vehicle owner version ${expectedVersion} but found ${existing.version}`
      );
    }

    for(const owner of VehicleOwnerRepository.ownerStore.values()){
      if(owner.id===id||owner.tenantId!==tenantId)continue;
      if(data.email&&owner.email.trim().toLowerCase()===data.email.trim().toLowerCase())throw new UniqueConstraintViolationError("vehicle-owner email");
      if(data.phone&&owner.phone.replace(/[^0-9]/g,"")===data.phone.replace(/[^0-9]/g,""))throw new UniqueConstraintViolationError("vehicle-owner phone number");
      if(data.idOrPassportNumber&&owner.idOrPassportNumber?.trim().toLowerCase()===data.idOrPassportNumber.trim().toLowerCase())throw new UniqueConstraintViolationError("vehicle-owner ID / passport");
      if(data.taxPinNumber&&owner.taxPinNumber?.trim().toLowerCase()===data.taxPinNumber.trim().toLowerCase())throw new UniqueConstraintViolationError("vehicle-owner tax PIN");
    }
    const now = new Date().toISOString();
    const updated: VehicleOwner = {
      ...existing,
      ...data,
      id,
      tenantId,
      version: (existing.version || 1) + 1,
      updatedAt: now,
    };

    VehicleOwnerRepository.ownerStore.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("vehicle_owners", id);
    }
    VehicleOwnerRepository.ownerStore.delete(id);
  }

  // Test utility
  public static clear(): void {
    VehicleOwnerRepository.ownerStore.clear();
  }
}
