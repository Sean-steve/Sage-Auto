import { AccessService } from "./modules/access/access.service";
import { accessController } from "./modules/access/access.controller";
import express, { Express } from "express";
import {
  healthController,
  livenessController,
  readinessController,
  metadataController,
  metricsController,
} from "./health/health.controller";
import { observabilityMiddleware } from "./common/middleware/observability.middleware";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware";
import { bypassValidationMiddleware } from "./common/middleware/bypass-validation.middleware";
import { globalErrorMiddleware } from "./common/filters/http-exception.filter";
import { AppLoggerService } from "./common/logger/app-logger.service";
import { IdentityModule } from "./modules/identity/identity.module";
import { TenancyModule } from "./modules/tenancy/tenancy.module";
import { AuthorizationModule } from "./modules/authorization/authorization.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";
import { BillingModule } from "./modules/billing/billing.module";
import { EntitlementsModule } from "./modules/entitlements/entitlements.module";
import { FleetModule } from "./modules/fleet/fleet.module";
import { VehicleOwnersModule } from "./modules/vehicle-owners/vehicle-owners.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { CorporateAccountsModule } from "./modules/corporate-accounts/corporate-accounts.module";
import { DriversModule } from "./modules/drivers/drivers.module";
import { AgentsModule } from "./modules/agents/agents.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { HandoversModule } from "./modules/handovers/handovers.module";
import { RentalsModule } from "./modules/rentals/rentals.module";
import { InspectionsModule } from "./modules/inspections/inspections.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { LedgerModule } from "./modules/ledger/ledger.module";
import { OwnerSettlementsModule } from "./modules/owner-settlements/owner-settlements.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { FilesModule } from "./modules/files/files.module";
import { MediaModule } from "./modules/media/media.module";
import { WebsiteModule } from "./modules/website/website.module";
import { DomainsModule } from "./modules/domains/domains.module";
import { PublicBookingModule } from "./modules/public-booking/public-booking.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { CrmModule } from "./modules/crm/crm.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { PlatformAnalyticsModule } from "./modules/platform-analytics/platform-analytics.module";
import { createPlatformAdminModule } from "./modules/platform-admin/platform-admin.module";
import { getSharedEventBus } from "./infrastructure/events/event-bus";
import {
  TenantRepository,
  TenantSettingsRepository,
  TenantMembershipRepository,
  AuditRepository,
  OutboxRepository,
  RoleRepository,
  TenantMembershipRoleRepository,
  PlatformRoleRepository,
  SupportAccessSessionRepository,
  PlanRepository,
  FeatureRepository,
  PlanFeatureRepository,
  SubscriptionRepository,
  SaaSBillingInvoiceRepository,
  BillingAccountRepository,
  VehicleRepository,
  UserRepository,
  BookingRepository,
} from "@carhire/database";
import { TokenService } from "./modules/identity/application/security/token.service";
import { createAuthGuard } from "./modules/identity/presentation/auth.guard";
import { validateDeploymentConfig } from "@carhire/config";

export function createApiApp(): Express {
  validateDeploymentConfig();
  const app = express();
  const logger = new AppLoggerService("HttpServer");

  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(bypassValidationMiddleware);
  app.use(observabilityMiddleware);

  // Request logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
        requestId: (req as { id?: string }).id,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });
    next();
  });

  // Health, Metrics & Diagnostic routes
  app.get("/api/health", healthController);
  app.get("/api/health/live", livenessController);
  app.get("/api/health/ready", readinessController);
  app.get("/api/metrics", metricsController);
  app.get("/api/metadata", metadataController);

  // Initialize Seed Data
  PlanRepository.initializeSeed();
  FeatureRepository.initializeSeed();
  PlanFeatureRepository.initializeSeed();
  
  // Shared Repositories & Services
  const tenantRepo = new TenantRepository();
  const settingsRepo = new TenantSettingsRepository();
  const membershipRepo = new TenantMembershipRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();
  const roleRepo = new RoleRepository();
  const membershipRoleRepo = new TenantMembershipRoleRepository(roleRepo);
  const platformRoleRepo = new PlatformRoleRepository();
  const supportSessionRepo = new SupportAccessSessionRepository();
  const tokenService = new TokenService();
  const authGuard = createAuthGuard(tokenService);

  // Shared VehicleRepository (single source of truth for fleet + public catalogue)
  const vehicleRepo = new VehicleRepository();

  // Authorization Module (Sprint 5: DEV-005, SEC-005, SEC-007)
  const authorizationModule = new AuthorizationModule({
    roleRepository: roleRepo,
    membershipRoleRepository: membershipRoleRepo,
    platformRoleRepository: platformRoleRepo,
    supportSessionRepository: supportSessionRepo,
    membershipRepository: membershipRepo,
    tenantRepository: tenantRepo,
    auditRepository: auditRepo,
    outboxRepository: outboxRepo,
  });

  // Subscriptions & SaaS Billing Modules (Sprint 6: Control Plane Foundation)
  const platformAuthGuard = (perm: string) => authorizationModule.createPlatformPermissionGuard(perm);
  const permissionGuard = (perm: string) => authorizationModule.createPermissionGuard(perm);

  const subscriptionsModule = new SubscriptionsModule(platformAuthGuard, permissionGuard);
  const billingModule = new BillingModule(
    subscriptionsModule.subscriptionService,
    platformAuthGuard,
    permissionGuard
  );

  // Entitlements & Capability Engine Module (Sprint 7: ENT-001)
  const entitlementsModule = new EntitlementsModule(
    platformAuthGuard,
    permissionGuard
  );

  // Fleet & Vehicle Owners Modules (Sprint 9: DOM-001, DOM-003, ENT-001)
  const fleetModule = new FleetModule(
    vehicleRepo,
    entitlementsModule.entitlementService,
    permissionGuard
  );
  const vehicleOwnersModule = new VehicleOwnersModule(permissionGuard);

  // Party & Customer Modules (Sprint 10: DOM-001, DOM-003, SEC-005)
  const customersModule = new CustomersModule(permissionGuard);
  const corporateAccountsModule = new CorporateAccountsModule(permissionGuard);
  const driversModule = new DriversModule(permissionGuard);
  const agentsModule = new AgentsModule(permissionGuard);

  // Pricing & Rate Engine Module (Sprint 11: DEV-006, DEV-007, BRS-001)
  const pricingModule = new PricingModule(permissionGuard);

  // Availability & Concurrency-Safe Allocation Engine Module (Sprint 12: DEV-006, DEV-007, BRS-001)
  const availabilityModule = new AvailabilityModule(permissionGuard);

  // Booking & Reservation Lifecycle Module (Sprint 13: DOM-003 §14-16, DEV-006, DEV-007, BRS-001)
  const bookingsModule = new BookingsModule(
    pricingModule.pricingService,
    availabilityModule.availabilityService,
    permissionGuard
  );

  // Contracts & Legal Instruments Module (Sprint 14: DOM-003 §17, DEV-006, DEV-007, BRS-001)
  const contractsModule = new ContractsModule(permissionGuard);

  // Compliance, Regulatory Documents & Operational Eligibility Module (Sprint 18: DEV-006, DEV-009, DOM-003)
  const complianceModule = new ComplianceModule(permissionGuard);

  // Vehicle Handover & Dispatch Module (Sprint 14: DOM-003 §18, DEV-006, DEV-007, BRS-001)
  const handoversModule = new HandoversModule(permissionGuard, complianceModule.readinessService);

  // Rental Aggregate & On-Road Operations Module (Sprint 14: DOM-003 §19-20, DEV-006, DEV-007, BRS-001)
  const rentalsModule = new RentalsModule(permissionGuard, complianceModule.readinessService);

  // Inspections, Damage & Evidence Module (Sprint 15: DOM-003 §21-22, DEV-006, DEV-007, BRS-001)
  const inspectionsModule = new InspectionsModule(permissionGuard);

  // Maintenance Management & Fleet Servicing Module (Sprint 17: DOM-003 §21-24, DEV-006, DEV-007, BRS-001)
  const maintenanceModule = new MaintenanceModule(permissionGuard);

  // General Ledger & Double-Entry Accounting Module (Sprint 20: DOM-003 §35-40)
  const ledgerModule = new LedgerModule(permissionGuard);

  // Payment Bounded Context & Provider Integrations (Sprint 22: DEV-009, DATA-002)
  const paymentsModule = new PaymentsModule(permissionGuard);

  // Operational Finance, Invoicing, Receivables & Expenses Module (Sprint 19: DOM-003 §28-34)
  const financeModule = new FinanceModule(permissionGuard, {
    ledgerService: ledgerModule.ledgerService,
    paymentService: paymentsModule.paymentService,
  });

  // Vehicle Owner Settlements, Revenue Sharing & Payout Obligations (Sprint 21: DOM-003 §41-45)
  const ownerSettlementsModule = new OwnerSettlementsModule(
    permissionGuard,
    ledgerModule.ledgerService
  );

  // Secure Files, Document Storage & Object Access Module (Sprint 27: ARCH-001, SEC-001, SEC-002)
  const filesModule = new FilesModule({
    outboxRepo,
    permissionGuard,
  });

  // Media & Image Processing Module (Sprint 28: ARCH-001, DEV-006, SEC-001)
  const mediaModule = new MediaModule({
    fileRepo: filesModule.fileRepo,
    storageDriver: filesModule.storageDriver,
    outboxRepo,
    permissionGuard,
  });

  // Website CMS, Branding & Public Storefront Engine (Sprint 29: ARCH-001, DEV-008)
  const websiteModule = new WebsiteModule({
    vehicleRepo,
    permissionGuard,
  });

  // Domains, Automatic Subdomains & Host Resolution Module (Sprint 30: TEN-001, DEV-008, DEV-009)
  const domainsModule = new DomainsModule({
    domainRepo: websiteModule.domainRepo,
    websiteRepo: websiteModule.websiteRepo,
    pageRepo: websiteModule.pageRepo,
    snapshotRepo: websiteModule.snapshotRepo,
    tenantRepo,
    entitlementEngine: entitlementsModule.entitlementEngine,
    permissionGuard,
  });

  // Identity & Authentication Module (Sprint 3: DEV-004, SEC-007)
  const identityModule = new IdentityModule();
  app.use("/api/v1/auth", identityModule.router);

  // Tenancy & Trusted Context Module (Sprint 4: DEV-004, DEV-007)
  const tenancyModule = new TenancyModule(
    tenantRepo,
    settingsRepo,
    membershipRepo,
    auditRepo,
    outboxRepo,
    tokenService,
    membershipRoleRepo,
    roleRepo,
    authorizationModule.authorizationService
  );
  const accessService = new AccessService(authorizationModule,tenancyModule,identityModule.emailDelivery);
  app.use("/api/v1/access",accessController(accessService,identityModule));
  // Legacy operational routes require verified accounts. Self-service identities
  // use the record-scoped access endpoints, never broad staff collection APIs.
  app.use("/api/v1", async (req,res,next)=>{
    if(req.path.startsWith('/public/')||req.path.startsWith('/health')) {next();return;}
    await authGuard(req,res,async()=>{
      try {
        await accessService.user(req.auth!.userId,true);
        if(req.method!=='GET' && /^\/(?:roles|memberships|platform\/staff)(?:\/|$)/.test(req.path)) {
          res.status(409).json({error:{message:'Use Team & invitations to change access. Legacy role mutations are disabled.'}});return;
        }

        const tenantId=req.headers['x-tenant-id'] as string;
        if(tenantId) {
          const m=await membershipRepo.findByTenantAndUser(tenantId,req.auth!.userId);
          if(m) {
            const roles=await membershipRoleRepo.getRolesForMembership(tenantId,m.id);
            if(roles.some(r=>['DRIVER','VEHICLE_OWNER'].includes(r.code||''))) {res.status(403).json({error:{message:'Use your personal portal for access to linked records.'}});return;}
          }
        }
        next();
      } catch(error:any) {res.status(error.statusCode||403).json({error:{message:error.message}});}
    });
  });
  app.use("/api/v1", tenancyModule.router);

  // Authorization & Role Routes (Sprint 5: DEV-005)
  const tenantGuard = tenancyModule.tenantGuard;
  app.use(["/api/v1/roles", "/api/v1/permissions", "/api/v1/memberships"], authGuard, tenantGuard);
  app.use("/api/v1", authorizationModule.createRoleController());
  app.use("/api/v1/authorization", authGuard, tenantGuard);
  app.use("/api/v1", authorizationModule.createAuthorizationController());
  app.use("/api/v1/platform", authGuard, async (req, res, next) => {
    const membership=await authorizationModule.platformMembershipRepository.findByUserId(req.auth!.userId);
    if(!req.auth?.isPlatformStaff || membership?.status!=="ACTIVE") {res.status(403).json({error:{message:"Active platform staff access is required."}});return;}
    next();
  });
  app.use("/api/v1/platform", authGuard, authorizationModule.createPlatformAuthorizationController());

  // Platform Subscriptions, Billing & Entitlement Routes (Sprint 6 & 7)
  app.use("/api/v1/platform", authGuard, subscriptionsModule.platformRouter);
  app.use("/api/v1/platform/billing", authGuard, billingModule.platformRouter);
  app.use("/api/v1/platform", authGuard, entitlementsModule.platformRouter);

  // Platform SaaS Analytics, Subscriptions & MRR Intelligence (Sprint 35: DOM-003, DEV-004)
  const platformAnalyticsModule = new PlatformAnalyticsModule({
    eventBus: getSharedEventBus(),
  });
  app.use("/api/v1/platform/analytics", platformAuthGuard("platform.analytics.read"), platformAnalyticsModule.router);

  // Platform Admin Command Center & SaaS Operations (Sprint 37: TEN-001..005, OPS-001..004)
  const platformAdminModule = createPlatformAdminModule({
    tenantRepo,
    subscriptionRepo: new SubscriptionRepository(),
    planRepo: new PlanRepository(),
    vehicleRepo,
    bookingRepo: new BookingRepository(),
    auditRepo,
    outboxRepo,
    userRepo: new UserRepository(),
    platformAuthService: authorizationModule.platformAuthorizationService,
  });
  app.use("/api/v1/platform", authGuard, platformAdminModule.router);

  // Tenant Subscriptions, Billing & Entitlement Routes (Sprint 6 & 7)
  app.use("/api/v1/subscription", authGuard, tenantGuard, subscriptionsModule.tenantRouter);
  app.use("/api/v1/billing", authGuard, tenantGuard, billingModule.tenantRouter);
  app.use("/api/v1/entitlements", authGuard, tenantGuard, entitlementsModule.tenantRouter);

  // Tenant Fleet & Vehicle Owners Routes (Sprint 9: DOM-001, DOM-003)
  app.use("/api/v1/fleet", authGuard, tenantGuard, fleetModule.router);
  app.use("/api/v1/vehicle-owners", authGuard, tenantGuard, vehicleOwnersModule.router);

  // Tenant Party & Customer Operations Routes (Sprint 10: DOM-001, DOM-003)
  app.use("/api/v1/customers", authGuard, tenantGuard, customersModule.router);
  app.use("/api/v1/corporate-accounts", authGuard, tenantGuard, corporateAccountsModule.router);
  app.use("/api/v1/drivers", authGuard, tenantGuard, driversModule.router);
  app.use("/api/v1/agents", authGuard, tenantGuard, agentsModule.router);

  // Tenant Pricing & Rate Engine Routes (Sprint 11: DEV-006, DEV-007, BRS-001)
  app.use("/api/v1/pricing", authGuard, tenantGuard, pricingModule.router);

  // Tenant Availability & Allocation Engine Routes (Sprint 12: DEV-006, DEV-007, BRS-001)
  app.use("/api/v1/availability", authGuard, tenantGuard, availabilityModule.router);

  // Tenant Booking & Reservation Routes (Sprint 13: DOM-003 §14-16, DEV-006, DEV-007, BRS-001)
  app.use("/api/v1/bookings", authGuard, tenantGuard, bookingsModule.router);

  // Tenant Contracts & Legal Instruments Routes (Sprint 14: DOM-003 §17)
  app.use("/api/v1/contracts", authGuard, tenantGuard, contractsModule.router);

  // Tenant Vehicle Handover Routes (Sprint 14: DOM-003 §18)
  app.use("/api/v1/handovers", authGuard, tenantGuard, handoversModule.router);

  // Tenant Rental Aggregate & On-Road Operations Routes (Sprint 14: DOM-003 §19-20)
  app.use("/api/v1/rentals", authGuard, tenantGuard, rentalsModule.router);

  // Tenant Inspections, Damage & Evidence Routes (Sprint 15: DOM-003 §21-22)
  app.use("/api/v1/inspections", authGuard, tenantGuard, inspectionsModule.router);

  // Tenant Maintenance Management Routes (Sprint 17: DOM-003 §21-24)
  app.use("/api/v1/maintenance", authGuard, tenantGuard, maintenanceModule.router);

  // Tenant Compliance, Regulatory Documents & Eligibility Routes (Sprint 18: DEV-006, DEV-009, DOM-003)
  app.use("/api/v1/compliance", authGuard, tenantGuard, complianceModule.router);

  // Tenant Operational Finance Routes (Sprint 19: DOM-003 §28-34)
  app.use("/api/v1/finance", authGuard, tenantGuard, financeModule.router);

  // Tenant General Ledger & Double-Entry Accounting Routes (Sprint 20: DOM-003 §35-40)
  app.use("/api/v1/ledger", authGuard, tenantGuard, ledgerModule.router);

  // Tenant Owner Settlement Routes (Sprint 21: DOM-003 §41-45)
  app.use("/api/v1/owner-settlements", authGuard, tenantGuard, ownerSettlementsModule.router);

  // Tenant Payment Bounded Context & Provider Contracts Routes (Sprint 22: DEV-009, DATA-002)
  app.post("/api/v1/payments/webhooks/:provider", paymentsModule.controller.handleWebhook);
  app.use("/api/v1/payments", authGuard, tenantGuard, paymentsModule.router);

  // Tenant Secure Files, Document Storage & Object Access Routes (Sprint 27: ARCH-001, SEC-001, SEC-002)
  app.get("/api/v1/files/public/:fileId", filesModule.handlePublicFileDownload);
  app.use("/api/v1/files", authGuard, tenantGuard, filesModule.filesRouter);
  app.use("/api/v1/documents", authGuard, tenantGuard, filesModule.documentsRouter);

  // Tenant Media & Image Processing Routes (Sprint 28: ARCH-001, DEV-006, SEC-001)
  app.get("/api/v1/media/public/:id", mediaModule.handlePublicDerivativeDelivery);
  app.use("/api/v1/media", authGuard, tenantGuard, mediaModule.mediaRouter);
  app.use("/api/v1/vehicles", authGuard, tenantGuard, mediaModule.vehicleMediaRouter);

  // Tenant Website CMS, Branding & Public Storefront Engine (Sprint 29: ARCH-001, DEV-008)
  app.use("/api/v1/public/website", websiteModule.publicRouter);
  app.use("/api/v1/website", authGuard, tenantGuard, websiteModule.tenantRouter);

  // Tenant Domain Management & Authoritative Public Host Resolution (Sprint 30: TEN-001, DEV-008, DEV-009)
  app.use("/api/v1/public/domains", domainsModule.publicRouter);
  app.use("/api/v1/tenant/domains", authGuard, tenantGuard, domainsModule.tenantRouter);

  // Public Vehicle Discovery, Live Availability, Public Pricing & Checkout Module (Sprint 31)
  const publicBookingModule = new PublicBookingModule({
    hostResolver: domainsModule.hostResolutionService,
    bookingService: bookingsModule.bookingService,
    availabilityService: availabilityModule.availabilityService,
    pricingService: pricingModule.pricingService,
    paymentService: paymentsModule.paymentService,
    vehicleRepo,
  });
  app.use("/api/v1/public/booking", publicBookingModule.router);

  // Tenant Notifications & Communication Orchestration Module (Sprint 32: DEV-012)
  const notificationsModule = new NotificationsModule({
    eventBus: getSharedEventBus(),
    tenantRepo,
    websiteRepo: websiteModule.websiteRepo,
    domainRepo: websiteModule.domainRepo,
  });
  app.post("/api/v1/notifications/webhooks/:provider", async (req, res) => {
    try {
      const provider = req.params.provider.toUpperCase();
      const receipt = await notificationsModule.orchestrator.processDeliveryReceipt({
        provider,
        rawPayload: req.body,
        signature: (req.headers["x-twilio-signature"] || req.headers["x-hub-signature-256"]) as string,
      });
      res.status(200).json({ status: "acknowledged", receiptId: receipt?.id });
    } catch (err: any) {
      res.status(400).json({ error: { code: "WEBHOOK_FAILED", message: err.message } });
    }
  });
  app.use("/api/v1/notifications", authGuard, tenantGuard, notificationsModule.router);

  // Leads, Sales Quotes & CRM Pipeline (Sprint 33)
  const crmModule = new CrmModule({
    pricingService: pricingModule.pricingService,
    availabilityService: availabilityModule.availabilityService,
    bookingService: bookingsModule.bookingService,
    customerService: customersModule.customersService,
    corporateService: corporateAccountsModule.corporateService,
    notificationOrchestrator: notificationsModule.orchestrator,
    hostResolver: domainsModule.hostResolutionService,
  });
  app.use("/api/v1/public/crm", crmModule.publicRouter);
  app.use("/api/v1/crm", authGuard, tenantGuard, crmModule.router);

  // Tenant Analytics, KPI Engine & Reporting Platform (Sprint 34: DOM-003, DEV-009)
  const analyticsModule = new AnalyticsModule({
    eventBus: getSharedEventBus(),
  });
  app.use("/api/v1/analytics", authGuard, tenantGuard, analyticsModule.analyticsRouter);
  app.use("/api/v1/reports", authGuard, tenantGuard, analyticsModule.reportsRouter);

  // Global error handler
  app.use(globalErrorMiddleware);

  return app;
}
