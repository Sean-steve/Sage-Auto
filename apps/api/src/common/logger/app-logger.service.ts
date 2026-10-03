// ============================================================================
// CAR HIRE OS — SECURE AUDIT & APP LOGGER SERVICE (DEV-004, SEC-007, SPRINT 42)
// Provides structured JSON logging with automatic PII & credential redaction
// Backed by @carhire/observability
// ============================================================================

import {
  StructuredLogger,
  sanitizeTelemetryData,
  sanitizeLogString,
  getTelemetryContext,
} from "@carhire/observability";

export const REDACTED_MASK = "[REDACTED]";

export function sanitizeLogData(data: unknown, depth = 0): unknown {
  return sanitizeTelemetryData(data, depth);
}

export class AppLoggerService {
  private logger: StructuredLogger;
  private context: string;

  constructor(context: string = "App") {
    this.context = context;
    this.logger = new StructuredLogger(context);
  }

  log(message: string, meta?: Record<string, unknown>) {
    this.logger.info(message, meta);
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.logger.warn(message, meta);
  }

  error(message: string, trace?: string, meta?: Record<string, unknown>) {
    const errorObj = trace ? new Error(trace) : undefined;
    this.logger.error(message, errorObj, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.logger.debug(message, meta);
  }
}
