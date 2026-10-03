import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — CANONICAL FEATURE REGISTRY REPOSITORY (ENT-001)
// ============================================================================

import type { Feature, CreateFeatureDto, FeatureType, FeatureCategory } from "@carhire/types";
import { UniqueConstraintViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IFeatureRepository {
  findById(id: string, tx?: TransactionContext): Promise<Feature | null>;
  findByKey(key: string, tx?: TransactionContext): Promise<Feature | null>;
  listAll(tx?: TransactionContext): Promise<Feature[]>;
  listByCategory(category: FeatureCategory, tx?: TransactionContext): Promise<Feature[]>;
  create(dto: CreateFeatureDto, tx?: TransactionContext): Promise<Feature>;
  update(id: string, updates: Partial<Feature>, tx?: TransactionContext): Promise<Feature>;
  delete(id: string, tx?: TransactionContext): Promise<void>;
}

export const CANONICAL_SEED_FEATURES: Feature[] = [
  {
    id: "feat-fleet-vehicle-create",
    key: "fleet.vehicle.create",
    name: "Vehicle Creation Capability",
    description: "Ability to register, import, and activate rental fleet vehicles.",
    type: "BOOLEAN",
    category: "FLEET",
    status: "ACTIVE",
    defaultValue: true,
    isAddonEligible: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-fleet-max-vehicles",
    key: "fleet.max_vehicles",
    name: "Maximum Fleet Capacity",
    description: "Numeric ceiling of simultaneous non-retired vehicles allowed in tenant workspace.",
    type: "NUMERIC_LIMIT",
    category: "FLEET",
    status: "ACTIVE",
    defaultValue: 5,
    isAddonEligible: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-analytics-advanced",
    key: "analytics.advanced",
    name: "Advanced Business Intelligence",
    description: "Access to cohort retention, utilization heatmaps, predictive yield, and executive reporting.",
    type: "BOOLEAN",
    category: "ANALYTICS",
    status: "ACTIVE",
    defaultValue: false,
    isAddonEligible: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-website-custom-domain",
    key: "website.custom_domain",
    name: "Custom White-Label Domain",
    description: "Binding custom top-level domain with automated SSL certificate provisioning.",
    type: "BOOLEAN",
    category: "WEBSITE",
    status: "ACTIVE",
    defaultValue: false,
    isAddonEligible: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-website-public-site",
    key: "website.public_site",
    name: "Public Booking Website",
    description: "Public client-facing vehicle booking portal and catalogue preview.",
    type: "BOOLEAN",
    category: "WEBSITE",
    status: "ACTIVE",
    defaultValue: true,
    isAddonEligible: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-finance-ledger",
    key: "finance.ledger",
    name: "Double-Entry General Ledger",
    description: "Automated accounting journal entries, chart of accounts, and financial statement audit trail.",
    type: "BOOLEAN",
    category: "FINANCE",
    status: "ACTIVE",
    defaultValue: false,
    isAddonEligible: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-settlements-manage",
    key: "settlements.manage",
    name: "Vehicle Owner Split Settlements",
    description: "Investor payout calculations, management fee deductions, and owner disbursement runs.",
    type: "BOOLEAN",
    category: "FINANCE",
    status: "ACTIVE",
    defaultValue: false,
    isAddonEligible: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-users-max-members",
    key: "users.max_members",
    name: "Maximum Workspace Team Members",
    description: "Numeric ceiling of invited active staff users in the tenant organization.",
    type: "NUMERIC_LIMIT",
    category: "USERS",
    status: "ACTIVE",
    defaultValue: 3,
    isAddonEligible: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-notifications-sms-monthly",
    key: "notifications.sms.monthly",
    name: "Monthly SMS Dispatch Quota",
    description: "Metered monthly count of transactional SMS messages (dispatch, OTP, payment confirmation).",
    type: "USAGE_LIMIT",
    category: "NOTIFICATIONS",
    status: "ACTIVE",
    defaultValue: 100,
    isAddonEligible: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "feat-integrations-mpesa-daraja",
    key: "integrations.mpesa_daraja",
    name: "M-Pesa Daraja Integration",
    description: "Direct Paybill / Buy Goods STK push and C2B payment reconciliation.",
    type: "BOOLEAN",
    category: "INTEGRATIONS",
    status: "ACTIVE",
    defaultValue: true,
    isAddonEligible: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export class FeatureRepository implements IFeatureRepository {
  private static store = createRecordStore<string, Feature>("feature.repository:store");
  private static keyIndex = createRecordStore<string, string>("feature.repository:keyIndex");

  static initializeSeed(seedFeatures?: Feature[]) {
    this.store.clear();
    this.keyIndex.clear();

    const features = seedFeatures && seedFeatures.length > 0 ? seedFeatures : CANONICAL_SEED_FEATURES;
    for (const f of features) {
      this.store.set(f.id, { ...f });
      this.keyIndex.set(f.key, f.id);
    }
  }

  async findById(id: string): Promise<Feature | null> {
    if (FeatureRepository.store.size === 0) {
      FeatureRepository.initializeSeed();
    }
    const item = FeatureRepository.store.get(id);
    return item ? { ...item } : null;
  }

  async findByKey(key: string): Promise<Feature | null> {
    if (FeatureRepository.store.size === 0) {
      FeatureRepository.initializeSeed();
    }
    const id = FeatureRepository.keyIndex.get(key);
    if (!id) return null;
    const item = FeatureRepository.store.get(id);
    return item ? { ...item } : null;
  }

  async listAll(): Promise<Feature[]> {
    if (FeatureRepository.store.size === 0) {
      FeatureRepository.initializeSeed();
    }
    return Array.from(FeatureRepository.store.values()).map((f) => ({ ...f }));
  }

  async listByCategory(category: FeatureCategory): Promise<Feature[]> {
    if (FeatureRepository.store.size === 0) {
      FeatureRepository.initializeSeed();
    }
    return Array.from(FeatureRepository.store.values())
      .filter((f) => f.category === category)
      .map((f) => ({ ...f }));
  }

  async create(dto: CreateFeatureDto): Promise<Feature> {
    if (FeatureRepository.store.size === 0) {
      FeatureRepository.initializeSeed();
    }
    if (FeatureRepository.keyIndex.has(dto.key)) {
      throw new UniqueConstraintViolationError("key", dto.key);
    }

    const now = new Date().toISOString();
    const id = `feat-${dto.key.replace(/\./g, "-")}-${Date.now().toString(36)}`;
    const newFeature: Feature = {
      id,
      key: dto.key,
      name: dto.name,
      description: dto.description,
      type: dto.type,
      category: dto.category,
      status: "ACTIVE",
      defaultValue: dto.defaultValue,
      isAddonEligible: dto.isAddonEligible ?? false,
      createdAt: now,
      updatedAt: now,
    };

    FeatureRepository.store.set(id, newFeature);
    FeatureRepository.keyIndex.set(newFeature.key, id);
    return { ...newFeature };
  }

  async update(id: string, updates: Partial<Feature>): Promise<Feature> {
    if (FeatureRepository.store.size === 0) {
      FeatureRepository.initializeSeed();
    }
    const existing = FeatureRepository.store.get(id);
    if (!existing) {
      throw new RecordNotFoundError("Feature", id);
    }

    if (updates.key && updates.key !== existing.key) {
      if (FeatureRepository.keyIndex.has(updates.key)) {
        throw new UniqueConstraintViolationError("key", updates.key);
      }
      FeatureRepository.keyIndex.delete(existing.key);
      FeatureRepository.keyIndex.set(updates.key, id);
    }

    const updated: Feature = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    FeatureRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<void> {
    const existing = FeatureRepository.store.get(id);
    if (existing) {
      FeatureRepository.keyIndex.delete(existing.key);
      FeatureRepository.store.delete(id);
    }
  }
}
