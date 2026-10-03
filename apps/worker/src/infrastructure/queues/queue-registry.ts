// ============================================================================
// CAR HIRE OS — QUEUE REGISTRY (DEV-011, BRS-003)
// Queue lifecycle, BullMQ initialization, dual-mode fallback, and health metrics
// ============================================================================

import { Queue as BullQueue, JobsOptions } from "bullmq";
import { QueueName, CANONICAL_QUEUE_OPTIONS, CanonicalJobOptions } from "./queue-tokens";
import { RedisConnectionManager } from "../redis/redis-client";
import { QueueMetrics } from "@carhire/contracts";

export interface IQueueJob<T = any> {
  id: string;
  name: string;
  data: T;
  opts: JobsOptions;
  attemptsMade: number;
  failedReason?: string;
  stacktrace?: string[];
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  returnvalue?: any;
}

export interface ICanonicalQueue<T = any> {
  name: string;
  add(name: string, data: T, opts?: JobsOptions): Promise<IQueueJob<T>>;
  getJob(jobId: string): Promise<IQueueJob<T> | null>;
  getMetrics(): Promise<QueueMetrics>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isPaused(): Promise<boolean>;
  close(): Promise<void>;
  drain(): Promise<void>;
}

/**
 * In-Memory high-fidelity simulated queue for test and disconnected environments.
 */
export class SimulatedQueue<T = any> implements ICanonicalQueue<T> {
  private jobs: Map<string, IQueueJob<T>> = new Map();
  private waiting: string[] = [];
  private active: Set<string> = new Set();
  private completed: Set<string> = new Set();
  private failed: Set<string> = new Set();
  private delayed: Map<string, number> = new Map();
  private paused: boolean = false;

  constructor(public readonly name: string) {}

  async add(jobName: string, data: T, opts: JobsOptions = {}): Promise<IQueueJob<T>> {
    const id = opts.jobId || `${jobName}-${crypto.randomUUID()}`;

    // If job already exists in waiting or active, return existing (deduplication)
    if (this.jobs.has(id)) {
      const existing = this.jobs.get(id)!;
      if (this.waiting.includes(id) || this.active.has(id)) {
        return existing;
      }
    }

    const job: IQueueJob<T> = {
      id,
      name: jobName,
      data,
      opts,
      attemptsMade: 0,
      timestamp: Date.now(),
    };

    this.jobs.set(id, job);

    if (opts.delay && opts.delay > 0) {
      this.delayed.set(id, Date.now() + opts.delay);
    } else {
      this.waiting.push(id);
    }

    return job;
  }

  async getJob(jobId: string): Promise<IQueueJob<T> | null> {
    return this.jobs.get(jobId) || null;
  }

  // Internal simulator processor accessors
  popNextWaiting(): IQueueJob<T> | null {
    if (this.paused) return null;

    // Check if any delayed jobs are now ready
    const now = Date.now();
    for (const [id, readyAt] of this.delayed.entries()) {
      if (readyAt <= now) {
        this.delayed.delete(id);
        this.waiting.push(id);
      }
    }

    const nextId = this.waiting.shift();
    if (!nextId) return null;

    const job = this.jobs.get(nextId);
    if (!job) return null;

    this.active.add(nextId);
    job.processedOn = Date.now();
    return job;
  }

  markCompleted(jobId: string, result?: any): void {
    this.active.delete(jobId);
    this.completed.add(jobId);
    const job = this.jobs.get(jobId);
    if (job) {
      job.finishedOn = Date.now();
      job.returnvalue = result;
    }
  }

  markFailed(jobId: string, error: Error, shouldRetry = false, delayMs = 0): void {
    this.active.delete(jobId);
    const job = this.jobs.get(jobId);
    if (job) {
      job.attemptsMade += 1;
      job.failedReason = error.message;
      job.stacktrace = error.stack ? [error.stack] : [];

      if (shouldRetry) {
        if (delayMs > 0) {
          this.delayed.set(jobId, Date.now() + delayMs);
        } else {
          this.waiting.push(jobId);
        }
      } else {
        this.failed.add(jobId);
        job.finishedOn = Date.now();
      }
    }
  }

  async getMetrics(): Promise<QueueMetrics> {
    return {
      name: this.name,
      waiting: this.waiting.length,
      active: this.active.size,
      completed: this.completed.size,
      failed: this.failed.size,
      delayed: this.delayed.size,
      paused: this.paused,
    };
  }

  async pause(): Promise<void> {
    this.paused = true;
  }

  async resume(): Promise<void> {
    this.paused = false;
  }

  async isPaused(): Promise<boolean> {
    return this.paused;
  }

  async close(): Promise<void> {
    this.paused = true;
  }

  async drain(): Promise<void> {
    this.waiting = [];
    this.delayed.clear();
  }

  clearAll(): void {
    this.jobs.clear();
    this.waiting = [];
    this.active.clear();
    this.completed.clear();
    this.failed.clear();
    this.delayed.clear();
    this.paused = false;
  }
}

/**
 * BullMQ wrapper implementing ICanonicalQueue for real Redis deployments.
 */
export class BullMqQueueAdapter<T = any> implements ICanonicalQueue<T> {
  constructor(private readonly bullQueue: BullQueue) {}

  get name(): string {
    return this.bullQueue.name;
  }

  async add(name: string, data: T, opts?: JobsOptions): Promise<IQueueJob<T>> {
    const job = await this.bullQueue.add(name, data, opts);
    return {
      id: String(job.id),
      name: job.name,
      data: job.data as T,
      opts: job.opts,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace || undefined,
      timestamp: job.timestamp,
    };
  }

  async getJob(jobId: string): Promise<IQueueJob<T> | null> {
    const job = await this.bullQueue.getJob(jobId);
    if (!job) return null;
    return {
      id: String(job.id),
      name: job.name,
      data: job.data as T,
      opts: job.opts,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace || undefined,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      returnvalue: job.returnvalue,
    };
  }

  async getMetrics(): Promise<QueueMetrics> {
    const counts = await (this.bullQueue as any).getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused"
    );
    const isPaused = await this.bullQueue.isPaused();
    return {
      name: this.bullQueue.name,
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: isPaused,
    };
  }

  async pause(): Promise<void> {
    await this.bullQueue.pause();
  }

  async resume(): Promise<void> {
    await this.bullQueue.resume();
  }

  async isPaused(): Promise<boolean> {
    return this.bullQueue.isPaused();
  }

  async close(): Promise<void> {
    const backend = (this.bullQueue as any).backend;
    if (backend?.close) {
      await backend.disconnectBlocking?.();
      await backend.close(true);
      await backend.disconnect?.(false);
      return;
    }
    await this.bullQueue.close();
  }

  async drain(): Promise<void> {
    await this.bullQueue.drain();
  }

  public getRawQueue(): BullQueue {
    return this.bullQueue;
  }
}

/**
 * QueueRegistry coordinates all canonical queues across the platform.
 */
export class QueueRegistry {
  private static instance: QueueRegistry | null = null;
  private queues: Map<QueueName, ICanonicalQueue> = new Map();
  private redisManager: RedisConnectionManager;

  private constructor(redisManager?: RedisConnectionManager) {
    this.redisManager = redisManager || RedisConnectionManager.getInstance();
  }

  public static getInstance(redisManager?: RedisConnectionManager): QueueRegistry {
    if (!QueueRegistry.instance) {
      QueueRegistry.instance = new QueueRegistry(redisManager);
    }
    return QueueRegistry.instance;
  }

  public static resetInstance(): void {
    if (QueueRegistry.instance) {
      QueueRegistry.instance.closeAll();
      QueueRegistry.instance = null;
    }
  }

  /**
   * Retrieves or initializes a canonical queue.
   */
  public getQueue<T = any>(queueName: QueueName): ICanonicalQueue<T> {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName) as ICanonicalQueue<T>;
    }

    const redisClient = this.redisManager.getClient();
    let queue: ICanonicalQueue<T>;

    if (redisClient && !this.redisManager.isSimulated()) {
      const defaultOpts = CANONICAL_QUEUE_OPTIONS[queueName];
      const bullQueue = new BullQueue(queueName, {
        connection: this.redisManager.getConnectionOptions(),
        defaultJobOptions: {
          attempts: defaultOpts.attempts,
          backoff: defaultOpts.backoff,
          removeOnComplete: defaultOpts.removeOnComplete,
          removeOnFail: defaultOpts.removeOnFail,
        },
      });
      const bullBackend = (bullQueue as any).backend;
      for (const bullConnection of [bullBackend?.connection, bullBackend?.blockingConnection]) {
        bullConnection?.on?.("error", (error: Error) => {
          if (this.redisManager.getStatus() !== "disconnected") {
            console.error(`[QueueRegistry] Redis connection error on queue '${queueName}':`, error);
          }
        });
      }
      queue = new BullMqQueueAdapter<T>(bullQueue);
    } else {
      queue = new SimulatedQueue<T>(queueName);
    }

    this.queues.set(queueName, queue);
    return queue;
  }

  /**
   * Collects metrics from all initialized queues.
   */
  public async getAllMetrics(): Promise<QueueMetrics[]> {
    const metrics: QueueMetrics[] = [];
    for (const [name, queue] of this.queues.entries()) {
      metrics.push(await queue.getMetrics());
    }
    return metrics;
  }

  /**
   * Gracefully closes all open queues.
   */
  public async closeAll(): Promise<void> {
    for (const queue of this.queues.values()) {
      try {
        await queue.close();
      } catch (err) {
        console.error(`[QueueRegistry] Error closing queue ${queue.name}:`, err);
      }
    }
    this.queues.clear();
  }
}
