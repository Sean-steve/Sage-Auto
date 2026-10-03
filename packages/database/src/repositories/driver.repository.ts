import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — DRIVER PERSISTENCE REPOSITORY (DEV-004, DOM-001, DOM-003)
// Commercial, Designated & Chauffeur Driver Management
// ============================================================================

import type {
  Driver,
  DriverFilterQueryDto,
  CustomerDriverRelationship,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IDriverRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<Driver | null>;
  findByLicenseNumber(licenseNumber: string, tenantId: string, tx?: TransactionContext): Promise<Driver | null>;
  findByDriverNumber(driverNumber: string, tenantId: string, tx?: TransactionContext): Promise<Driver | null>;
  findAll(tenantId: string, filter?: DriverFilterQueryDto, tx?: TransactionContext): Promise<{ drivers: Driver[]; total: number }>;
  create(data: Omit<Driver, "id" | "driverNumber" | "version" | "createdAt" | "updatedAt"> & { driverNumber?: string }, tx?: TransactionContext): Promise<Driver>;
  update(id: string, tenantId: string, data: Partial<Driver>, expectedVersion?: number, tx?: TransactionContext): Promise<Driver>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;

  // Customer-Driver Relationships
  listCustomerDrivers(customerId: string, tenantId: string): Promise<CustomerDriverRelationship[]>;
  linkCustomerDriver(data: Omit<CustomerDriverRelationship, "id" | "createdAt">): Promise<CustomerDriverRelationship>;
  unlinkCustomerDriver(id: string, tenantId: string): Promise<void>;
}

export class DriverRepository implements IDriverRepository {
  private static driverStore = createRecordStore<string, Driver>("driver.repository:driverStore");
  private static relationshipStore = createRecordStore<string, CustomerDriverRelationship>("driver.repository:relationshipStore");
  private static driverSequence = 30;

  static clear(): void {
    DriverRepository.driverStore.clear();
    DriverRepository.relationshipStore.clear();
    DriverRepository.driverSequence = 30;
  }

  static seed(drivers: Driver[]): void {
    for (const d of drivers) {
      DriverRepository.driverStore.set(d.id, { ...d });
    }
  }

  async findById(id: string, tenantId: string): Promise<Driver | null> {
    const driver = DriverRepository.driverStore.get(id);
    if (!driver) return null;
    if (driver.tenantId !== tenantId) {
      throw new CrossTenantViolationError(driver.tenantId, tenantId);
    }
    return { ...driver };
  }

  async findByLicenseNumber(licenseNumber: string, tenantId: string): Promise<Driver | null> {
    const normalized = licenseNumber.trim().toLowerCase();
    for (const driver of DriverRepository.driverStore.values()) {
      if (driver.tenantId === tenantId && driver.licenseNumber.trim().toLowerCase() === normalized) {
        return { ...driver };
      }
    }
    return null;
  }

  async findByDriverNumber(driverNumber: string, tenantId: string): Promise<Driver | null> {
    const normalized = driverNumber.trim().toUpperCase();
    for (const driver of DriverRepository.driverStore.values()) {
      if (driver.tenantId === tenantId && driver.driverNumber.trim().toUpperCase() === normalized) {
        return { ...driver };
      }
    }
    return null;
  }

  async findAll(
    tenantId: string,
    filter?: DriverFilterQueryDto
  ): Promise<{ drivers: Driver[]; total: number }> {
    let results = Array.from(DriverRepository.driverStore.values()).filter(
      (d) => d.tenantId === tenantId
    );

    if (filter) {
      if (filter.status) {
        results = results.filter((d) => d.status === filter.status);
      }
      if (filter.verificationStatus) {
        results = results.filter((d) => d.verificationStatus === filter.verificationStatus);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        results = results.filter(
          (d) =>
            d.fullName.toLowerCase().includes(q) ||
            d.driverNumber.toLowerCase().includes(q) ||
            (d.email && d.email.toLowerCase().includes(q)) ||
            d.phone.includes(q) ||
            d.licenseNumber.toLowerCase().includes(q) ||
            (d.badgeNumber && d.badgeNumber.toLowerCase().includes(q))
        );
      }
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = results.length;
    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    const startIndex = (page - 1) * limit;
    const paginated = results.slice(startIndex, startIndex + limit);

    return { drivers: paginated.map((d) => ({ ...d })), total };
  }

  async create(
    data: Omit<Driver, "id" | "driverNumber" | "version" | "createdAt" | "updatedAt"> & { driverNumber?: string }
  ): Promise<Driver> {
    const now = new Date().toISOString();
    DriverRepository.driverSequence++;
    const num = String(DriverRepository.driverSequence).padStart(6, "0");
    const driverNumber = data.driverNumber || `DRV-${new Date().getFullYear()}-${num}`;

    const newDriver: Driver = {
      ...data,
      id: crypto.randomUUID(),
      driverNumber,
      verificationStatus: data.verificationStatus || "UNVERIFIED",
      status: data.status || "ACTIVE",
      rating: data.rating ?? 5.0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    DriverRepository.driverStore.set(newDriver.id, newDriver);
    return { ...newDriver };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Driver>,
    expectedVersion?: number
  ): Promise<Driver> {
    const driver = DriverRepository.driverStore.get(id);
    if (!driver) {
      throw new RecordNotFoundError("Driver", id);
    }
    if (driver.tenantId !== tenantId) {
      throw new CrossTenantViolationError(driver.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && driver.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`Driver ${id} version mismatch: expected ${expectedVersion}, actual ${driver.version}`);
    }

    const updatedDriver: Driver = {
      ...driver,
      ...data,
      id: driver.id,
      tenantId: driver.tenantId,
      driverNumber: driver.driverNumber,
      version: driver.version + 1,
      updatedAt: new Date().toISOString(),
    };

    DriverRepository.driverStore.set(id, updatedDriver);
    return { ...updatedDriver };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const driver = DriverRepository.driverStore.get(id);
    if (!driver) return;
    if (driver.tenantId !== tenantId) {
      throw new CrossTenantViolationError(driver.tenantId, tenantId);
    }
    DriverRepository.driverStore.delete(id);
  }

  async listCustomerDrivers(customerId: string, tenantId: string): Promise<CustomerDriverRelationship[]> {
    return Array.from(DriverRepository.relationshipStore.values())
      .filter((r) => r.tenantId === tenantId && r.customerId === customerId)
      .map((r) => ({ ...r }));
  }

  async linkCustomerDriver(
    data: Omit<CustomerDriverRelationship, "id" | "createdAt">
  ): Promise<CustomerDriverRelationship> {
    const now = new Date().toISOString();
    const newRel: CustomerDriverRelationship = {
      ...data,
      id: crypto.randomUUID(),
      isDefault: data.isDefault ?? false,
      status: data.status || "ACTIVE",
      createdAt: now,
    };
    DriverRepository.relationshipStore.set(newRel.id, newRel);
    return { ...newRel };
  }

  async unlinkCustomerDriver(id: string, tenantId: string): Promise<void> {
    const rel = DriverRepository.relationshipStore.get(id);
    if (!rel) return;
    if (rel.tenantId !== tenantId) {
      throw new CrossTenantViolationError(rel.tenantId, tenantId);
    }
    DriverRepository.relationshipStore.delete(id);
  }
}
