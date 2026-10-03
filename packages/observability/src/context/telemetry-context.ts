// ============================================================================
// CAR HIRE OS — TELEMETRY CONTEXT & CORRELATION PROPAGATION (SPRINT 42)
// Isomorphic AsyncLocalStorage-based propagation of correlation IDs & W3C trace context
// Works synchronously in Node.js via process.getBuiltinModule and in browser via ambient state
// ============================================================================

import { TelemetryContextData } from "../types";

export interface TelemetryStorageInterface<T> {
  getStore(): T | undefined;
  run<R>(store: T, callback: () => R): R;
}

class FallbackTelemetryStorage<T> implements TelemetryStorageInterface<T> {
  private current?: T;

  getStore(): T | undefined {
    return this.current;
  }

  run<R>(store: T, callback: () => R): R {
    const previous = this.current;
    this.current = store;
    try {
      return callback();
    } finally {
      this.current = previous;
    }
  }
}

function initializeStorage(): TelemetryStorageInterface<TelemetryContextData> {
  if (typeof process !== "undefined" && typeof (process as any).getBuiltinModule === "function") {
    try {
      const asyncHooks = (process as any).getBuiltinModule("node:async_hooks");
      if (asyncHooks?.AsyncLocalStorage) {
        return new asyncHooks.AsyncLocalStorage();
      }
    } catch {
      // Fall through to fallback
    }
  }
  return new FallbackTelemetryStorage<TelemetryContextData>();
}

const telemetryStorage = initializeStorage();

function getSecureHex(byteLength: number): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  for (let i = 0; i < byteLength; i++) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return out;
}

export function generateCorrelationId(): string {
  const uuid = typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${getSecureHex(4)}-${getSecureHex(2)}-${getSecureHex(2)}-${getSecureHex(2)}-${getSecureHex(6)}`;
  return `corr-${uuid}`;
}

export function generateRequestId(): string {
  const uuid = typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${getSecureHex(4)}-${getSecureHex(2)}-${getSecureHex(2)}-${getSecureHex(2)}-${getSecureHex(6)}`;
  return `req-${uuid}`;
}

export function generateTraceId(): string {
  return getSecureHex(16); // 32 hex chars (W3C standard)
}

export function generateSpanId(): string {
  return getSecureHex(8); // 16 hex chars (W3C standard)
}

export interface TraceparentInfo {
  version: string;
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/**
 * Parses W3C traceparent header: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export function parseTraceparent(header?: string | null): TraceparentInfo | null {
  if (!header || typeof header !== "string") return null;
  const parts = header.trim().split("-");
  if (parts.length < 4) return null;
  const [version, traceId, spanId, flags] = parts;
  if (traceId.length !== 32 || spanId.length !== 16) return null;
  return {
    version,
    traceId,
    spanId,
    sampled: flags === "01",
  };
}

/**
 * Formats W3C traceparent header
 */
export function formatTraceparent(traceId: string, spanId: string, sampled = true): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

/**
 * Returns current ambient telemetry context or a fallback default
 */
export function getTelemetryContext(): TelemetryContextData {
  const current = telemetryStorage.getStore();
  if (current) {
    return current;
  }

  return {
    correlationId: generateCorrelationId(),
    requestId: generateRequestId(),
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    service: process.env.APP_NAME || "@carhire/api",
    releaseId: process.env.RELEASE_ID || "dev-local-0.1.0",
    environment: process.env.APP_ENV || process.env.NODE_ENV || "development",
  };
}

/**
 * Runs an asynchronous callback with populated telemetry context
 */
export function runWithTelemetryContext<T>(
  context: Partial<TelemetryContextData>,
  callback: () => T
): T {
  const base = getTelemetryContext();
  const merged: TelemetryContextData = {
    ...base,
    ...context,
    correlationId: context.correlationId || base.correlationId || generateCorrelationId(),
    requestId: context.requestId || base.requestId || generateRequestId(),
    traceId: context.traceId || base.traceId || generateTraceId(),
    spanId: context.spanId || generateSpanId(),
    service: context.service || base.service || "@carhire/api",
    releaseId: context.releaseId || base.releaseId || process.env.RELEASE_ID || "dev-local-0.1.0",
    environment: context.environment || base.environment || process.env.APP_ENV || "development",
  };

  return telemetryStorage.run(merged, callback);
}

/**
 * Extracts telemetry context from Express / HTTP Request headers
 */
export function extractHttpContext(req: {
  headers: Record<string, string | string[] | undefined>;
}): Partial<TelemetryContextData> {
  const headers = req.headers || {};
  const getHeader = (name: string): string | undefined => {
    const val = headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const correlationId = getHeader("x-correlation-id") || generateCorrelationId();
  const requestId = getHeader("x-request-id") || generateRequestId();
  const traceparent = parseTraceparent(getHeader("traceparent"));
  const traceId = traceparent?.traceId || generateTraceId();
  const parentSpanId = traceparent?.spanId;
  const spanId = generateSpanId();
  const tenantId = getHeader("x-tenant-id");
  const actorType = getHeader("x-actor-type");
  const actorId = getHeader("x-actor-id");

  return {
    correlationId,
    requestId,
    traceId,
    spanId,
    tenantId,
    actorType,
    actorId,
    baggage: {
      ...(parentSpanId ? { parentSpanId } : {}),
    },
  };
}
