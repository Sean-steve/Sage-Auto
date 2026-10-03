import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — VEHICLE CATEGORY PERSISTENCE REPOSITORY (DEV-004, DOM-001)
// ============================================================================

import type { VehicleCategoryItem } from "@carhire/types";
import { UniqueConstraintViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IVehicleCategoryRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<VehicleCategoryItem | null>;
  findByCode(code: string, tenantId?: string, tx?: TransactionContext): Promise<VehicleCategoryItem | null>;
  findAll(tenantId?: string, tx?: TransactionContext): Promise<VehicleCategoryItem[]>;
  create(data: Omit<VehicleCategoryItem, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<VehicleCategoryItem>;
}

export class VehicleCategoryRepository implements IVehicleCategoryRepository {
  private static categoryStore = createRecordStore<string, VehicleCategoryItem>("vehicle-category.repository:categoryStore");

  constructor() {
    // Seed standard categories if empty
    if (VehicleCategoryRepository.categoryStore.size === 0) {
      const defaultCategories: Omit<VehicleCategoryItem, "createdAt" | "updatedAt">[] = [
        { id: "cat-suv", name: "SUV", code: "SUV", description: "Sport Utility Vehicles and Crossovers", icon: "Car", status: "ACTIVE" },
        { id: "cat-sedan", name: "Sedan", code: "Sedan", description: "Executive and Standard 4-door Saloons", icon: "Car", status: "ACTIVE" },
        { id: "cat-4x4", name: "4x4 Offroad", code: "4x4 Offroad", description: "Rugged 4WD Safari and Expedition Vehicles", icon: "Shield", status: "ACTIVE" },
        { id: "cat-luxury", name: "Luxury", code: "Luxury", description: "Premium Chauffeur & VIP Fleet", icon: "Sparkles", status: "ACTIVE" },
        { id: "cat-hatchback", name: "Hatchback", code: "Hatchback", description: "Compact and Economy Urban Cruisers", icon: "Car", status: "ACTIVE" },
        { id: "cat-van", name: "Van/Bus", code: "Van/Bus", description: "Multi-Passenger Vans & Commercial Shuttles", icon: "Truck", status: "ACTIVE" },
      ];
      const now = new Date().toISOString();
      for (const cat of defaultCategories) {
        VehicleCategoryRepository.categoryStore.set(cat.id, {
          ...cat,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  async findById(id: string): Promise<VehicleCategoryItem | null> {
    return VehicleCategoryRepository.categoryStore.get(id) || null;
  }

  async findByCode(code: string, tenantId?: string): Promise<VehicleCategoryItem | null> {
    const norm = code.trim().toUpperCase();
    for (const cat of VehicleCategoryRepository.categoryStore.values()) {
      if ((!cat.tenantId || cat.tenantId === tenantId) && cat.code.toUpperCase() === norm) {
        return { ...cat };
      }
    }
    return null;
  }

  async findAll(tenantId?: string): Promise<VehicleCategoryItem[]> {
    return Array.from(VehicleCategoryRepository.categoryStore.values())
      .filter((c) => !c.tenantId || c.tenantId === tenantId)
      .map((c) => ({ ...c }));
  }

  async create(data: Omit<VehicleCategoryItem, "id" | "createdAt" | "updatedAt">): Promise<VehicleCategoryItem> {
    const existing = await this.findByCode(data.code, data.tenantId);
    if (existing) {
      throw new UniqueConstraintViolationError("code", data.code);
    }

    const now = new Date().toISOString();
    const newCat: VehicleCategoryItem = {
      ...data,
      id: crypto.randomUUID(),
      status: data.status || "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    VehicleCategoryRepository.categoryStore.set(newCat.id, newCat);
    return { ...newCat };
  }

  // Test utility
  public static clear(): void {
    VehicleCategoryRepository.categoryStore.clear();
  }
}
