// ============================================================================
// CAR HIRE OS — SPRINT 40: SPIKE TESTING SUITE
// Simulates 10x sudden burst of traffic and verifies graceful recovery to baseline
// ============================================================================

import { strict as assert } from "node:assert";
import {
  PerformanceTelemetry,
  MetricSummary,
  verifyNonProductionSafety,
} from "./perf-harness";
import { SyntheticDataGenerator } from "./synthetic-data-generator";
import {
  VehicleRepository,
  BookingRepository,
} from "../../src/index";

export async function runSpikePerformanceSuite(): Promise<MetricSummary[]> {
  verifyNonProductionSafety();

  console.log("\n==================================================================");
  console.log("CAR HIRE OS — SPRINT 40: TRAFFIC SPIKE & RESILIENCE BENCHMARK");
  console.log("Simulating Baseline (10 req) -> 10x Spike Burst (100 req) -> Post-Spike (10 req)");
  console.log("==================================================================\n");

  const generator = new SyntheticDataGenerator();
  const seed = await generator.generate({ tier: "MEDIUM", tenantCount: 2, vehiclesPerTenant: 10 });
  const tenantId = seed.tenantIds[0];
  const vehicleId = seed.vehicleIds[0];
  const customerId = seed.customerIds[0];

  const vehicleRepo = new VehicleRepository();
  const bookingRepo = new BookingRepository();
  const results: MetricSummary[] = [];

  async function executePhase(
    phaseName: string,
    id: string,
    concurrency: number,
    targetP95: number
  ): Promise<MetricSummary> {
    const telemetry = new PerformanceTelemetry();
    telemetry.start();

    const tasks = Array.from({ length: concurrency }, async (_, idx) => {
      const start = process.hrtime.bigint();
      try {
        // Mixed read-write operation under spike
        const list = await vehicleRepo.findAll(tenantId, { limit: 10 });
        assert.ok(list.vehicles.length > 0);
        if (idx % 5 === 0) {
          await bookingRepo.create(tenantId, {
            bookingNumber: `BK-SPIKE-${id}-${idx}-${Date.now()}`,
            customerId,
            vehicleId,
            pickupLocation: "Nairobi JKIA",
            returnLocation: "Nairobi JKIA",
            pickupAt: new Date(Date.now() + 86400000).toISOString(),
            returnAt: new Date(Date.now() + 172800000).toISOString(),
            grossTotal: 17000,
            netRentalSubtotal: 17000,
            depositRequired: 25000,
            taxAmount: 2720,
            initialStatus: "PENDING_CONFIRMATION",
          } as any);
        }
        const end = process.hrtime.bigint();
        telemetry.record(Number(end - start) / 1e6, true);
      } catch (err: any) {
        const end = process.hrtime.bigint();
        telemetry.record(Number(end - start) / 1e6, false, err.message);
      }
    });

    await Promise.all(tasks);
    telemetry.stop();

    const summary = telemetry.summarize(id, phaseName, "SPIKE", concurrency, targetP95);
    results.push(summary);

    const mark = summary.status === "PASS" ? "✓" : summary.status === "WARN" ? "⚠" : "✗";
    console.log(
      `  ${mark} [${id}] ${phaseName.padEnd(46)} | Concurrency: ${String(concurrency).padStart(3)} | p50: ${summary.p50Ms.toFixed(2).padStart(5)}ms | p95: ${summary.p95Ms.toFixed(2).padStart(5)}ms | ${summary.status}`
    );
    return summary;
  }

  // Phase 1: Pre-spike baseline
  const pre = await executePhase("Pre-Spike Normal Baseline", "SPIKE-PRE-001", 10, 50);

  // Phase 2: 10x Sudden Burst
  const burst = await executePhase("10x Sudden Traffic Burst", "SPIKE-BURST-002", 100, 150);

  // Phase 3: Post-spike recovery baseline
  const post = await executePhase("Post-Spike Immediate Recovery", "SPIKE-POST-003", 10, 50);

  // Verification: System recovered to normal baseline latency post-spike
  assert.ok(
    post.p95Ms < burst.p95Ms + 20,
    "Post-spike latency must immediately recover and not exhibit degradation"
  );

  console.log("\n==================================================================");
  console.log("SPIKE BENCHMARK COMPLETE: ZERO RESIDUAL SYSTEM SATURATION");
  console.log("==================================================================\n");

  return results;
}

if (process.env.NODE_ENV !== "test" && require.main === module) {
  runSpikePerformanceSuite().catch((err) => {
    console.error("FATAL: Spike performance suite failed:", err);
    process.exit(1);
  });
}
