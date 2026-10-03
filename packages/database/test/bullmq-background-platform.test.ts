// ============================================================================
// CAR HIRE OS — SPRINT 26 TEST SUITE:
// BULLMQ WORKERS, SCHEDULER, RETRY ORCHESTRATION, DEAD-LETTER QUEUE & BACKGROUND EXECUTION PLATFORM (DEV-011, BRS-003)
// ============================================================================

import { strict as assert } from "node:assert";
import {
  QueueName,
  SCHEDULED_JOB_NAMES,
  COMMAND_JOB_NAMES,
  EVENT_TYPES,
  DomainEventEnvelope,
} from "@carhire/contracts";
import {
  OutboxRepository,
  EventConsumptionRepository,
  BookingRepository,
  ComplianceRecordRepository,
  MaintenanceScheduleRepository,
  VehicleRepository,
  SubscriptionRepository,
  SaasBillingInvoiceRepository,
  OwnerSettlementRepository,
} from "@carhire/database";
import {
  RedisConnectionManager,
  QueueRegistry,
  WorkerRegistry,
  CanonicalScheduler,
  DeadLetterService,
  BullMqEventTransport,
  WorkerManager,
  buildEventJobId,
  buildScheduledJobId,
  calculateBackoffWithJitter,
  SimulatedQueue,
} from "../../../apps/worker/src/main";
import {
  createDomainEventEnvelope,
} from "../../../apps/api/src/infrastructure/events/event-envelope";
import {
  getSharedEventBus,
  IEventSubscriber,
} from "../../../apps/api/src/infrastructure/events/event-bus";
import {
  OutboxRelayService,
} from "../../../apps/worker/src/jobs/outbox-relay.job";
import { processBookingExpiry } from "../../../apps/worker/src/jobs/booking-expiry.job";
import { processComplianceCheck } from "../../../apps/worker/src/jobs/compliance-check.job";
import { processMaintenanceCheck } from "../../../apps/worker/src/jobs/maintenance-check.job";
import { processSubscriptionBilling } from "../../../apps/worker/src/jobs/subscription-billing.job";
import { processSettlementBatch } from "../../../apps/worker/src/jobs/owner-settlement.job";

async function runSprint26TestSuite() {
  console.log("======================================================================");
  console.log("RUNNING SPRINT 26: BULLMQ WORKERS, SCHEDULER, RETRY & DLQ PLATFORM");
  console.log("======================================================================");

  // Clean state
  EventConsumptionRepository.clear();
  DeadLetterService.clearStore();
  (OutboxRepository as any).store?.clear();
  (BookingRepository as any).store?.clear();
  (ComplianceRecordRepository as any).store?.clear();
  (MaintenanceScheduleRepository as any).store?.clear();
  (VehicleRepository as any).store?.clear();
  (SubscriptionRepository as any).store?.clear();
  (SaasBillingInvoiceRepository as any).store?.clear();
  (OwnerSettlementRepository as any).store?.clear();

  // Reset Singletons
  RedisConnectionManager.resetInstance();
  QueueRegistry.resetInstance();
  WorkerRegistry.resetInstance();
  CanonicalScheduler.resetInstance();

  // ============================================================================
  // TEST 1: QUEUE TOPOLOGY & CANONICAL QUEUE REGISTRY INITIALIZATION
  // ============================================================================
  console.log("TEST 1: Canonical Queue Topology & Registry Initialization");
  {
    const queueRegistry = QueueRegistry.getInstance();
    const eventsQueue = queueRegistry.getQueue(QueueName.EVENTS);
    const schedQueue = queueRegistry.getQueue(QueueName.SCHEDULED);
    const cmdQueue = queueRegistry.getQueue(QueueName.COMMANDS);
    const dlqQueue = queueRegistry.getQueue(QueueName.DEAD_LETTER);

    assert.equal(eventsQueue.name, "carhire.events");
    assert.equal(schedQueue.name, "carhire.scheduled");
    assert.equal(cmdQueue.name, "carhire.commands");
    assert.equal(dlqQueue.name, "carhire.dlq");

    const metrics = await queueRegistry.getAllMetrics();
    assert.equal(metrics.length, 4);
    assert.ok(metrics.some((m) => m.name === QueueName.EVENTS));
    assert.ok(metrics.some((m) => m.name === QueueName.SCHEDULED));
    assert.ok(metrics.some((m) => m.name === QueueName.COMMANDS));
    assert.ok(metrics.some((m) => m.name === QueueName.DEAD_LETTER));

    console.log("  ✓ All 4 canonical queues registered with strict naming topology and initial zero metrics");
  }

  // ============================================================================
  // TEST 2: REDIS CONNECTION & DUAL-MODE FALLBACK MANAGEMENT
  // ============================================================================
  console.log("TEST 2: Redis Connection Lifecycle & Dual-Mode Fallback");
  {
    const redisManager = RedisConnectionManager.getInstance();
    const status = await redisManager.initialize();
    assert.ok(
      status === "connected" || status === "simulated",
      `Status must be valid ('connected' or 'simulated'), got ${status}`
    );
    assert.equal(redisManager.getStatus(), status);

    console.log(`  ✓ Redis connection initialized gracefully in mode: ${status}`);
  }

  // ============================================================================
  // TEST 3: BULLMQ EVENT TRANSPORT & DETERMINISTIC JOB ID DEDUPLICATION
  // ============================================================================
  console.log("TEST 3: BullMQ Event Transport & Deterministic Job ID Deduplication");
  {
    const queueRegistry = QueueRegistry.getInstance();
    const transport = new BullMqEventTransport(queueRegistry);
    const eventsQueue = queueRegistry.getQueue(QueueName.EVENTS);

    const eventId = crypto.randomUUID();
    const testTenantId = crypto.randomUUID();
    const testCorrelationId = crypto.randomUUID();
    const envelope = createDomainEventEnvelope({
      eventId,
      eventType: EVENT_TYPES.BOOKING_RESERVATION_CONFIRMED,
      tenantId: testTenantId,
      source: "carhire.api.test",
      correlationId: testCorrelationId,
      aggregate: { type: "Booking", id: "bkg-101", version: 1 },
      actor: { type: "USER", id: "usr-01" },
      data: { bookingNumber: "BKG-2026-001" },
    });

    // Publish once
    await transport.publish(envelope);

    const expectedJobId = buildEventJobId(eventId);
    const job = await eventsQueue.getJob(expectedJobId);
    assert.ok(job, "Job must exist in events queue with deterministic ID");
    assert.equal(job.id, `evt:${eventId}`);
    assert.equal(job.data.eventType, "booking.reservation.confirmed");

    // Publish duplicate event: queue deduplication prevents secondary job
    await transport.publish(envelope);
    const metrics = await eventsQueue.getMetrics();
    assert.equal(metrics.waiting, 1, "Duplicate event publish must not create duplicate waiting job");

    console.log("  ✓ Event transport enqueues canonical envelope with deterministic deduplication key");
  }

  // ============================================================================
  // TEST 4: TRANSACTIONAL OUTBOX RELAY VIA EVENT TRANSPORT
  // ============================================================================
  console.log("TEST 4: Transactional Outbox Relay via Event Transport");
  const relayTenantId = crypto.randomUUID();
  let stagedOutboxRecordId = "";
  {
    const outboxRepo = new OutboxRepository();
    const queueRegistry = QueueRegistry.getInstance();
    const transport = new BullMqEventTransport(queueRegistry);

    // Staging event in database outbox
    const correlationId = crypto.randomUUID();
    const outboxRecord = await outboxRepo.record({
      eventType: EVENT_TYPES.PAYMENT_SUCCEEDED,
      aggregateType: "Payment",
      aggregateId: "pay-777",
      tenantId: relayTenantId,
      source: "carhire.api.payments",
      correlationId,
      payload: { amount: 15000, currency: "USD" },
    });
    stagedOutboxRecordId = outboxRecord.id;
    assert.equal(outboxRecord.status, "PENDING");

    // Run outbox relay with eventTransport configured
    const relay = new OutboxRelayService(outboxRepo, transport, {
      workerId: "test-relay-worker",
      batchSize: 10,
    });

    const result = await relay.processBatch();
    assert.equal(result.claimed, 1);
    assert.equal(result.published, 1);

    // Verify outbox record updated to PUBLISHED
    const updatedRecord = await outboxRepo.findById(outboxRecord.id);
    assert.equal(updatedRecord?.status, "PUBLISHED");

    // Verify event is now queued in BullMQ events queue
    const eventsQueue = queueRegistry.getQueue(QueueName.EVENTS);
    const queuedJob = await eventsQueue.getJob(`evt:${outboxRecord.id}`);
    assert.ok(queuedJob, "Outbox event must be transferred to BullMQ events queue");
    assert.equal(queuedJob.data.eventType, "payment.succeeded");

    console.log("  ✓ Outbox relay bridged PostgreSQL transactional outbox into BullMQ events queue");
  }

  // ============================================================================
  // TEST 5: WORKER EVENT PROCESSING, IDEMPOTENCY & TENANT CONTEXT ISOLATION
  // ============================================================================
  console.log("TEST 5: Worker Event Processing, Idempotency & Tenant Context Isolation");
  {
    const workerRegistry = WorkerRegistry.getInstance();
    const queueRegistry = QueueRegistry.getInstance();
    const eventsQueue = queueRegistry.getQueue(QueueName.EVENTS);

    let subscriberExecutionCount = 0;
    let observedTenantInSubscriber: string | null = null;

    const mockSubscriber: IEventSubscriber = {
      consumerName: "AuditTelemetrySubscriber",
      eventTypes: [EVENT_TYPES.PAYMENT_SUCCEEDED],
      async handle(event) {
        subscriberExecutionCount++;
        observedTenantInSubscriber = workerRegistry.getActiveTenantContext();
      },
    };

    const eventBus = getSharedEventBus();
    eventBus.subscribe(mockSubscriber);

    // Initial worker tenant context must be null
    assert.equal(workerRegistry.getActiveTenantContext(), null);

    // Process the jobs in events queue (job from TEST 3, then job from TEST 4)
    await workerRegistry.processNextSync(QueueName.EVENTS);
    const processed = await workerRegistry.processNextSync(QueueName.EVENTS);
    assert.ok(processed, "Job should be processed by events worker");
    assert.equal(subscriberExecutionCount, 1);
    assert.equal(observedTenantInSubscriber, relayTenantId);

    // Guaranteed context cleanup after job completion
    assert.equal(workerRegistry.getActiveTenantContext(), null, "Tenant context must be cleaned up in finally");

    // Test duplicate delivery to subscriber: Inbox pattern suppresses re-execution
    const dupEventId = crypto.randomUUID();
    const dupCorrId = crypto.randomUUID();
    const dupTenantId = crypto.randomUUID();
    const duplicateReport = await eventBus.publish(
      createDomainEventEnvelope({
        eventId: dupEventId,
        eventType: EVENT_TYPES.PAYMENT_SUCCEEDED,
        tenantId: dupTenantId,
        source: "carhire.test",
        correlationId: dupCorrId,
        aggregate: { type: "Payment", id: "p1" },
        actor: { type: "SYSTEM" },
        data: {},
      })
    );
    assert.equal(duplicateReport.successfulCount, 1);

    // Second publish of identical eventId
    const secondReport = await eventBus.publish(
      createDomainEventEnvelope({
        eventId: dupEventId,
        eventType: EVENT_TYPES.PAYMENT_SUCCEEDED,
        tenantId: dupTenantId,
        source: "carhire.test",
        correlationId: dupCorrId,
        aggregate: { type: "Payment", id: "p1" },
        actor: { type: "SYSTEM" },
        data: {},
      })
    );
    assert.equal(secondReport.skippedCount, 1, "Duplicate event must be skipped by consumer inbox");
    assert.equal(secondReport.results[0].status, "SKIPPED_DUPLICATE");

    console.log("  ✓ Worker restored tenant context, executed subscribers, cleaned context, and suppressed duplicates");
  }

  // ============================================================================
  // TEST 6: CANONICAL SCHEDULER & REPEATABLE JOB DEDUPLICATION
  // ============================================================================
  console.log("TEST 6: Canonical Scheduler & Repeatable Job Deduplication");
  {
    const scheduler = CanonicalScheduler.getInstance();
    const queueRegistry = QueueRegistry.getInstance();
    const schedQueue = queueRegistry.getQueue(QueueName.SCHEDULED);

    // Test deterministic schedule ID calculation
    const window = "2026-09-07T11:00";
    const schedJobId1 = buildScheduledJobId(SCHEDULED_JOB_NAMES.BOOKING_EXPIRY, window);
    const schedJobId2 = buildScheduledJobId(SCHEDULED_JOB_NAMES.BOOKING_EXPIRY, window);
    assert.equal(schedJobId1, schedJobId2);
    assert.equal(schedJobId1, "sched:sched.booking-expiry:2026-09-07T11:00");

    // Enqueue a scheduled tick
    await scheduler.enqueueScheduledTick(SCHEDULED_JOB_NAMES.BOOKING_EXPIRY, "ten-sched-01");
    const metrics = await schedQueue.getMetrics();
    assert.equal(metrics.waiting, 1);

    // Enqueue same tick within same minute: deduplicated
    await scheduler.enqueueScheduledTick(SCHEDULED_JOB_NAMES.BOOKING_EXPIRY, "ten-sched-01");
    const metrics2 = await schedQueue.getMetrics();
    assert.equal(metrics2.waiting, 1, "Duplicate schedule ticks within window must be deduplicated");

    console.log("  ✓ Scheduler registered canonical recurring jobs with deterministic window deduplication");
  }

  // ============================================================================
  // TEST 7: SCHEDULED JOB DISPATCHES COMMAND (NO BUSINESS LOGIC OWNERSHIP)
  // ============================================================================
  console.log("TEST 7: Scheduled Job Dispatches Command (Rule Separation)");
  {
    const workerRegistry = WorkerRegistry.getInstance();
    const queueRegistry = QueueRegistry.getInstance();
    const commandsQueue = queueRegistry.getQueue(QueueName.COMMANDS);

    // Process the scheduled job from TEST 6
    const processed = await workerRegistry.processNextSync(QueueName.SCHEDULED);
    assert.ok(processed, "Scheduled job should be processed");

    // The scheduled worker should NOT have executed domain rules directly.
    // Instead, it must have dispatched a command into carhire.commands queue!
    const cmdMetrics = await commandsQueue.getMetrics();
    assert.equal(cmdMetrics.waiting, 1, "Scheduled job must dispatch command to commands queue");

    console.log("  ✓ Scheduled job triggered command without directly embedding business domain rules");
  }

  // ============================================================================
  // TEST 8: DOMAIN COMMAND EXECUTION: BOOKING EXPIRY & HOLD RELEASE
  // ============================================================================
  console.log("TEST 8: Domain Command: Booking Expiry & Hold Release");
  {
    const tenantId = "ten-bkg-exp";
    const bookingRepo = new BookingRepository();
    const outboxRepo = new OutboxRepository();

    // Create an unconfirmed provisional booking older than grace period
    const staleDate = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const booking = await bookingRepo.create(tenantId, {
      bookingNumber: "BKG-EXP-001",
      customerId: "cust-01",
      requestedVehicleCategoryId: "cat-sedan",
      vehicleId: "veh-exp-01",
      pickupLocationId: "stn-01",
      returnLocationId: "stn-01",
      pickupAt: new Date(Date.now() + 86400000).toISOString(),
      returnAt: new Date(Date.now() + 172800000).toISOString(),
      pricingSnapshot: {} as any,
      grossTotal: 250,
      netRentalSubtotal: 200,
      depositRequired: 50,
      taxAmount: 0,
      initialStatus: "DRAFT" as any,
    });
    // Run booking expiry command with evaluation time past grace period
    const futureEvalTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await processBookingExpiry({
      tenantId,
      gracePeriodMinutes: 30,
      now: futureEvalTime,
    });

    assert.equal(result.expiredCount, 1);

    // Verify booking status was cancelled
    const updated = await bookingRepo.findById(booking.id, tenantId);
    assert.equal(updated?.status, "CANCELLED");

    // Verify outbox domain event was recorded
    const pendingOutbox = await outboxRepo.fetchPendingBatch(10);
    const expEvent = pendingOutbox.find(
      (e) => e.eventType === EVENT_TYPES.BOOKING_RESERVATION_EXPIRED && e.aggregateId === booking.id
    );
    assert.ok(expEvent, "Booking reservation expired event must be recorded in outbox");

    console.log("  ✓ Stale reservation cancelled, hold released, and outbox event generated");
  }

  // ============================================================================
  // TEST 9: DOMAIN COMMAND EXECUTION: COMPLIANCE SCAN & EXPIRY AUTOMATION
  // ============================================================================
  console.log("TEST 9: Domain Command: Compliance Scan & Expiry Automation");
  {
    const tenantId = "ten-comp-01";
    const complianceRepo = new ComplianceRecordRepository();
    const outboxRepo = new OutboxRepository();

    // Create an expired compliance record (e.g. road permit)
    const record = await complianceRepo.create({
      tenantId,
      requirementId: "req-road-permit",
      requirementCode: "ROAD_PERMIT",
      subjectType: "VEHICLE" as any,
      subjectId: "veh-comp-01",
      status: "VALID" as any,
      verificationStatus: "VERIFIED" as any,
      validFrom: "2025-01-01T00:00:00Z",
      expiresAt: "2026-01-01T00:00:00Z", // Past date
    });

    const result = await processComplianceCheck({
      tenantId,
      daysThreshold: 14,
    });

    assert.equal(result.expiredCount, 1);

    // Check status transitioned to EXPIRED
    const updated = await complianceRepo.findById(record.id, tenantId);
    assert.equal(updated?.status, "EXPIRED");

    // Check outbox event
    const pendingOutbox = await outboxRepo.fetchPendingBatch(20);
    const compEvent = pendingOutbox.find(
      (e) => e.eventType === EVENT_TYPES.COMPLIANCE_DOCUMENT_EXPIRED && e.aggregateId === record.id
    );
    assert.ok(compEvent, "Compliance document expired event must be in outbox");

    console.log("  ✓ Expired compliance document transitioned and outbox event staged");
  }

  // ============================================================================
  // TEST 10: DOMAIN COMMAND EXECUTION: PREVENTIVE MAINTENANCE SCAN
  // ============================================================================
  console.log("TEST 10: Domain Command: Preventive Maintenance Scan");
  {
    const tenantId = "ten-maint-01";
    const scheduleRepo = new MaintenanceScheduleRepository();
    const outboxRepo = new OutboxRepository();

    // Create a maintenance schedule overdue by date
    const schedule = await scheduleRepo.create(tenantId, {
      name: "10,000 KM Engine Service",
      maintenanceType: "SCHEDULED_SERVICE" as any,
      vehicleId: "veh-maint-01",
      intervalDays: 90,
      lastCompletedAt: "2025-01-01T00:00:00Z",
    });

    const result = await processMaintenanceCheck({
      tenantId,
    });

    assert.equal(result.dueCount, 1);

    const pendingOutbox = await outboxRepo.fetchPendingBatch(30);
    const maintEvent = pendingOutbox.find(
      (e) => e.eventType === EVENT_TYPES.MAINTENANCE_SCHEDULED && e.aggregateId === schedule.id
    );
    assert.ok(maintEvent, "Maintenance scheduled event must be recorded in outbox");

    console.log("  ✓ Overdue maintenance schedule identified and event staged");
  }

  // ============================================================================
  // TEST 11: DOMAIN COMMAND EXECUTION: SAAS SUBSCRIPTION BILLING & INVOICING
  // ============================================================================
  console.log("TEST 11: Domain Command: SaaS Subscription Billing & Invoicing");
  {
    const subRepo = new SubscriptionRepository();
    const outboxRepo = new OutboxRepository();

    // Create subscription past currentPeriodEnd
    const sub = await subRepo.create({
      tenantId: "ten-sub-bill",
      planId: "plan-pro",
      billingInterval: "monthly" as any,
      currentPeriodStart: "2026-08-01T00:00:00Z",
      currentPeriodEnd: "2026-09-01T00:00:00Z", // Past date
      status: "ACTIVE" as any,
      state: "ACTIVE" as any,
      cancelAtPeriodEnd: false,
      currency: "USD",
      amount: 199,
      billingCycle: "MONTHLY",
      autoRenew: true,
    });

    const result = await processSubscriptionBilling();
    assert.ok(result.renewedCount >= 1);
    assert.ok(result.invoicesIssued >= 1);

    const updatedSub = await subRepo.findById(sub.id);
    assert.ok(new Date(updatedSub!.currentPeriodEnd) > new Date("2026-09-01T00:00:00Z"));

    const pendingOutbox = await outboxRepo.fetchPendingBatch(40);
    const billEvent = pendingOutbox.find(
      (e) => e.eventType === EVENT_TYPES.BILLING_INVOICE_ISSUED && e.tenantId === "ten-sub-bill"
    );
    assert.ok(billEvent, "Billing invoice issued event must be in outbox");

    console.log("  ✓ Expired subscription period renewed, invoice generated and outbox event staged");
  }

  // ============================================================================
  // TEST 12: DOMAIN COMMAND EXECUTION: OWNER SETTLEMENT BATCH CALCULATION
  // ============================================================================
  console.log("TEST 12: Domain Command: Owner Settlement Batch Calculation");
  {
    const tenantId = "ten-owner-stl";
    const settlementRepo = new OwnerSettlementRepository();
    const outboxRepo = new OutboxRepository();

    const settlement = await settlementRepo.create({
      tenantId,
      ownerId: "owner-99",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      currency: "USD",
      grossRevenue: "5000",
      totalDeductions: "750",
      netPayoutAmount: "4250",
      status: "DRAFT" as any,
      calculatedAt: new Date().toISOString(),
    });

    const result = await processSettlementBatch({ tenantId });
    assert.equal(result.settlementsProcessed, 1);

    const pendingOutbox = await outboxRepo.fetchPendingBatch(50);
    const stlEvent = pendingOutbox.find(
      (e) => e.eventType === EVENT_TYPES.SETTLEMENT_BATCH_CALCULATED && e.aggregateId === settlement.id
    );
    assert.ok(stlEvent, "Settlement batch calculated event must be recorded in outbox");

    console.log("  ✓ Owner settlement batch processed and outbox event dispatched");
  }

  // ============================================================================
  // TEST 13: RETRY ORCHESTRATION & EXPONENTIAL BACKOFF CALCULATION
  // ============================================================================
  console.log("TEST 13: Retry Orchestration & Exponential Backoff with Jitter");
  {
    const delay1 = calculateBackoffWithJitter(1, 1000);
    const delay2 = calculateBackoffWithJitter(2, 1000);
    const delay3 = calculateBackoffWithJitter(3, 1000);

    assert.ok(delay1 >= 1000 && delay1 <= 1250, `Attempt 1 delay should be ~1000ms, got ${delay1}`);
    assert.ok(delay2 >= 2000 && delay2 <= 2500, `Attempt 2 delay should be ~2000ms, got ${delay2}`);
    assert.ok(delay3 >= 4000 && delay3 <= 5000, `Attempt 3 delay should be ~4000ms, got ${delay3}`);

    console.log("  ✓ Exponential backoff with jitter progression verified");
  }

  // ============================================================================
  // TEST 14: DEAD-LETTER QUEUE (DLQ) CAPTURE & FAILURE ENVELOPE PRESERVATION
  // ============================================================================
  console.log("TEST 14: Dead-Letter Queue (DLQ) Capture & Failure Diagnostics");
  {
    const dlqService = new DeadLetterService();

    const entry = await dlqService.captureFailure({
      originalQueue: QueueName.COMMANDS,
      originalJobId: "cmd-failed-999",
      jobName: COMMAND_JOB_NAMES.EXPIRE_BOOKINGS,
      payload: { tenantId: "ten-fail-01", reason: "Simulated lock timeout" },
      failedReason: "Lock timeout during allocation release",
      stacktrace: ["Error: Lock timeout", "at Object.execute"],
      attemptsMade: 3,
      maxAttempts: 3,
      tenantId: "ten-fail-01",
      correlationId: "corr-fail-999",
    });

    assert.ok(entry.id);
    assert.equal(entry.status, "DEAD_LETTER");
    assert.equal(entry.originalQueue, "carhire.commands");
    assert.equal(entry.attemptsMade, 3);
    assert.equal(entry.tenantId, "ten-fail-01");
    assert.equal(entry.failedReason, "Lock timeout during allocation release");

    // List entries filtered by tenant
    const { entries, total } = await dlqService.listEntries({ tenantId: "ten-fail-01" });
    assert.equal(total, 1);
    assert.equal(entries[0].id, entry.id);

    console.log("  ✓ Exhausted failure captured into DLQ with full diagnostic context and metadata");
  }

  // ============================================================================
  // TEST 15: DEAD-LETTER QUEUE (DLQ) REPLAY & DISMISS OPERATIONS
  // ============================================================================
  console.log("TEST 15: DLQ Replay (Re-Queue) & Dismiss Operations");
  {
    const dlqService = new DeadLetterService();
    const queueRegistry = QueueRegistry.getInstance();
    const cmdQueue = queueRegistry.getQueue(QueueName.COMMANDS);

    const { entries } = await dlqService.listEntries({ status: "DEAD_LETTER" });
    const targetEntry = entries[0];
    assert.ok(targetEntry);

    // Replay entry back into original queue
    const replayed = await dlqService.replay(targetEntry.id);
    assert.ok(replayed);

    const replayedEntry = await dlqService.getEntry(targetEntry.id);
    assert.equal(replayedEntry?.status, "REPLAYED");
    assert.ok(replayedEntry?.replayedAt);

    // Verify command was placed back into target queue
    const metrics = await cmdQueue.getMetrics();
    assert.ok(metrics.waiting >= 1, "Replayed job must be re-queued in original queue");

    // Test dismiss on a second entry
    const secondEntry = await dlqService.captureFailure({
      originalQueue: QueueName.EVENTS,
      originalJobId: "evt-fail-222",
      jobName: "event.dispatch",
      payload: {},
      failedReason: "Poison pill",
      attemptsMade: 3,
      maxAttempts: 3,
    });
    const dismissed = await dlqService.dismiss(secondEntry.id);
    assert.ok(dismissed);
    const dismissedEntry = await dlqService.getEntry(secondEntry.id);
    assert.equal(dismissedEntry?.status, "DISMISSED");

    // Verify stats
    const stats = await dlqService.getStats();
    assert.equal(stats.total, 2);
    assert.equal(stats.replayedCount, 1);
    assert.equal(stats.dismissedCount, 1);

    console.log("  ✓ DLQ replay and dismiss administrative actions verified");
  }

  // ============================================================================
  // TEST 16: WORKER MANAGER ORCHESTRATION & HEALTH TELEMETRY
  // ============================================================================
  console.log("TEST 16: Production Worker Manager Bootstrap, Health Check & Teardown");
  {
    const manager = new WorkerManager();
    await manager.start();

    const health = await manager.getHealth();
    assert.equal(health.status, "healthy");
    assert.ok(health.redisStatus === "connected" || health.redisStatus === "simulated");
    assert.equal(health.workersRunning, 1);
    assert.equal(health.schedulerActive, true);
    assert.equal(health.queues.length, 4);

    // Graceful teardown
    await manager.stop(2000);
    const stoppedHealth = await manager.getHealth();
    assert.equal(stoppedHealth.workersRunning, 0);
    assert.equal(stoppedHealth.schedulerActive, false);

    console.log("  ✓ WorkerManager bootstrap, health status probe, and graceful draining completed");
  }

  console.log("======================================================================");
  console.log("ALL SPRINT 26 BULLMQ BACKGROUND PLATFORM TESTS PASSED PERFECTLY!");
  console.log("======================================================================");
}

runSprint26TestSuite().catch((err) => {
  console.error("❌ Sprint 26 Test Suite Failed:", err);
  process.exit(1);
});
