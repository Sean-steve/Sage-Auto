import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — CUSTOMER PERSISTENCE REPOSITORY (DEV-004, DOM-001, DOM-003)
// Individual, VIP & Corporate Affiliated Renters Management
// ============================================================================

import type { Customer, CustomerFilterQueryDto } from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ICustomerRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<Customer | null>;
  findByEmail(email: string, tenantId: string, tx?: TransactionContext): Promise<Customer | null>;
  findByIdOrPassport(idOrPassportNumber: string, tenantId: string, tx?: TransactionContext): Promise<Customer | null>;
  findByCustomerNumber(customerNumber: string, tenantId: string, tx?: TransactionContext): Promise<Customer | null>;
  findAll(tenantId: string, filter?: CustomerFilterQueryDto, tx?: TransactionContext): Promise<{ customers: Customer[]; total: number }>;
  list(tenantId: string, tx?: TransactionContext): Promise<Customer[]>;
  listByTenant(tenantId: string, tx?: TransactionContext): Promise<Customer[]>;
  create(data: Omit<Customer, "id" | "customerNumber" | "totalRentalsCount" | "version" | "createdAt" | "updatedAt"> & { customerNumber?: string; totalRentalsCount?: number }, tx?: TransactionContext): Promise<Customer>;
  update(id: string, tenantId: string, data: Partial<Customer>, expectedVersion?: number, tx?: TransactionContext): Promise<Customer>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class CustomerRepository implements ICustomerRepository {
  private static customerStore = createRecordStore<string, Customer>("customer.repository:customerStore");
  private static customerSequence = 100;

  static clear(): void {
    CustomerRepository.customerStore.clear();
    CustomerRepository.customerSequence = 100;
  }

  static seed(customers: Customer[]): void {
    for (const c of customers) {
      CustomerRepository.customerStore.set(c.id, { ...c });
    }
  }

  async findById(id: string, tenantId: string): Promise<Customer | null> {
    const customer = CustomerRepository.customerStore.get(id);
    if (!customer) return null;
    if (customer.tenantId !== tenantId) {
      throw new CrossTenantViolationError(customer.tenantId, tenantId);
    }
    return { ...customer };
  }

  async findByEmail(email: string, tenantId: string): Promise<Customer | null> {
    const normalized = email.trim().toLowerCase();
    for (const customer of CustomerRepository.customerStore.values()) {
      if (customer.tenantId === tenantId && customer.email.trim().toLowerCase() === normalized) {
        return { ...customer };
      }
    }
    return null;
  }

  async findByIdOrPassport(idOrPassportNumber: string, tenantId: string): Promise<Customer | null> {
    const normalized = idOrPassportNumber.trim().toLowerCase();
    for (const customer of CustomerRepository.customerStore.values()) {
      if (customer.tenantId === tenantId && customer.idOrPassportNumber.trim().toLowerCase() === normalized) {
        return { ...customer };
      }
    }
    return null;
  }

  async findByCustomerNumber(customerNumber: string, tenantId: string): Promise<Customer | null> {
    const normalized = customerNumber.trim().toUpperCase();
    for (const customer of CustomerRepository.customerStore.values()) {
      if (customer.tenantId === tenantId && customer.customerNumber.trim().toUpperCase() === normalized) {
        return { ...customer };
      }
    }
    return null;
  }

  async findAll(
    tenantId: string,
    filter?: CustomerFilterQueryDto
  ): Promise<{ customers: Customer[]; total: number }> {
    let results = Array.from(CustomerRepository.customerStore.values()).filter(
      (c) => c.tenantId === tenantId
    );

    if (filter) {
      if (filter.status) {
        results = results.filter((c) => c.status === filter.status);
      }
      if (filter.verificationStatus) {
        results = results.filter((c) => c.verificationStatus === filter.verificationStatus);
      }
      if (filter.customerType) {
        results = results.filter((c) => c.customerType === filter.customerType);
      }
      if (filter.corporateAccountId) {
        results = results.filter((c) => c.corporateAccountId === filter.corporateAccountId);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        results = results.filter(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            c.customerNumber.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            c.idOrPassportNumber.toLowerCase().includes(q) ||
            c.licenseNumber.toLowerCase().includes(q)
        );
      }
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = results.length;
    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    const startIndex = (page - 1) * limit;
    const paginated = results.slice(startIndex, startIndex + limit);

    return { customers: paginated.map((c) => ({ ...c })), total };
  }

  async list(tenantId: string): Promise<Customer[]> {
    const res = await this.findAll(tenantId, { limit: 1000 });
    return res.customers;
  }

  async listByTenant(tenantId: string): Promise<Customer[]> {
    return this.list(tenantId);
  }

  async create(
    data: Omit<Customer, "id" | "customerNumber" | "totalRentalsCount" | "version" | "createdAt" | "updatedAt"> & { customerNumber?: string; totalRentalsCount?: number }
  ): Promise<Customer> {
    const now = new Date().toISOString();
    CustomerRepository.customerSequence++;
    const num = String(CustomerRepository.customerSequence).padStart(6, "0");
    const customerNumber = data.customerNumber || `CUS-${new Date().getFullYear()}-${num}`;

    const newCustomer: Customer = {
      ...data,
      id: crypto.randomUUID(),
      customerNumber,
      customerType: data.customerType || "INDIVIDUAL",
      status: data.status || "ACTIVE",
      verificationStatus: data.verificationStatus || "UNVERIFIED",
      totalRentalsCount: data.totalRentalsCount || 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    CustomerRepository.customerStore.set(newCustomer.id, newCustomer);
    return { ...newCustomer };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Customer>,
    expectedVersion?: number
  ): Promise<Customer> {
    const customer = CustomerRepository.customerStore.get(id);
    if (!customer) {
      throw new RecordNotFoundError("Customer", id);
    }
    if (customer.tenantId !== tenantId) {
      throw new CrossTenantViolationError(customer.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && customer.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`Customer ${id} version mismatch: expected ${expectedVersion}, actual ${customer.version}`);
    }

    const updatedCustomer: Customer = {
      ...customer,
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
      id: customer.id,
      tenantId: customer.tenantId,
      customerNumber: customer.customerNumber,
      version: customer.version + 1,
      updatedAt: new Date().toISOString(),
    };

    CustomerRepository.customerStore.set(id, updatedCustomer);
    return { ...updatedCustomer };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const customer = CustomerRepository.customerStore.get(id);
    if (!customer) return;
    if (customer.tenantId !== tenantId) {
      throw new CrossTenantViolationError(customer.tenantId, tenantId);
    }
    CustomerRepository.customerStore.delete(id);
  }
}
