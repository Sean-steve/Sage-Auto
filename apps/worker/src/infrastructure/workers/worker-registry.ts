// ============================================================================
// CAR HIRE OS — WORKER REGISTRY & EXECUTION PLATFORM (DEV-011, BRS-003)
// Worker lifecycle, concurrency isolation, tenant context scoping, retry & DLQ routing
// ============================================================================

import { Worker as BullWorker, Job as BullJob } from "bullmq";
import {
  QueueName,
  DomainEventEnvelope,
  ScheduledJobPayload,
  CommandJobPayload,
  COMMAND_JOB_NAMES,
  SCHEDULED_JOB_NAMES,
} from "@carhire/contracts";
import { RedisConnectionManager } from "../redis/redis-client";
import { QueueRegistry, SimulatedQueue, IQueueJob } from "../queues/queue-registry";
import { DeadLetterService } from "../dlq/dead-letter-service";
import { CANONICAL_QUEUE_OPTIONS, calculateBackoffWithJitter, buildCommandJobId } from "../queues/queue-tokens";
import { getSharedEventBus } from "../../../../api/src/infrastructure/events/event-bus";

// Handlers interface for application commands
export type CommandHandler = (command: CommandJobPayload) => Promise<any>;

export interface WorkerRegistryConfig {
  concurrency?: Partial<Record<QueueName, number>>;
  shutdownTimeoutMs?: number;
}

export class WorkerRegistry {
  private static instance: WorkerRegistry | null = null;
  private queueRegistry: QueueRegistry;
  private redisManager: RedisConnectionManager;
  private deadLetterService: DeadLetterService;
  private bullWorkers: Map<QueueName, BullWorker> = new Map();
  private commandHandlers: Map<string, CommandHandler> = new Map();
  private simulatedIntervals: NodeJS.Timeout[] = [];
  private isRunning: boolean = false;
  private activeJobsCount: number = 0;

  private currentTenantContext: string | null = null;

  private constructor(
    queueRegistry?: QueueRegistry,
    redisManager?: RedisConnectionManager,
    deadLetterService?: DeadLetterService
  ) {
    this.queueRegistry = queueRegistry || QueueRegistry.getInstance();
    this.redisManager = redisManager || RedisConnectionManager.getInstance();
    this.deadLetterService = deadLetterService || new DeadLetterService(this.queueRegistry);
  }

  public static getInstance(): WorkerRegistry {
    if (!WorkerRegistry.instance) {
      WorkerRegistry.instance = new WorkerRegistry();
    }
    return WorkerRegistry.instance;
  }

  public static resetInstance(): void {
    if (WorkerRegistry.instance) {
      WorkerRegistry.instance.stop();
      WorkerRegistry.instance = null;
    }
  }

  /**
   * Registers a domain command handler.
   */
  public registerCommandHandler(commandName: string, handler: CommandHandler): void {
    this.commandHandlers.set(commandName, handler);
  }

  /**
   * Starts all workers across canonical queues.
   */
  public async start(config: WorkerRegistryConfig = {}): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const concurrencySettings: Record<QueueName, number> = {
      [QueueName.EVENTS]: config.concurrency?.[QueueName.EVENTS] || 10,
      [QueueName.SCHEDULED]: config.concurrency?.[QueueName.SCHEDULED] || 2,
      [QueueName.COMMANDS]: config.concurrency?.[QueueName.COMMANDS] || 5,
      [QueueName.NOTIFICATIONS]: config.concurrency?.[QueueName.NOTIFICATIONS] || 10,
      [QueueName.DEAD_LETTER]: config.concurrency?.[QueueName.DEAD_LETTER] || 1,
    };

    const redisClient = this.redisManager.getClient();
    const isSimulated = this.redisManager.isSimulated() || !redisClient;

    if (!isSimulated && redisClient) {
      this.initBullWorker(QueueName.EVENTS, concurrencySettings[QueueName.EVENTS], this.processEventJob.bind(this));
      this.initBullWorker(QueueName.SCHEDULED, concurrencySettings[QueueName.SCHEDULED], this.processScheduledJob.bind(this));
      this.initBullWorker(QueueName.COMMANDS, concurrencySettings[QueueName.COMMANDS], this.processCommandJob.bind(this));
    } else {
      // In-Memory Simulated Loop Runner
      this.startSimulatedWorkerLoop(QueueName.EVENTS, this.processEventJob.bind(this));
      this.startSimulatedWorkerLoop(QueueName.SCHEDULED, this.processScheduledJob.bind(this));
      this.startSimulatedWorkerLoop(QueueName.COMMANDS, this.processCommandJob.bind(this));
    }

    console.log(
      `[WorkerRegistry] Started background workers (mode: ${isSimulated ? "SIMULATED" : "REDIS_BULLMQ"})`
    );
  }

  /**
   * Initializes a real BullMQ Worker instance.
   */
  private initBullWorker(
    queueName: QueueName,
    concurrency: number,
    processor: (job: { id: string; name: string; data: any; attemptsMade: number }) => Promise<any>
  ) {
    const redisClient = this.redisManager.getClient()!;
    const worker = new BullWorker(
      queueName,
      async (job: BullJob) => {
        return this.withJobScoping(job.id || "unknown-job", job.data?.tenantId, async () => {
          return processor({
            id: String(job.id),
            name: job.name,
            data: job.data,
            attemptsMade: job.attemptsMade,
          });
        });
      },
      {
        connection: this.redisManager.getConnectionOptions(),
        concurrency,
      }
    );
    const bullBackend = (worker as any).backend;
    for (const bullConnection of [bullBackend?.connection, bullBackend?.blockingConnection]) {
      bullConnection?.on?.("error", (error: Error) => {
        if (this.isRunning) {
          console.error(`[WorkerRegistry] Redis connection error on queue '${queueName}':`, error);
        }
      });
    }

    worker.on("failed", async (job, error) => {
      if (!job) return;
      const maxAttempts = CANONICAL_QUEUE_OPTIONS[queueName]?.attempts || 3;
      if (job.attemptsMade >= maxAttempts) {
        await this.deadLetterService.captureFailure({
          originalQueue: queueName,
          originalJobId: String(job.id),
          jobName: job.name,
          payload: job.data,
          failedReason: error.message,
          stacktrace: error.stack ? [error.stack] : [],
          attemptsMade: job.attemptsMade,
          maxAttempts,
          tenantId: job.data?.tenantId,
          correlationId: job.data?.correlationId,
        });
      }
    });

    worker.on("error", (error) => {
      if (this.isRunning) {
        console.error(`[WorkerRegistry] Worker error on queue '${queueName}':`, error);
      }
    });

    this.bullWorkers.set(queueName, worker);
  }

  /**
   * Starts a polling runner loop for simulated queue mode.
   */
  private startSimulatedWorkerLoop(
    queueName: QueueName,
    processor: (job: { id: string; name: string; data: any; attemptsMade: number }) => Promise<any>
  ) {
    const queue = this.queueRegistry.getQueue(queueName) as SimulatedQueue;
    const interval = setInterval(async () => {
      if (!this.isRunning) return;

      const job = queue.popNextWaiting();
      if (!job) return;

      this.activeJobsCount++;
      try {
        await this.withJobScoping(job.id, job.data?.tenantId, async () => {
          return processor({
            id: job.id,
            name: job.name,
            data: job.data,
            attemptsMade: job.attemptsMade,
          });
        });
        queue.markCompleted(job.id);
      } catch (err: any) {
        const maxAttempts = CANONICAL_QUEUE_OPTIONS[queueName]?.attempts || 3;
        const attemptsMade = job.attemptsMade + 1;
        const shouldRetry = attemptsMade < maxAttempts;
        const delay = shouldRetry ? calculateBackoffWithJitter(attemptsMade) : 0;

        queue.markFailed(job.id, err, shouldRetry, delay);

        if (!shouldRetry) {
          await this.deadLetterService.captureFailure({
            originalQueue: queueName,
            originalJobId: job.id,
            jobName: job.name,
            payload: job.data,
            failedReason: err?.message || String(err),
            stacktrace: err?.stack ? [err.stack] : [],
            attemptsMade,
            maxAttempts,
            tenantId: job.data?.tenantId,
            correlationId: job.data?.correlationId,
          });
        }
      } finally {
        this.activeJobsCount--;
      }
    }, 25);

    this.simulatedIntervals.push(interval);
  }

  /**
   * Process a single job synchronously in simulated or test mode.
   */
  public async processNextSync(queueName: QueueName): Promise<boolean> {
    const queue = this.queueRegistry.getQueue(queueName) as SimulatedQueue;
    const job = queue.popNextWaiting();
    if (!job) return false;

    let processor: (job: { id: string; name: string; data: any; attemptsMade: number }) => Promise<any>;
    if (queueName === QueueName.EVENTS) processor = this.processEventJob.bind(this);
    else if (queueName === QueueName.SCHEDULED) processor = this.processScheduledJob.bind(this);
    else if (queueName === QueueName.COMMANDS) processor = this.processCommandJob.bind(this);
    else return false;

    try {
      await this.withJobScoping(job.id, job.data?.tenantId, async () => {
        return processor({
          id: job.id,
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade,
        });
      });
      queue.markCompleted(job.id);
      return true;
    } catch (err: any) {
      const maxAttempts = CANONICAL_QUEUE_OPTIONS[queueName]?.attempts || 3;
      const attemptsMade = job.attemptsMade + 1;
      const shouldRetry = attemptsMade < maxAttempts;
      const delay = shouldRetry ? calculateBackoffWithJitter(attemptsMade) : 0;

      queue.markFailed(job.id, err, shouldRetry, delay);

      if (!shouldRetry) {
        await this.deadLetterService.captureFailure({
          originalQueue: queueName,
          originalJobId: job.id,
          jobName: job.name,
          payload: job.data,
          failedReason: err?.message || String(err),
          stacktrace: err?.stack ? [err.stack] : [],
          attemptsMade,
          maxAttempts,
          tenantId: job.data?.tenantId,
          correlationId: job.data?.correlationId,
        });
      }
      return false;
    }
  }

  /**
   * Enforces tenant context isolation and guaranteed cleanup.
   */
  private async withJobScoping<T>(jobId: string, tenantId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
    this.currentTenantContext = tenantId || null;
    try {
      return await fn();
    } finally {
      this.currentTenantContext = null;
    }
  }

  public getActiveTenantContext(): string | null {
    return this.currentTenantContext;
  }

  // --------------------------------------------------------------------------
  // PROCESSOR: DOMAIN EVENTS QUEUE
  // --------------------------------------------------------------------------
  private async processEventJob(job: { id: string; name: string; data: DomainEventEnvelope }): Promise<any> {
    const envelope = job.data;
    if (!envelope || !envelope.eventType) {
      throw new Error("Invalid event job payload: missing envelope");
    }

    const eventBus = getSharedEventBus();
    const report = await eventBus.publish(envelope);

    if (report.failedCount > 0) {
      const firstError = report.results.find((r) => r.status === "FAILED")?.error || "Subscriber failure";
      throw new Error(`Event subscriber execution error: ${firstError}`);
    }

    return report;
  }

  // --------------------------------------------------------------------------
  // PROCESSOR: SCHEDULED JOBS QUEUE
  // Strictly respects: "SCHEDULED JOBS TRIGGER COMMANDS. They do NOT own business rules."
  // --------------------------------------------------------------------------
  private async processScheduledJob(job: { id: string; name: string; data: ScheduledJobPayload }): Promise<any> {
    const scheduledPayload = job.data;
    const commandsQueue = this.queueRegistry.getQueue(QueueName.COMMANDS);

    let commandName: string;
    let commandData: any = {};

    switch (scheduledPayload.jobName) {
      case SCHEDULED_JOB_NAMES.OUTBOX_RELAY:
        commandName = COMMAND_JOB_NAMES.PROCESS_OUTBOX;
        commandData = { batchSize: 50 };
        break;

      case SCHEDULED_JOB_NAMES.BOOKING_EXPIRY:
        commandName = COMMAND_JOB_NAMES.EXPIRE_BOOKINGS;
        commandData = { gracePeriodMinutes: 30 };
        break;

      case SCHEDULED_JOB_NAMES.COMPLIANCE_CHECK:
        commandName = COMMAND_JOB_NAMES.SCAN_COMPLIANCE;
        commandData = { daysThreshold: 14 };
        break;

      case SCHEDULED_JOB_NAMES.MAINTENANCE_CHECK:
        commandName = COMMAND_JOB_NAMES.CHECK_MAINTENANCE;
        commandData = { overdueDaysThreshold: 0 };
        break;

      case SCHEDULED_JOB_NAMES.SUBSCRIPTION_BILLING:
        commandName = COMMAND_JOB_NAMES.BILL_SUBSCRIPTIONS;
        commandData = { periodWindow: scheduledPayload.window };
        break;

      case SCHEDULED_JOB_NAMES.SETTLEMENT_BATCH:
        commandName = COMMAND_JOB_NAMES.CALCULATE_SETTLEMENTS;
        commandData = { periodClose: true };
        break;

      case SCHEDULED_JOB_NAMES.FILE_ORPHAN_CLEANUP:
        commandName = COMMAND_JOB_NAMES.CLEANUP_ORPHAN_FILES;
        commandData = { sessionExpiryCutoffHours: 24, quarantineRetentionDays: 30 };
        break;

      case SCHEDULED_JOB_NAMES.FILE_RECONCILIATION:
        commandName = COMMAND_JOB_NAMES.RECONCILE_STORAGE_FILES;
        commandData = {};
        break;

      default:
        commandName = `cmd.${scheduledPayload.jobName.replace(/^sched\./, "")}`;
        commandData = scheduledPayload.options || {};
    }

    const commandId = crypto.randomUUID();
    const commandPayload: CommandJobPayload = {
      commandId,
      commandName,
      tenantId: scheduledPayload.tenantId || null,
      correlationId: `sched-corr-${commandId}`,
      causationId: job.id,
      actor: { type: "SYSTEM", id: "canonical-scheduler" },
      data: commandData,
      timestamp: new Date().toISOString(),
    };

    const deterministicJobId = buildCommandJobId(commandName, `${scheduledPayload.window}-${commandId.slice(0, 8)}`);

    await commandsQueue.add(commandName, commandPayload, {
      jobId: deterministicJobId,
    });

    return {
      triggeredCommand: commandName,
      commandId,
      status: "dispatched",
    };
  }

  // --------------------------------------------------------------------------
  // PROCESSOR: APPLICATION COMMANDS QUEUE
  // --------------------------------------------------------------------------
  private async processCommandJob(job: { id: string; name: string; data: CommandJobPayload }): Promise<any> {
    const command = job.data;
    const handler = this.commandHandlers.get(command.commandName);

    if (!handler) {
      console.warn(`[WorkerRegistry] No registered handler for command '${command.commandName}'`);
      return { status: "no_handler_registered", commandName: command.commandName };
    }

    return await handler(command);
  }

  /**
   * Graceful shutdown: drains workers, clears intervals, waits for in-flight jobs.
   */
  public async stop(timeoutMs = 5000): Promise<void> {
    this.isRunning = false;

    // Clear simulation intervals
    for (const interval of this.simulatedIntervals) {
      clearInterval(interval);
    }
    this.simulatedIntervals = [];

    // Close BullMQ workers
    const closePromises: Promise<void>[] = [];
    for (const [name, worker] of this.bullWorkers.entries()) {
      closePromises.push(
        (async () => {
          const bullBackend = (worker as any).backend;
          for (const bullConnection of [bullBackend?.connection, bullBackend?.blockingConnection]) {
            bullConnection?.on?.("error", () => undefined);
          }
          if (bullBackend?.close) {
            await bullBackend.disconnectBlocking?.();
            await bullBackend.close(true);
            await bullBackend.disconnect?.(false);
          } else {
            await worker.close(true);
          }
        })().catch((err) => {
          console.error(`[WorkerRegistry] Error closing worker ${name}:`, err);
        })
      );
    }
    await Promise.all(closePromises);
    this.bullWorkers.clear();

    // Wait for in-flight active jobs to complete up to timeout
    const deadline = Date.now() + timeoutMs;
    while (this.activeJobsCount > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }

    console.log("[WorkerRegistry] Background workers gracefully stopped.");
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobsCount: this.activeJobsCount,
      registeredCommandHandlers: Array.from(this.commandHandlers.keys()),
      bullWorkerCount: this.bullWorkers.size,
    };
  }
}
