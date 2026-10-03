import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — VEHICLE PERSISTENCE REPOSITORY (DEV-004, DOM-001, DOM-003)
// Multi-tenant, Concurrency-Safe Asset Management
// ============================================================================

import type {
  Vehicle,
  VehicleLifecycleStatus,
  VehicleAvailabilityStatus,
  VehicleFilterQueryDto,
  VehicleMileageRecord,
  VehicleFuelRecord,
  VehicleStatusHistory,
} from "@carhire/types";
import {
  UniqueConstraintViolationError,
  RecordNotFoundError,
  ConcurrencyConflictError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IVehicleRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<Vehicle | null>;
  findByRegistrationPlate(registrationPlate: string, tenantId: string, tx?: TransactionContext): Promise<Vehicle | null>;
  findByVin(vin: string, tenantId: string, tx?: TransactionContext): Promise<Vehicle | null>;
  findAll(tenantId: string, filter?: VehicleFilterQueryDto, tx?: TransactionContext): Promise<{ vehicles: Vehicle[]; total: number }>;
  listByTenant(tenantId: string, tx?: TransactionContext): Promise<Vehicle[]>;
  list(tenantId: string, tx?: TransactionContext): Promise<Vehicle[]>;
  listAll(tx?: TransactionContext): Promise<Vehicle[]>;
  getAll(tx?: TransactionContext): Promise<Vehicle[]>;
  countByTenant(tenantId: string, tx?: TransactionContext): Promise<number>;
  create(data: Omit<Vehicle, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<Vehicle>;
  update(id: string, tenantId: string, data: Partial<Vehicle>, expectedVersion?: number, tx?: TransactionContext): Promise<Vehicle>;
  updateStatus(
    id: string,
    tenantId: string,
    lifecycleStatus?: VehicleLifecycleStatus,
    availabilityStatus?: VehicleAvailabilityStatus,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<Vehicle>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
  recordMileage(
    id: string,
    tenantId: string,
    mileage: number,
    source?: VehicleMileageRecord["source"],
    recordedBy?: string,
    notes?: string,
    tx?: TransactionContext
  ): Promise<VehicleMileageRecord>;
  recordFuel(
    id: string,
    tenantId: string,
    fuelLevel: number,
    litersAdded?: number,
    cost?: number,
    source?: string,
    recordedBy?: string,
    tx?: TransactionContext
  ): Promise<VehicleFuelRecord>;
  recordStatusHistory(
    history: Omit<VehicleStatusHistory, "id" | "timestamp">,
    tx?: TransactionContext
  ): Promise<VehicleStatusHistory>;
  getStatusHistory(vehicleId: string, tenantId: string, limit?: number, tx?: TransactionContext): Promise<VehicleStatusHistory[]>;
  getMileageRecords(vehicleId: string, tenantId: string, limit?: number, tx?: TransactionContext): Promise<VehicleMileageRecord[]>;
  getFuelRecords(vehicleId: string, tenantId: string, limit?: number, tx?: TransactionContext): Promise<VehicleFuelRecord[]>;
}

export class VehicleRepository implements IVehicleRepository {
  private static vehicleStore = createRecordStore<string, Vehicle>("vehicle.repository:vehicleStore");
  private static mileageStore = createRecordStore<string, VehicleMileageRecord>("vehicle.repository:mileageStore");
  private static fuelStore = createRecordStore<string, VehicleFuelRecord>("vehicle.repository:fuelStore");
  private static statusHistoryStore = createRecordStore<string, VehicleStatusHistory>("vehicle.repository:statusHistoryStore");

  async findById(id: string, tenantId?: string): Promise<Vehicle | null> {
    const vehicle = VehicleRepository.vehicleStore.get(id);
    if (!vehicle) return null;
    if (tenantId && vehicle.tenantId !== tenantId) {
      throw new CrossTenantViolationError(vehicle.tenantId, tenantId);
    }
    return { ...vehicle };
  }

  async findByRegistrationPlate(registrationPlate: string, tenantId: string): Promise<Vehicle | null> {
    const normalized = registrationPlate.trim().toUpperCase().replace(/\s+/g, "");
    for (const vehicle of VehicleRepository.vehicleStore.values()) {
      if (
        vehicle.tenantId === tenantId &&
        vehicle.registrationPlate.trim().toUpperCase().replace(/\s+/g, "") === normalized
      ) {
        return { ...vehicle };
      }
    }
    return null;
  }

  async findByVin(vin: string, tenantId: string): Promise<Vehicle | null> {
    if (!vin) return null;
    const normalized = vin.trim().toUpperCase();
    for (const vehicle of VehicleRepository.vehicleStore.values()) {
      if (vehicle.tenantId === tenantId && vehicle.vin?.trim().toUpperCase() === normalized) {
        return { ...vehicle };
      }
    }
    return null;
  }

  async countByTenant(tenantId: string): Promise<number> {
    let count = 0;
    for (const vehicle of VehicleRepository.vehicleStore.values()) {
      if (vehicle.tenantId === tenantId) {
        count++;
      }
    }
    return count;
  }

  async findAll(tenantId: string, filter?: VehicleFilterQueryDto): Promise<{ vehicles: Vehicle[]; total: number }> {
    let results = Array.from(VehicleRepository.vehicleStore.values()).filter(
      (v) => v.tenantId === tenantId
    );

    if (filter) {
      if (filter.lifecycleStatus) {
        results = results.filter((v) => v.lifecycleStatus === filter.lifecycleStatus);
      }
      if (filter.availabilityStatus) {
        results = results.filter((v) => v.availabilityStatus === filter.availabilityStatus);
      }
      if (filter.category) {
        results = results.filter((v) => v.category.toLowerCase() === filter.category!.toLowerCase());
      }
      if (filter.ownerId) {
        results = results.filter((v) => v.ownerId === filter.ownerId);
      }
      if (filter.isPublishedToWebsite !== undefined) {
        results = results.filter((v) => v.isPublishedToWebsite === filter.isPublishedToWebsite);
      }
      if (filter.search) {
        const query = filter.search.toLowerCase();
        results = results.filter(
          (v) =>
            v.registrationPlate.toLowerCase().includes(query) ||
            v.make.toLowerCase().includes(query) ||
            v.model.toLowerCase().includes(query) ||
            (v.vin && v.vin.toLowerCase().includes(query))
        );
      }
    }

    // Sort
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = results.length;
    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    const startIndex = (page - 1) * limit;
    const paginated = results.slice(startIndex, startIndex + limit);

    return { vehicles: paginated.map((v) => ({ ...v })), total };
  }

  async listByTenant(tenantId: string): Promise<Vehicle[]> {
    const result = await this.findAll(tenantId, { limit: 1000 });
    return result.vehicles;
  }

  async list(tenantId: string): Promise<Vehicle[]> {
    return this.listByTenant(tenantId);
  }

  async listAll(_tx?: TransactionContext): Promise<Vehicle[]> {
    return Array.from(VehicleRepository.vehicleStore.values()).map((v) => ({ ...v }));
  }

  async getAll(tx?: TransactionContext): Promise<Vehicle[]> {
    return this.listAll(tx);
  }

  async create(data: Omit<Vehicle, "id" | "createdAt" | "updatedAt">): Promise<Vehicle> {
    // Unique Plate check
    const existingPlate = await this.findByRegistrationPlate(data.registrationPlate, data.tenantId);
    if (existingPlate) {
      throw new UniqueConstraintViolationError("registration_plate", data.registrationPlate);
    }

    if (data.vin) {
      const existingVin = await this.findByVin(data.vin, data.tenantId);
      if (existingVin) {
        throw new UniqueConstraintViolationError("vin", data.vin);
      }
    }

    const now = new Date().toISOString();
    const newVehicle: Vehicle = {
      ...data,
      id: crypto.randomUUID(),
      features: data.features || [],
      lifecycleStatus: data.lifecycleStatus || "ACTIVE",
      availabilityStatus: data.availabilityStatus || "AVAILABLE",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    VehicleRepository.vehicleStore.set(newVehicle.id, newVehicle);
    return { ...newVehicle };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Vehicle>,
    expectedVersion?: number
  ): Promise<Vehicle> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("vehicles", id);
    }

    if (expectedVersion !== undefined && existing.version !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic concurrency violation: Expected vehicle version ${expectedVersion} but found ${existing.version}.`
      );
    }

    if (data.registrationPlate && data.registrationPlate !== existing.registrationPlate) {
      const plateInUse = await this.findByRegistrationPlate(data.registrationPlate, tenantId);
      if (plateInUse && plateInUse.id !== id) {
        throw new UniqueConstraintViolationError("registration_plate", data.registrationPlate);
      }
    }

    if (data.vin && data.vin !== existing.vin) {
      const vinInUse = await this.findByVin(data.vin, tenantId);
      if (vinInUse && vinInUse.id !== id) {
        throw new UniqueConstraintViolationError("vin", data.vin);
      }
    }

    const currentInStore = VehicleRepository.vehicleStore.get(id);
    if (expectedVersion !== undefined && currentInStore?.version !== undefined && currentInStore.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic concurrency violation: Expected vehicle version ${expectedVersion} but found ${currentInStore.version}.`
      );
    }

    const now = new Date().toISOString();
    const updated: Vehicle = {
      ...existing,
      ...data,
      id,
      tenantId,
      version: ((currentInStore?.version ?? existing.version) || 1) + 1,
      updatedAt: now,
    };

    VehicleRepository.vehicleStore.set(id, updated);
    return { ...updated };
  }

  async updateStatus(
    id: string,
    tenantId: string,
    lifecycleStatus?: VehicleLifecycleStatus,
    availabilityStatus?: VehicleAvailabilityStatus,
    expectedVersion?: number
  ): Promise<Vehicle> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("vehicles", id);
    }

    if (expectedVersion !== undefined && existing.version !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic lock failure: Vehicle version mismatch (expected: ${expectedVersion}, actual: ${existing.version})`
      );
    }

    const now = new Date().toISOString();
    const updated: Vehicle = {
      ...existing,
      lifecycleStatus: lifecycleStatus || existing.lifecycleStatus,
      availabilityStatus: availabilityStatus || existing.availabilityStatus,
      version: (existing.version || 1) + 1,
      updatedAt: now,
    };

    VehicleRepository.vehicleStore.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("vehicles", id);
    }
    VehicleRepository.vehicleStore.delete(id);
  }

  async recordMileage(
    id: string,
    tenantId: string,
    mileage: number,
    source: VehicleMileageRecord["source"] = "MANUAL_AUDIT",
    recordedBy?: string,
    notes?: string
  ): Promise<VehicleMileageRecord> {
    const vehicle = await this.findById(id, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("vehicles", id);
    }

    const record: VehicleMileageRecord = {
      id: crypto.randomUUID(),
      tenantId,
      vehicleId: id,
      recordedMileage: mileage,
      recordedAt: new Date().toISOString(),
      source,
      recordedBy,
      notes,
      createdAt: new Date().toISOString(),
    };

    VehicleRepository.mileageStore.set(record.id, record);

    // Update current vehicle odometer if greater
    if (mileage > vehicle.odometer) {
      await this.update(id, tenantId, { odometer: mileage });
    }

    return record;
  }

  async recordFuel(
    id: string,
    tenantId: string,
    fuelLevel: number,
    litersAdded?: number,
    cost?: number,
    source?: string,
    recordedBy?: string
  ): Promise<VehicleFuelRecord> {
    const vehicle = await this.findById(id, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("vehicles", id);
    }

    const record: VehicleFuelRecord = {
      id: crypto.randomUUID(),
      tenantId,
      vehicleId: id,
      fuelLevelPercent: Math.min(100, Math.max(0, fuelLevel)),
      litersAdded,
      cost,
      recordedAt: new Date().toISOString(),
      source,
      recordedBy,
      createdAt: new Date().toISOString(),
    };

    VehicleRepository.fuelStore.set(record.id, record);
    await this.update(id, tenantId, { fuelLevel: record.fuelLevelPercent });

    return record;
  }

  async recordStatusHistory(
    history: Omit<VehicleStatusHistory, "id" | "timestamp">
  ): Promise<VehicleStatusHistory> {
    const record: VehicleStatusHistory = {
      ...history,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    VehicleRepository.statusHistoryStore.set(record.id, record);
    return record;
  }

  async getStatusHistory(vehicleId: string, tenantId: string, limit: number = 20): Promise<VehicleStatusHistory[]> {
    return Array.from(VehicleRepository.statusHistoryStore.values())
      .filter((h) => h.vehicleId === vehicleId && h.tenantId === tenantId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getMileageRecords(vehicleId: string, tenantId: string, limit: number = 20): Promise<VehicleMileageRecord[]> {
    return Array.from(VehicleRepository.mileageStore.values())
      .filter((m) => m.vehicleId === vehicleId && m.tenantId === tenantId)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      .slice(0, limit);
  }

  async getFuelRecords(vehicleId: string, tenantId: string, limit: number = 20): Promise<VehicleFuelRecord[]> {
    return Array.from(VehicleRepository.fuelStore.values())
      .filter((f) => f.vehicleId === vehicleId && f.tenantId === tenantId)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      .slice(0, limit);
  }

  // Test utility
  public static clear(): void {
    VehicleRepository.vehicleStore.clear();
    VehicleRepository.mileageStore.clear();
    VehicleRepository.fuelStore.clear();
    VehicleRepository.statusHistoryStore.clear();
  }

  /**
   * Seeds the repository with initial vehicle data.
   * Only populates if the store is empty.
   */
  static initializeSeed(vehicles?: import("@carhire/types").Vehicle[]): void {
    if (VehicleRepository.vehicleStore.size > 0) return;
    if (!vehicles || vehicles.length === 0) return;
    for (const v of vehicles) {
      VehicleRepository.vehicleStore.set(v.id, { ...v });
    }
  }
}
