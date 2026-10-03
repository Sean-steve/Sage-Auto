// ============================================================================
// CAR HIRE OS — TRANSACTIONAL OUTBOX RELAY JOB & WORKER (DEV-010, BRS-002)
// Asynchronous polling, concurrency-safe claiming, at-least-once dispatch, and DLQ handling
// ============================================================================

import {
  IOutboxRepository,
  OutboxRepository,
  OutboxRecord,
} from "@carhire/database";
import {
  DomainEventEnvelope,
  IEventTransport,
  CommandJobPayload,
} from "@carhire/contracts";
import {
  deserializeDomainEvent,
  createDomainEventEnvelope,
  validateDomainEventEnvelope,
} from "../../../api/src/infrastructure/events/event-envelope";
import {
  IEventBus,
  getSharedEventBus,
} from "../../../api/src/infrastructure/events/event-bus";

export interface OutboxRelayConfig {
  batchSize?: number;
  workerId?: string;
  lockTimeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  eventTransport?: IEventTransport;
}

export interface OutboxRelayResult {
  claimed: number;
  published: number;
  failed: number;
  deadLettered: number;
  durationMs: number;
  workerId: string;
}

export class OutboxRelayService {
  private readonly outboxRepo: IOutboxRepository;
  private readonly eventBus?: IEventBus;
  private readonly eventTransport?: IEventTransport;
  private readonly workerId: string;
  private readonly maxAttempts: number;
  private readonly lockTimeoutMs: number;

  constructor(
    outboxRepo?: IOutboxRepository,
    eventBusOrTransport?: IEventBus | IEventTransport,
    config: OutboxRelayConfig = {}
  ) {
    this.outboxRepo = outboxRepo || new OutboxRepository();
    this.workerId = config.workerId || `relay-worker-${crypto.randomUUID().slice(0, 8)}`;
    this.maxAttempts = config.maxAttempts || 5;
    this.lockTimeoutMs = config.lockTimeoutMs || 30000;

    if (config.eventTransport) {
      this.eventTransport = config.eventTransport;
    } else if (eventBusOrTransport && "publishBatch" in eventBusOrTransport) {
      this.eventTransport = eventBusOrTransport as IEventTransport;
    } else if (eventBusOrTransport && "subscribe" in eventBusOrTransport) {
      this.eventBus = eventBusOrTransport as IEventBus;
    } else {
      this.eventBus = getSharedEventBus();
    }
  }

  /**
   * Converts a database OutboxRecord into a canonical DomainEventEnvelope.
   */
  public recordToEnvelope(record: OutboxRecord): DomainEventEnvelope {
    const actorType = (record.actorType || "SYSTEM") as any;
    const isUuid = (val?: string | null) =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    const correlationId = isUuid(record.correlationId)
      ? record.correlationId!
      : isUuid(record.id)
      ? record.id
      : crypto.randomUUID();

    const tenantId = isUuid(record.tenantId) ? record.tenantId : null;

    return createDomainEventEnvelope({
      eventId: isUuid(record.id) ? record.id : crypto.randomUUID(),
      eventType: record.eventType,
      eventVersion: Number(record.eventVersion || 1),
      occurredAt: record.occurredAt,
      tenantId,
      source: record.source || "carhire.api",
      correlationId,
      causationId: isUuid(record.causationId) ? record.causationId : null,
      aggregate: {
        type: record.aggregateType,
        id: record.aggregateId,
        version: record.aggregateVersion || 1,
      },
      actor: {
        type: actorType,
        id: record.actorId,
        supportActorId: record.supportActorId,
      },
      data: record.payload,
      metadata: record.metadata,
    });
  }

  /**
   * Runs a single polling cycle: claims pending records, dispatches through the event bus,
   * marks published on success, and handles retries / dead-letter queues.
   */
  public async processBatch(limit = 50): Promise<OutboxRelayResult> {
    const startTime = Date.now();
    const result: OutboxRelayResult = {
      claimed: 0,
      published: 0,
      failed: 0,
      deadLettered: 0,
      durationMs: 0,
      workerId: this.workerId,
    };

    // 1. Claim pending/retriable events with concurrency lock
    const claimedRecords = await this.outboxRepo.claimBatch(
      this.workerId,
      limit,
      this.lockTimeoutMs
    );

    result.claimed = claimedRecords.length;
    if (claimedRecords.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // 2. Process each claimed record
    for (const record of claimedRecords) {
      try {
        const envelope = this.recordToEnvelope(record);

        // Validate envelope structure before dispatch
        const validation = validateDomainEventEnvelope(envelope);
        if (!validation.isValid) {
          throw new Error(`Invalid event envelope: ${validation.errors?.join("; ")}`);
        }

        // Dispatch via EventTransport (BullMQ) or in-memory EventBus
        if (this.eventTransport) {
          await this.eventTransport.publish(envelope);
        } else if (this.eventBus) {
          const report = await this.eventBus.publish(envelope);
          if (report.failedCount > 0) {
            const firstError = report.results.find((r) => r.status === "FAILED")?.error || "Subscriber execution error";
            throw new Error(`Subscriber failure: ${firstError}`);
          }
        }

        // 3. Mark record as published
        await this.outboxRepo.markPublished(record.id);
        result.published += 1;
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        result.failed += 1;

        // Will increment attemptCount and mark FAILED or DEAD_LETTER
        const isDeadLetterNext = record.attemptCount + 1 >= this.maxAttempts;
        if (isDeadLetterNext) {
          result.deadLettered += 1;
        }

        await this.outboxRepo.markFailed(
          record.id,
          errorMsg,
          undefined,
          this.maxAttempts
        );
      }
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Replays dead letters back into PENDING state for retry after operator triage.
   */
  public async replayDeadLetters(tenantId?: string, limit = 50): Promise<number> {
    const deadLetters = await this.outboxRepo.findDeadLetters(tenantId, limit);
    let replayed = 0;
    for (const dl of deadLetters) {
      const ok = await this.outboxRepo.retryDeadLetter(dl.id);
      if (ok) replayed++;
    }
    return replayed;
  }

  /**
   * Retrieves relay health and backlog statistics.
   */
  public async getHealth(tenantId?: string) {
    return this.outboxRepo.getStats(tenantId);
  }
}

/**
 * Worker entry point function for interval runner
 */
export async function processOutboxRelay(
  config: OutboxRelayConfig & { outboxRepo?: IOutboxRepository; eventBus?: IEventBus } = {}
): Promise<OutboxRelayResult> {
  const relay = new OutboxRelayService(config.outboxRepo, config.eventBus, config);
  const result = await relay.processBatch(config.batchSize || 50);
  if (result.claimed > 0) {
    console.log(
      `[Worker:OutboxRelay] Processed ${result.published}/${result.claimed} events in ${result.durationMs}ms (failed: ${result.failed}, deadLettered: ${result.deadLettered})`
    );
  }
  return result;
}

/**
 * Worker Command Handler invoked by the Background Execution Platform.
 */
export async function handleProcessOutboxCommand(
  command: CommandJobPayload<{ batchSize?: number }>
): Promise<OutboxRelayResult> {
  return processOutboxRelay({
    batchSize: command.data?.batchSize || 50,
  });
}
