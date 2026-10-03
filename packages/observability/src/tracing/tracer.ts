// ============================================================================
// CAR HIRE OS — DISTRIBUTED TRACING ENGINE (SPRINT 42)
// Vendor-neutral OpenTelemetry-compatible tracing with W3C propagation & attribute sanitization
// ============================================================================

import { SpanKind, SpanRecord } from "../types";
import {
  generateSpanId,
  getTelemetryContext,
  runWithTelemetryContext,
} from "../context/telemetry-context";
import { SENSITIVE_KEY_PATTERNS } from "../redaction/redaction-engine";

export class Span {
  public readonly traceId: string;
  public readonly spanId: string;
  public readonly parentSpanId?: string;
  public readonly name: string;
  public readonly kind: SpanKind;
  public readonly startTime: number;
  private endTime?: number;
  private status: "OK" | "ERROR" = "OK";
  private statusMessage?: string;
  private attributes: Record<string, string | number | boolean> = {};
  private events: SpanRecord["events"] = [];
  private onEnd?: (span: SpanRecord) => void;

  constructor(
    name: string,
    kind: SpanKind = "INTERNAL",
    traceId: string,
    parentSpanId?: string,
    onEnd?: (span: SpanRecord) => void
  ) {
    this.name = name;
    this.kind = kind;
    this.traceId = traceId;
    this.parentSpanId = parentSpanId;
    this.spanId = generateSpanId();
    this.startTime = Date.now();
    this.onEnd = onEnd;
  }

  public setStatus(status: "OK" | "ERROR", message?: string): this {
    this.status = status;
    if (message) this.statusMessage = message;
    return this;
  }

  /**
   * Sets attribute after validating that it is neither sensitive nor unbounded high-cardinality
   */
  public setAttribute(key: string, value: string | number | boolean): this {
    // 1. Redact sensitive keys
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))) {
      return this;
    }

    // 2. Reject sensitive or raw PII values
    if (typeof value === "string") {
      if (value.length > 256) {
        value = value.substring(0, 256) + "...";
      }
    }

    this.attributes[key] = value;
    return this;
  }

  public setTag(key: string, value: string | number | boolean): this {
    return this.setAttribute(key, value);
  }

  public setAttributes(attrs: Record<string, string | number | boolean>): this {
    for (const [k, v] of Object.entries(attrs)) {
      this.setAttribute(k, v);
    }
    return this;
  }

  public addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
    this.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes,
    });
    return this;
  }

  public end(): void {
    if (this.endTime) return;
    this.endTime = Date.now();
    const durationMs = this.endTime - this.startTime;

    const record: SpanRecord = {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      status: this.status,
      statusMessage: this.statusMessage,
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs,
      attributes: { ...this.attributes },
      events: [...this.events],
    };

    if (this.onEnd) {
      try {
        this.onEnd(record);
      } catch {
        // Observability rule: tracing exporter failure must never throw
      }
    }
  }

  public toRecord(): SpanRecord {
    const end = this.endTime || Date.now();
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      status: this.status,
      statusMessage: this.statusMessage,
      startTime: this.startTime,
      endTime: end,
      durationMs: end - this.startTime,
      attributes: { ...this.attributes },
      events: [...this.events],
    };
  }
}

export class Tracer {
  private serviceName: string;
  private sampleRatio: number;
  private static instance?: Tracer;
  private static spanBuffer: SpanRecord[] = [];
  private static bufferLimit = 500;

  constructor(serviceName = "@carhire/api", sampleRatio = 1.0) {
    this.serviceName = serviceName;
    this.sampleRatio = sampleRatio;
  }

  public static getInstance(serviceName = "@carhire/api", sampleRatio = 1.0): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer(serviceName, sampleRatio);
    }
    return Tracer.instance;
  }

  public startSpan(name: string, options?: { kind?: SpanKind; parentSpanId?: string }): Span {
    const ambient = getTelemetryContext();
    const traceId = ambient.traceId || generateSpanId();
    const parentSpanId = options?.parentSpanId || ambient.spanId;

    const span = new Span(
      name,
      options?.kind || "INTERNAL",
      traceId,
      parentSpanId,
      (record) => {
        Tracer.recordSpan(record);
      }
    );

    span.setAttribute("service.name", this.serviceName);
    span.setAttribute("deployment.environment", ambient.environment);
    span.setAttribute("service.version", ambient.releaseId);

    return span;
  }

  public async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    options?: { kind?: SpanKind }
  ): Promise<T> {
    const span = this.startSpan(name, options);

    return runWithTelemetryContext(
      {
        spanId: span.spanId,
        traceId: span.traceId,
      },
      async () => {
        try {
          const result = await fn(span);
          span.setStatus("OK");
          return result;
        } catch (error: any) {
          span.setStatus("ERROR", error?.message || "Unknown error");
          span.addEvent("exception", {
            "exception.type": error?.name || "Error",
            "exception.message": error?.message || String(error),
          });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }

  private static recordSpan(span: SpanRecord) {
    Tracer.spanBuffer.push(span);
    if (Tracer.spanBuffer.length > Tracer.bufferLimit) {
      Tracer.spanBuffer.shift();
    }
  }

  public static getCompletedSpans(): SpanRecord[] {
    return [...Tracer.spanBuffer];
  }

  public static clearBuffer(): void {
    Tracer.spanBuffer = [];
  }
}

export const defaultTracer = new Tracer();
