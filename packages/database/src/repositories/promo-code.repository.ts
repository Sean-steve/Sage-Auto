import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PROMO CODE REPOSITORY (DEV-004, DEV-006, BRS-001)
// Manages Promotional Discount Codes, Validation, Usage Limits & Expiries
// ============================================================================

import type { PromoCode, CreatePromoCodeDto } from "@carhire/types";
import {
  RecordNotFoundError,
  CrossTenantViolationError,
  InternalDatabaseError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IPromoCodeRepository {
  create(tenantId: string, data: CreatePromoCodeDto, tx?: TransactionContext): Promise<PromoCode>;
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<PromoCode | null>;
  findByCode(code: string, tenantId: string, tx?: TransactionContext): Promise<PromoCode | null>;
  findAll(tenantId: string, tx?: TransactionContext): Promise<PromoCode[]>;
  update(id: string, tenantId: string, data: Partial<PromoCode>, tx?: TransactionContext): Promise<PromoCode>;
  recordUsage(code: string, tenantId: string, tx?: TransactionContext): Promise<PromoCode>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class PromoCodeRepository implements IPromoCodeRepository {
  private static promoStore = createRecordStore<string, PromoCode>("promo-code.repository:promoStore");

  static clear(): void {
    PromoCodeRepository.promoStore.clear();
  }

  static seed(promos: PromoCode[]): void {
    for (const p of promos) {
      PromoCodeRepository.promoStore.set(p.id, { ...p });
    }
  }

  async create(tenantId: string, data: CreatePromoCodeDto): Promise<PromoCode> {
    if (!tenantId) throw new InternalDatabaseError("tenantId is required");
    const normalizedCode = data.code.trim().toUpperCase();

    const existing = await this.findByCode(normalizedCode, tenantId);
    if (existing) {
      throw new InternalDatabaseError(`Promo code '${normalizedCode}' already exists in this workspace`);
    }

    const now = new Date().toISOString();
    const id = `promo-${crypto.randomUUID()}`;

    const promo: PromoCode = {
      id,
      tenantId,
      code: normalizedCode,
      description: data.description?.trim(),
      discountType: data.discountType,
      discountValue: data.discountValue,
      applicableTo: data.applicableTo || "BASE_RENTAL",
      minRentalDays: data.minRentalDays,
      minSubtotalAmount: data.minSubtotalAmount,
      maxDiscountAmount: data.maxDiscountAmount,
      validFrom: data.validFrom,
      validTo: data.validTo,
      usageLimit: data.usageLimit,
      usageCount: 0,
      applicableCategories: data.applicableCategories,
      isStackable: Boolean(data.isStackable),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    PromoCodeRepository.promoStore.set(id, promo);
    return { ...promo };
  }

  async findById(id: string, tenantId: string): Promise<PromoCode | null> {
    const promo = PromoCodeRepository.promoStore.get(id);
    if (!promo) return null;
    if (promo.tenantId !== tenantId) {
      throw new CrossTenantViolationError(promo.tenantId, tenantId);
    }
    return { ...promo };
  }

  async findByCode(code: string, tenantId: string): Promise<PromoCode | null> {
    const normalized = code.trim().toUpperCase();
    for (const promo of PromoCodeRepository.promoStore.values()) {
      if (promo.tenantId === tenantId && promo.code === normalized) {
        return { ...promo };
      }
    }
    return null;
  }

  async findAll(tenantId: string): Promise<PromoCode[]> {
    const results: PromoCode[] = [];
    for (const promo of PromoCodeRepository.promoStore.values()) {
      if (promo.tenantId === tenantId) {
        results.push({ ...promo });
      }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, tenantId: string, data: Partial<PromoCode>): Promise<PromoCode> {
    const promo = await this.findById(id, tenantId);
    if (!promo) throw new RecordNotFoundError("PromoCode", id);

    const now = new Date().toISOString();
    const updated: PromoCode = {
      ...promo,
      ...data,
      id: promo.id,
      tenantId: promo.tenantId,
      updatedAt: now,
    };

    PromoCodeRepository.promoStore.set(id, updated);
    return { ...updated };
  }

  async recordUsage(code: string, tenantId: string): Promise<PromoCode> {
    const promo = await this.findByCode(code, tenantId);
    if (!promo) throw new RecordNotFoundError("PromoCode", code);

    const now = new Date().toISOString();
    promo.usageCount += 1;
    promo.updatedAt = now;

    if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
      promo.status = "EXPIRED";
    }

    PromoCodeRepository.promoStore.set(promo.id, promo);
    return { ...promo };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const promo = await this.findById(id, tenantId);
    if (!promo) throw new RecordNotFoundError("PromoCode", id);
    PromoCodeRepository.promoStore.delete(id);
  }
}
