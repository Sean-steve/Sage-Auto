import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PRICING RULE REPOSITORY (DEV-004, DEV-006, BRS-001)
// Manages Seasonal Rates, Duration Tiers, and Ancillary/Location Fee Rules
// ============================================================================

import type {
  SeasonalRateRule,
  DurationTierRule,
  PricingFeeRule,
  CreateSeasonalRateDto,
  CreateDurationTierDto,
  CreatePricingFeeDto,
} from "@carhire/types";
import {
  RecordNotFoundError,
  CrossTenantViolationError,
  InternalDatabaseError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IPricingRuleRepository {
  // Seasonal Rules
  createSeasonalRule(tenantId: string, ratePlanId: string, data: CreateSeasonalRateDto, tx?: TransactionContext): Promise<SeasonalRateRule>;
  listSeasonalRules(tenantId: string, ratePlanId?: string, tx?: TransactionContext): Promise<SeasonalRateRule[]>;
  deleteSeasonalRule(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;

  // Duration Tiers
  createDurationTier(tenantId: string, ratePlanId: string, data: CreateDurationTierDto, tx?: TransactionContext): Promise<DurationTierRule>;
  listDurationTiers(tenantId: string, ratePlanId: string, tx?: TransactionContext): Promise<DurationTierRule[]>;
  deleteDurationTier(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;

  // Fee Rules
  createFeeRule(tenantId: string, data: CreatePricingFeeDto, tx?: TransactionContext): Promise<PricingFeeRule>;
  listFeeRules(tenantId: string, ratePlanId?: string | null, tx?: TransactionContext): Promise<PricingFeeRule[]>;
  getFeeByCode(tenantId: string, code: string, ratePlanId?: string | null, tx?: TransactionContext): Promise<PricingFeeRule | null>;
  deleteFeeRule(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class PricingRuleRepository implements IPricingRuleRepository {
  private static seasonalStore = createRecordStore<string, SeasonalRateRule>("pricing-rule.repository:seasonalStore");
  private static tierStore = createRecordStore<string, DurationTierRule>("pricing-rule.repository:tierStore");
  private static feeStore = createRecordStore<string, PricingFeeRule>("pricing-rule.repository:feeStore");

  static clear(): void {
    PricingRuleRepository.seasonalStore.clear();
    PricingRuleRepository.tierStore.clear();
    PricingRuleRepository.feeStore.clear();
  }

  static seed(
    seasonal?: SeasonalRateRule[],
    tiers?: DurationTierRule[],
    fees?: PricingFeeRule[]
  ): void {
    if (seasonal) {
      for (const s of seasonal) PricingRuleRepository.seasonalStore.set(s.id, { ...s });
    }
    if (tiers) {
      for (const t of tiers) PricingRuleRepository.tierStore.set(t.id, { ...t });
    }
    if (fees) {
      for (const f of fees) PricingRuleRepository.feeStore.set(f.id, { ...f });
    }
  }

  // --- Seasonal Rules ---
  async createSeasonalRule(
    tenantId: string,
    ratePlanId: string,
    data: CreateSeasonalRateDto
  ): Promise<SeasonalRateRule> {
    if (!tenantId) throw new InternalDatabaseError("tenantId is required");
    const now = new Date().toISOString();
    const id = `seas-${crypto.randomUUID()}`;

    const rule: SeasonalRateRule = {
      id,
      tenantId,
      ratePlanId,
      name: data.name.trim(),
      startDate: data.startDate,
      endDate: data.endDate,
      multiplier: data.multiplier,
      vehicleCategoryId: data.vehicleCategoryId ?? null,
      priority: data.priority ?? 50,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    PricingRuleRepository.seasonalStore.set(id, rule);
    return { ...rule };
  }

  async listSeasonalRules(tenantId: string, ratePlanId?: string): Promise<SeasonalRateRule[]> {
    const results: SeasonalRateRule[] = [];
    for (const rule of PricingRuleRepository.seasonalStore.values()) {
      if (rule.tenantId === tenantId) {
        if (!ratePlanId || rule.ratePlanId === ratePlanId) {
          results.push({ ...rule });
        }
      }
    }
    return results.sort((a, b) => b.priority - a.priority);
  }

  async deleteSeasonalRule(id: string, tenantId: string): Promise<void> {
    const rule = PricingRuleRepository.seasonalStore.get(id);
    if (!rule) throw new RecordNotFoundError("SeasonalRateRule", id);
    if (rule.tenantId !== tenantId) throw new CrossTenantViolationError(rule.tenantId, tenantId);
    PricingRuleRepository.seasonalStore.delete(id);
  }

  // --- Duration Tiers ---
  async createDurationTier(
    tenantId: string,
    ratePlanId: string,
    data: CreateDurationTierDto
  ): Promise<DurationTierRule> {
    if (!tenantId) throw new InternalDatabaseError("tenantId is required");
    const now = new Date().toISOString();
    const id = `tier-${crypto.randomUUID()}`;

    const tier: DurationTierRule = {
      id,
      tenantId,
      ratePlanId,
      minDays: data.minDays,
      maxDays: data.maxDays,
      discountPercent: data.discountPercent,
      customDailyRate: data.customDailyRate,
      createdAt: now,
      updatedAt: now,
    };

    PricingRuleRepository.tierStore.set(id, tier);
    return { ...tier };
  }

  async listDurationTiers(tenantId: string, ratePlanId: string): Promise<DurationTierRule[]> {
    const results: DurationTierRule[] = [];
    for (const tier of PricingRuleRepository.tierStore.values()) {
      if (tier.tenantId === tenantId && tier.ratePlanId === ratePlanId) {
        results.push({ ...tier });
      }
    }
    return results.sort((a, b) => a.minDays - b.minDays);
  }

  async deleteDurationTier(id: string, tenantId: string): Promise<void> {
    const tier = PricingRuleRepository.tierStore.get(id);
    if (!tier) throw new RecordNotFoundError("DurationTierRule", id);
    if (tier.tenantId !== tenantId) throw new CrossTenantViolationError(tier.tenantId, tenantId);
    PricingRuleRepository.tierStore.delete(id);
  }

  // --- Fees ---
  async createFeeRule(tenantId: string, data: CreatePricingFeeDto): Promise<PricingFeeRule> {
    if (!tenantId) throw new InternalDatabaseError("tenantId is required");
    const now = new Date().toISOString();
    const id = `fee-${crypto.randomUUID()}`;

    const fee: PricingFeeRule = {
      id,
      tenantId,
      ratePlanId: data.ratePlanId ?? null,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      feeType: data.feeType,
      calculationType: data.calculationType,
      amount: data.amount,
      isTaxable: data.isTaxable !== undefined ? Boolean(data.isTaxable) : true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    PricingRuleRepository.feeStore.set(id, fee);
    return { ...fee };
  }

  async listFeeRules(tenantId: string, ratePlanId?: string | null): Promise<PricingFeeRule[]> {
    const results: PricingFeeRule[] = [];
    for (const fee of PricingRuleRepository.feeStore.values()) {
      if (fee.tenantId === tenantId) {
        if (ratePlanId === undefined || fee.ratePlanId === ratePlanId || fee.ratePlanId === null) {
          results.push({ ...fee });
        }
      }
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getFeeByCode(
    tenantId: string,
    code: string,
    ratePlanId?: string | null
  ): Promise<PricingFeeRule | null> {
    const normalized = code.trim().toUpperCase();
    // 1. Check plan-specific fee
    if (ratePlanId) {
      for (const fee of PricingRuleRepository.feeStore.values()) {
        if (fee.tenantId === tenantId && fee.ratePlanId === ratePlanId && fee.code === normalized) {
          return { ...fee };
        }
      }
    }
    // 2. Check global tenant fee
    for (const fee of PricingRuleRepository.feeStore.values()) {
      if (fee.tenantId === tenantId && !fee.ratePlanId && fee.code === normalized) {
        return { ...fee };
      }
    }
    return null;
  }

  async deleteFeeRule(id: string, tenantId: string): Promise<void> {
    const fee = PricingRuleRepository.feeStore.get(id);
    if (!fee) throw new RecordNotFoundError("PricingFeeRule", id);
    if (fee.tenantId !== tenantId) throw new CrossTenantViolationError(fee.tenantId, tenantId);
    PricingRuleRepository.feeStore.delete(id);
  }
}
