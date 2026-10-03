// ============================================================================
// CAR HIRE OS — PRICING & RATE ENGINE MODULE (DEV-006, DEV-007, BRS-001)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  RatePlanRepository,
  PromoCodeRepository,
  PricingRuleRepository,
  TenantSettingsRepository,
  CorporateAccountRepository,
  VehicleCategoryRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { PricingService } from "./application/pricing.service";
import { createPricingController } from "./presentation/pricing.controller";

export class PricingModule {
  public readonly pricingService: PricingService;
  public readonly router: Router;

  constructor(
    permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const ratePlanRepo = new RatePlanRepository();
    const promoRepo = new PromoCodeRepository();
    const ruleRepo = new PricingRuleRepository();
    const tenantSettingsRepo = new TenantSettingsRepository();
    const corporateAccountRepo = new CorporateAccountRepository();
    const vehicleCategoryRepo = new VehicleCategoryRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.pricingService = new PricingService(
      ratePlanRepo,
      promoRepo,
      ruleRepo,
      tenantSettingsRepo,
      corporateAccountRepo,
      vehicleCategoryRepo,
      auditRepo,
      outboxRepo
    );

    this.router = createPricingController(this.pricingService, permissionGuard);
  }
}
