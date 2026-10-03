import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — TRANSACTIONAL OUTBOX REPOSITORY (DEV-010, BRS-002)
// Durable transactional event staging, claiming, dispatching, and retry management
// ============================================================================

import { TransactionContext } from "../transaction-manager";

export type OutboxStatus = "PENDING" | "CLAIMED" | "PUBLISHED" | "PROCESSED" | "FAILED" | "DEAD_LETTER";

export interface OutboxRecord {
  id: string;
  eventType: string;
  eventVersion: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: number;
  tenantId?: string;
  source: string;
  actorType?: string;
  actorId?: string;
  supportActorId?: string;
  correlationId?: string;
  causationId?: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  status: OutboxStatus;
  attemptCount: number;
  availableAt: string;
  claimedAt?: string;
  claimedBy?: string;
  publishedAt?: string;
  processedAt?: string;
  lastError?: string;
  lastErrorCode?: string;
  createdAt: string;
}

export type CreateOutboxRecordInput = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  aggregateVersion?: number;
  tenantId?: string;
  source?: string;
  actorType?: string;
  actorId?: string;
  supportActorId?: string;
  correlationId?: string;
  causationId?: string;
  eventVersion?: string | number;
  metadata?: Record<string, unknown>;
  status?: OutboxStatus;
  occurredAt?: string;
  availableAt?: string;
  lastError?: string;
  lastErrorCode?: string;
  id?: string;
};

export interface IOutboxRepository {
  create(record: CreateOutboxRecordInput, tx?: TransactionContext): Promise<OutboxRecord>;
  save?(envelope: any, tx?: TransactionContext): Promise<OutboxRecord>;
  publish(event: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; source?: string; correlationId?: string; causationId?: string; actorId?: string }, tx?: TransactionContext): Promise<OutboxRecord>;
  record(event: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; source?: string; correlationId?: string; causationId?: string; actorId?: string }, tx?: TransactionContext): Promise<OutboxRecord>;
  enqueue(event: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; source?: string; correlationId?: string; causationId?: string; actorId?: string }, tx?: TransactionContext): Promise<OutboxRecord>;
  fetchPendingBatch(limit?: number, tx?: TransactionContext): Promise<OutboxRecord[]>;
  findPending(limit?: number, tx?: TransactionContext): Promise<OutboxRecord[]>;
  claimBatch(workerId: string, limit?: number, lockTimeoutMs?: number, tx?: TransactionContext): Promise<OutboxRecord[]>;
  markPublished(id: string, publishedAt?: string, tx?: TransactionContext): Promise<void>;
  markProcessed(id: string, tx?: TransactionContext): Promise<void>;
  markFailed(id: string, error: string, retryDelayMs?: number, maxAttempts?: number, tx?: TransactionContext): Promise<void>;
  findById(id: string, tx?: TransactionContext): Promise<OutboxRecord | null>;
  findDeadLetters(tenantId?: string, limit?: number, tx?: TransactionContext): Promise<OutboxRecord[]>;
  retryDeadLetter(id: string, tx?: TransactionContext): Promise<boolean>;
  getStats(tenantId?: string): Promise<{ pending: number; claimed: number; published: number; failed: number; deadLetter: number; total: number }>;
}

export class OutboxRepository implements IOutboxRepository {
  private static store = createRecordStore<string, OutboxRecord>("outbox.repository:store");

  public static clear(): void {
    OutboxRepository.store.clear();
  }

  async findPending(limit = 100, tx?: TransactionContext): Promise<OutboxRecord[]> {
    return this.fetchPendingBatch(limit, tx);
  }

  async findById(id: string, _tx?: TransactionContext): Promise<OutboxRecord | null> {
    return OutboxRepository.store.get(id) || null;
  }

  async create(data: CreateOutboxRecordInput, _tx?: TransactionContext): Promise<OutboxRecord> {
    const now = new Date().toISOString();
    const id = data.id || crypto.randomUUID();
    const record: OutboxRecord = {
      id,
      eventType: data.eventType,
      eventVersion: String(data.eventVersion || "1"),
      aggregateType: data.aggregateType,
      aggregateId: data.aggregateId,
      aggregateVersion: data.aggregateVersion ?? 1,
      tenantId: data.tenantId,
      source: data.source || "carhire.api",
      actorType: data.actorType || "SYSTEM",
      actorId: data.actorId,
      supportActorId: data.supportActorId,
      correlationId: data.correlationId || crypto.randomUUID(),
      causationId: data.causationId,
      payload: data.payload,
      metadata: data.metadata,
      occurredAt: data.occurredAt || now,
      status: data.status || "PENDING",
      attemptCount: 0,
      availableAt: data.availableAt || now,
      createdAt: now,
      lastError: data.lastError,
      lastErrorCode: data.lastErrorCode,
    };

    OutboxRepository.store.set(record.id, record);
    return record;
  }

  async save(envelope: any, tx?: TransactionContext): Promise<OutboxRecord> {
    return this.create({
      id: envelope.eventId,
      eventType: envelope.eventType,
      eventVersion: envelope.eventVersion,
      aggregateType: envelope.aggregate?.type || "unknown",
      aggregateId: envelope.aggregate?.id || "unknown",
      aggregateVersion: envelope.aggregate?.version,
      tenantId: envelope.tenantId,
      source: envelope.source,
      actorType: envelope.actor?.type,
      actorId: envelope.actor?.id,
      supportActorId: envelope.actor?.supportActorId,
      correlationId: envelope.correlationId,
      causationId: envelope.causationId,
      payload: envelope.data || {},
      metadata: envelope.metadata,
      occurredAt: envelope.occurredAt,
      status: "PENDING",
    }, tx);
  }

  async record(event: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; source?: string; correlationId?: string; causationId?: string; actorId?: string }, tx?: TransactionContext): Promise<OutboxRecord> {
    return this.publish(event, tx);
  }

  async enqueue(event: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; source?: string; correlationId?: string; causationId?: string; actorId?: string }, tx?: TransactionContext): Promise<OutboxRecord> {
    return this.publish(event, tx);
  }

  async publish(event: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; tenantId?: string; source?: string; correlationId?: string; causationId?: string; actorId?: string }, tx?: TransactionContext): Promise<OutboxRecord> {
    const now = new Date().toISOString();
    return this.create({
      eventType: event.eventType,
      eventVersion: "1",
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      tenantId: event.tenantId,
      source: event.source || "carhire.api",
      correlationId: event.correlationId,
      causationId: event.causationId,
      actorId: event.actorId,
      payload: event.payload,
      occurredAt: now,
      availableAt: now,
      status: "PENDING",
    }, tx);
  }

  async fetchPendingBatch(limit = 50, _tx?: TransactionContext): Promise<OutboxRecord[]> {
    const now = new Date().toISOString();
    return Array.from(OutboxRepository.store.values())
      .filter((r) => (r.status === "PENDING" || r.status === "FAILED") && r.availableAt <= now)
      .slice(0, limit);
  }

  /**
   * Concurrency-safe batch claiming with lock timeout recovery.
   * Prevents two concurrent relay workers from claiming and publishing the same record.
   */
  async claimBatch(workerId: string, limit = 50, lockTimeoutMs = 30000, _tx?: TransactionContext): Promise<OutboxRecord[]> {
    const now = new Date();
    const nowIso = now.toISOString();
    const claimed: OutboxRecord[] = [];

    for (const record of OutboxRepository.store.values()) {
      if (claimed.length >= limit) break;

      const isPending = (record.status === "PENDING" || record.status === "FAILED") && record.availableAt <= nowIso;
      const isLockExpired = record.status === "CLAIMED" && record.claimedAt && (new Date(record.claimedAt).getTime() + lockTimeoutMs < now.getTime());

      if (isPending || isLockExpired) {
        record.status = "CLAIMED";
        record.claimedAt = nowIso;
        record.claimedBy = workerId;
        claimed.push(record);
      }
    }

    return claimed;
  }

  async markPublished(id: string, publishedAt?: string, _tx?: TransactionContext): Promise<void> {
    const record = OutboxRepository.store.get(id);
    if (record) {
      const now = publishedAt || new Date().toISOString();
      record.status = "PUBLISHED";
      record.publishedAt = now;
      record.processedAt = now;
      OutboxRepository.store.set(id, record);
    }
  }

  async markProcessed(id: string, tx?: TransactionContext): Promise<void> {
    return this.markPublished(id, undefined, tx);
  }

  async markFailed(id: string, error: string, retryDelayMs?: number, maxAttempts = 5, _tx?: TransactionContext): Promise<void> {
    const record = OutboxRepository.store.get(id);
    if (record) {
      record.attemptCount += 1;
      record.lastError = error;
      record.lastErrorCode = "DISPATCH_FAILURE";

      if (record.attemptCount >= maxAttempts) {
        record.status = "DEAD_LETTER";
      } else {
        record.status = "FAILED";
        // Exponential backoff: base 1000ms * 2^(attempt-1), capped at 60s, or custom delay
        const delay = retryDelayMs !== undefined
          ? retryDelayMs
          : Math.min(60000, 1000 * Math.pow(2, record.attemptCount - 1));
        record.availableAt = new Date(Date.now() + delay).toISOString();
      }
      record.claimedAt = undefined;
      record.claimedBy = undefined;
      OutboxRepository.store.set(id, record);
    }
  }

  async findDeadLetters(tenantId?: string, limit = 50, _tx?: TransactionContext): Promise<OutboxRecord[]> {
    return Array.from(OutboxRepository.store.values())
      .filter((r) => r.status === "DEAD_LETTER" && (!tenantId || r.tenantId === tenantId))
      .slice(0, limit);
  }

  async retryDeadLetter(id: string, _tx?: TransactionContext): Promise<boolean> {
    const record = OutboxRepository.store.get(id);
    if (record && record.status === "DEAD_LETTER") {
      record.status = "PENDING";
      record.availableAt = new Date().toISOString();
      record.claimedAt = undefined;
      record.claimedBy = undefined;
      record.lastError = undefined;
      record.lastErrorCode = undefined;
      return true;
    }
    return false;
  }

  async findByTenant(tenantId: string, limit = 100): Promise<OutboxRecord[]> {
    return Array.from(OutboxRepository.store.values())
      .filter((r) => r.tenantId === tenantId)
      .slice(-limit);
  }

  async getStats(tenantId?: string): Promise<{ pending: number; claimed: number; published: number; failed: number; deadLetter: number; total: number }> {
    const records = Array.from(OutboxRepository.store.values()).filter(
      (r) => !tenantId || r.tenantId === tenantId
    );

    let pending = 0;
    let claimed = 0;
    let published = 0;
    let failed = 0;
    let deadLetter = 0;

    for (const r of records) {
      if (r.status === "PENDING") pending++;
      else if (r.status === "CLAIMED") claimed++;
      else if (r.status === "PUBLISHED" || r.status === "PROCESSED") published++;
      else if (r.status === "FAILED") failed++;
      else if (r.status === "DEAD_LETTER") deadLetter++;
    }

    return {
      pending,
      claimed,
      published,
      failed,
      deadLetter,
      total: records.length,
    };
  }
}

