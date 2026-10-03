// ============================================================================
// CAR HIRE OS — SPRINT 33 INTEGRATION TEST SUITE:
// LEADS, SALES QUOTES, CRM PIPELINE, CUSTOMER FOLLOW-UP, COMMERCIAL CONVERSION
// ============================================================================

import { strict as assert } from "node:assert";
import {
  InMemoryLeadRepository,
  InMemorySalesQuoteRepository,
  InMemoryCrmActivityRepository,
  InMemoryCrmTaskRepository,
  InMemoryCrmPipelineStageRepository,
  InMemoryNotificationRepository,
  InMemoryNotificationReceiptRepository,
  InMemoryNotificationTemplateRepository,
  InMemoryCommunicationPreferenceRepository,
  InMemoryNotificationSuppressionRepository,
  InMemoryNotificationProviderConfigRepository,
  InMemoryTenantWebsiteRepository,
  InMemoryWebsiteDomainRepository,
  CustomerRepository,
  CorporateAccountRepository,
  BookingRepository,
  VehicleRepository,
  VehicleCategoryRepository,
  RatePlanRepository,
  AuditRepository,
  PartyDocumentRepository,
  OutboxRepository,
  TenantRepository,
} from "../src/index";
import { EventBus } from "../../../apps/api/src/infrastructure/events/event-bus";
import { LeadService } from "../../../apps/api/src/modules/crm/application/lead.service";
import { SalesQuoteService } from "../../../apps/api/src/modules/crm/application/sales-quote.service";
import { CrmActivityService } from "../../../apps/api/src/modules/crm/application/crm-activity.service";
import { CrmTaskService } from "../../../apps/api/src/modules/crm/application/crm-task.service";
import { CrmPipelineService } from "../../../apps/api/src/modules/crm/application/crm-pipeline.service";
import { CustomersService } from "../../../apps/api/src/modules/customers/application/customers.service";
import { CorporateAccountsService } from "../../../apps/api/src/modules/corporate-accounts/application/corporate-accounts.service";
import { BookingService } from "../../../apps/api/src/modules/bookings/application/booking.service";
import { PricingService } from "../../../apps/api/src/modules/pricing/application/pricing.service";
import { AvailabilityService } from "../../../apps/api/src/modules/availability/application/availability.service";
import {
  NotificationOrchestratorService,
  ProviderRegistryService,
  MockNotificationProvider,
  TemplateEngine,
} from "../../../apps/api/src/modules/notifications/index";
import {
  LeadNotFoundError,
  LeadAlreadyConvertedError,
  SalesQuoteNotFoundError,
  SalesQuoteExpiredError,
  SalesQuoteAlreadyConvertedError,
} from "../../../apps/api/src/modules/crm/domain/crm.errors";

async function runSprint33TestSuite() {
  console.log("======================================================================");
  console.log("RUNNING SPRINT 33: LEADS, SALES QUOTES & CRM PIPELINE TEST SUITE");
  console.log("======================================================================");

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const tenantBId = "22222222-2222-2222-2222-222222222222";

  // Repositories
  const leadRepo = new InMemoryLeadRepository();
  const quoteRepo = new InMemorySalesQuoteRepository();
  const activityRepo = new InMemoryCrmActivityRepository();
  const taskRepo = new InMemoryCrmTaskRepository();
  const stageRepo = new InMemoryCrmPipelineStageRepository();
  const outboxRepo = new OutboxRepository();

  const customerRepo = new CustomerRepository();
  const corporateRepo = new CorporateAccountRepository();
  const docRepo = new PartyDocumentRepository();
  const auditRepo = new AuditRepository();
  const bookingRepo = new BookingRepository();
  const vehicleRepo = new VehicleRepository();
  const categoryRepo = new VehicleCategoryRepository();
  const rateRepo = new RatePlanRepository();

  // Notification subsystem for communication
  const notifRepo = new InMemoryNotificationRepository();
  const notifReceiptRepo = new InMemoryNotificationReceiptRepository();
  const notifTemplateRepo = new InMemoryNotificationTemplateRepository();
  const notifPrefRepo = new InMemoryCommunicationPreferenceRepository();
  const notifSuppressionRepo = new InMemoryNotificationSuppressionRepository();
  const notifConfigRepo = new InMemoryNotificationProviderConfigRepository();
  const websiteRepo = new InMemoryTenantWebsiteRepository();
  const domainRepo = new InMemoryWebsiteDomainRepository();

  const tenantRepo = new TenantRepository();
  const eventBus = new EventBus();
  const mockProvider = new MockNotificationProvider();
  const providerRegistry = new ProviderRegistryService(notifConfigRepo, mockProvider, {
    useMockAsDefault: true,
  });

  const notificationOrchestrator = new NotificationOrchestratorService(
    notifRepo,
    notifReceiptRepo,
    notifTemplateRepo,
    notifPrefRepo,
    notifSuppressionRepo,
    providerRegistry,
    eventBus,
    tenantRepo,
    websiteRepo,
    domainRepo
  );

  // Core domain services
  const customerService = new CustomersService(customerRepo, docRepo, auditRepo, outboxRepo);
  const corporateService = new CorporateAccountsService(corporateRepo, auditRepo, outboxRepo);
  const pricingService = new PricingService(rateRepo as any);
  const crmDefaultRatePlan = await pricingService.createRatePlan(tenantId, {
    code: "CRM_DEFAULT_USD",
    name: "CRM Default USD",
    currency: "USD",
    priority: 10,
    isDefault: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    taxInclusive: false,
  });
  await pricingService.setRates(tenantId, crmDefaultRatePlan.id, [{
    dailyRate: 150,
    weeklyDailyRate: 150,
    monthlyDailyRate: 150,
    weekendDailyRate: 150,
    mileageAllowanceModel: "UNLIMITED",
    depositAmount: 300,
    depositModel: "FIXED",
  }]);
  await pricingService.activateRatePlan(tenantId, crmDefaultRatePlan.id);
  const availabilityService = new AvailabilityService();
  const bookingService = new BookingService(
    bookingRepo,
    pricingService,
    availabilityService,
    customerRepo,
    corporateRepo,
    undefined,
    undefined,
    vehicleRepo,
    categoryRepo
  );

  // CRM Services
  const activityService = new CrmActivityService(activityRepo, outboxRepo);
  const taskService = new CrmTaskService(taskRepo, outboxRepo);
  const pipelineService = new CrmPipelineService(stageRepo, leadRepo);

  const leadService = new LeadService(
    leadRepo,
    stageRepo,
    activityService,
    outboxRepo,
    customerService,
    corporateService,
    notificationOrchestrator
  );

  const quoteService = new SalesQuoteService(
    quoteRepo,
    leadRepo,
    activityService,
    outboxRepo,
    pricingService,
    availabilityService,
    bookingService,
    notificationOrchestrator,
    leadService
  );

  // -------------------------------------------------------------------------
  // Test 1: Lead Capture & Lifecycle Progression
  // -------------------------------------------------------------------------
  console.log("▶ Test 1: Lead Capture & Lifecycle Progression...");
  const lead1 = await leadService.createLead(
    tenantId,
    {
      firstName: "James",
      lastName: "Mwangi",
      email: "james.mwangi@example.com",
      phone: "+254711223344",
      source: "WEBSITE_ENQUIRY",
      estimatedValue: 1200,
      currency: "USD",
      confidenceScore: 60,
      pickupDate: "2026-10-01T09:00:00Z",
      returnDate: "2026-10-08T18:00:00Z",
      pickupLocation: "Nairobi Airport (NBO)",
      returnLocation: "Nairobi Airport (NBO)",
    },
    "sales_agent_1"
  );

  assert.equal(lead1.status, "NEW");
  assert.ok(lead1.leadNumber.startsWith("LEAD-"));
  assert.equal(lead1.email, "james.mwangi@example.com");
  assert.equal(lead1.estimatedValue, 1200);

  // Assign lead
  const assignedLead = await leadService.assignLead(
    tenantId,
    lead1.id,
    "usr_rep_42",
    "sales_manager"
  );
  assert.equal(assignedLead.assignedUserId, "usr_rep_42");
  assert.equal(assignedLead.version, 2);

  // Qualify lead
  const qualifiedLead = await leadService.qualifyLead(tenantId, lead1.id, "usr_rep_42");
  assert.equal(qualifiedLead.status, "QUALIFIED");
  console.log("  ✓ [PASS] 1. Lead captured, assigned, and qualified with versioning.");

  // -------------------------------------------------------------------------
  // Test 2: Loss Tracking & Disqualification
  // -------------------------------------------------------------------------
  console.log("▶ Test 2: Loss Tracking & Disqualification...");
  const lead2 = await leadService.createLead(
    tenantId,
    {
      firstName: "Alice",
      lastName: "Wonder",
      email: "alice@example.com",
      source: "PHONE_CALL",
      estimatedValue: 500,
    },
    "sales_agent_2"
  );

  const lostLead = await leadService.markLost(
    tenantId,
    lead2.id,
    "PRICE_TOO_HIGH",
    "Customer found cheaper rate with local competitor",
    "sales_agent_2"
  );
  assert.equal(lostLead.status, "LOST");
  assert.equal(lostLead.lossReason, "PRICE_TOO_HIGH");
  assert.equal(lostLead.lossNotes, "Customer found cheaper rate with local competitor");

  const lead3 = await leadService.createLead(
    tenantId,
    {
      firstName: "Spam",
      lastName: "Bot",
      email: "spam@invalid.test",
      source: "WEBSITE_ENQUIRY",
    }
  );
  const disqualifiedLead = await leadService.disqualifyLead(tenantId, lead3.id, "sales_agent_1");
  assert.equal(disqualifiedLead.status, "DISQUALIFIED");
  console.log("  ✓ [PASS] 2. Lead loss reason recorded and spam lead disqualified.");

  // -------------------------------------------------------------------------
  // Test 3: Lead Conversion to Customer & Corporate Account
  // -------------------------------------------------------------------------
  console.log("▶ Test 3: Lead Conversion to Customer & Corporate Account...");
  // Individual Conversion
  const conversionRes = await leadService.convertLead(
    tenantId,
    lead1.id,
    {
      idOrPassportNumber: "ID-998877",
      licenseNumber: "DL-KEN-112233",
    },
    "usr_rep_42"
  );

  assert.equal(conversionRes.lead.status, "CONVERTED");
  assert.ok(conversionRes.customerId);
  assert.equal(conversionRes.lead.convertedCustomerId, conversionRes.customerId);

  // Converted lead cannot be modified/re-converted
  await assert.rejects(
    async () => {
      await leadService.convertLead(tenantId, lead1.id, {}, "usr_rep_42");
    },
    (err: any) => err instanceof LeadAlreadyConvertedError
  );

  // Corporate Conversion
  const corpLead = await leadService.createLead(
    tenantId,
    {
      companyName: "Acme Safari Logistics",
      firstName: "John",
      lastName: "Doe",
      email: "procurement@acmesafari.com",
      phone: "+254700000000",
      type: "CORPORATE",
      estimatedValue: 15000,
    }
  );

  const corpConversion = await leadService.convertLead(
    tenantId,
    corpLead.id,
    {
      registrationNumber: "REG-ACME-2026",
      billingAddress: "Westlands Commercial Center, Nairobi",
      creditLimit: 50000,
    },
    "sales_manager"
  );

  assert.equal(corpConversion.lead.status, "CONVERTED");
  assert.ok(corpConversion.corporateAccountId);
  console.log("  ✓ [PASS] 3. Leads converted to canonical Customer and CorporateAccount.");

  // -------------------------------------------------------------------------
  // Test 4: Website Public Enquiry Storefront Ingestion
  // -------------------------------------------------------------------------
  console.log("▶ Test 4: Website Public Enquiry Storefront Ingestion...");
  const publicEnquiry = await leadService.handlePublicEnquiry({
    tenantId,
    firstName: "Sarah",
    lastName: "Connor",
    email: "sarah.connor@example.com",
    phone: "+15552345678",
    pickupDate: "2026-11-15T10:00:00Z",
    returnDate: "2026-11-20T10:00:00Z",
    pickupLocation: "Downtown Depot",
    returnLocation: "Downtown Depot",
    preferredVehicleCategory: "SUV / 4x4",
    message: "Need a robust 4x4 with roof tent for camping.",
    marketingConsent: true,
  });

  assert.equal(publicEnquiry.source, "WEBSITE_ENQUIRY");
  assert.equal(publicEnquiry.email, "sarah.connor@example.com");
  assert.equal(publicEnquiry.status, "NEW");
  assert.equal(publicEnquiry.metadata?.publicEnquiry, true);

  // Verify automated email acknowledgement was queued
  const notifications = await notifRepo.findMany({ tenantId });
  const ackNotif = notifications.items.find(
    (n) => n.recipient === "sarah.connor@example.com"
  );
  assert.ok(ackNotif, "Acknowledgement notification should have been queued.");
  assert.equal(ackNotif.category, "OPERATIONAL");
  console.log("  ✓ [PASS] 4. Storefront enquiry ingested and auto-acknowledgment sent.");

  // -------------------------------------------------------------------------
  // Test 5: Sales Quote Generation & Financial Math
  // -------------------------------------------------------------------------
  console.log("▶ Test 5: Sales Quote Generation & Financial Math...");
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { quote, version } = await quoteService.createQuote(
    tenantId,
    {
      leadId: publicEnquiry.id,
      currency: "USD",
      validUntil,
      pickupDate: "2026-11-15T10:00:00Z",
      returnDate: "2026-11-20T10:00:00Z",
      pickupLocation: "Downtown Depot",
      returnLocation: "Downtown Depot",
      lineItems: [
        {
          type: "BASE_RATE",
          description: "Toyota Land Cruiser Prado (5 Days)",
          unitPrice: 150,
          quantity: 5,
          taxRatePercent: 16, // 16% VAT
          discountAmount: 50,  // $50 discount
        },
        {
          type: "ADDON",
          description: "GPS Navigation Unit",
          unitPrice: 10,
          quantity: 5,
          taxRatePercent: 16,
        },
        {
          type: "INSURANCE",
          description: "Collision Damage Waiver (Zero Excess)",
          unitPrice: 25,
          quantity: 5,
          taxRatePercent: 0, // Tax exempt insurance
        },
      ],
      requiredDepositAmount: 300,
      paymentTerms: "30% deposit upon acceptance, balance at vehicle collection.",
    },
    "sales_agent_1"
  );

  // Item 1: (150 * 5) = 750. Discount = 50 -> Taxable = 700. Tax (16%) = 112. Total = 812
  // Item 2: (10 * 5) = 50. Discount = 0 -> Taxable = 50. Tax (16%) = 8. Total = 58
  // Item 3: (25 * 5) = 125. Discount = 0 -> Taxable = 125. Tax (0%) = 0. Total = 125
  // Subtotal = 750 + 50 + 125 = 925
  // DiscountTotal = 50
  // TaxTotal = 112 + 8 + 0 = 120
  // GrandTotal = 925 - 50 + 120 = 995
  assert.equal(quote.status, "DRAFT");
  assert.equal(quote.currentVersion, 1);
  assert.equal(quote.subtotal, 925);
  assert.equal(quote.discountTotal, 50);
  assert.equal(quote.taxTotal, 120);
  assert.equal(quote.grandTotal, 995);
  assert.equal(quote.depositTotal, 300);
  assert.ok(quote.publicToken.length >= 16);
  assert.equal(version.versionNumber, 1);
  assert.equal(version.grandTotal, 995);
  console.log("  ✓ [PASS] 5. Sales quote v1 created with precise tax/discount/total calculations.");

  // -------------------------------------------------------------------------
  // Test 6: Immutable Quote Versioning (v1 -> v2)
  // -------------------------------------------------------------------------
  console.log("▶ Test 6: Immutable Quote Versioning (v1 -> v2)...");
  // Customer negotiates an extra discount on rental
  const version2 = await quoteService.createNewVersion(
    tenantId,
    quote.id,
    {
      lineItems: [
        {
          type: "BASE_RATE",
          description: "Toyota Land Cruiser Prado (5 Days - Negotiated)",
          unitPrice: 150,
          quantity: 5,
          taxRatePercent: 16,
          discountAmount: 100, // Increased discount from 50 to 100
        },
        {
          type: "ADDON",
          description: "GPS Navigation Unit (Complimentary)",
          unitPrice: 0,
          quantity: 5,
          taxRatePercent: 16,
        },
        {
          type: "INSURANCE",
          description: "Collision Damage Waiver (Zero Excess)",
          unitPrice: 25,
          quantity: 5,
          taxRatePercent: 0,
        },
      ],
      requiredDepositAmount: 250,
      notes: "Applied commercial discount approved by sales manager.",
    },
    "sales_manager"
  );

  assert.equal(version2.versionNumber, 2);
  // Item 1: (150*5)=750. Discount=100 -> Taxable=650. Tax(16%)=104. Total=754.
  // Item 2: 0
  // Item 3: 125
  // GrandTotal = (750+0+125) - 100 + 104 = 875 - 100 + 104 = 879
  assert.equal(version2.grandTotal, 879);

  // Assert active quote header updated
  const updatedQuote = await quoteService.getQuote(tenantId, quote.id);
  assert.equal(updatedQuote.currentVersion, 2);
  assert.equal(updatedQuote.grandTotal, 879);
  assert.equal(updatedQuote.depositTotal, 250);

  // Assert version 1 historical snapshot remains intact
  const allVersions = await quoteService.getVersions(tenantId, quote.id);
  assert.equal(allVersions.length, 2);
  assert.equal(allVersions[0].versionNumber, 1);
  assert.equal(allVersions[0].grandTotal, 995);
  assert.equal(allVersions[1].versionNumber, 2);
  assert.equal(allVersions[1].grandTotal, 879);
  console.log("  ✓ [PASS] 6. Quote v2 created; v1 snapshot immutably preserved.");

  // -------------------------------------------------------------------------
  // Test 7: Quote Dispatch & Public Customer Review Pipeline
  // -------------------------------------------------------------------------
  console.log("▶ Test 7: Quote Dispatch & Public Customer Review Pipeline...");
  const sentQuote = await quoteService.sendQuote(
    tenantId,
    quote.id,
    "sarah.connor@example.com",
    "+15552345678",
    "sales_agent_1"
  );
  assert.equal(sentQuote.status, "SENT");

  // Verify notification was queued to recipient
  const quoteNotifications = await notifRepo.findMany({ tenantId });
  const quoteEmail = quoteNotifications.items.find(
    (n) => n.correlationId === quote.id
  );
  assert.ok(quoteEmail, "Dispatch email notification must be queued.");
  assert.ok(quoteEmail.body.includes(quote.publicToken));

  // Customer clicks link and opens quote
  const viewedQuote = await quoteService.recordQuoteViewed(quote.publicToken);
  assert.ok(viewedQuote);
  assert.equal(viewedQuote.status, "VIEWED");
  console.log("  ✓ [PASS] 7. Quote dispatched and viewed status tracked via token.");

  // -------------------------------------------------------------------------
  // Test 8: Quote Acceptance & Expiry Protection
  // -------------------------------------------------------------------------
  console.log("▶ Test 8: Quote Acceptance & Expiry Protection...");
  // Test expired quote cannot be accepted
  const expiredQuoteRes = await quoteService.createQuote(tenantId, {
    currency: "USD",
    validUntil: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
    pickupDate: "2026-12-01T10:00:00Z",
    returnDate: "2026-12-05T10:00:00Z",
    pickupLocation: "Airport",
    returnLocation: "Airport",
    lineItems: [
      { type: "BASE_RATE", description: "Standard Sedan", unitPrice: 50, quantity: 4 },
    ],
  });

  await assert.rejects(
    async () => {
      await quoteService.acceptQuote({ publicToken: expiredQuoteRes.quote.publicToken });
    },
    (err: any) => err instanceof SalesQuoteExpiredError
  );

  // Accept valid quote
  const acceptedQuote = await quoteService.acceptQuote(
    { publicToken: quote.publicToken },
    "sarah_customer"
  );
  assert.equal(acceptedQuote.status, "ACCEPTED");
  console.log("  ✓ [PASS] 8. Expired quotes rejected; valid quote successfully accepted.");

  // -------------------------------------------------------------------------
  // Test 9: Commercial Conversion to Canonical Booking (Sprint 13)
  // -------------------------------------------------------------------------
  console.log("▶ Test 9: Commercial Conversion to Canonical Booking (Sprint 13)...");
  const conversionResult = await quoteService.convertToBooking(
    tenantId,
    quote.id,
    "operations_agent_1"
  );

  assert.ok(conversionResult.bookingId);
  assert.equal(conversionResult.quote.status, "CONVERTED");
  assert.equal(conversionResult.quote.convertedBookingId, conversionResult.bookingId);

  // Converted quote cannot be modified or re-converted
  await assert.rejects(
    async () => {
      await quoteService.createNewVersion(tenantId, quote.id, { lineItems: [] });
    },
    (err: any) => err instanceof SalesQuoteAlreadyConvertedError
  );

  // Verify associated lead is automatically marked CONVERTED / Won
  const linkedLead = await leadService.getLead(tenantId, publicEnquiry.id);
  assert.equal(linkedLead.status, "CONVERTED");
  assert.ok(linkedLead.convertedAt);
  console.log("  ✓ [PASS] 9. Quote converted to canonical Booking and lead marked Won.");

  // -------------------------------------------------------------------------
  // Test 10: CRM Follow-Up Tasks & Reminders
  // -------------------------------------------------------------------------
  console.log("▶ Test 10: CRM Follow-Up Tasks & Reminders...");
  const task = await taskService.createTask({
    tenantId,
    entityType: "LEAD",
    entityId: lead1.id,
    title: "Call James regarding contract signature",
    description: "Follow up on Corporate Account agreement document.",
    dueDate: "2026-09-15T15:00:00Z",
    priority: "HIGH",
    assignedUserId: "usr_rep_42",
  });

  assert.equal(task.status, "PENDING");
  assert.equal(task.priority, "HIGH");

  // Query user tasks
  const userTasks = await taskService.getTasksByUser(tenantId, "usr_rep_42");
  assert.equal(userTasks.length, 1);
  assert.equal(userTasks[0].id, task.id);

  // Reschedule task
  const rescheduled = await taskService.rescheduleTask(
    tenantId,
    task.id,
    "2026-09-16T10:00:00Z"
  );
  assert.equal(rescheduled.dueDate, "2026-09-16T10:00:00Z");

  // Complete task
  const completed = await taskService.completeTask(tenantId, task.id, "usr_rep_42");
  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.completedAt);
  assert.equal(completed.completedBy, "usr_rep_42");
  console.log("  ✓ [PASS] 10. CRM Tasks created, assigned, rescheduled, and completed.");

  // -------------------------------------------------------------------------
  // Test 11: CRM Activity Stream & Timeline Audit
  // -------------------------------------------------------------------------
  console.log("▶ Test 11: CRM Activity Stream & Timeline Audit...");
  const leadTimeline = await activityService.getTimeline(tenantId, "LEAD", lead1.id);
  assert.ok(leadTimeline.length >= 3, "Should have creation, status changes, and conversion activities.");

  const quoteTimeline = await activityService.getTimeline(tenantId, "SALES_QUOTE", quote.id);
  assert.ok(quoteTimeline.length >= 4, "Should record creation, revision, dispatch, view, acceptance, and conversion.");

  const conversionActivity = quoteTimeline.find((a) => a.type === "CONVERSION");
  assert.ok(conversionActivity);
  console.log("  ✓ [PASS] 11. Polymorphic activity audit stream verified for Lead and Quote.");

  // -------------------------------------------------------------------------
  // Test 12: Pipeline Stages & Kanban Summary Metrics
  // -------------------------------------------------------------------------
  console.log("▶ Test 12: Pipeline Stages & Kanban Summary Metrics...");
  const pipelineSummary = await pipelineService.getPipelineSummary(tenantId);
  assert.ok(pipelineSummary.length >= 6);

  const wonStageSummary = pipelineSummary.find((s) => s.stage.code === "WON");
  assert.ok(wonStageSummary);
  assert.ok(wonStageSummary.leadCount >= 1);
  console.log("  ✓ [PASS] 12. Pipeline stages and Kanban aggregation calculated.");

  // -------------------------------------------------------------------------
  // Test 13: Strict Multi-Tenant Data Isolation
  // -------------------------------------------------------------------------
  console.log("▶ Test 13: Strict Multi-Tenant Data Isolation...");
  // Tenant B cannot access Tenant A's lead
  await assert.rejects(
    async () => {
      await leadService.getLead(tenantBId, lead1.id);
    },
    (err: any) => err instanceof LeadNotFoundError
  );

  // Tenant B cannot access Tenant A's quote
  await assert.rejects(
    async () => {
      await quoteService.getQuote(tenantBId, quote.id);
    },
    (err: any) => err instanceof SalesQuoteNotFoundError
  );

  // Tenant B cannot list Tenant A's leads
  const tenantBLeads = await leadService.listLeads({ tenantId: tenantBId });
  assert.equal(tenantBLeads.items.length, 0);

  // Tenant B cannot list Tenant A's quotes
  const tenantBQuotes = await quoteService.listQuotes({ tenantId: tenantBId });
  assert.equal(tenantBQuotes.items.length, 0);
  console.log("  ✓ [PASS] 13. Multi-tenant boundary isolation enforced.");

  console.log("======================================================================");
  console.log("🎉 ALL SPRINT 33 LEADS, SALES QUOTES & CRM TESTS PASSED! (13/13)");
  console.log("======================================================================");
}

runSprint33TestSuite().catch((err) => {
  console.error("Sprint 33 test suite failed:", err);
  process.exit(1);
});
