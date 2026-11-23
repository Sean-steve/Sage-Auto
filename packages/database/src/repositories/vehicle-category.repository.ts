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
    private async initialize(): Promise<void> {
        // Seed standard categories if empty
        if ((await VehicleCategoryRepository.categoryStore.size) === 0) {
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
                (await VehicleCategoryRepository.categoryStore.set(cat.id, {
                    ...cat,
                    createdAt: now,
                    updatedAt: now,
                }));
            }
        }
    }
    async findById(id: string): Promise<VehicleCategoryItem | null> {
        await this.initialize();
        return (await VehicleCategoryRepository.categoryStore.get(id)) || null;
    }
    async findByCode(code: string, tenantId?: string): Promise<VehicleCategoryItem | null> {
        await this.initialize();
        const norm = code.trim().toUpperCase();
        for (const cat of (await VehicleCategoryRepository.categoryStore.values())) {
            if ((!cat.tenantId || cat.tenantId === tenantId) && cat.code.toUpperCase() === norm) {
                return { ...cat };
            }
        }
        return null;
    }
    async findAll(tenantId?: string): Promise<VehicleCategoryItem[]> {
        await this.initialize();
        return Array.from((await VehicleCategoryRepository.categoryStore.values()))
            .filter((c) => !c.tenantId || c.tenantId === tenantId)
            .map((c) => ({ ...c }));
    }
    async create(data: Omit<VehicleCategoryItem, "id" | "createdAt" | "updatedAt">): Promise<VehicleCategoryItem> {
        await this.initialize();
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
        (await VehicleCategoryRepository.categoryStore.set(newCat.id, newCat));
        return { ...newCat };
    }
    // Test utility
    public static async clear(): Promise<void> {
        (await VehicleCategoryRepository.categoryStore.clear());
    }
}
