import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — TENANT SETTINGS PERSISTENCE REPOSITORY (DEV-004, DATA-002 §5)
// ============================================================================

import type { TenantSetting } from "@carhire/types";
import { RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ITenantSettingsRepository {
  findByTenantId(tenantId: string, tx?: TransactionContext): Promise<TenantSetting | null>;
  upsert(
    tenantId: string,
    settings: Partial<TenantSetting>,
    tx?: TransactionContext
  ): Promise<TenantSetting>;
}

export class TenantSettingsRepository implements ITenantSettingsRepository {
  private static store = createRecordStore<string, TenantSetting>("tenant-settings.repository:store");

  static initializeSeed(seedSettings: TenantSetting[]) {
    seedSettings.forEach((s) => {
      this.store.set(s.tenantId, { ...s });
    });
  }

  async findByTenantId(tenantId: string): Promise<TenantSetting | null> {
    return TenantSettingsRepository.store.get(tenantId) || null;
  }

  async upsert(tenantId: string, settings: Partial<TenantSetting>): Promise<TenantSetting> {
    const existing = await this.findByTenantId(tenantId);
    const now = new Date().toISOString();

    const record: TenantSetting = {
      id: existing?.id || crypto.randomUUID(),
      tenantId,
      vatRatePercent: settings.vatRatePercent ?? existing?.vatRatePercent ?? 16,
      mpesaPaybill: settings.mpesaPaybill ?? existing?.mpesaPaybill,
      mpesaShortcode: settings.mpesaShortcode ?? existing?.mpesaShortcode,
      mpesaPasskey: settings.mpesaPasskey ?? existing?.mpesaPasskey,
      mpesaSandbox: settings.mpesaSandbox ?? existing?.mpesaSandbox ?? true,
      allowedDailyKm: settings.allowedDailyKm ?? existing?.allowedDailyKm ?? 250,
      excessKmRate: settings.excessKmRate ?? existing?.excessKmRate ?? 25,
      depositDefaultAmount: settings.depositDefaultAmount ?? existing?.depositDefaultAmount ?? 25000,
      cdwDailyRate: settings.cdwDailyRate ?? existing?.cdwDailyRate ?? 1500,
      enableGpsTracking: settings.enableGpsTracking ?? existing?.enableGpsTracking ?? false,
      requirePreauthDeposit: settings.requirePreauthDeposit ?? existing?.requirePreauthDeposit ?? true,
      flexibleConfig: settings.flexibleConfig ?? existing?.flexibleConfig,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    TenantSettingsRepository.store.set(tenantId, record);
    return record;
  }
}
