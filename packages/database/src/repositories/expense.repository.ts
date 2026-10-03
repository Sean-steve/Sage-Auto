import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — OPERATIONAL EXPENSE REPOSITORY (Sprint 19: DOM-003 §28-34)
// Repository for Fleet Operating Expenses, Approvals & Maintenance Ingestion
// ============================================================================

import type {
  OperationalExpense,
  ExpenseCategory,
  ExpenseCategoryCode,
  ExpenseStatus,
} from "@carhire/types";
import {
  OperationalExpenseNotFoundError,
  CrossTenantViolationError,
  FinanceConcurrencyConflictError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ListExpensesFilter {
  vehicleId?: string;
  rentalId?: string;
  maintenanceId?: string;
  vehicleOwnerId?: string;
  category?: ExpenseCategoryCode;
  status?: ExpenseStatus;
  fromDate?: string;
  toDate?: string;
}

export interface IExpenseRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<OperationalExpense | null>;
  findByExpenseNumber(expenseNumber: string, tenantId?: string, tx?: TransactionContext): Promise<OperationalExpense | null>;
  findByMaintenanceId(maintenanceId: string, tenantId: string, tx?: TransactionContext): Promise<OperationalExpense | null>;
  listByTenant(tenantId: string, filter?: ListExpensesFilter, tx?: TransactionContext): Promise<OperationalExpense[]>;
  create(
    data: Omit<OperationalExpense, "id" | "expenseNumber" | "version" | "createdAt" | "updatedAt"> & {
      expenseNumber?: string;
    },
    tx?: TransactionContext
  ): Promise<OperationalExpense>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<OperationalExpense>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<OperationalExpense>;
  listCategories(tenantId: string): Promise<ExpenseCategory[]>;
}

export class ExpenseRepository implements IExpenseRepository {
  private static store = createRecordStore<string, OperationalExpense>("expense.repository:store");
  private static counter = 1000;

  static clear() {
    this.store.clear();
    this.counter = 1000;
  }

  private generateExpenseNumber(): string {
    const year = new Date().getFullYear();
    const seq = (++ExpenseRepository.counter).toString().padStart(6, "0");
    return `EXP-${year}-${seq}`;
  }

  async findById(id: string, tenantId?: string): Promise<OperationalExpense | null> {
    const exp = ExpenseRepository.store.get(id);
    if (!exp) return null;
    if (tenantId && exp.tenantId !== tenantId) {
      throw new CrossTenantViolationError(exp.tenantId, tenantId);
    }
    return JSON.parse(JSON.stringify(exp));
  }

  async findByExpenseNumber(expenseNumber: string, tenantId?: string): Promise<OperationalExpense | null> {
    for (const exp of ExpenseRepository.store.values()) {
      if (exp.expenseNumber === expenseNumber) {
        if (tenantId && exp.tenantId !== tenantId) {
          throw new CrossTenantViolationError(exp.tenantId, tenantId);
        }
        return JSON.parse(JSON.stringify(exp));
      }
    }
    return null;
  }

  async findByMaintenanceId(maintenanceId: string, tenantId: string): Promise<OperationalExpense | null> {
    for (const exp of ExpenseRepository.store.values()) {
      if (exp.tenantId === tenantId && exp.maintenanceId === maintenanceId) {
        return JSON.parse(JSON.stringify(exp));
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, filter?: ListExpensesFilter): Promise<OperationalExpense[]> {
    const results: OperationalExpense[] = [];
    for (const exp of ExpenseRepository.store.values()) {
      if (exp.tenantId !== tenantId) continue;
      if (filter?.vehicleId && exp.vehicleId !== filter.vehicleId) continue;
      if (filter?.rentalId && exp.rentalId !== filter.rentalId) continue;
      if (filter?.maintenanceId && exp.maintenanceId !== filter.maintenanceId) continue;
      if (filter?.vehicleOwnerId && exp.vehicleOwnerId !== filter.vehicleOwnerId) continue;
      if (filter?.category && exp.category !== filter.category) continue;
      if (filter?.status && exp.status !== filter.status) continue;
      if (filter?.fromDate && exp.expenseDate < filter.fromDate) continue;
      if (filter?.toDate && exp.expenseDate > filter.toDate) continue;
      results.push(JSON.parse(JSON.stringify(exp)));
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<OperationalExpense, "id" | "expenseNumber" | "version" | "createdAt" | "updatedAt"> & {
      expenseNumber?: string;
    }
  ): Promise<OperationalExpense> {
    const id = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const expenseNumber = data.expenseNumber || this.generateExpenseNumber();

    const expense: OperationalExpense = {
      ...data,
      id,
      expenseNumber,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    ExpenseRepository.store.set(id, JSON.parse(JSON.stringify(expense)));
    return JSON.parse(JSON.stringify(expense));
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<OperationalExpense>,
    expectedVersion?: number
  ): Promise<OperationalExpense> {
    const existing = ExpenseRepository.store.get(id);
    if (!existing) {
      throw new OperationalExpenseNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new FinanceConcurrencyConflictError("OperationalExpense", id, expectedVersion, existing.version);
    }

    const updated: OperationalExpense = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      expenseNumber: existing.expenseNumber,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    ExpenseRepository.store.set(id, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  }

  async listCategories(tenantId: string): Promise<ExpenseCategory[]> {
    // Canonical standard default categories
    const categories: ExpenseCategory[] = [
      {
        id: "cat_maintenance",
        tenantId,
        code: "MAINTENANCE",
        name: "Fleet Maintenance & Repairs",
        description: "Servicing, scheduled inspections, parts and garage repairs",
        isTaxDeductible: true,
        requiresVehicleAttribution: true,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_fuel",
        tenantId,
        code: "FUEL",
        name: "Vehicle Refueling",
        description: "Branch refueling, pump top-ups and emergency fuel",
        isTaxDeductible: true,
        requiresVehicleAttribution: true,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_cleaning",
        tenantId,
        code: "CLEANING",
        name: "Valeting & Detailing",
        description: "Vehicle washing, interior valeting and sanitization",
        isTaxDeductible: true,
        requiresVehicleAttribution: true,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_parking",
        tenantId,
        code: "PARKING",
        name: "Parking & Storage",
        description: "Airport parking fees, staging yard fees and terminal permits",
        isTaxDeductible: true,
        requiresVehicleAttribution: false,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_toll",
        tenantId,
        code: "TOLL",
        name: "Highway Tolls",
        description: "Expressway and electronic highway tolls",
        isTaxDeductible: true,
        requiresVehicleAttribution: true,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_insurance",
        tenantId,
        code: "INSURANCE",
        name: "Vehicle Fleet Insurance",
        description: "Comprehensive insurance premiums, CDW and excess coverage",
        isTaxDeductible: true,
        requiresVehicleAttribution: true,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_licensing",
        tenantId,
        code: "LICENSING",
        name: "Regulatory & Road Licensing",
        description: "NTSA inspection certificates, PSV inspection, radio permits",
        isTaxDeductible: true,
        requiresVehicleAttribution: true,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_office",
        tenantId,
        code: "OFFICE",
        name: "Branch & Operational Overhead",
        description: "Office rent, utilities, station supplies and communications",
        isTaxDeductible: true,
        requiresVehicleAttribution: false,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_driver",
        tenantId,
        code: "DRIVER",
        name: "Chauffeur & Driver Allowances",
        description: "Direct driver per diems and delivery contractor payments",
        isTaxDeductible: true,
        requiresVehicleAttribution: false,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_marketing",
        tenantId,
        code: "MARKETING",
        name: "Marketing & Customer Acquisition",
        description: "Direct marketing, local ads and promotional campaigns",
        isTaxDeductible: true,
        requiresVehicleAttribution: false,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "cat_other",
        tenantId,
        code: "OTHER",
        name: "General Operating Expense",
        description: "Miscellaneous business expenses",
        isTaxDeductible: true,
        requiresVehicleAttribution: false,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];
    return categories;
  }
}
