// ============================================================================
// CAR HIRE OS — QUEUE TOKENS & JOB IDENTITY HELPERS (DEV-011, BRS-003)
// Queue topology constants, deterministic IDs, and retry backoff defaults
// ============================================================================

import { QueueName, SCHEDULED_JOB_NAMES, COMMAND_JOB_NAMES } from "@carhire/contracts";

export { QueueName, SCHEDULED_JOB_NAMES, COMMAND_JOB_NAMES };

export interface CanonicalJobOptions {
  attempts?: number;
  backoff?: {
    type: "exponential" | "fixed";
    delay: number;
  };
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
}

export const CANONICAL_QUEUE_OPTIONS: Record<QueueName, CanonicalJobOptions> = {
  [QueueName.EVENTS]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
  [QueueName.SCHEDULED]: {
    attempts: 2,
    backoff: { type: "fixed", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  [QueueName.COMMANDS]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
  [QueueName.NOTIFICATIONS]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
  [QueueName.DEAD_LETTER]: {
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false,
  },
};

/**
 * Builds a deterministic job ID for a domain event delivery.
 * Ensures deduplication if the same event is submitted multiple times.
 */
export function buildEventJobId(eventId: string, consumerName?: string): string {
  if (consumerName) {
    return `evt:${eventId}:${consumerName}`;
  }
  return `evt:${eventId}`;
}

/**
 * Builds a deterministic job ID for a scheduled job tick in a specific time window.
 * Ensures that if multiple clustered workers wake up on the same schedule tick, only
 * one job is placed into the queue.
 */
export function buildScheduledJobId(jobName: string, windowTimestamp?: string): string {
  const windowKey = windowTimestamp || new Date().toISOString().slice(0, 16); // Minute window resolution
  return `sched:${jobName}:${windowKey}`;
}

/**
 * Builds a deterministic job ID for an application command.
 */
export function buildCommandJobId(commandName: string, commandId: string): string {
  return `cmd:${commandName}:${commandId}`;
}

/**
 * Calculates exponential backoff with jitter to prevent thundering herd.
 */
export function calculateBackoffWithJitter(attempt: number, baseDelayMs = 1000, maxDelayMs = 30000): number {
  const exponential = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
  const jitter = Math.random() * (0.2 * exponential); // 20% random jitter
  return Math.floor(exponential + jitter);
}
