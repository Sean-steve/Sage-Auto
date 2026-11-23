import {NormalizedCustomerRepository} from './normalized-customer.repository';
import { createRecordStore, nextRecordNumber } from "../record-store";
// ============================================================================
// CAR HIRE OS — CUSTOMER PERSISTENCE REPOSITORY (DEV-004, DOM-001, DOM-003)
// Individual, VIP & Corporate Affiliated Renters Management
// ============================================================================
import type { Customer, CustomerFilterQueryDto } from "@carhire/types";
import { RecordNotFoundError, ConcurrencyConflictError, CrossTenantViolationError, UniqueConstraintViolationError, } from "../errors";
import { TransactionContext } from "../transaction-manager";
export interface ICustomerRepository {
    findById(id: string, tenantId: string, tx?: TransactionContext): Promise<Customer | null>;
    findByEmail(email: string, tenantId: string, tx?: TransactionContext): Promise<Customer | null>;
    findByIdOrPassport(idOrPassportNumber: string, tenantId: string, tx?: TransactionContext): Promise<Customer | null>;
    findByCustomerNumber(customerNumber: string, tenantId: string, tx?: TransactionContext): Promise<Customer | null>;
    findAll(tenantId: string, filter?: CustomerFilterQueryDto, tx?: TransactionContext): Promise<{
        customers: Customer[];
        total: number;
    }>;
    list(tenantId: string, tx?: TransactionContext): Promise<Customer[]>;
    listByTenant(tenantId: string, tx?: TransactionContext): Promise<Customer[]>;
    create(data: Omit<Customer, "id" | "customerNumber" | "totalRentalsCount" | "version" | "createdAt" | "updatedAt"> & {
        customerNumber?: string;
        totalRentalsCount?: number;
    }, tx?: TransactionContext): Promise<Customer>;
    update(id: string, tenantId: string, data: Partial<Customer>, expectedVersion?: number, tx?: TransactionContext): Promise<Customer>;
    delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}
export class CustomerRepository implements ICustomerRepository {
    constructor() {
        const backend = process.env.CUSTOMER_REPOSITORY_BACKEND;
        if (backend === 'normalized') return new NormalizedCustomerRepository();
        if (backend && backend !== 'compatibility') throw new Error('Unsupported CUSTOMER_REPOSITORY_BACKEND; refusing fallback.');
    }
    private static customerStore = createRecordStore<string, Customer>("customer.repository:customerStore");
    static async clear(): Promise<void> {
        if (process.env.CUSTOMER_REPOSITORY_BACKEND === 'normalized') throw new Error('Normalized customer cleanup requires explicit tenant-scoped deletes.');
        (await CustomerRepository.customerStore.clear());
    }
    static async seed(customers: Customer[]): Promise<void> {
        if (process.env.CUSTOMER_REPOSITORY_BACKEND === 'normalized') throw new Error('Use the verified normalized migration for customer imports.');
        for (const c of customers) {
            (await CustomerRepository.customerStore.set(c.id, { ...c }));
        }
    }
    async findById(id: string, tenantId: string): Promise<Customer | null> {
        const customer = (await CustomerRepository.customerStore.get(id));
        if (!customer)
            return null;
        if (customer.tenantId !== tenantId) {
            throw new CrossTenantViolationError(customer.tenantId, tenantId);
        }
        return { ...customer };
    }
    async findByEmail(email: string, tenantId: string): Promise<Customer | null> {
        const normalized = email.trim().toLowerCase();
        for (const customer of (await CustomerRepository.customerStore.values())) {
            if (customer.tenantId === tenantId && customer.email.trim().toLowerCase() === normalized) {
                return { ...customer };
            }
        }
        return null;
    }
    async findByIdOrPassport(idOrPassportNumber: string, tenantId: string): Promise<Customer | null> {
        const normalized = idOrPassportNumber.trim().toLowerCase();
        for (const customer of (await CustomerRepository.customerStore.values())) {
            if (customer.tenantId === tenantId && customer.idOrPassportNumber.trim().toLowerCase() === normalized) {
                return { ...customer };
            }
        }
        return null;
    }
    async findByCustomerNumber(customerNumber: string, tenantId: string): Promise<Customer | null> {
        const normalized = customerNumber.trim().toUpperCase();
        for (const customer of (await CustomerRepository.customerStore.values())) {
            if (customer.tenantId === tenantId && customer.customerNumber.trim().toUpperCase() === normalized) {
                return { ...customer };
            }
        }
        return null;
    }
    async findAll(tenantId: string, filter?: CustomerFilterQueryDto): Promise<{
        customers: Customer[];
        total: number;
    }> {
        let results = Array.from((await CustomerRepository.customerStore.values())).filter((c) => c.tenantId === tenantId);
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
                results = results.filter((c) => c.fullName.toLowerCase().includes(q) ||
                    c.customerNumber.toLowerCase().includes(q) ||
                    c.email.toLowerCase().includes(q) ||
                    c.phone.includes(q) ||
                    c.idOrPassportNumber.toLowerCase().includes(q) ||
                    c.licenseNumber.toLowerCase().includes(q));
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
    async create(data: Omit<Customer, "id" | "customerNumber" | "totalRentalsCount" | "version" | "createdAt" | "updatedAt"> & {
        customerNumber?: string;
        totalRentalsCount?: number;
    }): Promise<Customer> {
        const email = data.email.trim().toLowerCase();
        const phone = data.phone.replace(/[^0-9]/g, "");
        const identity = data.idOrPassportNumber.trim().toLowerCase();
        const licence = data.licenseNumber.trim().toLowerCase();
        for (const existing of (await CustomerRepository.customerStore.values())) {
            if (existing.tenantId !== data.tenantId)
                continue;
            if (existing.email.trim().toLowerCase() === email)
                throw new UniqueConstraintViolationError("customer email");
            if (existing.phone.replace(/[^0-9]/g, "") === phone)
                throw new UniqueConstraintViolationError("customer phone number");
            if (existing.idOrPassportNumber.trim().toLowerCase() === identity)
                throw new UniqueConstraintViolationError("ID / passport number");
            if (existing.licenseNumber.trim().toLowerCase() === licence)
                throw new UniqueConstraintViolationError("driving licence number");
        }
        const now = new Date().toISOString();
        const customerNumber = data.customerNumber || (await nextRecordNumber("customer.repository:customerStore", "customerNumber", `CUS-${new Date().getFullYear()}-`, 100));
        const newCustomer: Customer = {
            ...data,
            email,
            phone: data.phone.trim(),
            idOrPassportNumber: data.idOrPassportNumber.trim(),
            licenseNumber: data.licenseNumber.trim(),
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
        (await CustomerRepository.customerStore.set(newCustomer.id, newCustomer));
        return { ...newCustomer };
    }
    async update(id: string, tenantId: string, data: Partial<Customer>, expectedVersion?: number): Promise<Customer> {
        const customer = (await CustomerRepository.customerStore.get(id));
        if (!customer) {
            throw new RecordNotFoundError("Customer", id);
        }
        if (customer.tenantId !== tenantId) {
            throw new CrossTenantViolationError(customer.tenantId, tenantId);
        }
        if (expectedVersion !== undefined && customer.version !== expectedVersion) {
            throw new ConcurrencyConflictError(`Customer ${id} version mismatch: expected ${expectedVersion}, actual ${customer.version}`);
        }
        for (const existing of (await CustomerRepository.customerStore.values())) {
            if (existing.id === id || existing.tenantId !== tenantId)
                continue;
            if (data.email && existing.email.trim().toLowerCase() === data.email.trim().toLowerCase())
                throw new UniqueConstraintViolationError("customer email");
            if (data.phone && existing.phone.replace(/[^0-9]/g, "") === data.phone.replace(/[^0-9]/g, ""))
                throw new UniqueConstraintViolationError("customer phone number");
            if (data.idOrPassportNumber && existing.idOrPassportNumber.trim().toLowerCase() === data.idOrPassportNumber.trim().toLowerCase())
                throw new UniqueConstraintViolationError("ID / passport number");
            if (data.licenseNumber && existing.licenseNumber.trim().toLowerCase() === data.licenseNumber.trim().toLowerCase())
                throw new UniqueConstraintViolationError("driving licence number");
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
        (await CustomerRepository.customerStore.set(id, updatedCustomer));
        return { ...updatedCustomer };
    }
    async delete(id: string, tenantId: string): Promise<void> {
        const customer = (await CustomerRepository.customerStore.get(id));
        if (!customer)
            return;
        if (customer.tenantId !== tenantId) {
            throw new CrossTenantViolationError(customer.tenantId, tenantId);
        }
        (await CustomerRepository.customerStore.delete(id));
    }
}
