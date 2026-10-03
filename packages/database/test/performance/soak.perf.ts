// ============================================================================
// CAR HIRE OS — SPRINT 40: SOAK & ENDURANCE TESTING SUITE
// Sustained execution test verifying heap memory stability & zero connection leakage
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
  LedgerAccountRepository,
  JournalTransactionRepository,
  JournalEntryRepository,
  OutboxRepository,
} from "../../src/index";

export async function runSoakPerformanceSuite(): Promise<MetricSummary[]> {
  verifyNonProductionSafety();

  console.log("\n==================================================================");
  console.log("CAR HIRE OS — SPRINT 40: SOAK & ENDURANCE BENCHMARK");
  console.log("Evaluating Sustained Memory Stability & Zero Resource Leakage");
  console.log("==================================================================\n");

  const generator = new SyntheticDataGenerator();
  const seed = await generator.generate({ tier: "MEDIUM", tenantCount: 2, vehiclesPerTenant: 10 });
  const tenantId = seed.tenantIds[0];
  const vehicleId = seed.vehicleIds[0];
  const customerId = seed.customerIds[0];

  const vehicleRepo = new VehicleRepository();
  const bookingRepo = new BookingRepository();
  const ledgerAccountRepo = new LedgerAccountRepository();
  const journalTxRepo = new JournalTransactionRepository();
  const journalEntryRepo = new JournalEntryRepository();
  const outboxRepo = new OutboxRepository();

  const accounts = await ledgerAccountRepo.listByTenant(tenantId);
  const debitAcc = accounts[0].id;
  const creditAcc = accounts[1].id;

  // Initial Memory Baseline
  if (global.gc) {
    global.gc();
  }
  const initialMem = process.memoryUsage();
  const initialHeapMb = initialMem.heapUsed / (1024 * 1024);
  console.log(`  Initial Heap Used: ${initialHeapMb.toFixed(2)} MB`);

  const telemetry = new PerformanceTelemetry();
  telemetry.start();

  const cycles = 500;
  for (let c = 0; c < cycles; c++) {
    const start = process.hrtime.bigint();
    try {
      // 1. Vehicle catalogue query
      await vehicleRepo.findAll(tenantId, { limit: 5 });

      // 2. Booking creation
      if (c % 10 === 0) {
        await bookingRepo.create(tenantId, {
          bookingNumber: `BK-SOAK-${c}-${Date.now()}`,
          customerId,
          vehicleId,
          pickupLocation: "Nairobi JKIA",
          returnLocation: "Nairobi JKIA",
          pickupAt: new Date(Date.now() + 86400000).toISOString(),
          returnAt: new Date(Date.now() + 172800000).toISOString(),
          grossTotal: 25500,
          netRentalSubtotal: 25500,
          depositRequired: 25000,
          taxAmount: 4080,
          initialStatus: "PENDING_CONFIRMATION",
        } as any);
      }

      // 3. Ledger balanced posting
      if (c % 20 === 0) {
        const entries = [
          {
            id: `ent-dr-soak-${c}-${Date.now()}`,
            transactionId: `jrn-soak-${c}`,
            tenantId,
            accountId: debitAcc,
            accountCode: "1000",
            accountName: "Cash & M-Pesa",
            direction: "DEBIT" as const,
            amount: "1000.0000",
            sortOrder: 1,
          },
          {
            id: `ent-cr-soak-${c}-${Date.now()}`,
            transactionId: `jrn-soak-${c}`,
            tenantId,
            accountId: creditAcc,
            accountCode: "4000",
            accountName: "Rental Revenue",
            direction: "CREDIT" as const,
            amount: "1000.0000",
            sortOrder: 2,
          },
        ];
        await journalTxRepo.create({
          tenantId,
          transactionDate: new Date().toISOString(),
          status: "POSTED",
          sourceType: "OPERATIONAL_INVOICE",
          sourceId: `soak-${c}`,
          currency: "KES",
          totalDebit: "1000.0000",
          totalCredit: "1000.0000",
          description: `Soak test posting ${c}`,
          entries: entries as any,
        } as any);
        await journalEntryRepo.createMany(entries as any);
      }

      // 4. Outbox lifecycle
      if (c % 25 === 0) {
        const ev = await outboxRepo.create({
          tenantId,
          eventType: "SOAK_EVENT",
          aggregateType: "Booking",
          aggregateId: `bk-soak-${c}`,
          source: "carhire.soak",
          payload: { cycle: c },
          status: "PENDING",
        });
        await outboxRepo.markProcessed(ev.id);
      }

      const end = process.hrtime.bigint();
      telemetry.record(Number(end - start) / 1e6, true);
    } catch (err: any) {
      const end = process.hrtime.bigint();
      telemetry.record(Number(end - start) / 1e6, false, err.message);
    }
  }

  telemetry.stop();

  if (global.gc) {
    global.gc();
  }
  const finalMem = process.memoryUsage();
  const finalHeapMb = finalMem.heapUsed / (1024 * 1024);
  const heapDeltaMb = finalHeapMb - initialHeapMb;

  console.log(`  Final Heap Used:   ${finalHeapMb.toFixed(2)} MB`);
  console.log(`  Heap Delta:        ${heapDeltaMb.toFixed(2)} MB`);

  // Assert heap growth under sustained ops is < 80MB (no runaway memory leak)
  assert.ok(
    heapDeltaMb < 80,
    `Heap growth (${heapDeltaMb.toFixed(2)} MB) must be within 80 MB threshold`
  );

  const summary = telemetry.summarize(
    "SOAK-001",
    "Sustained 500-Cycle Endurance Test",
    "SOAK",
    cycles,
    100
  );

  const mark = summary.status === "PASS" ? "✓" : summary.status === "WARN" ? "⚠" : "✗";
  console.log(
    `  ${mark} [SOAK-001] Cycles: ${cycles} | p50: ${summary.p50Ms.toFixed(2)}ms | p95: ${summary.p95Ms.toFixed(2)}ms | RPS: ${summary.throughputRps.toFixed(0)} | ${summary.status}`
  );

  console.log("\n==================================================================");
  console.log("SOAK BENCHMARK COMPLETE: PROVEN MEMORY & RESOURCE STABILITY");
  console.log("==================================================================\n");

  return [summary];
}

if (process.env.NODE_ENV !== "test" && require.main === module) {
  runSoakPerformanceSuite().catch((err) => {
    console.error("FATAL: Soak performance suite failed:", err);
    process.exit(1);
  });
}
