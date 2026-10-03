// ============================================================================
// CAR HIRE OS — STRUCTURED JSON LOGGER (DEV-004, SEC-007, SPRINT 42)
// Production JSON logging with ambient trace/correlation injection, recursive PII redaction
// and bounded memory diagnostics buffer
// ============================================================================

import { LogEntry, LogLevel } from "../types";
import { sanitizeTelemetryData, sanitizeLogString, safeTenantHash } from "../redaction/redaction-engine";
import { getTelemetryContext } from "../context/telemetry-context";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export class StructuredLogger {
  private contextName: string;
  private minLevel: LogLevel;
  private static bufferLimit = 500;
  private static logBuffer: LogEntry[] = [];

  constructor(contextName = "System", minLevel?: LogLevel) {
    this.contextName = contextName;
    const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
    this.minLevel = minLevel || (LOG_LEVEL_PRIORITY[envLevel] !== undefined ? envLevel : "info");
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>, error?: Error | unknown) {
    if (!this.shouldLog(level)) {
      return;
    }

    try {
      const ambient = getTelemetryContext();
      const sanitizedMessage = sanitizeLogString(message);
      const safeMeta = meta ? sanitizeTelemetryData(meta) : undefined;
      const safeTenant = safeTenantHash(ambient.tenantId);

      let parsedError: LogEntry["error"] | undefined;
      if (error instanceof Error) {
        parsedError = {
          name: error.name,
          message: sanitizeLogString(error.message),
          stack: error.stack ? sanitizeLogString(error.stack) : undefined,
          code: (error as any).code,
        };
      } else if (error && typeof error === "object") {
        parsedError = sanitizeTelemetryData(error as any);
      }

      const entry: LogEntry = {
        level,
        timestamp: new Date().toISOString(),
        service: ambient.service,
        context: this.contextName,
        message: sanitizedMessage,
        environment: ambient.environment,
        releaseId: ambient.releaseId,
        correlationId: ambient.correlationId,
        requestId: ambient.requestId,
        traceId: ambient.traceId,
        spanId: ambient.spanId,
        tenantHash: safeTenant,
        actorType: ambient.actorType,
        ...(parsedError ? { error: parsedError } : {}),
        ...(safeMeta ? { meta: safeMeta as Record<string, unknown> } : {}),
      };

      // Store in memory ring buffer for diagnostic testing
      StructuredLogger.logBuffer.push(entry);
      if (StructuredLogger.logBuffer.length > StructuredLogger.bufferLimit) {
        StructuredLogger.logBuffer.shift();
      }

      const serialized = JSON.stringify(entry);

      if (level === "error" || level === "fatal") {
        console.error(serialized);
      } else if (level === "warn") {
        console.warn(serialized);
      } else {
        console.log(serialized);
      }
    } catch {
      // OBSERVABILITY RULE: Observability failures must never crash the business system!
      try {
        console.error(`[StructuredLogger] Fail-safe fallback: level=${level} context=${this.contextName}`);
      } catch {
        // Absolute fail-safe
      }
    }
  }

  public debug(message: string, meta?: Record<string, unknown>) {
    this.write("debug", message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>) {
    this.write("info", message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>) {
    this.write("warn", message, meta);
  }

  public error(message: string, error?: Error | unknown, meta?: Record<string, unknown>) {
    this.write("error", message, meta, error);
  }

  public fatal(message: string, error?: Error | unknown, meta?: Record<string, unknown>) {
    this.write("fatal", message, meta, error);
  }

  /**
   * Diagnostic inspection of logged entries in memory
   */
  public static getRecentLogs(filter?: { level?: LogLevel; context?: string; limit?: number } | number): LogEntry[] {
    const limit = typeof filter === "number" ? filter : filter?.limit;
    const level = typeof filter === "object" ? filter.level : undefined;
    const context = typeof filter === "object" ? filter.context : undefined;

    const matched = StructuredLogger.logBuffer.filter((entry) => {
      if (level && entry.level !== level) return false;
      if (context && entry.context !== context) return false;
      return true;
    });

    return limit ? matched.slice(-limit) : matched;
  }

  public static clearBuffer(): void {
    StructuredLogger.logBuffer = [];
  }
}

export function createLogger(contextName: string): StructuredLogger {
  return new StructuredLogger(contextName);
}
