// ============================================================================
// CAR HIRE OS — CANONICAL SCHEDULER (DEV-011, BRS-003)
// Repeatable job orchestration, cron schedules, and distributed deduplication
// ============================================================================

import {
  QueueName,
  SCHEDULED_JOB_NAMES,
  ScheduledJobName,
  ScheduledJobPayload,
} from "@carhire/contracts";
import { QueueRegistry, ICanonicalQueue } from "../queues/queue-registry";
import { buildScheduledJobId } from "../queues/queue-tokens";

export interface ScheduledTaskDefinition {
  jobName: ScheduledJobName;
  cronPattern: string;
  intervalMs?: number;
  description: string;
  enabled?: boolean;
}

export const CANONICAL_SCHEDULE_DEFINITIONS: ScheduledTaskDefinition[] = [
  {
    jobName: SCHEDULED_JOB_NAMES.OUTBOX_RELAY,
    cronPattern: "*/10 * * * * *", // every 10 seconds
    intervalMs: 10000,
    description: "Transactional outbox relay batch dispatcher",
    enabled: true,
  },
  {
    jobName: SCHEDULED_JOB_NAMES.BOOKING_EXPIRY,
    cronPattern: "*/5 * * * *", // every 5 minutes
    intervalMs: 300000,
    description: "Scan and release expired provisional bookings and vehicle holds",
    enabled: true,
  },
  {
    jobName: SCHEDULED_JOB_NAMES.COMPLIANCE_CHECK,
    cronPattern: "0 0 * * *", // daily at 00:00 UTC
    intervalMs: 86400000,
    description: "Scan vehicle documents, permits and inspections for impending expiry",
    enabled: true,
  },
  {
    jobName: SCHEDULED_JOB_NAMES.MAINTENANCE_CHECK,
    cronPattern: "0 * * * *", // hourly
    intervalMs: 3600000,
    description: "Evaluate odometer readings and scheduled service thresholds",
    enabled: true,
  },
  {
    jobName: SCHEDULED_JOB_NAMES.SUBSCRIPTION_BILLING,
    cronPattern: "0 1 * * *", // daily at 01:00 UTC
    intervalMs: 86400000,
    description: "Process recurring SaaS plan subscriptions and invoice generation",
    enabled: true,
  },
  {
    jobName: SCHEDULED_JOB_NAMES.SETTLEMENT_BATCH,
    cronPattern: "0 2 * * 1", // weekly on Monday 02:00 UTC
    intervalMs: 604800000,
    description: "Close settlement periods and trigger owner revenue calculation",
    enabled: true,
  },
  {
    jobName: SCHEDULED_JOB_NAMES.FILE_ORPHAN_CLEANUP,
    cronPattern: "0 3 * * *", // daily at 03:00 UTC
    intervalMs: 86400000,
    description: "Sweep abandoned upload sessions, purged quarantined files and soft-deleted assets",
    enabled: true,
  },
  {
    jobName: SCHEDULED_JOB_NAMES.FILE_RECONCILIATION,
    cronPattern: "0 4 * * *", // daily at 04:00 UTC
    intervalMs: 86400000,
    description: "Reconcile database object records against cloud storage buckets and detect discrepancies",
    enabled: true,
  },
];

export class CanonicalScheduler {
  private static instance: CanonicalScheduler | null = null;
  private queueRegistry: QueueRegistry;
  private scheduledQueue: ICanonicalQueue<ScheduledJobPayload>;
  private timerIds: NodeJS.Timeout[] = [];
  private isRunning: boolean = false;

  private constructor(queueRegistry?: QueueRegistry) {
    this.queueRegistry = queueRegistry || QueueRegistry.getInstance();
    this.scheduledQueue = this.queueRegistry.getQueue<ScheduledJobPayload>(QueueName.SCHEDULED);
  }

  public static getInstance(): CanonicalScheduler {
    if (!CanonicalScheduler.instance) {
      CanonicalScheduler.instance = new CanonicalScheduler();
    }
    return CanonicalScheduler.instance;
  }

  public static resetInstance(): void {
    if (CanonicalScheduler.instance) {
      CanonicalScheduler.instance.stop();
      CanonicalScheduler.instance = null;
    }
  }

  /**
   * Starts the scheduler and registers all canonical repeat tasks.
   */
  public async start(definitions: ScheduledTaskDefinition[] = CANONICAL_SCHEDULE_DEFINITIONS): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    for (const def of definitions) {
      if (def.enabled === false) continue;
      await this.registerSchedule(def);
    }

    console.log(`[CanonicalScheduler] Registered ${definitions.length} canonical background schedules.`);
  }

  /**
   * Registers a single scheduled task with repeat options or recurring timer.
   */
  public async registerSchedule(task: ScheduledTaskDefinition): Promise<void> {
    // In production BullMQ, we register a repeat job.
    // In local/test mode, we use timer intervals aligned to window intervals.
    const intervalMs = task.intervalMs || 60000;

    const timer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.enqueueScheduledTick(task.jobName);
    }, intervalMs);

    this.timerIds.push(timer);
  }

  /**
   * Enqueues a single scheduled tick with deterministic deduplication key.
   */
  public async enqueueScheduledTick(
    jobName: ScheduledJobName,
    tenantId?: string | null,
    options?: Record<string, unknown>
  ): Promise<string> {
    const now = new Date();
    const window = now.toISOString().slice(0, 16); // 1-minute window bucket
    const deterministicId = buildScheduledJobId(jobName, window);

    const payload: ScheduledJobPayload = {
      jobName,
      scheduledAt: now.toISOString(),
      window,
      tenantId: tenantId || null,
      options,
    };

    await this.scheduledQueue.add(jobName, payload, {
      jobId: deterministicId,
    });

    return deterministicId;
  }

  /**
   * Manually triggers an immediate execution of a scheduled job (e.g. from admin panel or test).
   */
  public async triggerNow(
    jobName: ScheduledJobName,
    tenantId?: string | null,
    options?: Record<string, unknown>
  ): Promise<string> {
    const immediateWindow = `manual-${Date.now()}`;
    const jobId = `sched:${jobName}:${immediateWindow}`;

    const payload: ScheduledJobPayload = {
      jobName,
      scheduledAt: new Date().toISOString(),
      window: immediateWindow,
      tenantId: tenantId || null,
      options,
    };

    await this.scheduledQueue.add(jobName, payload, {
      jobId,
    });

    console.log(`[CanonicalScheduler] Manually triggered scheduled job ${jobName} (jobId: ${jobId})`);
    return jobId;
  }

  /**
   * Stops all active scheduler timers.
   */
  public stop(): void {
    this.isRunning = false;
    for (const timer of this.timerIds) {
      clearInterval(timer);
    }
    this.timerIds = [];
    console.log("[CanonicalScheduler] All recurring background schedules stopped.");
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      activeTimerCount: this.timerIds.length,
      registeredJobs: CANONICAL_SCHEDULE_DEFINITIONS.map((d) => d.jobName),
    };
  }
}
