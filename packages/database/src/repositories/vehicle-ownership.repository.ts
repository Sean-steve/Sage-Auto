import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — VEHICLE OWNERSHIP PERSISTENCE REPOSITORY (DEV-004, DOM-001)
// Historical Lineage & Commercial Revenue-Share Agreement Management
// ============================================================================

import type { VehicleOwnership, OwnershipType } from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IVehicleOwnershipRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<VehicleOwnership | null>;
  findActiveByVehicleId(vehicleId: string, tenantId: string, tx?: TransactionContext): Promise<VehicleOwnership | null>;
  findHistoryByVehicleId(vehicleId: string, tenantId: string, tx?: TransactionContext): Promise<VehicleOwnership[]>;
  findByOwnerId(ownerId: string, tenantId: string, tx?: TransactionContext): Promise<VehicleOwnership[]>;
  create(data: Omit<VehicleOwnership, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<VehicleOwnership>;
  retireActiveOwnership(vehicleId: string, tenantId: string, endDate?: string, tx?: TransactionContext): Promise<void>;
  assignOwnership(
    data: {
      tenantId: string;
      vehicleId: string;
      ownerId: string;
      ownershipType: OwnershipType;
      revenueSharePercent: number;
      fixedMonthlyPayout?: number;
      allowableExpenseDeductions?: boolean;
      termsSnapshot?: string;
      notes?: string;
      startDate?: string;
    },
    tx?: TransactionContext
  ): Promise<VehicleOwnership>;
}

export class VehicleOwnershipRepository implements IVehicleOwnershipRepository {
  private static ownershipStore = createRecordStore<string, VehicleOwnership>("vehicle-ownership.repository:ownershipStore");

  async findById(id: string, tenantId: string): Promise<VehicleOwnership | null> {
    const ownership = VehicleOwnershipRepository.ownershipStore.get(id);
    if (!ownership) return null;
    if (ownership.tenantId !== tenantId) {
      throw new CrossTenantViolationError(ownership.tenantId, tenantId);
    }
    return { ...ownership };
  }

  async findActiveByVehicleId(vehicleId: string, tenantId: string): Promise<VehicleOwnership | null> {
    for (const ownership of VehicleOwnershipRepository.ownershipStore.values()) {
      if (
        ownership.tenantId === tenantId &&
        ownership.vehicleId === vehicleId &&
        ownership.isActive
      ) {
        return { ...ownership };
      }
    }
    return null;
  }

  async findHistoryByVehicleId(vehicleId: string, tenantId: string): Promise<VehicleOwnership[]> {
    return Array.from(VehicleOwnershipRepository.ownershipStore.values())
      .filter((o) => o.tenantId === tenantId && o.vehicleId === vehicleId)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .map((o) => ({ ...o }));
  }

  async findByOwnerId(ownerId: string, tenantId: string): Promise<VehicleOwnership[]> {
    return Array.from(VehicleOwnershipRepository.ownershipStore.values())
      .filter((o) => o.tenantId === tenantId && o.ownerId === ownerId)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .map((o) => ({ ...o }));
  }

  async create(data: Omit<VehicleOwnership, "id" | "createdAt" | "updatedAt">): Promise<VehicleOwnership> {
    const now = new Date().toISOString();
    const newOwnership: VehicleOwnership = {
      ...data,
      id: crypto.randomUUID(),
      startDate: data.startDate || now,
      allowableExpenseDeductions: data.allowableExpenseDeductions ?? true,
      isActive: data.isActive ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    VehicleOwnershipRepository.ownershipStore.set(newOwnership.id, newOwnership);
    return { ...newOwnership };
  }

  async retireActiveOwnership(vehicleId: string, tenantId: string, endDate?: string): Promise<void> {
    const now = endDate || new Date().toISOString();
    for (const ownership of VehicleOwnershipRepository.ownershipStore.values()) {
      if (
        ownership.tenantId === tenantId &&
        ownership.vehicleId === vehicleId &&
        ownership.isActive
      ) {
        ownership.isActive = false;
        ownership.endDate = now;
        ownership.updatedAt = new Date().toISOString();
        ownership.version = (ownership.version || 1) + 1;
        VehicleOwnershipRepository.ownershipStore.set(ownership.id, ownership);
      }
    }
  }

  async assignOwnership(
    data: {
      tenantId: string;
      vehicleId: string;
      ownerId: string;
      ownershipType: OwnershipType;
      revenueSharePercent: number;
      fixedMonthlyPayout?: number;
      allowableExpenseDeductions?: boolean;
      termsSnapshot?: string;
      notes?: string;
      startDate?: string;
    }
  ): Promise<VehicleOwnership> {
    const startDate = data.startDate || new Date().toISOString();

    // 1. Retire any currently active agreement
    await this.retireActiveOwnership(data.vehicleId, data.tenantId, startDate);

    // 2. Insert new active ownership record
    const created = await this.create({
      tenantId: data.tenantId,
      vehicleId: data.vehicleId,
      ownerId: data.ownerId,
      ownershipType: data.ownershipType,
      revenueSharePercent: data.revenueSharePercent,
      fixedMonthlyPayout: data.fixedMonthlyPayout,
      allowableExpenseDeductions: data.allowableExpenseDeductions ?? true,
      termsSnapshot: data.termsSnapshot || `Agreement assigned on ${new Date().toLocaleDateString()}`,
      notes: data.notes,
      startDate,
      isActive: true,
    });

    return created;
  }

  // Test utility
  public static clear(): void {
    VehicleOwnershipRepository.ownershipStore.clear();
  }
}
