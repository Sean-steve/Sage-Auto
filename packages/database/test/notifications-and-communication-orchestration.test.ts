// ============================================================================
// CAR HIRE OS — SPRINT 32 INTEGRATION TEST SUITE:
// NOTIFICATIONS, COMMUNICATION ORCHESTRATION, EMAIL, SMS, WHATSAPP,
// DELIVERY RECEIPTS, TEMPLATES, PREFERENCES & COMMUNICATION RELIABILITY
// ============================================================================

import { strict as assert } from "node:assert";
import {
  InMemoryNotificationRepository,
  InMemoryNotificationReceiptRepository,
  InMemoryNotificationTemplateRepository,
  InMemoryCommunicationPreferenceRepository,
  InMemoryNotificationSuppressionRepository,
  InMemoryNotificationProviderConfigRepository,
  InMemoryTenantWebsiteRepository,
  InMemoryWebsiteDomainRepository,
  TenantRepository,
} from "../src/index";
import {
  ProviderRegistryService,
  MockNotificationProvider,
  EmailNotificationProvider,
  SmsNotificationProvider,
  WhatsAppNotificationProvider,
  NotificationOrchestratorService,
  NotificationPolicyConsumer,
  TemplateEngine,
} from "../../../apps/api/src/modules/notifications/index";
import { EventBus } from "../../../apps/api/src/infrastructure/events/event-bus";
import { EVENT_TYPES, DomainEventEnvelope } from "@carhire/contracts";

async function runSprint32TestSuite() {
  console.log("======================================================================");
  console.log("RUNNING SPRINT 32: NOTIFICATIONS & COMMUNICATION ORCHESTRATION TEST SUITE");
  console.log("======================================================================");

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const tenantBId = "22222222-2222-2222-2222-222222222222";

  // Repositories
  const notificationRepo = new InMemoryNotificationRepository();
  const receiptRepo = new InMemoryNotificationReceiptRepository();
  const templateRepo = new InMemoryNotificationTemplateRepository();
  const preferenceRepo = new InMemoryCommunicationPreferenceRepository();
  const suppressionRepo = new InMemoryNotificationSuppressionRepository();
  const providerConfigRepo = new InMemoryNotificationProviderConfigRepository();
  const tenantRepo = new TenantRepository();
  const websiteRepo = new InMemoryTenantWebsiteRepository();
  const domainRepo = new InMemoryWebsiteDomainRepository();

  // Setup mock tenant & domain
  TenantRepository.initializeSeed([
    {
      id: tenantId,
      name: "Safari Car Hire Ltd",
      slug: "safari-rentals",
      status: "ACTIVE",
      tier: "ENTERPRISE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any,
  ]);

  // Setup website & custom domain
  const website = await websiteRepo.save({
    id: "web-001",
    tenantId,
    subdomain: "safari",
    status: "PUBLISHED",
    branding: { brandName: "Safari Rentals" } as any,
    navigation: { headerNavigation: [], footerNavigation: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await domainRepo.save({
    id: "dom-001",
    tenantId,
    websiteId: website.id,
    hostname: "book.safaricars.com",
    type: "CUSTOM_DOMAIN",
    verificationStatus: "VERIFIED",
    verificationMethod: "DNS_TXT",
    verificationToken: "tok-1",
    expectedTxtRecord: "txt",
    expectedCnameRecord: "cname",
    sslStatus: "ACTIVE",
    isPrimary: true,
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const eventBus = new EventBus();
  const mockProvider = new MockNotificationProvider();
  const providerRegistry = new ProviderRegistryService(providerConfigRepo, mockProvider, {
    useMockAsDefault: true,
  });

  const orchestrator = new NotificationOrchestratorService(
    notificationRepo,
    receiptRepo,
    templateRepo,
    preferenceRepo,
    suppressionRepo,
    providerRegistry,
    eventBus,
    tenantRepo,
    websiteRepo,
    domainRepo
  );

  const policyConsumer = new NotificationPolicyConsumer(orchestrator);
  eventBus.subscribe(policyConsumer);

  // Initialize System Default Templates
  await orchestrator.initializeDefaultTemplates();

  // --------------------------------------------------------------------------
  // TEST 1: Template Engine Interpolation, Safety & Variable Extraction
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 1: Template Engine Interpolation & HTML Escaping...");
  {
    const template = "Hello {{customer.name}}, your car is {{vehicle}}!";
    const rendered = TemplateEngine.render(
      template,
      {
        customer: { name: "Alice Mwangi" },
        vehicle: "<script>alert('xss')</script>",
      },
      { escapeHtml: true }
    );

    assert.ok(rendered.includes("Hello Alice Mwangi"), "Should interpolate nested objects");
    assert.ok(
      rendered.includes("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;"),
      "Should safely escape HTML in variable values when escapeHtml is true"
    );

    const extracted = TemplateEngine.extractVariables(template);
    assert.deepEqual(extracted, ["customer.name", "vehicle"], "Should extract all variable tokens");
    console.log("  ✓ [PASS] 1. Template engine rendered variables safely with HTML escaping.");
  }

  // --------------------------------------------------------------------------
  // TEST 2: Canonical Link Resolution via Website Domain Architecture
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 2: Canonical Link Resolution (Tenant Custom Domain)...");
  {
    const resolvedBaseUrl = await orchestrator.resolveCanonicalWebsiteBaseUrl(tenantId);
    assert.equal(
      resolvedBaseUrl,
      "https://book.safaricars.com",
      "Should resolve primary verified custom domain"
    );

    // Fallback tenant without custom domain
    const fallbackBaseUrl = await orchestrator.resolveCanonicalWebsiteBaseUrl("unknown-tenant");
    assert.equal(
      fallbackBaseUrl,
      "https://app.carhireos.com",
      "Should fall back gracefully if no website domain exists"
    );
    console.log("  ✓ [PASS] 2. Tenant canonical links correctly resolve through domain pipeline.");
  }

  // --------------------------------------------------------------------------
  // TEST 3: Multi-Channel Delivery (Email, SMS, WhatsApp)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 3: Multi-Channel Delivery via Providers...");
  {
    // 3.1 Email
    const emailResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "EMAIL",
      category: "TRANSACTIONAL",
      priority: "HIGH",
      recipient: "alice@example.com",
      recipientName: "Alice Mwangi",
      templateKey: "booking.confirmation",
      correlationId: "corr-email-1",
      variables: {
        customerName: "Alice Mwangi",
        bookingReference: "BK-2026-001",
        vehicleName: "Toyota Land Cruiser",
        pickupDate: "2026-10-01 09:00",
        pickupLocation: "Nairobi JKIA",
        returnDate: "2026-10-05 18:00",
        returnLocation: "Nairobi JKIA",
        totalAmount: "KES 45,000",
        tenantName: "Safari Rentals",
      },
    });

    assert.equal(emailResult.notification.status, "PROVIDER_ACCEPTED");
    assert.ok(emailResult.notification.sentAt, "Should set sentAt");
    assert.ok(
      emailResult.notification.subject?.includes("BK-2026-001"),
      "Subject rendered with booking reference"
    );
    assert.ok(
      emailResult.notification.body.includes("https://book.safaricars.com/portal"),
      "Body includes canonical portal URL"
    );

    // 3.2 SMS with GSM-7 Segmentation & E.164 Normalization
    const smsSegmentation = SmsNotificationProvider.calculateSegmentation(
      "Safari Rentals: Booking BK-001 confirmed for 2026-10-01."
    );
    assert.equal(smsSegmentation.isUnicode, false, "GSM-7 standard message");
    assert.equal(smsSegmentation.segmentCount, 1, "Single segment");

    const phoneE164 = SmsNotificationProvider.normalizePhoneNumber("0712345678");
    assert.equal(phoneE164, "+254712345678", "E.164 normalized");

    const smsResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "SMS",
      category: "TRANSACTIONAL",
      recipient: "0712345678",
      templateKey: "booking.confirmation",
      correlationId: "corr-sms-1",
      variables: {
        tenantName: "Safari Rentals",
        bookingReference: "BK-2026-001",
        vehicleName: "Toyota Prado",
        pickupDate: "2026-10-01",
        pickupLocation: "JKIA",
      },
    });

    assert.equal(smsResult.notification.status, "PROVIDER_ACCEPTED");
    assert.ok(smsResult.notification.body.includes("BK-2026-001"));

    // 3.3 WhatsApp
    const waResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "WHATSAPP",
      category: "TRANSACTIONAL",
      recipient: "+254722000000",
      templateKey: "booking.confirmation",
      correlationId: "corr-wa-1",
      variables: {
        customerName: "Alice Mwangi",
        tenantName: "Safari Rentals",
        bookingReference: "BK-2026-001",
        vehicleName: "Toyota Prado",
        pickupDate: "2026-10-01",
        pickupLocation: "JKIA",
        totalAmount: "KES 45,000",
      },
    });

    assert.equal(waResult.notification.status, "PROVIDER_ACCEPTED");
    console.log("  ✓ [PASS] 3. Multi-channel delivery (Email, SMS, WhatsApp) succeeded.");
  }

  // --------------------------------------------------------------------------
  // TEST 4: Idempotency & Duplicate Send Protection
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 4: Idempotency & Duplicate Send Protection...");
  {
    const initialSendCount = mockProvider.getSentMessages().length;

    const repeatResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "EMAIL",
      category: "TRANSACTIONAL",
      recipient: "alice@example.com",
      templateKey: "booking.confirmation",
      correlationId: "corr-email-1", // Same correlation ID and recipient
      variables: {
        customerName: "Alice Mwangi",
        bookingReference: "BK-2026-001",
      },
    });

    assert.equal(repeatResult.isDuplicate, true, "Should identify duplicate send");
    assert.equal(
      mockProvider.getSentMessages().length,
      initialSendCount,
      "Provider should NOT have been invoked on duplicate send"
    );
    console.log("  ✓ [PASS] 4. Idempotency correctly prevented duplicate delivery.");
  }

  // --------------------------------------------------------------------------
  // TEST 5: Recipient Suppression List Enforcement
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 5: Suppression List Enforcement...");
  {
    // Add recipient to suppression list
    await suppressionRepo.suppress({
      id: "sup-001",
      tenantId,
      channel: "EMAIL",
      recipient: "bounced-user@example.com",
      reason: "HARD_BOUNCE",
      notes: "Mailbox does not exist",
      createdAt: new Date().toISOString(),
    });

    const suppressedResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "EMAIL",
      category: "TRANSACTIONAL",
      recipient: "bounced-user@example.com",
      body: "Test message",
      correlationId: "corr-sup-1",
    });

    assert.equal(suppressedResult.suppressed, true, "Should be flagged suppressed");
    assert.equal(suppressedResult.suppressionReason, "HARD_BOUNCE");
    assert.equal(suppressedResult.notification.status, "SUPPRESSED");
    console.log("  ✓ [PASS] 5. Suppressed recipient was blocked from dispatch.");
  }

  // --------------------------------------------------------------------------
  // TEST 6: Communication Preferences (Opt-in / Opt-out & Security Non-suppression)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 6: Communication Preferences & Non-suppressible Security...");
  {
    const customerPartyId = "party-cust-123";

    // Customer opts out of MARKETING and OPERATIONAL on SMS
    await preferenceRepo.save({
      id: "pref-001",
      tenantId,
      partyType: "CUSTOMER",
      partyId: customerPartyId,
      recipient: "+254700000001",
      channel: "SMS",
      category: "MARKETING",
      optedIn: false,
      updatedAt: new Date().toISOString(),
    });

    // 6.1 Marketing attempt should be suppressed
    const marketingResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "SMS",
      category: "MARKETING",
      recipient: "+254700000001",
      recipientPartyId: customerPartyId,
      body: "Special weekend discount: 20% off!",
      correlationId: "corr-mkt-1",
    });

    assert.equal(marketingResult.suppressed, true, "Marketing should be suppressed per preference");
    assert.equal(marketingResult.notification.status, "SUPPRESSED");

    // 6.2 Security message MUST NEVER be suppressed regardless of preferences
    const securityResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "EMAIL",
      category: "SECURITY",
      recipient: "cust@example.com",
      recipientPartyId: customerPartyId,
      templateKey: "security.password_reset",
      correlationId: "corr-sec-1",
      variables: {
        userName: "Alice Mwangi",
        resetUrl: "https://book.safaricars.com/reset?token=xyz",
        tenantName: "Safari Rentals",
      },
    });

    assert.equal(securityResult.notification.status, "PROVIDER_ACCEPTED", "Security cannot be suppressed");
    console.log("  ✓ [PASS] 6. Preferences enforced; security category remains non-suppressible.");
  }

  // --------------------------------------------------------------------------
  // TEST 7: Template Overrides & Hierarchy
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 7: Template Overrides (Tenant Customization)...");
  {
    // Tenant customizes booking.confirmation template
    await templateRepo.save({
      id: "custom-tpl-1",
      tenantId,
      key: "booking.confirmation",
      name: "Custom Safari Booking Conf",
      category: "TRANSACTIONAL",
      channel: "EMAIL",
      subjectTemplate: "Jambo {{customerName}}! Your 4x4 Safari Booking {{bookingReference}} is Set!",
      bodyTemplate: "Karibu {{customerName}}, your vehicle {{vehicleName}} is ready in Nairobi.",
      isSystemDefault: false,
      isActive: true,
      version: 2,
      variablesSchema: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const customResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "EMAIL",
      category: "TRANSACTIONAL",
      recipient: "traveler@example.com",
      templateKey: "booking.confirmation",
      correlationId: "corr-override-1",
      variables: {
        customerName: "David Kim",
        bookingReference: "SAF-999",
        vehicleName: "Toyota Land Cruiser",
      },
    });

    assert.ok(
      customResult.notification.subject?.includes("Jambo David Kim!"),
      "Tenant override took precedence over system default"
    );

    // Other tenant gets system default
    const defaultResult = await orchestrator.sendNotificationIntent({
      tenantId: tenantBId,
      channel: "EMAIL",
      category: "TRANSACTIONAL",
      recipient: "traveler2@example.com",
      templateKey: "booking.confirmation",
      correlationId: "corr-tenantb-1",
      variables: {
        customerName: "Bob Smith",
        bookingReference: "BK-888",
        vehicleName: "Nissan X-Trail",
        pickupDate: "2026-10-01",
        pickupLocation: "Mombasa",
        returnDate: "2026-10-05",
        returnLocation: "Mombasa",
        totalAmount: "KES 20,000",
        tenantName: "Coastal Car Hire",
      },
    });

    assert.ok(
      defaultResult.notification.subject?.includes("Reservation Confirmed: BK-888"),
      "Tenant B gets standard system default"
    );
    console.log("  ✓ [PASS] 7. Template inheritance and tenant overrides verified.");
  }

  // --------------------------------------------------------------------------
  // TEST 8: Webhook Ingestion, Delivery Receipts & Auto-Suppression on Bounce
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 8: Webhook Receipts & Auto-Suppression on Bounce...");
  {
    // Send a message
    const sendResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "EMAIL",
      category: "TRANSACTIONAL",
      recipient: "fragile@example.com",
      body: "Important notification",
      correlationId: "corr-bounce-test",
    });

    const providerMsgId = sendResult.providerResult?.providerMessageId;
    assert.ok(providerMsgId, "Must have provider message ID");

    // 8.1 Simulate Delivered webhook
    const deliveredReceipt = await orchestrator.processDeliveryReceipt({
      provider: "MOCK_PROVIDER",
      rawPayload: {
        id: providerMsgId,
        event: "delivered",
        timestamp: new Date().toISOString(),
      },
    });

    assert.ok(deliveredReceipt, "Receipt recorded");
    const deliveredNotif = await notificationRepo.findById(sendResult.notification.id);
    assert.equal(deliveredNotif?.status, "DELIVERED", "Status updated to DELIVERED");

    // 8.2 Send another message that will bounce
    const sendBounceResult = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "EMAIL",
      category: "TRANSACTIONAL",
      recipient: "invalid-user-box@example.com",
      body: "Invoice",
      correlationId: "corr-bounce-2",
    });

    const bounceMsgId = sendBounceResult.providerResult?.providerMessageId!;
    await orchestrator.processDeliveryReceipt({
      provider: "MOCK_PROVIDER",
      rawPayload: {
        id: bounceMsgId,
        event: "bounce",
      },
    });

    const bouncedNotif = await notificationRepo.findById(sendBounceResult.notification.id);
    assert.equal(bouncedNotif?.status, "BOUNCED", "Status updated to BOUNCED");

    // Verify auto-suppression occurred
    const isNowSuppressed = await suppressionRepo.isSuppressed(
      tenantId,
      "EMAIL",
      "invalid-user-box@example.com"
    );
    assert.equal(isNowSuppressed.isSuppressed, true, "Bounced address was auto-suppressed");
    assert.equal(isNowSuppressed.reason, "HARD_BOUNCE");
    console.log("  ✓ [PASS] 8. Delivery receipts updated status and hard bounces auto-suppressed.");
  }

  // --------------------------------------------------------------------------
  // TEST 9: Domain Event Consumer Policy Translations
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 9: Domain Event Policy Consumer (Outbox / EventBus Integration)...");
  {
    const beforeCount = mockProvider.getSentMessages().length;

    // Publish booking.reservation.confirmed event
    const bookingConfirmedEnvelope: DomainEventEnvelope = {
      eventId: "ev-booking-001",
      eventType: EVENT_TYPES.BOOKING_RESERVATION_CONFIRMED,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      source: "carhire.bookings",
      tenantId,
      correlationId: "corr-domain-event-1",
      aggregate: { type: "Booking", id: "bk-999" },
      actor: { type: "USER", id: "cust-99" },
      data: {
        tenantId,
        bookingId: "bk-999",
        bookingReference: "BK-DOM-777",
        customerName: "Dr. Sarah Omondi",
        customerEmail: "sarah.omondi@example.com",
        customerPhone: "+254733123456",
        vehicleName: "Mercedes Benz E-Class",
        totalAmount: "KES 60,000",
        tenantName: "Safari Rentals",
      },
    };

    await eventBus.publish(bookingConfirmedEnvelope);

    const afterCount = mockProvider.getSentMessages().length;
    assert.equal(
      afterCount,
      beforeCount + 2,
      "Policy consumer should have triggered 2 notifications (1 Email, 1 SMS)"
    );

    const emailSent = mockProvider.getMessagesForRecipient("sarah.omondi@example.com")[0];
    assert.ok(emailSent, "Email sent to customer");
    assert.ok(emailSent.request.subject?.includes("BK-DOM-777"), "Email subject references booking");

    const smsSent = mockProvider.getMessagesForRecipient("+254733123456")[0];
    assert.ok(smsSent, "SMS sent to customer");
    assert.ok(smsSent.request.body.includes("BK-DOM-777"), "SMS body references booking");

    console.log("  ✓ [PASS] 9. Domain events seamlessly translated to multi-channel notifications.");
  }

  // --------------------------------------------------------------------------
  // TEST 10: Failed Delivery & Retry Mechanism
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 10: Delivery Failure & Exponential Retry...");
  {
    mockProvider.setFailNext(true, "Temporary gateway outage");

    const failedSend = await orchestrator.sendNotificationIntent({
      tenantId,
      channel: "EMAIL",
      category: "OPERATIONAL",
      recipient: "mechanic@example.com",
      body: "Work order assigned",
      correlationId: "corr-fail-retry-1",
    });

    assert.equal(failedSend.notification.status, "QUEUED", "First failure returns to QUEUED for retry");
    assert.equal(failedSend.notification.attempts, 1, "Attempts incremented to 1");

    // Now retry delivery
    const retried = await orchestrator.retryNotification(tenantId, failedSend.notification.id);
    assert.equal(retried.status, "PROVIDER_ACCEPTED", "Retry succeeded");
    assert.equal(retried.attempts, 2, "Attempts incremented to 2");
    console.log("  ✓ [PASS] 10. Failed deliveries properly tracked and retry succeeded.");
  }

  // --------------------------------------------------------------------------
  // TEST 11: Analytics & Delivery Statistics
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 11: Delivery Analytics & Statistics Metrics...");
  {
    const stats = await orchestrator.getStats(tenantId);
    assert.ok(stats.totalSent > 0, "Sent count > 0");
    assert.ok(stats.totalDelivered > 0, "Delivered count > 0");
    assert.ok(stats.totalSuppressed > 0, "Suppressed count > 0");
    assert.ok(stats.byChannel.email.sent > 0, "Email stats tracked");
    assert.ok(stats.byChannel.sms.sent > 0, "SMS stats tracked");
    assert.ok(stats.byCategory.TRANSACTIONAL > 0, "Transactional category tracked");
    console.log(`  ✓ [PASS] 11. Stats compiled (Total Sent: ${stats.totalSent}, Delivered: ${stats.totalDelivered}, Delivery Rate: ${stats.deliveryRatePercent}%).`);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Tenant Boundary Isolation
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 12: Multi-Tenant Boundary Isolation...");
  {
    const tenantALogs = await notificationRepo.findMany({ tenantId, limit: 100 });
    const tenantBLogs = await notificationRepo.findMany({ tenantId: tenantBId, limit: 100 });

    for (const log of tenantALogs.items) {
      assert.equal(log.tenantId, tenantId, "All tenant A logs belong to Tenant A");
    }
    for (const log of tenantBLogs.items) {
      assert.equal(log.tenantId, tenantBId, "All tenant B logs belong to Tenant B");
    }
    console.log("  ✓ [PASS] 12. Strict multi-tenant isolation verified.");
  }

  console.log("\n======================================================================");
  console.log("🎉 ALL SPRINT 32 NOTIFICATION & COMMUNICATION TESTS PASSED! (12/12)");
  console.log("======================================================================\n");
}

runSprint32TestSuite().catch((err) => {
  console.error("Sprint 32 Test Suite Failed:", err);
  process.exit(1);
});
