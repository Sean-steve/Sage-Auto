// ============================================================================
// CAR HIRE OS — BACKGROUND JOBS, QUEUES & TRANSPORT CONTRACTS (DEV-011, BRS-003)
// Canonical definitions for BullMQ queue topology, event transport, retry and DLQ
// ============================================================================

import { DomainEventEnvelope } from "./events.contract";

/**
 * Canonical queue names across the Car Hire OS platform.
 */
export enum QueueName {
  EVENTS = "carhire.events",
  SCHEDULED = "carhire.scheduled",
  COMMANDS = "carhire.commands",
  NOTIFICATIONS = "carhire.notifications",
  DEAD_LETTER = "carhire.dlq",
}

/**
 * Standardized job names for scheduled recurring jobs.
 */
export const SCHEDULED_JOB_NAMES = {
  OUTBOX_RELAY: "sched.outbox-relay",
  BOOKING_EXPIRY: "sched.booking-expiry",
  COMPLIANCE_CHECK: "sched.compliance-check",
  MAINTENANCE_CHECK: "sched.maintenance-check",
  SUBSCRIPTION_BILLING: "sched.subscription-billing",
  SETTLEMENT_BATCH: "sched.settlement-batch",
  FILE_ORPHAN_CLEANUP: "sched.file-orphan-cleanup",
  FILE_RECONCILIATION: "sched.file-reconciliation",
  MEDIA_RECONCILIATION: "sched.media-reconciliation",
  NOTIFICATION_RETRY_SCAN: "sched.notification-retry-scan",
  NOTIFICATION_CLEANUP: "sched.notification-cleanup",
} as const;

export type ScheduledJobName = typeof SCHEDULED_JOB_NAMES[keyof typeof SCHEDULED_JOB_NAMES];

/**
 * Standardized command names triggered by background scheduler or domain workflows.
 */
export const COMMAND_JOB_NAMES = {
  PROCESS_OUTBOX: "cmd.process-outbox",
  EXPIRE_BOOKINGS: "cmd.expire-bookings",
  SCAN_COMPLIANCE: "cmd.scan-compliance",
  CHECK_MAINTENANCE: "cmd.check-maintenance",
  BILL_SUBSCRIPTIONS: "cmd.bill-subscriptions",
  CALCULATE_SETTLEMENTS: "cmd.calculate-settlements",
  SCAN_FILE: "cmd.scan-file",
  CLEANUP_ORPHAN_FILES: "cmd.cleanup-orphan-files",
  RECONCILE_STORAGE_FILES: "cmd.reconcile-storage-files",
  PROCESS_MEDIA: "cmd.process-media",
  REGENERATE_MEDIA: "cmd.regenerate-media",
  RECONCILE_MEDIA: "cmd.reconcile-media",
  DELIVER_NOTIFICATION: "cmd.deliver-notification",
  PROCESS_NOTIFICATION_RETRY: "cmd.process-notification-retry",
} as const;

export type CommandJobName = typeof COMMAND_JOB_NAMES[keyof typeof COMMAND_JOB_NAMES];

/**
 * Canonical Event Transport interface decoupling business domains from message brokers.
 */
export interface IEventTransport {
  publish<T = any>(envelope: DomainEventEnvelope<T>): Promise<void>;
  publishBatch<T = any>(envelopes: DomainEventEnvelope<T>[]): Promise<void>;
}

/**
 * Payload carried by scheduled jobs.
 */
export interface ScheduledJobPayload {
  jobName: string;
  scheduledAt: string;
  window: string;
  tenantId?: string | null;
  options?: Record<string, unknown>;
}

/**
 * Payload carried by asynchronous application commands.
 */
export interface CommandJobPayload<T = any> {
  commandId: string;
  commandName: string;
  tenantId?: string | null;
  correlationId: string;
  causationId?: string | null;
  actor?: {
    type: string;
    id?: string;
    supportActorId?: string;
  };
  data: T;
  timestamp: string;
}

/**
 * Canonical Dead-Letter Queue (DLQ) entry for unrecoverable or exhausted jobs.
 */
export interface DeadLetterEntry {
  id: string;
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
  failedAt: string;
  replayedAt?: string;
  status: "DEAD_LETTER" | "REPLAYED" | "DISMISSED";
}

/**
 * Metrics describing queue depth and worker load.
 */
export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

/**
 * High-level health and telemetry status of the background execution platform.
 */
export interface BackgroundPlatformHealth {
  status: "healthy" | "degraded" | "unhealthy";
  redisStatus: "connected" | "disconnected" | "simulated";
  queues: QueueMetrics[];
  workersRunning: number;
  schedulerActive: boolean;
  uptimeSeconds: number;
}
