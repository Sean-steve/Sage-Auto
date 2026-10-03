// ============================================================================
// CAR HIRE OS — CANONICAL METRIC REGISTRY (SPRINT 42)
// Strict bounded-cardinality metric storage, Prometheus / OpenMetrics serialization
// and anti-cardinality explosion enforcement
// ============================================================================

import { MetricDefinition, MetricType, HistogramValue } from "../types";

/**
 * Strict ban-list of high-cardinality or sensitive label keys.
 * Including any of these keys in metric labels will immediately be rejected to protect Prometheus/TSDB.
 */
export const FORBIDDEN_LABEL_KEYS: RegExp[] = [
  /tenant_?id/i,
  /customer_?id/i,
  /booking_?id/i,
  /rental_?id/i,
  /payment_?id/i,
  /transaction_?id/i,
  /user_?id/i,
  /vehicle_?id/i,
  /vin/i,
  /token/i,
  /email/i,
  /phone/i,
  /mobile/i,
  /ip/i,
  /remote_?addr/i,
  /uuid/i,
  /session_?id/i,
  /card/i,
];

export class MetricCardinalityViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricCardinalityViolationError";
  }
}

export function validateMetricLabels(labels: Record<string, string>): void {
  for (const [key, value] of Object.entries(labels)) {
    // 1. Check against forbidden keys
    for (const pattern of FORBIDDEN_LABEL_KEYS) {
      if (pattern.test(key)) {
        throw new MetricCardinalityViolationError(
          `High-cardinality label key '${key}' is strictly forbidden in metric labels.`
        );
      }
    }

    // 2. Check for UUID-like or raw ID values
    if (typeof value === "string") {
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
        /^[0-9a-f]{24,64}$/i.test(value)
      ) {
        throw new MetricCardinalityViolationError(
          `High-cardinality UUID/Hash value detected for label '${key}': '${value}'. Must not be used in metric labels.`
        );
      }
    }
  }
}

function serializeLabels(labels: Record<string, string>): string {
  const sortedKeys = Object.keys(labels).sort();
  if (sortedKeys.length === 0) return "";
  return sortedKeys.map((k) => `${k}="${labels[k]}"`).join(",");
}

export class Counter {
  public readonly def: MetricDefinition;
  private values = new Map<string, { labels: Record<string, string>; value: number }>();

  constructor(def: MetricDefinition) {
    this.def = def;
  }

  public inc(labels: Record<string, string> = {}, amount = 1): void {
    validateMetricLabels(labels);
    const key = serializeLabels(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += amount;
    } else {
      // Limit number of distinct labelsets per metric to prevent unbounded memory
      if (this.values.size >= 100) {
        return; // drop excess labelsets
      }
      this.values.set(key, { labels, value: amount });
    }
  }

  public get(labels: Record<string, string> = {}): number {
    const key = serializeLabels(labels);
    return this.values.get(key)?.value || 0;
  }

  public reset(): void {
    this.values.clear();
  }

  public getAll(): Array<{ labels: Record<string, string>; value: number }> {
    return Array.from(this.values.values());
  }
}

export class Gauge {
  public readonly def: MetricDefinition;
  private values = new Map<string, { labels: Record<string, string>; value: number }>();

  constructor(def: MetricDefinition) {
    this.def = def;
  }

  public set(labels: Record<string, string> = {}, value: number): void {
    validateMetricLabels(labels);
    const key = serializeLabels(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value = value;
    } else {
      if (this.values.size >= 100) {
        return;
      }
      this.values.set(key, { labels, value });
    }
  }

  public inc(labels: Record<string, string> = {}, amount = 1): void {
    validateMetricLabels(labels);
    const key = serializeLabels(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += amount;
    } else {
      this.set(labels, amount);
    }
  }

  public dec(labels: Record<string, string> = {}, amount = 1): void {
    this.inc(labels, -amount);
  }

  public get(labels: Record<string, string> = {}): number {
    const key = serializeLabels(labels);
    return this.values.get(key)?.value || 0;
  }

  public reset(): void {
    this.values.clear();
  }

  public getAll(): Array<{ labels: Record<string, string>; value: number }> {
    return Array.from(this.values.values());
  }
}

const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class Histogram {
  public readonly def: MetricDefinition;
  public readonly buckets: number[];
  private values = new Map<string, HistogramValue>();

  constructor(def: MetricDefinition) {
    this.def = def;
    this.buckets = (def.buckets && def.buckets.length > 0 ? def.buckets : DEFAULT_HISTOGRAM_BUCKETS).sort(
      (a, b) => a - b
    );
  }

  public observe(labels: Record<string, string> = {}, val: number): void {
    validateMetricLabels(labels);
    const key = serializeLabels(labels);
    let entry = this.values.get(key);

    if (!entry) {
      if (this.values.size >= 100) return;
      const initialBuckets: Record<number, number> = {};
      for (const b of this.buckets) {
        initialBuckets[b] = 0;
      }
      entry = {
        labels,
        buckets: initialBuckets,
        sum: 0,
        count: 0,
      };
      this.values.set(key, entry);
    }

    entry.count += 1;
    entry.sum += val;

    for (const b of this.buckets) {
      if (val <= b) {
        entry.buckets[b] = (entry.buckets[b] || 0) + 1;
      }
    }
  }

  public get(labels: Record<string, string> = {}): HistogramValue | undefined {
    const key = serializeLabels(labels);
    return this.values.get(key);
  }

  public reset(): void {
    this.values.clear();
  }

  public getAll(): HistogramValue[] {
    return Array.from(this.values.values());
  }
}

export class MetricRegistry {
  private static instance: MetricRegistry;
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  private constructor() {}

  public static getInstance(): MetricRegistry {
    if (!MetricRegistry.instance) {
      MetricRegistry.instance = new MetricRegistry();
    }
    return MetricRegistry.instance;
  }

  public counter(name: string, help: string, labelNames: string[] = []): Counter {
    this.assertCanonicalName(name);
    this.assertAllowedLabelNames(labelNames);
    let existing = this.counters.get(name);
    if (!existing) {
      existing = new Counter({ name, help, type: "counter", labelNames });
      this.counters.set(name, existing);
    }
    return existing;
  }

  public gauge(name: string, help: string, labelNames: string[] = []): Gauge {
    this.assertCanonicalName(name);
    this.assertAllowedLabelNames(labelNames);
    let existing = this.gauges.get(name);
    if (!existing) {
      existing = new Gauge({ name, help, type: "gauge", labelNames });
      this.gauges.set(name, existing);
    }
    return existing;
  }

  public histogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): Histogram {
    this.assertCanonicalName(name);
    this.assertAllowedLabelNames(labelNames);
    let existing = this.histograms.get(name);
    if (!existing) {
      existing = new Histogram({ name, help, type: "histogram", labelNames, buckets });
      this.histograms.set(name, existing);
    }
    return existing;
  }

  private assertCanonicalName(name: string): void {
    if (!name.startsWith("carhire_")) {
      throw new Error(`Metric name '${name}' must follow the canonical prefix 'carhire_*'.`);
    }
  }

  private assertAllowedLabelNames(labelNames: string[] = []): void {
    for (const label of labelNames) {
      for (const pattern of FORBIDDEN_LABEL_KEYS) {
        if (pattern.test(label)) {
          throw new MetricCardinalityViolationError(
            `High-cardinality label key '${label}' is strictly forbidden in metric labels.`
          );
        }
      }
    }
  }

  public exportPrometheus(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, counter] of this.counters.entries()) {
      lines.push(`# HELP ${name} ${counter.def.help}`);
      lines.push(`# TYPE ${name} counter`);
      for (const entry of counter.getAll()) {
        const labelStr = serializeLabels(entry.labels);
        lines.push(`${name}${labelStr ? `{${labelStr}}` : ""} ${entry.value}`);
      }
    }

    // Gauges
    for (const [name, gauge] of this.gauges.entries()) {
      lines.push(`# HELP ${name} ${gauge.def.help}`);
      lines.push(`# TYPE ${name} gauge`);
      for (const entry of gauge.getAll()) {
        const labelStr = serializeLabels(entry.labels);
        lines.push(`${name}${labelStr ? `{${labelStr}}` : ""} ${entry.value}`);
      }
    }

    // Histograms
    for (const [name, hist] of this.histograms.entries()) {
      lines.push(`# HELP ${name} ${hist.def.help}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const entry of hist.getAll()) {
        const labelBase = serializeLabels(entry.labels);
        const prefix = labelBase ? `${labelBase},` : "";

        // Buckets
        let cumulative = 0;
        for (const b of hist.buckets) {
          cumulative += entry.buckets[b] || 0;
          lines.push(`${name}_bucket{${prefix}le="${b}"} ${cumulative}`);
        }
        lines.push(`${name}_bucket{${prefix}le="+Inf"} ${entry.count}`);
        lines.push(`${name}_sum{${labelBase ? `{${labelBase}}` : ""}} ${entry.sum}`);
        lines.push(`${name}_count{${labelBase ? `{${labelBase}}` : ""}} ${entry.count}`);
      }
    }

    return lines.join("\n") + "\n";
  }

  public resetAll(): void {
    for (const c of this.counters.values()) c.reset();
    for (const g of this.gauges.values()) g.reset();
    for (const h of this.histograms.values()) h.reset();
  }
}
