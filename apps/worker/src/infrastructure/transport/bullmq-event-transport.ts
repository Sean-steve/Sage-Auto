// ============================================================================
// CAR HIRE OS — BULLMQ EVENT TRANSPORT (DEV-011, BRS-003)
// Bridges domain events and outbox into BullMQ queue with deterministic deduplication
// ============================================================================

import {
  DomainEventEnvelope,
  IEventTransport,
  QueueName,
} from "@carhire/contracts";
import { QueueRegistry, ICanonicalQueue } from "../queues/queue-registry";
import { buildEventJobId } from "../queues/queue-tokens";

export class BullMqEventTransport implements IEventTransport {
  private queueRegistry: QueueRegistry;
  private eventsQueue: ICanonicalQueue<DomainEventEnvelope>;

  constructor(queueRegistry?: QueueRegistry) {
    this.queueRegistry = queueRegistry || QueueRegistry.getInstance();
    this.eventsQueue = this.queueRegistry.getQueue<DomainEventEnvelope>(QueueName.EVENTS);
  }

  /**
   * Publishes a single canonical domain event into the BullMQ events queue.
   * Deterministic job ID guarantees deduplication at the queue broker layer.
   */
  public async publish<T = any>(envelope: DomainEventEnvelope<T>): Promise<void> {
    if (!envelope || !envelope.eventId) {
      throw new Error("Cannot publish invalid event envelope: missing eventId");
    }

    const jobId = buildEventJobId(envelope.eventId);

    await this.eventsQueue.add("event.dispatch", envelope, {
      jobId,
      // Pass tenant and tracing hints in options if supported
    });
  }

  /**
   * Publishes a batch of domain event envelopes.
   */
  public async publishBatch<T = any>(envelopes: DomainEventEnvelope<T>[]): Promise<void> {
    if (!envelopes || envelopes.length === 0) return;

    for (const envelope of envelopes) {
      await this.publish(envelope);
    }
  }
}
