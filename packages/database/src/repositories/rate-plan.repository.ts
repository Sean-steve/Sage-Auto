import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — RATE PLAN PERSISTENCE REPOSITORY (DEV-004, DEV-006, BRS-001)
// Manages Versioned Commercial Rate Plans, Category Rates, and Hierarchy Overrides
// ============================================================================

import type {
  RatePlan,
  RatePlanRate,
  RatePlanAssignment,
  CreateRatePlanDto,
  UpdateRatePlanDto,
  SetRatePlanRatesDto,
  AssignRatePlanDto,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  CrossTenantViolationError,
  InternalDatabaseError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IRatePlanRepository {
  createRatePlan(tenantId: string, data: CreateRatePlanDto, tx?: TransactionContext): Promise<RatePlan>;
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<RatePlan | null>;
  findByCode(code: string, tenantId: string, tx?: TransactionContext): Promise<RatePlan | null>;
  findAll(tenantId: string, tx?: TransactionContext): Promise<RatePlan[]>;
  updateRatePlan(id: string, tenantId: string, data: UpdateRatePlanDto, expectedVersion?: number, tx?: TransactionContext): Promise<RatePlan>;
  activateRatePlan(id: string, tenantId: string, tx?: TransactionContext): Promise<RatePlan>;
  archiveRatePlan(id: string, tenantId: string, tx?: TransactionContext): Promise<RatePlan>;
  deleteRatePlan(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;

  // Rates
  setRates(ratePlanId: string, tenantId: string, rates: SetRatePlanRatesDto[], tx?: TransactionContext): Promise<RatePlanRate[]>;
  getRatesForPlan(ratePlanId: string, tenantId: string, tx?: TransactionContext): Promise<RatePlanRate[]>;
  getRateForCategoryOrVehicle(ratePlanId: string, tenantId: string, vehicleCategoryId?: string | null, vehicleId?: string | null, tx?: TransactionContext): Promise<RatePlanRate | null>;

  // Assignments & Effective Plan Resolution
  assignPlan(tenantId: string, ratePlanId: string, data: AssignRatePlanDto, tx?: TransactionContext): Promise<RatePlanAssignment>;
  getAssignmentsForPlan(ratePlanId: string, tenantId: string, tx?: TransactionContext): Promise<RatePlanAssignment[]>;
  findEffectiveRatePlan(
    tenantId: string,
    params: {
      vehicleId?: string;
      vehicleCategoryId?: string;
      corporateAccountId?: string;
      customerId?: string;
      agentId?: string;
      dateTime?: string;
    },
    tx?: TransactionContext
  ): Promise<{ plan: RatePlan; matchedRate: RatePlanRate; isCorporateNegotiated: boolean } | null>;
}

export class RatePlanRepository implements IRatePlanRepository {
  private static planStore = createRecordStore<string, RatePlan>("rate-plan.repository:planStore");
  private static rateStore = createRecordStore<string, RatePlanRate>("rate-plan.repository:rateStore");
  private static assignmentStore = createRecordStore<string, RatePlanAssignment>("rate-plan.repository:assignmentStore");

  static clear(): void {
    RatePlanRepository.planStore.clear();
    RatePlanRepository.rateStore.clear();
    RatePlanRepository.assignmentStore.clear();
  }

  static seed(plans: RatePlan[], rates?: RatePlanRate[], assignments?: RatePlanAssignment[]): void {
    for (const p of plans) {
      RatePlanRepository.planStore.set(p.id, { ...p });
    }
    if (rates) {
      for (const r of rates) {
        RatePlanRepository.rateStore.set(r.id, { ...r });
      }
    }
    if (assignments) {
      for (const a of assignments) {
        RatePlanRepository.assignmentStore.set(a.id, { ...a });
      }
    }
  }

  async createRatePlan(tenantId: string, data: CreateRatePlanDto): Promise<RatePlan> {
    if (!tenantId) throw new InternalDatabaseError("tenantId is required");
    const existing = await this.findByCode(data.code, tenantId);
    if (existing) {
      throw new InternalDatabaseError(`Rate plan with code '${data.code}' already exists`);
    }

    const now = new Date().toISOString();
    const id = `rp-${crypto.randomUUID()}`;

    // If marked as default, unset other defaults for this tenant
    if (data.isDefault) {
      for (const p of RatePlanRepository.planStore.values()) {
        if (p.tenantId === tenantId && p.isDefault) {
          p.isDefault = false;
          p.updatedAt = now;
        }
      }
    }

    const plan: RatePlan = {
      id,
      tenantId,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      description: data.description?.trim(),
      status: "DRAFT",
      currency: data.currency?.trim().toUpperCase() || "KES",
      priority: data.priority ?? 10,
      isDefault: Boolean(data.isDefault),
      effectiveFrom: data.effectiveFrom || now,
      effectiveTo: data.effectiveTo ?? null,
      taxInclusive: Boolean(data.taxInclusive),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    RatePlanRepository.planStore.set(id, plan);
    return { ...plan };
  }

  async findById(id: string, tenantId: string): Promise<RatePlan | null> {
    const plan = RatePlanRepository.planStore.get(id);
    if (!plan) return null;
    if (plan.tenantId !== tenantId) {
      throw new CrossTenantViolationError(plan.tenantId, tenantId);
    }
    return { ...plan };
  }

  async findByCode(code: string, tenantId: string): Promise<RatePlan | null> {
    const normalized = code.trim().toUpperCase();
    for (const plan of RatePlanRepository.planStore.values()) {
      if (plan.tenantId === tenantId && plan.code === normalized) {
        return { ...plan };
      }
    }
    return null;
  }

  async findAll(tenantId: string): Promise<RatePlan[]> {
    const results: RatePlan[] = [];
    for (const plan of RatePlanRepository.planStore.values()) {
      if (plan.tenantId === tenantId) {
        results.push({ ...plan });
      }
    }
    return results.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  }

  async updateRatePlan(
    id: string,
    tenantId: string,
    data: UpdateRatePlanDto,
    expectedVersion?: number
  ): Promise<RatePlan> {
    const plan = await this.findById(id, tenantId);
    if (!plan) {
      throw new RecordNotFoundError("RatePlan", id);
    }

    if (expectedVersion !== undefined && plan.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `RatePlan version mismatch: expected ${expectedVersion}, got ${plan.version}`
      );
    }

    const now = new Date().toISOString();

    if (data.isDefault && !plan.isDefault) {
      for (const p of RatePlanRepository.planStore.values()) {
        if (p.tenantId === tenantId && p.id !== id && p.isDefault) {
          p.isDefault = false;
          p.updatedAt = now;
        }
      }
    }

    const updated: RatePlan = {
      ...plan,
      name: data.name !== undefined ? data.name.trim() : plan.name,
      description: data.description !== undefined ? data.description.trim() : plan.description,
      priority: data.priority !== undefined ? data.priority : plan.priority,
      isDefault: data.isDefault !== undefined ? Boolean(data.isDefault) : plan.isDefault,
      effectiveFrom: data.effectiveFrom !== undefined ? data.effectiveFrom : plan.effectiveFrom,
      effectiveTo: data.effectiveTo !== undefined ? data.effectiveTo : plan.effectiveTo,
      taxInclusive: data.taxInclusive !== undefined ? Boolean(data.taxInclusive) : plan.taxInclusive,
      version: plan.version + 1,
      updatedAt: now,
    };

    RatePlanRepository.planStore.set(id, updated);
    return { ...updated };
  }

  async activateRatePlan(id: string, tenantId: string): Promise<RatePlan> {
    const plan = await this.findById(id, tenantId);
    if (!plan) {
      throw new RecordNotFoundError("RatePlan", id);
    }
    const now = new Date().toISOString();
    const updated: RatePlan = {
      ...plan,
      status: "ACTIVE",
      version: plan.version + 1,
      updatedAt: now,
    };
    RatePlanRepository.planStore.set(id, updated);
    return { ...updated };
  }

  async archiveRatePlan(id: string, tenantId: string): Promise<RatePlan> {
    const plan = await this.findById(id, tenantId);
    if (!plan) {
      throw new RecordNotFoundError("RatePlan", id);
    }
    const now = new Date().toISOString();
    const updated: RatePlan = {
      ...plan,
      status: "ARCHIVED",
      isDefault: false,
      version: plan.version + 1,
      updatedAt: now,
    };
    RatePlanRepository.planStore.set(id, updated);
    return { ...updated };
  }

  async deleteRatePlan(id: string, tenantId: string): Promise<void> {
    const plan = await this.findById(id, tenantId);
    if (!plan) {
      throw new RecordNotFoundError("RatePlan", id);
    }
    // Remove related rates and assignments
    for (const [rateId, rate] of RatePlanRepository.rateStore.entries()) {
      if (rate.ratePlanId === id && rate.tenantId === tenantId) {
        RatePlanRepository.rateStore.delete(rateId);
      }
    }
    for (const [assignId, assign] of RatePlanRepository.assignmentStore.entries()) {
      if (assign.ratePlanId === id && assign.tenantId === tenantId) {
        RatePlanRepository.assignmentStore.delete(assignId);
      }
    }
    RatePlanRepository.planStore.delete(id);
  }

  async setRates(
    ratePlanId: string,
    tenantId: string,
    ratesData: SetRatePlanRatesDto[]
  ): Promise<RatePlanRate[]> {
    const plan = await this.findById(ratePlanId, tenantId);
    if (!plan) {
      throw new RecordNotFoundError("RatePlan", ratePlanId);
    }

    const now = new Date().toISOString();
    const createdRates: RatePlanRate[] = [];

    // Clear existing rates for this plan
    for (const [rateId, rate] of RatePlanRepository.rateStore.entries()) {
      if (rate.ratePlanId === ratePlanId && rate.tenantId === tenantId) {
        RatePlanRepository.rateStore.delete(rateId);
      }
    }

    for (const r of ratesData) {
      const rateId = `rpr-${crypto.randomUUID()}`;
      const newRate: RatePlanRate = {
        id: rateId,
        tenantId,
        ratePlanId,
        vehicleCategoryId: r.vehicleCategoryId ?? null,
        vehicleId: r.vehicleId ?? null,
        hourlyRate: r.hourlyRate,
        dailyRate: r.dailyRate,
        weeklyDailyRate: r.weeklyDailyRate,
        monthlyDailyRate: r.monthlyDailyRate,
        weekendDailyRate: r.weekendDailyRate,
        mileageAllowanceModel: r.mileageAllowanceModel || "UNLIMITED",
        includedKmPerDay: r.includedKmPerDay,
        includedKmTotal: r.includedKmTotal,
        excessKmRate: r.excessKmRate,
        depositAmount: r.depositAmount,
        depositModel: r.depositModel || "FIXED",
        depositPercent: r.depositPercent,
        createdAt: now,
        updatedAt: now,
      };
      RatePlanRepository.rateStore.set(rateId, newRate);
      createdRates.push(newRate);
    }

    // Bump plan version
    plan.version += 1;
    plan.updatedAt = now;
    RatePlanRepository.planStore.set(ratePlanId, plan);

    return createdRates;
  }

  async getRatesForPlan(ratePlanId: string, tenantId: string): Promise<RatePlanRate[]> {
    const rates: RatePlanRate[] = [];
    for (const rate of RatePlanRepository.rateStore.values()) {
      if (rate.tenantId === tenantId && rate.ratePlanId === ratePlanId) {
        rates.push({ ...rate });
      }
    }
    return rates;
  }

  async getRateForCategoryOrVehicle(
    ratePlanId: string,
    tenantId: string,
    vehicleCategoryId?: string | null,
    vehicleId?: string | null
  ): Promise<RatePlanRate | null> {
    // 1. Exact vehicle match
    if (vehicleId) {
      for (const rate of RatePlanRepository.rateStore.values()) {
        if (rate.tenantId === tenantId && rate.ratePlanId === ratePlanId && rate.vehicleId === vehicleId) {
          return { ...rate };
        }
      }
    }

    // 2. Category match
    if (vehicleCategoryId) {
      for (const rate of RatePlanRepository.rateStore.values()) {
        if (rate.tenantId === tenantId && rate.ratePlanId === ratePlanId && rate.vehicleCategoryId === vehicleCategoryId) {
          return { ...rate };
        }
      }
    }

    // 3. Plan fallback (general rate with no category or vehicle constraint)
    for (const rate of RatePlanRepository.rateStore.values()) {
      if (rate.tenantId === tenantId && rate.ratePlanId === ratePlanId && !rate.vehicleCategoryId && !rate.vehicleId) {
        return { ...rate };
      }
    }

    return null;
  }

  async assignPlan(tenantId: string, ratePlanId: string, data: AssignRatePlanDto): Promise<RatePlanAssignment> {
    const plan = await this.findById(ratePlanId, tenantId);
    if (!plan) throw new RecordNotFoundError("RatePlan", ratePlanId);

    const now = new Date().toISOString();
    const id = `rpa-${crypto.randomUUID()}`;
    const assignment: RatePlanAssignment = {
      id,
      tenantId,
      ratePlanId,
      targetType: data.targetType,
      targetId: data.targetId,
      priority: data.priority ?? 100,
      createdAt: now,
      updatedAt: now,
    };
    RatePlanRepository.assignmentStore.set(id, assignment);
    return { ...assignment };
  }

  async getAssignmentsForPlan(ratePlanId: string, tenantId: string): Promise<RatePlanAssignment[]> {
    const results: RatePlanAssignment[] = [];
    for (const a of RatePlanRepository.assignmentStore.values()) {
      if (a.tenantId === tenantId && a.ratePlanId === ratePlanId) {
        results.push({ ...a });
      }
    }
    return results;
  }

  async findEffectiveRatePlan(
    tenantId: string,
    params: {
      vehicleId?: string;
      vehicleCategoryId?: string;
      corporateAccountId?: string;
      customerId?: string;
      agentId?: string;
      dateTime?: string;
    }
  ): Promise<{ plan: RatePlan; matchedRate: RatePlanRate; isCorporateNegotiated: boolean } | null> {
    const evalTime = params.dateTime ? new Date(params.dateTime).getTime() : Date.now();

    // Helper: is plan active & effective at date
    const isPlanEffective = (p: RatePlan): boolean => {
      if (p.status !== "ACTIVE") return false;
      const from = new Date(p.effectiveFrom).getTime();
      if (evalTime < from) return false;
      if (p.effectiveTo) {
        const to = new Date(p.effectiveTo).getTime();
        if (evalTime > to) return false;
      }
      return true;
    };

    // 1. Check Specific Vehicle Assignment / Vehicle Rate
    if (params.vehicleId) {
      for (const a of RatePlanRepository.assignmentStore.values()) {
        if (a.tenantId === tenantId && a.targetType === "VEHICLE" && a.targetId === params.vehicleId) {
          const plan = await this.findById(a.ratePlanId, tenantId);
          if (plan && isPlanEffective(plan)) {
            const matchedRate = await this.getRateForCategoryOrVehicle(plan.id, tenantId, params.vehicleCategoryId, params.vehicleId);
            if (matchedRate) return { plan, matchedRate, isCorporateNegotiated: false };
          }
        }
      }
    }

    // 2. Check Corporate Account Assignment
    if (params.corporateAccountId) {
      for (const a of RatePlanRepository.assignmentStore.values()) {
        if (a.tenantId === tenantId && a.targetType === "CORPORATE_ACCOUNT" && a.targetId === params.corporateAccountId) {
          const plan = await this.findById(a.ratePlanId, tenantId);
          if (plan && isPlanEffective(plan)) {
            const matchedRate = await this.getRateForCategoryOrVehicle(plan.id, tenantId, params.vehicleCategoryId, params.vehicleId);
            if (matchedRate) return { plan, matchedRate, isCorporateNegotiated: true };
          }
        }
      }
    }

    // 3. Check Customer Specific Assignment
    if (params.customerId) {
      for (const a of RatePlanRepository.assignmentStore.values()) {
        if (a.tenantId === tenantId && a.targetType === "CUSTOMER" && a.targetId === params.customerId) {
          const plan = await this.findById(a.ratePlanId, tenantId);
          if (plan && isPlanEffective(plan)) {
            const matchedRate = await this.getRateForCategoryOrVehicle(plan.id, tenantId, params.vehicleCategoryId, params.vehicleId);
            if (matchedRate) return { plan, matchedRate, isCorporateNegotiated: false };
          }
        }
      }
    }

    // 4. Check Category Assignment
    if (params.vehicleCategoryId) {
      for (const a of RatePlanRepository.assignmentStore.values()) {
        if (a.tenantId === tenantId && a.targetType === "CATEGORY" && a.targetId === params.vehicleCategoryId) {
          const plan = await this.findById(a.ratePlanId, tenantId);
          if (plan && isPlanEffective(plan)) {
            const matchedRate = await this.getRateForCategoryOrVehicle(plan.id, tenantId, params.vehicleCategoryId, params.vehicleId);
            if (matchedRate) return { plan, matchedRate, isCorporateNegotiated: false };
          }
        }
      }
    }

    // 5. Check Active Rate Plans in Priority Order
    const allPlans = await this.findAll(tenantId);
    for (const plan of allPlans) {
      if (isPlanEffective(plan)) {
        const matchedRate = await this.getRateForCategoryOrVehicle(plan.id, tenantId, params.vehicleCategoryId, params.vehicleId);
        if (matchedRate) {
          return { plan, matchedRate, isCorporateNegotiated: false };
        }
      }
    }

    // 6. Check Default Plan even if draft for fallback calculations
    for (const plan of allPlans) {
      if (plan.isDefault) {
        const matchedRate = await this.getRateForCategoryOrVehicle(plan.id, tenantId, params.vehicleCategoryId, params.vehicleId);
        if (matchedRate) {
          return { plan, matchedRate, isCorporateNegotiated: false };
        }
      }
    }

    return null;
  }
}
