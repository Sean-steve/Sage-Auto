// ============================================================================
// CAR HIRE OS — WORKER MODULE (DEV-011, BRS-003)
// Production Background Execution Platform: BullMQ, Scheduler, Workers, DLQ & Transport
// ============================================================================

import {
  COMMAND_JOB_NAMES,
  BackgroundPlatformHealth,
} from "@carhire/contracts";
import { SystemMetrics } from "@carhire/observability";
import { RedisConnectionManager } from "./infrastructure/redis/redis-client";
import { QueueRegistry } from "./infrastructure/queues/queue-registry";
import { WorkerRegistry } from "./infrastructure/workers/worker-registry";
import { CanonicalScheduler } from "./infrastructure/scheduler/canonical-scheduler";
import { DeadLetterService } from "./infrastructure/dlq/dead-letter-service";
import { BullMqEventTransport } from "./infrastructure/transport/bullmq-event-transport";

// Command Handlers
import { handleProcessOutboxCommand } from "./jobs/outbox-relay.job";
import { handleExpireBookingsCommand } from "./jobs/booking-expiry.job";
import { handleScanComplianceCommand } from "./jobs/compliance-check.job";
import { handleCheckMaintenanceCommand } from "./jobs/maintenance-check.job";
import { handleBillSubscriptionsCommand } from "./jobs/subscription-billing.job";
import { handleCalculateSettlementsCommand } from "./jobs/owner-settlement.job";
import {
  handleCleanupOrphanFilesCommand,
  handleReconcileStorageCommand,
} from "./jobs/file-cleanup.job";
import {
  handleProcessMediaCommand,
  handleRegenerateMediaCommand,
  handleReconcileMediaCommand,
} from "./jobs/media-processing.job";

export class WorkerManager {
  private redisManager: RedisConnectionManager;
  private queueRegistry: QueueRegistry;
  private workerRegistry: WorkerRegistry;
  private scheduler: CanonicalScheduler;
  private deadLetterService: DeadLetterService;
  private eventTransport: BullMqEventTransport;

  private isRunning: boolean = false;
  private startTime: number = 0;

  constructor() {
    this.redisManager = RedisConnectionManager.getInstance();
    this.queueRegistry = QueueRegistry.getInstance(this.redisManager);
    this.deadLetterService = new DeadLetterService(this.queueRegistry);
    this.workerRegistry = WorkerRegistry.getInstance();
    this.scheduler = CanonicalScheduler.getInstance();
    this.eventTransport = new BullMqEventTransport(this.queueRegistry);

    // Register all domain command processors
    this.registerCommands();
  }

  private registerCommands(): void {
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.PROCESS_OUTBOX,
      handleProcessOutboxCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.EXPIRE_BOOKINGS,
      handleExpireBookingsCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.SCAN_COMPLIANCE,
      handleScanComplianceCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.CHECK_MAINTENANCE,
      handleCheckMaintenanceCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.BILL_SUBSCRIPTIONS,
      handleBillSubscriptionsCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.CALCULATE_SETTLEMENTS,
      handleCalculateSettlementsCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.CLEANUP_ORPHAN_FILES,
      handleCleanupOrphanFilesCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.RECONCILE_STORAGE_FILES,
      handleReconcileStorageCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.PROCESS_MEDIA,
      handleProcessMediaCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.REGENERATE_MEDIA,
      handleRegenerateMediaCommand
    );
    this.workerRegistry.registerCommandHandler(
      COMMAND_JOB_NAMES.RECONCILE_MEDIA,
      handleReconcileMediaCommand
    );
  }

  /**
   * Starts the background execution platform.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now();

    console.log("[WorkerManager] Initializing background execution platform...");

    // 1. Initialize Redis or determine simulated mode
    const redisStatus = await this.redisManager.initialize();
    console.log(`[WorkerManager] Redis connection status: ${redisStatus}`);

    // 2. Start Workers
    await this.workerRegistry.start();

    // 3. Start Canonical Scheduler
    await this.scheduler.start();

    SystemMetrics.workerInstancesActive.set({ cluster_role: "background-worker" }, 1);
    SystemMetrics.redisConnected.set({ instance: "primary" }, redisStatus === "connected" ? 1 : 0);

    console.log("[WorkerManager] Background execution platform is ONLINE.");
  }

  /**
   * Graceful shutdown of workers, scheduler, and connections.
   */
  public async stop(timeoutMs = 5000): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    console.log("[WorkerManager] Stopping background execution platform...");

    SystemMetrics.workerInstancesActive.set({ cluster_role: "background-worker" }, 0);

    // 1. Stop scheduler first to prevent new ticks
    this.scheduler.stop();

    // 2. Stop workers and drain in-flight jobs
    await this.workerRegistry.stop(timeoutMs);

    // 3. Close queues
    await this.queueRegistry.closeAll();

    // 4. Disconnect Redis
    await this.redisManager.disconnect();
    SystemMetrics.redisConnected.set({ instance: "primary" }, 0);

    console.log("[WorkerManager] Background execution platform is OFFLINE.");
  }

  /**
   * Health and telemetry report for status probes and dashboards.
   */
  public async getHealth(): Promise<BackgroundPlatformHealth> {
    const queueMetrics = await this.queueRegistry.getAllMetrics();
    const redisStatus = this.redisManager.getStatus();

    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (redisStatus === "disconnected") {
      overallStatus = "degraded";
    }

    const workerStatus = this.workerRegistry.getStatus();
    const schedulerStatus = this.scheduler.getStatus();

    // Update telemetry gauges
    SystemMetrics.workerInstancesActive.set({ cluster_role: "background-worker" }, workerStatus.isRunning ? 1 : 0);
    SystemMetrics.redisConnected.set({ instance: "primary" }, redisStatus === "connected" ? 1 : 0);
    for (const q of queueMetrics) {
      SystemMetrics.queueWaitingJobs.set({ queue_name: q.name }, q.waiting);
      SystemMetrics.queueActiveJobs.set({ queue_name: q.name }, q.active);
    }

    return {
      status: overallStatus,
      redisStatus,
      queues: queueMetrics,
      workersRunning: workerStatus.isRunning ? 1 : 0,
      schedulerActive: schedulerStatus.isRunning,
      uptimeSeconds: this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }

  public getQueueRegistry(): QueueRegistry {
    return this.queueRegistry;
  }

  public getWorkerRegistry(): WorkerRegistry {
    return this.workerRegistry;
  }

  public getScheduler(): CanonicalScheduler {
    return this.scheduler;
  }

  public getDeadLetterService(): DeadLetterService {
    return this.deadLetterService;
  }

  public getEventTransport(): BullMqEventTransport {
    return this.eventTransport;
  }
}
