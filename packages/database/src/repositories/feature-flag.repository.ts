import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — FEATURE FLAG REPOSITORY (DEV-006 / ENT-001)
// Deployment and Rollout Flags (Distinct from Tenant Entitlements)
// ============================================================================

import { UniqueConstraintViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  rolloutPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface IFeatureFlagRepository {
  findById(id: string, tx?: TransactionContext): Promise<FeatureFlag | null>;
  findByKey(key: string, tx?: TransactionContext): Promise<FeatureFlag | null>;
  listAll(tx?: TransactionContext): Promise<FeatureFlag[]>;
  create(flag: Omit<FeatureFlag, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<FeatureFlag>;
  update(id: string, updates: Partial<FeatureFlag>, tx?: TransactionContext): Promise<FeatureFlag>;
}

export class FeatureFlagRepository implements IFeatureFlagRepository {
  private static store = createRecordStore<string, FeatureFlag>("feature-flag.repository:store");

  static initializeSeed(flags?: FeatureFlag[]) {
    this.store.clear();
    const defaults: FeatureFlag[] = flags || [
      {
        id: "flag-v2-billing-engine",
        key: "engine.v2_billing",
        name: "V2 Billing Engine Rollout",
        description: "Enables new payment reconciliation pipeline.",
        enabled: true,
        rolloutPercentage: 100,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "flag-ai-telematics",
        key: "fleet.ai_telematics",
        name: "AI Telematics Ingestion",
        description: "Experimental real-time CAN bus telemetry processor.",
        enabled: false,
        rolloutPercentage: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    for (const f of defaults) {
      this.store.set(f.id, { ...f });
    }
  }

  async findById(id: string): Promise<FeatureFlag | null> {
    if (FeatureFlagRepository.store.size === 0) FeatureFlagRepository.initializeSeed();
    const item = FeatureFlagRepository.store.get(id);
    return item ? { ...item } : null;
  }

  async findByKey(key: string): Promise<FeatureFlag | null> {
    if (FeatureFlagRepository.store.size === 0) FeatureFlagRepository.initializeSeed();
    for (const f of FeatureFlagRepository.store.values()) {
      if (f.key === key) return { ...f };
    }
    return null;
  }

  async listAll(): Promise<FeatureFlag[]> {
    if (FeatureFlagRepository.store.size === 0) FeatureFlagRepository.initializeSeed();
    return Array.from(FeatureFlagRepository.store.values()).map((f) => ({ ...f }));
  }

  async create(flag: Omit<FeatureFlag, "id" | "createdAt" | "updatedAt">): Promise<FeatureFlag> {
    if (FeatureFlagRepository.store.size === 0) FeatureFlagRepository.initializeSeed();
    const existing = await this.findByKey(flag.key);
    if (existing) throw new UniqueConstraintViolationError("key", flag.key);

    const now = new Date().toISOString();
    const id = `flag-${flag.key.replace(/\./g, "-")}`;
    const newFlag: FeatureFlag = {
      ...flag,
      id,
      createdAt: now,
      updatedAt: now,
    };
    FeatureFlagRepository.store.set(id, newFlag);
    return { ...newFlag };
  }

  async update(id: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag> {
    if (FeatureFlagRepository.store.size === 0) FeatureFlagRepository.initializeSeed();
    const existing = FeatureFlagRepository.store.get(id);
    if (!existing) throw new RecordNotFoundError("FeatureFlag", id);

    const updated: FeatureFlag = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    FeatureFlagRepository.store.set(id, updated);
    return { ...updated };
  }
}
