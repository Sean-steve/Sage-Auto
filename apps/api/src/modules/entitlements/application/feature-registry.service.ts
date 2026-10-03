// ============================================================================
// CAR HIRE OS — FEATURE REGISTRY SERVICE (ENT-001 §2)
// Canonical Feature Registry & Plan Capability Matrix
// ============================================================================

import type {
  Feature,
  PlanFeature,
  CreateFeatureDto,
  ConfigurePlanFeatureDto,
  FeatureCategory,
} from "@carhire/types";
import { FeatureRepository, PlanFeatureRepository, PlanRepository } from "@carhire/database";
import { RecordNotFoundError } from "@carhire/database";

export class FeatureRegistryService {
  constructor(
    private readonly featureRepo: FeatureRepository = new FeatureRepository(),
    private readonly planFeatureRepo: PlanFeatureRepository = new PlanFeatureRepository(),
    private readonly planRepo: PlanRepository = new PlanRepository()
  ) {}

  async listFeatures(): Promise<Feature[]> {
    return this.featureRepo.listAll();
  }

  async listFeaturesByCategory(category: FeatureCategory): Promise<Feature[]> {
    return this.featureRepo.listByCategory(category);
  }

  async getFeature(keyOrId: string): Promise<Feature> {
    let feature = await this.featureRepo.findByKey(keyOrId);
    if (!feature) {
      feature = await this.featureRepo.findById(keyOrId);
    }
    if (!feature) {
      throw new RecordNotFoundError("Feature", keyOrId);
    }
    return feature;
  }

  async registerFeature(dto: CreateFeatureDto): Promise<Feature> {
    return this.featureRepo.create(dto);
  }

  async updateFeature(id: string, updates: Partial<Feature>): Promise<Feature> {
    return this.featureRepo.update(id, updates);
  }

  async getPlanFeatures(planId: string): Promise<PlanFeature[]> {
    return this.planFeatureRepo.findByPlanId(planId);
  }

  async configurePlanFeature(planId: string, dto: ConfigurePlanFeatureDto): Promise<PlanFeature> {
    // Validate feature exists
    const feature = await this.featureRepo.findByKey(dto.featureKey);
    if (!feature) {
      throw new RecordNotFoundError("Feature", dto.featureKey);
    }
    return this.planFeatureRepo.setPlanFeature(planId, dto);
  }
}
