// ============================================================================
// CAR HIRE OS — EVENT BUS & IDEMPOTENT DISPATCHER (DEV-010, BRS-002)
// In-process asynchronous event bus with idempotent consumer execution & DLQ support
// ============================================================================

import { DomainEventEnvelope } from "@carhire/contracts";
import { IEventConsumptionRepository, EventConsumptionRepository } from "@carhire/database";

export interface IEventSubscriber<T = any> {
  readonly consumerName: string;
  readonly eventTypes: readonly string[];
  handle(event: DomainEventEnvelope<T>): Promise<void>;
}

export interface DispatchResult {
  subscriberName: string;
  status: "EXECUTED" | "SKIPPED_DUPLICATE" | "FAILED";
  error?: string;
  durationMs: number;
}

export interface PublishReport {
  eventId: string;
  eventType: string;
  dispatchedAt: string;
  totalSubscribersMatched: number;
  successfulCount: number;
  skippedCount: number;
  failedCount: number;
  results: DispatchResult[];
}

export interface IEventBus {
  subscribe<T = any>(subscriber: IEventSubscriber<T>): void;
  unsubscribe(consumerName: string): void;
  publish<T = any>(event: DomainEventEnvelope<T>): Promise<PublishReport>;
  getSubscribers(): IEventSubscriber[];
  clear(): void;
}

export class EventBus implements IEventBus {
  private subscribers: Map<string, IEventSubscriber> = new Map();
  private consumptionRepo: IEventConsumptionRepository;

  constructor(consumptionRepo?: IEventConsumptionRepository) {
    this.consumptionRepo = consumptionRepo || new EventConsumptionRepository();
  }

  public subscribe<T = any>(subscriber: IEventSubscriber<T>): void {
    if (!subscriber.consumerName) {
      throw new Error("Subscriber must provide a non-empty consumerName");
    }
    this.subscribers.set(subscriber.consumerName, subscriber);
  }

  public unsubscribe(consumerName: string): void {
    this.subscribers.delete(consumerName);
  }

  public getSubscribers(): IEventSubscriber[] {
    return Array.from(this.subscribers.values());
  }

  public clear(): void {
    this.subscribers.clear();
  }

  /**
   * Matches an event type against subscriber patterns (exact, wildcards like "rental.*", or "*").
   */
  private matchesPattern(pattern: string, eventType: string): boolean {
    if (pattern === "*" || pattern === eventType) {
      return true;
    }
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + ".");
    }
    return false;
  }

  /**
   * Dispatches a domain event to all matching subscribers idempotently.
   * Duplicate deliveries are safely detected and skipped without re-executing business logic.
   */
  public async publish<T = any>(event: DomainEventEnvelope<T>): Promise<PublishReport> {
    const matchingSubscribers: IEventSubscriber[] = [];

    for (const subscriber of this.subscribers.values()) {
      const isMatch = subscriber.eventTypes.some((pattern) =>
        this.matchesPattern(pattern, event.eventType)
      );
      if (isMatch) {
        matchingSubscribers.push(subscriber);
      }
    }

    const report: PublishReport = {
      eventId: event.eventId,
      eventType: event.eventType,
      dispatchedAt: new Date().toISOString(),
      totalSubscribersMatched: matchingSubscribers.length,
      successfulCount: 0,
      skippedCount: 0,
      failedCount: 0,
      results: [],
    };

    for (const subscriber of matchingSubscribers) {
      const startTime = Date.now();
      const consumerName = subscriber.consumerName;

      // 1. Check & Acquire Consumer Idempotency Lock
      const canProcess = await this.consumptionRepo.startProcessing(
        consumerName,
        event.eventId,
        event.eventType,
        event.tenantId || undefined
      );

      if (!canProcess) {
        // Already processed or actively in flight
        report.skippedCount += 1;
        report.results.push({
          subscriberName: consumerName,
          status: "SKIPPED_DUPLICATE",
          durationMs: Date.now() - startTime,
        });
        continue;
      }

      // 2. Execute Subscriber Handler
      try {
        await subscriber.handle(event);

        // 3. Record Successful Execution
        await this.consumptionRepo.recordSuccess(
          consumerName,
          event.eventId,
          event.eventType,
          event.tenantId || undefined,
          { correlationId: event.correlationId, source: event.source }
        );

        report.successfulCount += 1;
        report.results.push({
          subscriberName: consumerName,
          status: "EXECUTED",
          durationMs: Date.now() - startTime,
        });
      } catch (err: any) {
        const errorMessage = err?.message || String(err);

        // 4. Record Failure for Consumer
        await this.consumptionRepo.recordFailure(
          consumerName,
          event.eventId,
          errorMessage,
          event.eventType,
          event.tenantId || undefined
        );

        report.failedCount += 1;
        report.results.push({
          subscriberName: consumerName,
          status: "FAILED",
          error: errorMessage,
          durationMs: Date.now() - startTime,
        });
      }
    }

    return report;
  }
}

// Global default singleton event bus for shared domain communication
let sharedEventBus: EventBus | null = null;

export function getSharedEventBus(): EventBus {
  if (!sharedEventBus) {
    sharedEventBus = new EventBus();
  }
  return sharedEventBus;
}

export function resetSharedEventBus(): void {
  if (sharedEventBus) {
    sharedEventBus.clear();
  }
  sharedEventBus = null;
}
