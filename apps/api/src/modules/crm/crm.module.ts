// ============================================================================
// CAR HIRE OS — CRM MODULE (Sprint 33)
// Bounded Context: Leads, Sales Quotes, Pipeline Stages, Activities & Tasks
// ============================================================================

import { Router } from "express";
import {
  LeadRepository,
  SalesQuoteRepository,
  CrmActivityRepository,
  CrmTaskRepository,
  CrmPipelineStageRepository,
  OutboxRepository,
} from "@carhire/database";
import { LeadService } from "./application/lead.service";
import { SalesQuoteService } from "./application/sales-quote.service";
import { CrmActivityService } from "./application/crm-activity.service";
import { CrmTaskService } from "./application/crm-task.service";
import { CrmPipelineService } from "./application/crm-pipeline.service";
import { createCrmController } from "./presentation/crm.controller";
import { createCrmPublicController } from "./presentation/crm-public.controller";
import { PricingService } from "../pricing/application/pricing.service";
import { AvailabilityService } from "../availability/application/availability.service";
import { BookingService } from "../bookings/application/booking.service";
import { CustomersService } from "../customers/application/customers.service";
import { CorporateAccountsService } from "../corporate-accounts/application/corporate-accounts.service";
import { NotificationOrchestratorService } from "../notifications/index";
import { HostResolutionService } from "../domains/application/host-resolution.service";

export interface CrmModuleOptions {
  pricingService?: PricingService;
  availabilityService?: AvailabilityService;
  bookingService?: BookingService;
  customerService?: CustomersService;
  corporateService?: CorporateAccountsService;
  notificationOrchestrator?: NotificationOrchestratorService;
  hostResolver?: HostResolutionService;
}

export class CrmModule {
  public readonly leadService: LeadService;
  public readonly quoteService: SalesQuoteService;
  public readonly activityService: CrmActivityService;
  public readonly taskService: CrmTaskService;
  public readonly pipelineService: CrmPipelineService;

  public readonly router: Router;
  public readonly publicRouter: Router;

  constructor(options: CrmModuleOptions = {}) {
    const leadRepo = new LeadRepository();
    const quoteRepo = new SalesQuoteRepository();
    const activityRepo = new CrmActivityRepository();
    const taskRepo = new CrmTaskRepository();
    const stageRepo = new CrmPipelineStageRepository();
    const outboxRepo = new OutboxRepository();

    this.activityService = new CrmActivityService(activityRepo, outboxRepo);
    this.taskService = new CrmTaskService(taskRepo, outboxRepo);
    this.pipelineService = new CrmPipelineService(stageRepo, leadRepo);

    this.leadService = new LeadService(
      leadRepo,
      stageRepo,
      this.activityService,
      outboxRepo,
      options.customerService,
      options.corporateService,
      options.notificationOrchestrator,
      options.hostResolver
    );

    this.quoteService = new SalesQuoteService(
      quoteRepo,
      leadRepo,
      this.activityService,
      outboxRepo,
      options.pricingService,
      options.availabilityService,
      options.bookingService,
      options.notificationOrchestrator,
      this.leadService
    );

    const controller = createCrmController(
      this.leadService,
      this.quoteService,
      this.activityService,
      this.taskService,
      this.pipelineService
    );

    const publicController = createCrmPublicController(
      this.leadService,
      this.quoteService,
      options.hostResolver
    );

    // Tenant Router (/api/v1/crm)
    const tenantRouter = Router();

    // Leads
    tenantRouter.get("/leads", controller.listLeads);
    tenantRouter.post("/leads", controller.createLead);
    tenantRouter.get("/leads/:id", controller.getLead);
    tenantRouter.put("/leads/:id", controller.updateLead);
    tenantRouter.patch("/leads/:id", controller.updateLead);
    tenantRouter.post("/leads/:id/assign", controller.assignLead);
    tenantRouter.post("/leads/:id/stage", controller.changeLeadStage);
    tenantRouter.post("/leads/:id/qualify", controller.qualifyLead);
    tenantRouter.post("/leads/:id/lost", controller.markLeadLost);
    tenantRouter.post("/leads/:id/convert", controller.convertLead);

    // Quotes
    tenantRouter.get("/quotes", controller.listQuotes);
    tenantRouter.post("/quotes", controller.createQuote);
    tenantRouter.get("/quotes/:id", controller.getQuote);
    tenantRouter.post("/quotes/:id/versions", controller.createQuoteVersion);
    tenantRouter.post("/quotes/:id/send", controller.sendQuote);
    tenantRouter.post("/quotes/:id/accept", controller.acceptQuote);
    tenantRouter.post("/quotes/:id/convert-to-booking", controller.convertQuoteToBooking);

    // Pipeline & Stages
    tenantRouter.get("/pipeline/stages", controller.getPipelineStages);
    tenantRouter.get("/pipeline/summary", controller.getPipelineSummary);

    // Tasks
    tenantRouter.get("/tasks", controller.listTasks);
    tenantRouter.post("/tasks", controller.createTask);
    tenantRouter.post("/tasks/:id/complete", controller.completeTask);

    // Activities
    tenantRouter.get("/activities", controller.listActivities);
    tenantRouter.post("/activities", controller.logActivity);

    this.router = tenantRouter;

    // Public Router (/api/v1/public/crm)
    const pubRouter = Router();
    pubRouter.post("/enquiries", publicController.submitEnquiry);
    pubRouter.get("/quotes/:token", publicController.getPublicQuote);
    pubRouter.post("/quotes/:token/accept", publicController.acceptPublicQuote);
    pubRouter.post("/quotes/:token/reject", publicController.rejectPublicQuote);

    this.publicRouter = pubRouter;
  }
}
