// ============================================================================
// CAR HIRE OS — PERFORMANCE TEST HARNESS & TELEMETRY ENGINE (SPRINT 40)
// High-resolution nanosecond timers, percentile calculation, concurrency execution,
// production safety guards, and invariant verification
// ============================================================================

export interface LatencySample {
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface MetricSummary {
  scenarioId: string;
  name: string;
  category: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  errorRatePercent: number;
  throughputRps: number;
  minMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  avgMs: number;
  memoryUsedDeltaMb: number;
  concurrency: number;
  status: "PASS" | "WARN" | "FAIL";
}

export interface PerformanceHarnessOptions {
  name: string;
  warmupIterations?: number;
  targetConcurrency?: number;
  durationSeconds?: number;
  allowProduction?: boolean;
}

/**
 * Production Safety Guardrail:
 * Refuses execution if running against a production environment without explicit flag.
 */
export function verifyNonProductionSafety(allowProduction = false): void {
  const env = (process.env.NODE_ENV || "").toLowerCase();
  const dbUrl = (process.env.DATABASE_URL || "").toLowerCase();
  const isProd = env === "production" || dbUrl.includes("production") || dbUrl.includes("aws.com") || dbUrl.includes("gcp.cloud");

  if (isProd && !allowProduction && process.env.PERF_ALLOW_PROD !== "true") {
    throw new Error(
      "SAFETY VIOLATION: Performance test attempted to run against a PRODUCTION environment. " +
      "Car Hire OS safety policy strictly blocks load tests on production without explicit PERF_ALLOW_PROD=true."
    );
  }
}

/**
 * High-precision percentile and metrics accumulator
 */
export class PerformanceTelemetry {
  private samples: LatencySample[] = [];
  private startTime: bigint = 0n;
  private endTime: bigint = 0n;
  private startMemMb = 0;
  private endMemMb = 0;

  start(): void {
    if (typeof process !== "undefined" && process.memoryUsage) {
      this.startMemMb = process.memoryUsage().heapUsed / 1024 / 1024;
    }
    this.startTime = process.hrtime.bigint();
  }

  stop(): void {
    this.endTime = process.hrtime.bigint();
    if (typeof process !== "undefined" && process.memoryUsage) {
      this.endMemMb = process.memoryUsage().heapUsed / 1024 / 1024;
    }
  }

  record(durationMs: number, success = true, error?: string): void {
    this.samples.push({
      durationMs,
      success,
      error,
      timestamp: Date.now(),
    });
  }

  summarize(scenarioId: string, name: string, category: string, concurrency = 1, p95TargetMs = 100): MetricSummary {
    const total = this.samples.length;
    if (total === 0) {
      return {
        scenarioId,
        name,
        category,
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        errorRatePercent: 0,
        throughputRps: 0,
        minMs: 0,
        p50Ms: 0,
        p90Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
        avgMs: 0,
        memoryUsedDeltaMb: 0,
        concurrency,
        status: "PASS",
      };
    }

    const successes = this.samples.filter((s) => s.success);
    const failures = this.samples.filter((s) => !s.success);
    const successCount = successes.length;
    const failureCount = failures.length;
    const errorRatePercent = (failureCount / total) * 100;

    const durations = this.samples.map((s) => s.durationMs).sort((a, b) => a - b);
    const minMs = durations[0];
    const maxMs = durations[durations.length - 1];
    const sum = durations.reduce((acc, v) => acc + v, 0);
    const avgMs = sum / total;

    const p50Ms = durations[Math.floor(total * 0.5)];
    const p90Ms = durations[Math.floor(total * 0.9)];
    const p95Ms = durations[Math.min(durations.length - 1, Math.floor(total * 0.95))];
    const p99Ms = durations[Math.min(durations.length - 1, Math.floor(total * 0.99))];

    const wallClockSeconds = Number(this.endTime - this.startTime) / 1e9;
    const throughputRps = wallClockSeconds > 0 ? total / wallClockSeconds : 0;
    const memoryUsedDeltaMb = Math.max(0, this.endMemMb - this.startMemMb);

    let status: "PASS" | "WARN" | "FAIL" = "PASS";
    if (errorRatePercent > 1.0 || p95Ms > p95TargetMs * 2.5) {
      status = "FAIL";
    } else if (p95Ms > p95TargetMs) {
      status = "WARN";
    }

    return {
      scenarioId,
      name,
      category,
      totalRequests: total,
      successCount,
      failureCount,
      errorRatePercent: Number(errorRatePercent.toFixed(2)),
      throughputRps: Number(throughputRps.toFixed(1)),
      minMs: Number(minMs.toFixed(2)),
      p50Ms: Number(p50Ms.toFixed(2)),
      p90Ms: Number(p90Ms.toFixed(2)),
      p95Ms: Number(p95Ms.toFixed(2)),
      p99Ms: Number(p99Ms.toFixed(2)),
      maxMs: Number(maxMs.toFixed(2)),
      avgMs: Number(avgMs.toFixed(2)),
      memoryUsedDeltaMb: Number(memoryUsedDeltaMb.toFixed(2)),
      concurrency,
      status,
    };
  }
}

/**
 * Executes a function concurrently across worker threads/promises
 */
export async function executeConcurrentWorkload<T>(
  concurrency: number,
  iterationsPerWorker: number,
  workloadFn: (workerIdx: number, iteration: number) => Promise<T>,
  telemetry: PerformanceTelemetry
): Promise<void> {
  telemetry.start();
  const workerPromises: Promise<void>[] = [];

  for (let workerIdx = 0; workerIdx < concurrency; workerIdx++) {
    const workerPromise = (async () => {
      for (let iter = 0; iter < iterationsPerWorker; iter++) {
        const start = process.hrtime.bigint();
        try {
          await workloadFn(workerIdx, iter);
          const end = process.hrtime.bigint();
          const durationMs = Number(end - start) / 1e6;
          telemetry.record(durationMs, true);
        } catch (err: any) {
          const end = process.hrtime.bigint();
          const durationMs = Number(end - start) / 1e6;
          telemetry.record(durationMs, false, err.message || String(err));
        }
      }
    })();
    workerPromises.push(workerPromise);
  }

  await Promise.all(workerPromises);
  telemetry.stop();
}
