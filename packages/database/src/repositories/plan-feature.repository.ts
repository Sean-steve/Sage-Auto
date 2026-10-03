import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PLAN FEATURE REPOSITORY (ENT-001)
// Maps Subscription Plans to Configured Features and Limits
// ============================================================================

import type { PlanFeature, ConfigurePlanFeatureDto } from "@carhire/types";
import { RecordNotFoundError, UniqueConstraintViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";
import { FeatureRepository } from "./feature.repository";

export interface IPlanFeatureRepository {
  findById(id: string, tx?: TransactionContext): Promise<PlanFeature | null>;
  findByPlanId(planId: string, tx?: TransactionContext): Promise<PlanFeature[]>;
  findByPlanAndFeatureKey(planId: string, featureKey: string, tx?: TransactionContext): Promise<PlanFeature | null>;
  setPlanFeature(planId: string, dto: ConfigurePlanFeatureDto, tx?: TransactionContext): Promise<PlanFeature>;
  listAll(tx?: TransactionContext): Promise<PlanFeature[]>;
}

export class PlanFeatureRepository implements IPlanFeatureRepository {
  private static store = createRecordStore<string, PlanFeature>("plan-feature.repository:store");

  static initializeSeed(seedPlanFeatures?: PlanFeature[]) {
    this.store.clear();

    if (seedPlanFeatures && seedPlanFeatures.length > 0) {
      for (const pf of seedPlanFeatures) {
        this.store.set(pf.id, { ...pf });
      }
      return;
    }

    // Default Seed Mappings for STARTER, GROWTH, ENTERPRISE, ENTERPRISE_PLUS
    const mappings: Array<{
      planId: string;
      featureKey: string;
      enabled: boolean;
      limitValue?: number | null;
      isUnlimited?: boolean;
    }> = [
      // STARTER
      { planId: "plan-starter", featureKey: "fleet.vehicle.create", enabled: true },
      { planId: "plan-starter", featureKey: "fleet.max_vehicles", enabled: true, limitValue: 5 },
      { planId: "plan-starter", featureKey: "analytics.advanced", enabled: false },
      { planId: "plan-starter", featureKey: "website.custom_domain", enabled: false },
      { planId: "plan-starter", featureKey: "website.public_site", enabled: true },
      { planId: "plan-starter", featureKey: "finance.ledger", enabled: false },
      { planId: "plan-starter", featureKey: "settlements.manage", enabled: false },
      { planId: "plan-starter", featureKey: "users.max_members", enabled: true, limitValue: 3 },
      { planId: "plan-starter", featureKey: "notifications.sms.monthly", enabled: true, limitValue: 100 },
      { planId: "plan-starter", featureKey: "integrations.mpesa_daraja", enabled: true },

      // GROWTH
      { planId: "plan-growth", featureKey: "fleet.vehicle.create", enabled: true },
      { planId: "plan-growth", featureKey: "fleet.max_vehicles", enabled: true, limitValue: 25 },
      { planId: "plan-growth", featureKey: "analytics.advanced", enabled: true },
      { planId: "plan-growth", featureKey: "website.custom_domain", enabled: true },
      { planId: "plan-growth", featureKey: "website.public_site", enabled: true },
      { planId: "plan-growth", featureKey: "finance.ledger", enabled: true },
      { planId: "plan-growth", featureKey: "settlements.manage", enabled: true },
      { planId: "plan-growth", featureKey: "users.max_members", enabled: true, limitValue: 10 },
      { planId: "plan-growth", featureKey: "notifications.sms.monthly", enabled: true, limitValue: 500 },
      { planId: "plan-growth", featureKey: "integrations.mpesa_daraja", enabled: true },

      // ENTERPRISE
      { planId: "plan-enterprise", featureKey: "fleet.vehicle.create", enabled: true },
      { planId: "plan-enterprise", featureKey: "fleet.max_vehicles", enabled: true, limitValue: 100 },
      { planId: "plan-enterprise", featureKey: "analytics.advanced", enabled: true },
      { planId: "plan-enterprise", featureKey: "website.custom_domain", enabled: true },
      { planId: "plan-enterprise", featureKey: "website.public_site", enabled: true },
      { planId: "plan-enterprise", featureKey: "finance.ledger", enabled: true },
      { planId: "plan-enterprise", featureKey: "settlements.manage", enabled: true },
      { planId: "plan-enterprise", featureKey: "users.max_members", enabled: true, limitValue: 50 },
      { planId: "plan-enterprise", featureKey: "notifications.sms.monthly", enabled: true, limitValue: 2000 },
      { planId: "plan-enterprise", featureKey: "integrations.mpesa_daraja", enabled: true },

      // ENTERPRISE_PLUS
      { planId: "plan-enterprise-plus", featureKey: "fleet.vehicle.create", enabled: true },
      { planId: "plan-enterprise-plus", featureKey: "fleet.max_vehicles", enabled: true, limitValue: null, isUnlimited: true },
      { planId: "plan-enterprise-plus", featureKey: "analytics.advanced", enabled: true },
      { planId: "plan-enterprise-plus", featureKey: "website.custom_domain", enabled: true },
      { planId: "plan-enterprise-plus", featureKey: "website.public_site", enabled: true },
      { planId: "plan-enterprise-plus", featureKey: "finance.ledger", enabled: true },
      { planId: "plan-enterprise-plus", featureKey: "settlements.manage", enabled: true },
      { planId: "plan-enterprise-plus", featureKey: "users.max_members", enabled: true, limitValue: null, isUnlimited: true },
      { planId: "plan-enterprise-plus", featureKey: "notifications.sms.monthly", enabled: true, limitValue: 10000 },
      { planId: "plan-enterprise-plus", featureKey: "integrations.mpesa_daraja", enabled: true },
    ];

    const now = "2026-01-01T00:00:00.000Z";
    for (const m of mappings) {
      const id = `pf-${m.planId}-${m.featureKey.replace(/\./g, "-")}`;
      this.store.set(id, {
        id,
        planId: m.planId,
        featureId: `feat-${m.featureKey.replace(/\./g, "-")}`,
        featureKey: m.featureKey,
        enabled: m.enabled,
        limitValue: m.limitValue ?? null,
        isUnlimited: m.isUnlimited ?? false,
        configuration: {},
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async findById(id: string): Promise<PlanFeature | null> {
    if (PlanFeatureRepository.store.size === 0) {
      PlanFeatureRepository.initializeSeed();
    }
    const item = PlanFeatureRepository.store.get(id);
    return item ? { ...item } : null;
  }

  async findByPlanId(planId: string): Promise<PlanFeature[]> {
    if (PlanFeatureRepository.store.size === 0) {
      PlanFeatureRepository.initializeSeed();
    }
    return Array.from(PlanFeatureRepository.store.values())
      .filter((pf) => pf.planId === planId)
      .map((pf) => ({ ...pf }));
  }

  async findByPlanAndFeatureKey(planId: string, featureKey: string): Promise<PlanFeature | null> {
    if (PlanFeatureRepository.store.size === 0) {
      PlanFeatureRepository.initializeSeed();
    }
    for (const pf of PlanFeatureRepository.store.values()) {
      if (pf.planId === planId && pf.featureKey === featureKey) {
        return { ...pf };
      }
    }
    return null;
  }

  async setPlanFeature(planId: string, dto: ConfigurePlanFeatureDto): Promise<PlanFeature> {
    if (PlanFeatureRepository.store.size === 0) {
      PlanFeatureRepository.initializeSeed();
    }

    const existing = await this.findByPlanAndFeatureKey(planId, dto.featureKey);
    const now = new Date().toISOString();

    if (existing) {
      const updated: PlanFeature = {
        ...existing,
        enabled: dto.enabled,
        limitValue: dto.limitValue !== undefined ? dto.limitValue : existing.limitValue,
        isUnlimited: dto.isUnlimited !== undefined ? dto.isUnlimited : existing.isUnlimited,
        configuration: dto.configuration ?? existing.configuration,
        updatedAt: now,
      };
      PlanFeatureRepository.store.set(existing.id, updated);
      return { ...updated };
    }

    const id = `pf-${planId}-${dto.featureKey.replace(/\./g, "-")}`;
    const newPf: PlanFeature = {
      id,
      planId,
      featureId: `feat-${dto.featureKey.replace(/\./g, "-")}`,
      featureKey: dto.featureKey,
      enabled: dto.enabled,
      limitValue: dto.limitValue ?? null,
      isUnlimited: dto.isUnlimited ?? false,
      configuration: dto.configuration ?? {},
      createdAt: now,
      updatedAt: now,
    };
    PlanFeatureRepository.store.set(id, newPf);
    return { ...newPf };
  }

  async listAll(): Promise<PlanFeature[]> {
    if (PlanFeatureRepository.store.size === 0) {
      PlanFeatureRepository.initializeSeed();
    }
    return Array.from(PlanFeatureRepository.store.values()).map((pf) => ({ ...pf }));
  }
}
