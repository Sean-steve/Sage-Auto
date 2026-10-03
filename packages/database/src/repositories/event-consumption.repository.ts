import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — EVENT CONSUMPTION / INBOX REPOSITORY (DEV-010, BRS-002)
// Enforces at-least-once subscriber idempotency, consumer tracking, and duplicate rejection
// ============================================================================

import { TransactionContext } from "../transaction-manager";

export type EventConsumptionStatus = "PROCESSING" | "PROCESSED" | "FAILED";

export interface EventConsumptionRecord {
  id: string;
  consumerName: string;
  eventId: string;
  eventType: string;
  tenantId?: string;
  status: EventConsumptionStatus;
  attemptCount: number;
  processedAt?: string;
  lastError?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface IEventConsumptionRepository {
  hasProcessed(consumerName: string, eventId: string, tx?: TransactionContext): Promise<boolean>;
  isProcessing(consumerName: string, eventId: string, tx?: TransactionContext): Promise<boolean>;
  startProcessing(
    consumerName: string,
    eventId: string,
    eventType: string,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<boolean>;
  recordSuccess(
    consumerName: string,
    eventId: string,
    eventType?: string,
    tenantId?: string,
    metadata?: Record<string, unknown>,
    tx?: TransactionContext
  ): Promise<void>;
  recordFailure(
    consumerName: string,
    eventId: string,
    error: string,
    eventType?: string,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<void>;
  getConsumption(
    consumerName: string,
    eventId: string,
    tx?: TransactionContext
  ): Promise<EventConsumptionRecord | null>;
  findByConsumer(
    consumerName: string,
    limit?: number,
    tx?: TransactionContext
  ): Promise<EventConsumptionRecord[]>;
}

export class EventConsumptionRepository implements IEventConsumptionRepository {
  private static store = createRecordStore<string, EventConsumptionRecord>("event-consumption.repository:store");

  public static clear(): void {
    EventConsumptionRepository.store.clear();
  }

  private compositeKey(consumerName: string, eventId: string): string {
    return `${consumerName}::${eventId}`;
  }

  async hasProcessed(consumerName: string, eventId: string, _tx?: TransactionContext): Promise<boolean> {
    const key = this.compositeKey(consumerName, eventId);
    const record = EventConsumptionRepository.store.get(key);
    return record?.status === "PROCESSED";
  }

  async isProcessing(consumerName: string, eventId: string, _tx?: TransactionContext): Promise<boolean> {
    const key = this.compositeKey(consumerName, eventId);
    const record = EventConsumptionRepository.store.get(key);
    return record?.status === "PROCESSING";
  }

  /**
   * Attempts to acquire processing lock for this consumer and event.
   * Returns true if lock was acquired and consumer may proceed; false if already processed or currently processing.
   */
  async startProcessing(
    consumerName: string,
    eventId: string,
    eventType: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<boolean> {
    const key = this.compositeKey(consumerName, eventId);
    const existing = EventConsumptionRepository.store.get(key);

    if (existing) {
      if (existing.status === "PROCESSED") {
        return false; // Already finished successfully
      }
      if (existing.status === "PROCESSING") {
        return false; // Concurrent execution in-flight
      }
      // If FAILED, we allow retry
      existing.status = "PROCESSING";
      existing.attemptCount += 1;
      EventConsumptionRepository.store.set(key, existing);
      return true;
    }

    const now = new Date().toISOString();
    const record: EventConsumptionRecord = {
      id: crypto.randomUUID(),
      consumerName,
      eventId,
      eventType,
      tenantId,
      status: "PROCESSING",
      attemptCount: 1,
      createdAt: now,
    };
    EventConsumptionRepository.store.set(key, record);
    return true;
  }

  async recordSuccess(
    consumerName: string,
    eventId: string,
    eventType = "unknown",
    tenantId?: string,
    metadata?: Record<string, unknown>,
    _tx?: TransactionContext
  ): Promise<void> {
    const key = this.compositeKey(consumerName, eventId);
    const existing = EventConsumptionRepository.store.get(key);
    const now = new Date().toISOString();

    if (existing) {
      existing.status = "PROCESSED";
      existing.processedAt = now;
      existing.metadata = metadata || existing.metadata;
      EventConsumptionRepository.store.set(key, existing);
    } else {
      const record: EventConsumptionRecord = {
        id: crypto.randomUUID(),
        consumerName,
        eventId,
        eventType,
        tenantId,
        status: "PROCESSED",
        attemptCount: 1,
        processedAt: now,
        metadata,
        createdAt: now,
      };
      EventConsumptionRepository.store.set(key, record);
    }
  }

  async recordFailure(
    consumerName: string,
    eventId: string,
    error: string,
    eventType = "unknown",
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<void> {
    const key = this.compositeKey(consumerName, eventId);
    const existing = EventConsumptionRepository.store.get(key);
    const now = new Date().toISOString();

    if (existing) {
      existing.status = "FAILED";
      existing.lastError = error;
      EventConsumptionRepository.store.set(key, existing);
    } else {
      const record: EventConsumptionRecord = {
        id: crypto.randomUUID(),
        consumerName,
        eventId,
        eventType,
        tenantId,
        status: "FAILED",
        attemptCount: 1,
        lastError: error,
        createdAt: now,
      };
      EventConsumptionRepository.store.set(key, record);
    }
  }

  async getConsumption(
    consumerName: string,
    eventId: string,
    _tx?: TransactionContext
  ): Promise<EventConsumptionRecord | null> {
    const key = this.compositeKey(consumerName, eventId);
    return EventConsumptionRepository.store.get(key) || null;
  }

  async findByConsumer(
    consumerName: string,
    limit = 100,
    _tx?: TransactionContext
  ): Promise<EventConsumptionRecord[]> {
    return Array.from(EventConsumptionRepository.store.values())
      .filter((r) => r.consumerName === consumerName)
      .slice(-limit);
  }
}
