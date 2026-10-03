// ============================================================================
// CAR HIRE OS — DEAD LETTER QUEUE (DLQ) SERVICE (DEV-011, BRS-003)
// Diagnostic capture, diagnostic triage, manual re-queue, and replay orchestration
// ============================================================================

import { DeadLetterEntry, QueueName } from "@carhire/contracts";
import { QueueRegistry, ICanonicalQueue } from "../queues/queue-registry";

export interface DlqFilter {
  tenantId?: string | null;
  queueName?: string;
  status?: "DEAD_LETTER" | "REPLAYED" | "DISMISSED";
  limit?: number;
  offset?: number;
}

export interface DlqStats {
  total: number;
  deadLetterCount: number;
  replayedCount: number;
  dismissedCount: number;
  byQueue: Record<string, number>;
  byTenant: Record<string, number>;
}

export class DeadLetterService {
  private static store: Map<string, DeadLetterEntry> = new Map();
  private queueRegistry: QueueRegistry;
  private dlqQueue: ICanonicalQueue<DeadLetterEntry>;

  constructor(queueRegistry?: QueueRegistry) {
    this.queueRegistry = queueRegistry || QueueRegistry.getInstance();
    this.dlqQueue = this.queueRegistry.getQueue<DeadLetterEntry>(QueueName.DEAD_LETTER);
  }

  public static clearStore(): void {
    DeadLetterService.store.clear();
  }

  /**
   * Captures an exhausted failed job into the DLQ with full diagnostic payload.
   */
  public async captureFailure(params: {
    originalQueue: string;
    originalJobId: string;
    jobName: string;
    payload: any;
    failedReason: string;
    stacktrace?: string[];
    attemptsMade: number;
    maxAttempts: number;
    tenantId?: string | null;
    correlationId?: string;
  }): Promise<DeadLetterEntry> {
    const entryId = `dlq-${crypto.randomUUID()}`;
    const entry: DeadLetterEntry = {
      id: entryId,
      originalQueue: params.originalQueue,
      originalJobId: params.originalJobId,
      jobName: params.jobName,
      payload: params.payload,
      failedReason: params.failedReason,
      stacktrace: params.stacktrace,
      attemptsMade: params.attemptsMade,
      maxAttempts: params.maxAttempts,
      tenantId: params.tenantId || null,
      correlationId: params.correlationId || params.payload?.correlationId,
      failedAt: new Date().toISOString(),
      status: "DEAD_LETTER",
    };

    DeadLetterService.store.set(entryId, entry);

    // Also place onto the DLQ queue for external observers/alerting
    await this.dlqQueue.add("dlq.captured", entry, {
      jobId: entryId,
      removeOnComplete: false,
    });

    console.warn(
      `[DLQ] Captured dead-letter job ${params.originalJobId} from queue '${params.originalQueue}' after ${params.attemptsMade} attempts: ${params.failedReason}`
    );

    return entry;
  }

  /**
   * Lists dead letter entries matching query criteria.
   */
  public async listEntries(filter: DlqFilter = {}): Promise<{ entries: DeadLetterEntry[]; total: number }> {
    let items = Array.from(DeadLetterService.store.values());

    if (filter.tenantId !== undefined) {
      items = items.filter((e) => e.tenantId === filter.tenantId);
    }
    if (filter.queueName) {
      items = items.filter((e) => e.originalQueue === filter.queueName);
    }
    if (filter.status) {
      items = items.filter((e) => e.status === filter.status);
    }

    // Sort newest first
    items.sort((a, b) => Date.parse(b.failedAt) - Date.parse(a.failedAt));

    const total = items.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    const paged = items.slice(offset, offset + limit);

    return { entries: paged, total };
  }

  /**
   * Retrieves a single DLQ entry by ID.
   */
  public async getEntry(id: string): Promise<DeadLetterEntry | null> {
    return DeadLetterService.store.get(id) || null;
  }

  /**
   * Replays an entry back into its original queue for retry after operator remediation.
   */
  public async replay(id: string): Promise<boolean> {
    const entry = DeadLetterService.store.get(id);
    if (!entry) {
      throw new Error(`Dead-letter entry not found: ${id}`);
    }
    if (entry.status === "REPLAYED") {
      return false;
    }

    const targetQueueName = entry.originalQueue as QueueName;
    const targetQueue = this.queueRegistry.getQueue(targetQueueName);

    // Re-queue with a new replay job ID to avoid deduplication conflict
    const replayJobId = `replay-${entry.originalJobId}-${Date.now()}`;
    await targetQueue.add(entry.jobName, entry.payload, {
      jobId: replayJobId,
    });

    entry.status = "REPLAYED";
    entry.replayedAt = new Date().toISOString();
    DeadLetterService.store.set(id, entry);

    console.log(`[DLQ] Replayed entry ${id} back to queue '${entry.originalQueue}' as job ${replayJobId}`);
    return true;
  }

  /**
   * Dismisses a dead-letter entry without replaying.
   */
  public async dismiss(id: string): Promise<boolean> {
    const entry = DeadLetterService.store.get(id);
    if (!entry) return false;

    entry.status = "DISMISSED";
    DeadLetterService.store.set(id, entry);
    return true;
  }

  /**
   * Provides aggregate statistics for dead-letter telemetry.
   */
  public async getStats(): Promise<DlqStats> {
    const items = Array.from(DeadLetterService.store.values());
    const stats: DlqStats = {
      total: items.length,
      deadLetterCount: 0,
      replayedCount: 0,
      dismissedCount: 0,
      byQueue: {},
      byTenant: {},
    };

    for (const item of items) {
      if (item.status === "DEAD_LETTER") stats.deadLetterCount++;
      if (item.status === "REPLAYED") stats.replayedCount++;
      if (item.status === "DISMISSED") stats.dismissedCount++;

      stats.byQueue[item.originalQueue] = (stats.byQueue[item.originalQueue] || 0) + 1;
      const tenantKey = item.tenantId || "system";
      stats.byTenant[tenantKey] = (stats.byTenant[tenantKey] || 0) + 1;
    }

    return stats;
  }
}
