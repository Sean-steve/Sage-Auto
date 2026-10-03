// ============================================================================
// CAR HIRE OS — BILLING MODULE
// ============================================================================

import { Router } from "express";
import {
  SaaSBillingInvoiceRepository,
  SaaSPaymentRecordRepository,
  BillingAccountRepository,
  SubscriptionRepository,
  PlanRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { PLATFORM_PERMISSIONS, TENANT_PERMISSIONS } from "@carhire/constants";
import { BillingService } from "./application/billing.service";
import { BillingJobsService } from "./application/billing-jobs.service";
import { SubscriptionService } from "../subscriptions/application/subscription.service";
import { PlatformBillingController } from "./presentation/platform-billing.controller";
import { TenantBillingController } from "./presentation/tenant-billing.controller";
import type { RequestHandler } from "express";

export interface IGuardWrapper {
  require?: (perm: string) => RequestHandler;
  requirePlatformPermission?: (perm: string) => RequestHandler;
}

export class BillingModule {
  public readonly platformRouter: Router;
  public readonly tenantRouter: Router;
  public readonly billingService: BillingService;
  public readonly jobsService: BillingJobsService;

  constructor(
    subscriptionService?: SubscriptionService,
    platformAuthGuard?: IGuardWrapper | ((perm: string) => RequestHandler),
    permissionGuard?: IGuardWrapper | ((perm: string) => RequestHandler)
  ) {
    const invoiceRepo = new SaaSBillingInvoiceRepository();
    const paymentRepo = new SaaSPaymentRecordRepository();
    const billingAccountRepo = new BillingAccountRepository();
    const subRepo = new SubscriptionRepository();
    const planRepo = new PlanRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.billingService = new BillingService(
      invoiceRepo,
      paymentRepo,
      billingAccountRepo,
      subRepo,
      planRepo,
      auditRepo,
      outboxRepo
    );

    const subService = subscriptionService || new SubscriptionService();
    this.jobsService = new BillingJobsService(
      subRepo,
      subService,
      this.billingService,
      invoiceRepo,
      planRepo
    );

    const platformCtrl = new PlatformBillingController(this.billingService, this.jobsService);
    const tenantCtrl = new TenantBillingController(this.billingService);

    const resolvePlatformGuard = (perm: string): RequestHandler => {
      if (!platformAuthGuard) return (_req, _res, next) => next();
      if (typeof platformAuthGuard === "function") return platformAuthGuard(perm);
      if (platformAuthGuard.requirePlatformPermission) return platformAuthGuard.requirePlatformPermission(perm);
      if (platformAuthGuard.require) return platformAuthGuard.require(perm);
      return (_req, _res, next) => next();
    };

    const resolveTenantGuard = (perm: string): RequestHandler => {
      if (!permissionGuard) return (_req, _res, next) => next();
      if (typeof permissionGuard === "function") return permissionGuard(perm);
      if (permissionGuard.require) return permissionGuard.require(perm);
      return (_req, _res, next) => next();
    };

    // Platform Router
    this.platformRouter = Router();
    const requirePlatformBillingRead = resolvePlatformGuard(PLATFORM_PERMISSIONS.PLATFORM_BILLING_READ);
    const requirePlatformBillingManage = resolvePlatformGuard(PLATFORM_PERMISSIONS.PLATFORM_BILLING_MANAGE);
    const requirePlatformRecordPayment = resolvePlatformGuard(PLATFORM_PERMISSIONS.PLATFORM_BILLING_RECORD_PAYMENT);

    this.platformRouter.get("/invoices", requirePlatformBillingRead, platformCtrl.listInvoices);
    this.platformRouter.get("/invoices/:id", requirePlatformBillingRead, platformCtrl.getInvoiceById);
    this.platformRouter.post("/invoices", requirePlatformBillingManage, platformCtrl.createInvoice);
    this.platformRouter.post("/invoices/:id/record-payment", requirePlatformRecordPayment, platformCtrl.recordPayment);
    this.platformRouter.get("/payments", requirePlatformBillingRead, platformCtrl.listPayments);
    this.platformRouter.post("/jobs/run-renewals", requirePlatformBillingManage, platformCtrl.runRenewalJob);

    // Tenant Router
    this.tenantRouter = Router();
    const requireTenantBillingRead = resolveTenantGuard(TENANT_PERMISSIONS.BILLING_READ);

    this.tenantRouter.get("/invoices", requireTenantBillingRead, tenantCtrl.listTenantInvoices);
    this.tenantRouter.get("/invoices/:id", requireTenantBillingRead, tenantCtrl.getInvoiceById);
    this.tenantRouter.post("/invoices/:id/pay-mock", requireTenantBillingRead, tenantCtrl.payInvoiceMock);
    this.tenantRouter.get("/payments", requireTenantBillingRead, tenantCtrl.listTenantPayments);
  }
}
