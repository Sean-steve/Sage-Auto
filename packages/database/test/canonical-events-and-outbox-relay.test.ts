// ============================================================================
// CAR HIRE OS — SPRINT 25 TEST SUITE:
// CANONICAL EVENT SCHEMA, TRANSACTIONAL OUTBOX & EVENT-DRIVEN RELAY (DEV-010, BRS-002)
// ============================================================================

import { strict as assert } from "node:assert";
import {
  EVENT_TYPES,
  DomainEventEnvelope,
} from "@carhire/contracts";
import {
  OutboxRepository,
  EventConsumptionRepository,
} from "@carhire/database";
import {
  createDomainEventEnvelope,
  validateDomainEventEnvelope,
  freezeEventEnvelope,
  serializeDomainEvent,
  deserializeDomainEvent,
} from "../../../apps/api/src/infrastructure/events/event-envelope";
import {
  EventBus,
  IEventSubscriber,
} from "../../../apps/api/src/infrastructure/events/event-bus";
import {
  OutboxRelayService,
} from "../../../apps/worker/src/jobs/outbox-relay.job";
import {
  GeneralLedgerEventSubscriber,
  FleetLifecycleEventSubscriber,
  MaintenanceInspectionSubscriber,
  InvoicePaymentAllocationSubscriber,
} from "../../../apps/api/src/infrastructure/events/subscribers/domain-subscribers";

async function runSprint25TestSuite() {
  console.log("----------------------------------------------------------------------");
  console.log("RUNNING SPRINT 25: CANONICAL EVENT SCHEMA & TRANSACTIONAL OUTBOX SUITE");
  console.log("----------------------------------------------------------------------");

  // Clean state
  EventConsumptionRepository.clear();
  const outboxRepo = new OutboxRepository();
  // Clear in-memory outbox store
  (OutboxRepository as any).store?.clear();

  // ============================================================================
  // TEST 1: CANONICAL EVENT ENVELOPE CREATION & DISTRIBUTED TRACING METADATA
  // ============================================================================
  console.log("TEST 1: Canonical Event Envelope Creation & Distributed Tracing Metadata");
  {
    const tenantId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const causationId = crypto.randomUUID();

    const envelope = createDomainEventEnvelope({
      eventType: EVENT_TYPES.BOOKING_RESERVATION_CONFIRMED,
      tenantId,
      source: "carhire.api.bookings",
      correlationId,
      causationId,
      aggregate: {
        type: "Booking",
        id: "bkg-101",
        version: 2,
      },
      actor: {
        type: "USER",
        id: "usr-456",
        supportActorId: "agent-789",
      },
      data: {
        bookingId: "bkg-101",
        bookingNumber: "BKG-2026-0001",
        vehicleId: "veh-001",
        depositStatus: "PAID",
      },
      metadata: {
        clientIp: "192.168.1.1",
        channel: "WEB_PORTAL",
      },
    });

    assert.ok(envelope.eventId, "Event ID must be generated");
    assert.equal(envelope.eventType, "booking.reservation.confirmed");
    assert.equal(envelope.eventVersion, 1);
    assert.ok(Date.parse(envelope.occurredAt), "occurredAt must be a valid ISO-8601 UTC timestamp");
    assert.equal(envelope.tenantId, tenantId);
    assert.equal(envelope.source, "carhire.api.bookings");
    assert.equal(envelope.correlationId, correlationId);
    assert.equal(envelope.causationId, causationId);
    assert.equal(envelope.aggregate.type, "Booking");
    assert.equal(envelope.aggregate.id, "bkg-101");
    assert.equal(envelope.aggregate.version, 2);
    assert.equal(envelope.actor.type, "USER");
    assert.equal(envelope.actor.id, "usr-456");
    assert.equal(envelope.actor.supportActorId, "agent-789");
    assert.equal(envelope.data.bookingNumber, "BKG-2026-0001");

    console.log("  ✓ Canonical envelope created with explicit timestamps, aggregate and tracing metadata");
  }

  // ============================================================================
  // TEST 2: STRICT IMMUTABILITY ENFORCEMENT & ZOD VALIDATION
  // ============================================================================
  console.log("TEST 2: Strict Immutability Enforcement & Schema Validation");
  {
    const envelope = createDomainEventEnvelope({
      eventType: EVENT_TYPES.PAYMENT_SUCCEEDED,
      aggregate: { type: "Payment", id: "pay-500" },
      data: { paymentId: "pay-500", amount: 12000, currency: "KES" },
    });

    // Verify deep freeze immutability
    assert.throws(() => {
      (envelope as any).eventType = "tampered.event";
    }, "Modifying frozen envelope top-level property must throw in strict mode");

    assert.throws(() => {
      (envelope.aggregate as any).type = "TamperedAggregate";
    }, "Modifying frozen aggregate metadata must throw");

    assert.throws(() => {
      (envelope.data as any).amount = 999999;
    }, "Modifying frozen event payload must throw");

    // Test Schema Validation
    const validationResult = validateDomainEventEnvelope(envelope);
    assert.equal(validationResult.isValid, true, "Valid envelope must pass validation");

    // Invalid envelope test
    const invalidEnvelope = {
      eventId: "not-a-uuid",
      eventType: "x", // too short
      occurredAt: "invalid-date",
      aggregate: {}, // missing type and id
    };
    const invalidValidation = validateDomainEventEnvelope(invalidEnvelope);
    assert.equal(invalidValidation.isValid, false, "Invalid envelope must fail validation");
    assert.ok(invalidValidation.errors && invalidValidation.errors.length > 0);

    // Test Serialization & Deserialization
    const serialized = serializeDomainEvent(envelope);
    const deserialized = deserializeDomainEvent(serialized);
    assert.equal(deserialized.eventId, envelope.eventId);
    assert.equal(deserialized.eventType, envelope.eventType);
    assert.equal((deserialized.data as any).amount, 12000);

    console.log("  ✓ Deep immutability, serialization round-trip, and Zod validation verified");
  }

  // ============================================================================
  // TEST 3: TRANSACTIONAL OUTBOX STAGING
  // ============================================================================
  console.log("TEST 3: Transactional Outbox Staging (Status = PENDING, attemptCount = 0)");
  {
    const event = createDomainEventEnvelope({
      eventType: EVENT_TYPES.RENTAL_DISPATCHED,
      tenantId: crypto.randomUUID(),
      aggregate: { type: "Rental", id: "rnt-201", version: 1 },
      actor: { type: "USER", id: "staff-1" },
      data: {
        rentalId: "rnt-201",
        rentalNumber: "RNT-001",
        vehicleId: "veh-001",
        checkoutOdometer: 15400,
      },
    });

    const outboxRecord = await outboxRepo.save(event);
    assert.equal(outboxRecord.id, event.eventId);
    assert.equal(outboxRecord.status, "PENDING");
    assert.equal(outboxRecord.attemptCount, 0);
    assert.equal(outboxRecord.eventType, EVENT_TYPES.RENTAL_DISPATCHED);
    assert.equal(outboxRecord.aggregateType, "Rental");
    assert.equal(outboxRecord.aggregateId, "rnt-201");
    assert.equal(outboxRecord.payload.checkoutOdometer, 15400);

    const pending = await outboxRepo.fetchPendingBatch(10);
    assert.ok(pending.some((p) => p.id === outboxRecord.id));

    console.log("  ✓ Event atomically recorded to transactional outbox in PENDING state");
  }

  // ============================================================================
  // TEST 4: CONCURRENCY-SAFE BATCH CLAIMING & LOCK TIMEOUT RECOVERY
  // ============================================================================
  console.log("TEST 4: Concurrency-Safe Batch Claiming & Lock Timeout Recovery");
  {
    // Clear repo
    (OutboxRepository as any).store?.clear();

    // Stage 3 events
    for (let i = 1; i <= 3; i++) {
      await outboxRepo.publish({
        eventType: EVENT_TYPES.BOOKING_RESERVATION_CREATED,
        aggregateType: "Booking",
        aggregateId: `bkg-${i}`,
        payload: { bookingId: `bkg-${i}`, totalAmount: 5000 * i },
      });
    }

    // Worker 1 claims batch
    const worker1Id = "worker-node-alpha";
    const batch1 = await outboxRepo.claimBatch(worker1Id, 2, 30000);
    assert.equal(batch1.length, 2, "Worker 1 should claim 2 events");
    assert.equal(batch1[0].status, "CLAIMED");
    assert.equal(batch1[0].claimedBy, worker1Id);
    assert.ok(batch1[0].claimedAt);

    // Worker 2 attempts to claim batch concurrently
    const worker2Id = "worker-node-beta";
    const batch2 = await outboxRepo.claimBatch(worker2Id, 10, 30000);
    assert.equal(batch2.length, 1, "Worker 2 should only receive the remaining unclaimed event");
    assert.equal(batch2[0].claimedBy, worker2Id);

    // Worker 3 attempts to claim while all are locked
    const worker3Id = "worker-node-gamma";
    const batch3 = await outboxRepo.claimBatch(worker3Id, 10, 30000);
    assert.equal(batch3.length, 0, "Zero events available when all are claimed/locked");

    // Simulate lock expiry on Worker 1's record (e.g. worker crashed)
    const crashedRecord = batch1[0];
    crashedRecord.claimedAt = new Date(Date.now() - 40000).toISOString(); // 40s ago (lockTimeout is 30s)

    // Worker 3 re-attempts: should successfully reclaim the abandoned record
    const batchReclaimed = await outboxRepo.claimBatch(worker3Id, 10, 30000);
    assert.equal(batchReclaimed.length, 1, "Worker 3 safely reclaims timed-out abandoned lock");
    assert.equal(batchReclaimed[0].id, crashedRecord.id);
    assert.equal(batchReclaimed[0].claimedBy, worker3Id);

    console.log("  ✓ Concurrency locks and lock timeout reclamation validated");
  }

  // ============================================================================
  // TEST 5: OUTBOX RELAY DISPATCH & MARK PUBLISHED
  // ============================================================================
  console.log("TEST 5: Outbox Relay Dispatch & Mark Published");
  {
    (OutboxRepository as any).store?.clear();
    EventConsumptionRepository.clear();

    const eventBus = new EventBus();
    let receivedEvents: DomainEventEnvelope[] = [];

    const dummySubscriber: IEventSubscriber = {
      consumerName: "AuditService.UniversalLogger",
      eventTypes: ["*"],
      handle: async (env) => {
        receivedEvents.push(env);
      },
    };
    eventBus.subscribe(dummySubscriber);

    // Stage 2 events
    await outboxRepo.publish({
      eventType: EVENT_TYPES.CUSTOMER_CREATED,
      aggregateType: "Customer",
      aggregateId: "cust-1",
      payload: { name: "Alice Nairobi", email: "alice@example.com" },
    });
    await outboxRepo.publish({
      eventType: EVENT_TYPES.CUSTOMER_UPDATED,
      aggregateType: "Customer",
      aggregateId: "cust-1",
      payload: { name: "Alice Mwangi", email: "alice@example.com" },
    });

    const relay = new OutboxRelayService(outboxRepo, eventBus, { workerId: "relay-test-1" });
    const result = await relay.processBatch(10);

    assert.equal(result.claimed, 2);
    assert.equal(result.published, 2);
    assert.equal(result.failed, 0);
    assert.equal(receivedEvents.length, 2);

    const stats = await outboxRepo.getStats();
    assert.equal(stats.published, 2);
    assert.equal(stats.pending, 0);
    assert.equal(stats.claimed, 0);

    console.log("  ✓ Outbox relay claimed, validated, dispatched, and marked records PUBLISHED");
  }

  // ============================================================================
  // TEST 6: SUBSCRIBER IDEMPOTENCY & DUPLICATE EVENT SUPPRESSION (INBOX PATTERN)
  // ============================================================================
  console.log("TEST 6: Subscriber Idempotency & Duplicate Event Suppression (Inbox Pattern)");
  {
    EventConsumptionRepository.clear();
    const consumptionRepo = new EventConsumptionRepository();
    const eventBus = new EventBus(consumptionRepo);

    let handlerInvocationCount = 0;

    const billingSubscriber: IEventSubscriber = {
      consumerName: "Billing.InvoiceFinalizer",
      eventTypes: [EVENT_TYPES.RENTAL_COMPLETED],
      handle: async (_event) => {
        handlerInvocationCount++;
      },
    };
    eventBus.subscribe(billingSubscriber);

    const event = createDomainEventEnvelope({
      eventType: EVENT_TYPES.RENTAL_COMPLETED,
      aggregate: { type: "Rental", id: "rnt-888" },
      data: { rentalId: "rnt-888", depositRefunded: 5000, completedAt: new Date().toISOString() },
    });

    // First delivery
    const report1 = await eventBus.publish(event);
    assert.equal(report1.successfulCount, 1);
    assert.equal(report1.skippedCount, 0);
    assert.equal(handlerInvocationCount, 1, "Handler executed on first delivery");

    // Second delivery (e.g. network retry / duplicate outbox relay)
    const report2 = await eventBus.publish(event);
    assert.equal(report2.successfulCount, 0);
    assert.equal(report2.skippedCount, 1, "Duplicate delivery identified and skipped");
    assert.equal(report2.results[0].status, "SKIPPED_DUPLICATE");
    assert.equal(handlerInvocationCount, 1, "Handler NOT invoked again on duplicate event");

    // Third delivery
    const report3 = await eventBus.publish(event);
    assert.equal(report3.skippedCount, 1);
    assert.equal(handlerInvocationCount, 1);

    // Verify consumption repo status
    const hasProcessed = await consumptionRepo.hasProcessed("Billing.InvoiceFinalizer", event.eventId);
    assert.equal(hasProcessed, true);

    console.log("  ✓ At-least-once duplicate delivery safely suppressed without re-executing business logic");
  }

  // ============================================================================
  // TEST 7: EXPONENTIAL BACKOFF RETRY STRATEGY ON SUBSCRIBER FAILURE
  // ============================================================================
  console.log("TEST 7: Exponential Backoff Retry Strategy on Subscriber Failure");
  {
    (OutboxRepository as any).store?.clear();
    EventConsumptionRepository.clear();

    const eventBus = new EventBus();
    let attemptNumber = 0;

    const flakySubscriber: IEventSubscriber = {
      consumerName: "ExternalWebhook.FlakyDispatcher",
      eventTypes: [EVENT_TYPES.PAYMENT_FAILED],
      handle: async () => {
        attemptNumber++;
        throw new Error("Downstream third-party endpoint 503 Gateway Timeout");
      },
    };
    eventBus.subscribe(flakySubscriber);

    // Stage event
    const record = await outboxRepo.publish({
      eventType: EVENT_TYPES.PAYMENT_FAILED,
      aggregateType: "Payment",
      aggregateId: "pay-failed-1",
      payload: { attemptId: "att-1", failureReason: "INSUFFICIENT_FUNDS" },
    });

    const relay = new OutboxRelayService(outboxRepo, eventBus, { workerId: "retry-worker" });

    // 1st relay cycle: fails
    const run1 = await relay.processBatch(10);
    assert.equal(run1.failed, 1);
    assert.equal(run1.published, 0);

    const recordAfter1 = await outboxRepo.findById(record.id);
    assert.equal(recordAfter1?.status, "FAILED");
    assert.equal(recordAfter1?.attemptCount, 1);
    assert.ok(recordAfter1?.lastError?.includes("Downstream third-party endpoint 503"));
    // availableAt must be in the future (backoff)
    assert.ok(new Date(recordAfter1!.availableAt).getTime() > Date.now());

    console.log("  ✓ Failed subscriber execution transitioned record to FAILED with exponential backoff delay");
  }

  // ============================================================================
  // TEST 8: DEAD-LETTER QUEUE (DLQ) THRESHOLD ENFORCEMENT & MANUAL RE-QUEUE
  // ============================================================================
  console.log("TEST 8: Dead-Letter Queue (DLQ) Threshold Enforcement & Manual Re-Queue");
  {
    (OutboxRepository as any).store?.clear();
    EventConsumptionRepository.clear();

    const eventBus = new EventBus();
    const fatalSubscriber: IEventSubscriber = {
      consumerName: "FatalErrorSubscriber",
      eventTypes: ["*"],
      handle: async () => {
        throw new Error("Fatal unrecoverable parsing error");
      },
    };
    eventBus.subscribe(fatalSubscriber);

    // Max attempts set to 3
    const relay = new OutboxRelayService(outboxRepo, eventBus, { maxAttempts: 3 });

    const record = await outboxRepo.publish({
      eventType: EVENT_TYPES.DAMAGE_REPORTED,
      aggregateType: "Damage",
      aggregateId: "dmg-999",
      payload: { severity: "SEVERE", estimatedRepairCost: 50000 },
    });

    // Run 3 cycles (simulating time advances)
    for (let cycle = 1; cycle <= 3; cycle++) {
      // Force availableAt to now so it can be claimed
      const r = await outboxRepo.findById(record.id);
      if (r) {
        r.availableAt = new Date().toISOString();
      }
      await relay.processBatch(10);
    }

    const deadLetterRecord = await outboxRepo.findById(record.id);
    assert.equal(deadLetterRecord?.status, "DEAD_LETTER", "Status must be DEAD_LETTER after exceeding maxAttempts");
    assert.equal(deadLetterRecord?.attemptCount, 3);

    // Confirm DLQ isolation: standard polling batch must NOT pick up DEAD_LETTER
    const pendingBatch = await outboxRepo.claimBatch("new-worker", 10);
    assert.equal(pendingBatch.length, 0, "DLQ records must be excluded from active batch claiming");

    // Query DLQ
    const dlq = await outboxRepo.findDeadLetters();
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0].id, record.id);

    // Operator triage & manual re-queue
    const replayed = await relay.replayDeadLetters();
    assert.equal(replayed, 1);

    const replayedRecord = await outboxRepo.findById(record.id);
    assert.equal(replayedRecord?.status, "PENDING", "Re-queued record returns to PENDING state");
    assert.equal(replayedRecord?.lastError, undefined);

    console.log("  ✓ DLQ threshold isolation and administrative re-queue verified");
  }

  // ============================================================================
  // TEST 9: CROSS-DOMAIN SUBSCRIBER CHOREOGRAPHY (PAYMENT -> LEDGER & INVOICE)
  // ============================================================================
  console.log("TEST 9: Cross-Domain Choreography: Payment Succeeded -> Ledger & Invoicing");
  {
    (OutboxRepository as any).store?.clear();
    EventConsumptionRepository.clear();

    const eventBus = new EventBus();
    const ledgerSub = new GeneralLedgerEventSubscriber();
    const invoiceSub = new InvoicePaymentAllocationSubscriber();

    eventBus.subscribe(ledgerSub);
    eventBus.subscribe(invoiceSub);

    const paymentEvent = createDomainEventEnvelope({
      eventType: EVENT_TYPES.PAYMENT_SUCCEEDED,
      tenantId: crypto.randomUUID(),
      aggregate: { type: "Payment", id: "pay-1001", version: 1 },
      data: {
        paymentId: "pay-1001",
        paymentNumber: "PAY-2026-0001",
        amount: 35000,
        currency: "KES",
        providerReference: "MPESA-QWE123RTY",
        obligationId: "inv-9001",
      },
    });

    const report = await eventBus.publish(paymentEvent);
    assert.equal(report.successfulCount, 2, "Both subscribers should execute successfully");

    // Verify Ledger Subscriber
    assert.equal(ledgerSub.postedJournals.length, 1);
    assert.equal(ledgerSub.postedJournals[0].reference, "JRN-PAY-PAY-2026-0001");
    assert.equal(ledgerSub.postedJournals[0].amount, 35000);

    // Verify Invoice Subscriber
    assert.equal(invoiceSub.allocatedPayments.length, 1);
    assert.equal(invoiceSub.allocatedPayments[0].paymentId, "pay-1001");
    assert.equal(invoiceSub.allocatedPayments[0].obligationId, "inv-9001");
    assert.equal(invoiceSub.allocatedPayments[0].amount, 35000);

    console.log("  ✓ Payment event choreographed across General Ledger and Invoice Allocation subscribers");
  }

  // ============================================================================
  // TEST 10: CROSS-DOMAIN CHOREOGRAPHY: RENTAL RETURNED -> FLEET & MAINTENANCE
  // ============================================================================
  console.log("TEST 10: Cross-Domain Choreography: Rental Return & Inspection Damage");
  {
    (OutboxRepository as any).store?.clear();
    EventConsumptionRepository.clear();

    const eventBus = new EventBus();
    const fleetSub = new FleetLifecycleEventSubscriber();
    const maintenanceSub = new MaintenanceInspectionSubscriber();

    eventBus.subscribe(fleetSub);
    eventBus.subscribe(maintenanceSub);

    // 1. Rental Returned event
    const returnEvent = createDomainEventEnvelope({
      eventType: EVENT_TYPES.RENTAL_RETURNED,
      aggregate: { type: "Rental", id: "rnt-555" },
      data: {
        rentalId: "rnt-555",
        rentalNumber: "RNT-555",
        vehicleId: "veh-404",
        returnOdometer: 67800,
        returnFuelLevel: 75,
        returnedAt: new Date().toISOString(),
      },
    });

    await eventBus.publish(returnEvent);
    assert.equal(fleetSub.vehicleUpdates.length, 1);
    assert.equal(fleetSub.vehicleUpdates[0].vehicleId, "veh-404");
    assert.equal(fleetSub.vehicleUpdates[0].newOdometer, 67800);
    assert.equal(fleetSub.vehicleUpdates[0].status, "PENDING_INSPECTION");

    // 2. Inspection Completed with Damage event
    const inspectionEvent = createDomainEventEnvelope({
      eventType: EVENT_TYPES.INSPECTION_COMPLETED,
      aggregate: { type: "Inspection", id: "insp-777" },
      data: {
        inspectionId: "insp-777",
        rentalId: "rnt-555",
        vehicleId: "veh-404",
        inspectionType: "CHECK_IN",
        inspectorId: "tech-12",
        odometerReading: 67800,
        fuelLevel: 75,
        hasDamage: true,
        damageCount: 2,
      },
    });

    await eventBus.publish(inspectionEvent);
    assert.equal(maintenanceSub.maintenanceWorkOrders.length, 1);
    assert.equal(maintenanceSub.maintenanceWorkOrders[0].vehicleId, "veh-404");
    assert.equal(maintenanceSub.maintenanceWorkOrders[0].priority, "HIGH");

    console.log("  ✓ Rental return and damaged check-in inspection choreographed fleet turnaround and work orders");
  }

  // ============================================================================
  // TEST 11: CANONICAL EVENT CATALOG COVERAGE ACROSS ALL DOMAIN MODULES
  // ============================================================================
  console.log("TEST 11: Canonical Event Catalog Coverage Across All Domains");
  {
    const expectedCatalogKeys = [
      // Fleet
      "FLEET_VEHICLE_CREATED",
      "FLEET_VEHICLE_UPDATED",
      "FLEET_VEHICLE_STATUS_CHANGED",
      "FLEET_VEHICLE_ODOMETER_UPDATED",
      "FLEET_VEHICLE_DECOMMISSIONED",
      // Bookings
      "BOOKING_RESERVATION_CREATED",
      "BOOKING_RESERVATION_CONFIRMED",
      "BOOKING_RESERVATION_CANCELLED",
      "BOOKING_RESERVATION_EXPIRED",
      "BOOKING_RESERVATION_AMENDED",
      // Rentals
      "RENTAL_CONTRACT_GENERATED",
      "RENTAL_CONTRACT_SIGNED",
      "RENTAL_HANDOVER_COMPLETED",
      "RENTAL_DISPATCHED",
      "RENTAL_STARTED",
      "RENTAL_RETURNED",
      "RENTAL_COMPLETED",
      // Inspections & Damage
      "INSPECTION_COMPLETED",
      "DAMAGE_REPORTED",
      "DAMAGE_REPAIRED",
      // Maintenance
      "MAINTENANCE_SCHEDULED",
      "MAINTENANCE_STARTED",
      "MAINTENANCE_COMPLETED",
      // Compliance
      "COMPLIANCE_DOCUMENT_EXPIRED",
      "COMPLIANCE_OVERRIDE_GRANTED",
      // Billing
      "BILLING_INVOICE_ISSUED",
      "BILLING_INVOICE_PAID",
      "BILLING_INVOICE_VOIDED",
      "BILLING_CREDIT_NOTE_ISSUED",
      // Payments
      "PAYMENT_INTENT_CREATED",
      "PAYMENT_ATTEMPTED",
      "PAYMENT_SUCCEEDED",
      "PAYMENT_FAILED",
      "PAYMENT_REFUND_INITIATED",
      "PAYMENT_REFUND_COMPLETED",
      // Ledger
      "LEDGER_JOURNAL_ENTRY_POSTED",
      // Settlements
      "SETTLEMENT_PERIOD_CLOSED",
      "SETTLEMENT_BATCH_CALCULATED",
      "SETTLEMENT_PAYOUT_INITIATED",
      "SETTLEMENT_PAYOUT_COMPLETED",
      // Customers
      "CUSTOMER_CREATED",
      "CUSTOMER_UPDATED",
      "CUSTOMER_BLACKLISTED",
      // Subscriptions & Tenancy
      "SUBSCRIPTION_PLAN_CHANGED",
      "SUBSCRIPTION_RENEWED",
      "SUBSCRIPTION_PAST_DUE",
      "SUBSCRIPTION_CANCELLED",
      "TENANT_PROVISIONED",
      "TENANT_SUSPENDED",
    ];

    for (const key of expectedCatalogKeys) {
      assert.ok(
        (EVENT_TYPES as any)[key],
        `Catalog constant EVENT_TYPES.${key} must be defined and non-empty`
      );
    }

    console.log(`  ✓ All ${expectedCatalogKeys.length} canonical domain event types verified`);
  }

  console.log("======================================================================");
  console.log("ALL SPRINT 25 CANONICAL EVENTS & OUTBOX RELAY TESTS PASSED PERFECTLY!");
  console.log("======================================================================");
}

runSprint25TestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
