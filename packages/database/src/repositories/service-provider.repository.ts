import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — SERVICE PROVIDER / GARAGE PERSISTENCE REPOSITORY (SPRINT 17)
// Bounded Context: Maintenance Management (DOM-003 §23, DEV-004)
// ============================================================================

import type {
  ServiceProvider,
  ServiceProviderStatus,
  CreateServiceProviderDto,
  UpdateServiceProviderDto,
  MaintenanceType,
} from "@carhire/types";
import {
  MaintenanceProviderNotFoundError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IServiceProviderRepository {
  create(
    tenantId: string,
    data: CreateServiceProviderDto,
    tx?: TransactionContext
  ): Promise<ServiceProvider>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ServiceProvider | null>;

  list(
    tenantId: string,
    filters?: {
      status?: ServiceProviderStatus;
      serviceType?: MaintenanceType;
      search?: string;
    },
    tx?: TransactionContext
  ): Promise<ServiceProvider[]>;

  update(
    id: string,
    tenantId: string,
    data: UpdateServiceProviderDto,
    tx?: TransactionContext
  ): Promise<ServiceProvider>;

  deactivate(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ServiceProvider>;

  seed(providers: ServiceProvider[]): void;
}

export class ServiceProviderRepository implements IServiceProviderRepository {
  private providers: Map<string, ServiceProvider> = createRecordStore("service-provider.repository:providers");

  async create(
    tenantId: string,
    data: CreateServiceProviderDto,
    tx?: TransactionContext
  ): Promise<ServiceProvider> {
    if (!tenantId) {
      throw new Error("TenantId is mandatory to create a service provider.");
    }

    const now = new Date().toISOString();
    const provider: ServiceProvider = {
      id: crypto.randomUUID(),
      tenantId,
      name: data.name.trim(),
      code: data.code?.trim().toUpperCase(),
      contactPerson: data.contactPerson?.trim(),
      phone: data.phone?.trim(),
      email: data.email?.trim().toLowerCase(),
      location: data.location?.trim(),
      address: data.address?.trim(),
      status: "ACTIVE",
      notes: data.notes?.trim(),
      servicesProvided: data.servicesProvided || [],
      rating: 5.0,
      createdAt: now,
      updatedAt: now,
    };

    this.providers.set(provider.id, provider);
    return { ...provider };
  }

  async findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ServiceProvider | null> {
    const provider = this.providers.get(id);
    if (!provider) return null;
    if (provider.tenantId !== tenantId) {
      throw new CrossTenantViolationError(provider.tenantId, tenantId);
    }
    return { ...provider };
  }

  async list(
    tenantId: string,
    filters?: {
      status?: ServiceProviderStatus;
      serviceType?: MaintenanceType;
      search?: string;
    },
    tx?: TransactionContext
  ): Promise<ServiceProvider[]> {
    let result = Array.from(this.providers.values()).filter(
      (p) => p.tenantId === tenantId
    );

    if (filters?.status) {
      result = result.filter((p) => p.status === filters.status);
    }

    if (filters?.serviceType) {
      result = result.filter(
        (p) =>
          !p.servicesProvided ||
          p.servicesProvided.length === 0 ||
          p.servicesProvided.includes(filters.serviceType!)
      );
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q) ||
          p.contactPerson?.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ ...p }));
  }

  async update(
    id: string,
    tenantId: string,
    data: UpdateServiceProviderDto,
    tx?: TransactionContext
  ): Promise<ServiceProvider> {
    const provider = await this.findById(id, tenantId, tx);
    if (!provider) {
      throw new MaintenanceProviderNotFoundError(id);
    }

    const updated: ServiceProvider = {
      ...provider,
      name: data.name !== undefined ? data.name.trim() : provider.name,
      code: data.code !== undefined ? data.code.trim().toUpperCase() : provider.code,
      contactPerson: data.contactPerson !== undefined ? data.contactPerson.trim() : provider.contactPerson,
      phone: data.phone !== undefined ? data.phone.trim() : provider.phone,
      email: data.email !== undefined ? data.email.trim().toLowerCase() : provider.email,
      location: data.location !== undefined ? data.location.trim() : provider.location,
      address: data.address !== undefined ? data.address.trim() : provider.address,
      status: data.status !== undefined ? data.status : provider.status,
      servicesProvided: data.servicesProvided !== undefined ? data.servicesProvided : provider.servicesProvided,
      notes: data.notes !== undefined ? data.notes.trim() : provider.notes,
      rating: data.rating !== undefined ? data.rating : provider.rating,
      updatedAt: new Date().toISOString(),
    };

    this.providers.set(id, updated);
    return { ...updated };
  }

  async deactivate(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ServiceProvider> {
    return this.update(id, tenantId, { status: "INACTIVE" }, tx);
  }

  seed(providers: ServiceProvider[]): void {
    for (const p of providers) {
      this.providers.set(p.id, { ...p });
    }
  }
}
