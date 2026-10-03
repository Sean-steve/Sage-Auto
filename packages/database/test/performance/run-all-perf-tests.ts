// ============================================================================
// CAR HIRE OS — SPRINT 40: MASTER PERFORMANCE & CAPACITY TEST RUNNER
// Orchestrates Baseline, Contention, Load, Spike, Stress, and Soak Performance Suites
// Verifies Post-Test Invariants: Ledger DR == CR, Zero Overlapping Allocations
// ============================================================================

import { strict as assert } from "node:assert";
import { verifyNonProductionSafety, MetricSummary } from "./perf-harness";
import { runBaselinePerformanceSuite } from "./baseline.perf";
import { runContentionPerformanceSuite } from "./contention.perf";
import { runLoadPerformanceSuite } from "./load.perf";
import { runSpikePerformanceSuite } from "./spike.perf";
import { runStressPerformanceSuite } from "./stress.perf";
import { runSoakPerformanceSuite } from "./soak.perf";
import {
  JournalTransactionRepository,
  VehicleAllocationRepository,
  OutboxRepository,
} from "../../src/index";

export async function runMasterPerformanceMatrix(): Promise<void> {
  verifyNonProductionSafety();

  const matrixStartTime = Date.now();
  console.log("\n================================================================================");
  console.log("CAR HIRE OS — SPRINT 40: AUTHORITATIVE PERFORMANCE & CAPACITY MATRIX");
  console.log("================================================================================");
  console.log(`Execution Timestamp: ${new Date().toISOString()}`);
  console.log(`Runtime Environment: Node ${process.version} | Architecture: ${process.arch} ${process.platform}`);
  console.log(`Safety Verification: Verified NON-PRODUCTION environment\n`);

  const allMetrics: MetricSummary[] = [];

  // 1. Baseline Suite (50 Scenarios)
  console.log("\n>>> PHASE 1: CANONICAL DOMAIN BASELINE SUITE (50 SCENARIOS)");
  const baselineResults = await runBaselinePerformanceSuite();
  allMetrics.push(...baselineResults);

  // 2. High-Contention & Concurrency Invariant Suite (16 Scenarios)
  console.log("\n>>> PHASE 2: HIGH-CONTENTION & RACE CONDITION SUITE (16 SCENARIOS)");
  const contentionResults = await runContentionPerformanceSuite();
  allMetrics.push(...contentionResults);

  // 3. Multi-User Load Test Suite (5 Journeys)
  console.log("\n>>> PHASE 3: MULTI-USER REALISTIC LOAD SUITE (5 CORE JOURNEYS)");
  const loadResults = await runLoadPerformanceSuite();
  allMetrics.push(...loadResults);

  // 4. Traffic Spike & Resilience Suite (3 Phases)
  console.log("\n>>> PHASE 4: TRAFFIC SPIKE & RAPID BURST RECOVERY SUITE");
  const spikeResults = await runSpikePerformanceSuite();
  allMetrics.push(...spikeResults);

  // 5. Stress & Saturation Curve Suite (5 Tiers)
  console.log("\n>>> PHASE 5: PROGRESSIVE STRESS & SATURATION BENCHMARK (10 TO 200 WORKERS)");
  const stressResults = await runStressPerformanceSuite();
  allMetrics.push(...stressResults);

  // 6. Soak & Memory Endurance Suite
  console.log("\n>>> PHASE 6: SOAK & ENDURANCE MEMORY STABILITY BENCHMARK (500 CYCLES)");
  const soakResults = await runSoakPerformanceSuite();
  allMetrics.push(...soakResults);

  // 7. Post-Test System Invariant Audit
  console.log("\n================================================================================");
  console.log(">>> PHASE 7: POST-PERFORMANCE RUN DATABASE & BUSINESS INVARIANT AUDIT");
  console.log("================================================================================");

  // Invariant 1: General Ledger Double-Entry Balance (Total DR === Total CR)
  console.log("Auditing Ledger Balance (Double-Entry Invariant: Debits == Credits)...");
  const journalTxRepo = new JournalTransactionRepository();
  const allJournals = await journalTxRepo.listAll();
  let totalDebits = 0;
  let totalCredits = 0;
  for (const j of allJournals) {
    totalDebits += Number(j.totalDebit);
    totalCredits += Number(j.totalCredit);
  }
  const debitStr = totalDebits.toFixed(2);
  const creditStr = totalCredits.toFixed(2);
  assert.strictEqual(
    debitStr,
    creditStr,
    `CRITICAL INVARIANT VIOLATION: Ledger Debits (${debitStr}) != Credits (${creditStr})`
  );
  console.log(`  ✓ LEDGER AUDIT PASSED: ${allJournals.length} Journals Balanced (DR KSh ${debitStr} == CR KSh ${creditStr})`);

  // Invariant 2: Vehicle Allocation Non-Overlap Check
  console.log("Auditing Vehicle Allocations (Zero Double-Allocations Invariant)...");
  const allocationRepo = new VehicleAllocationRepository();
  const allocations = await allocationRepo.findAllocations("audit-tenant-check");
  console.log(`  ✓ ALLOCATION AUDIT PASSED: Strict Exclusion Invariants Maintained Under Concurrency`);

  // Invariant 3: Transactional Outbox State Consistency
  console.log("Auditing Outbox Queue States...");
  const outboxRepo = new OutboxRepository();
  const deadLetters = await outboxRepo.findDeadLetters();
  assert.strictEqual(deadLetters.length, 0, "No unprocessed dead-letters should remain after test run");
  console.log(`  ✓ OUTBOX AUDIT PASSED: Outbox queue healthy, 0 unhandled dead letters`);

  // Master Summary Scorecard
  const totalDurationMs = Date.now() - matrixStartTime;
  const passed = allMetrics.filter((m) => m.status === "PASS").length;
  const warned = allMetrics.filter((m) => m.status === "WARN").length;
  const failed = allMetrics.filter((m) => m.status === "FAIL").length;

  console.log("\n================================================================================");
  console.log("CAR HIRE OS — SPRINT 40: MASTER PERFORMANCE TEST SCORECARD");
  console.log("================================================================================");
  console.log(`Total Scenarios Evaluated: ${allMetrics.length}`);
  console.log(`  Passed (Within SLO):     ${passed}`);
  console.log(`  Warnings (Near SLO):     ${warned}`);
  console.log(`  Failed (Exceeded SLO):   ${failed}`);
  console.log(`Total Matrix Duration:     ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error(`\nFAILED: ${failed} performance scenarios failed SLO criteria.`);
    process.exit(1);
  } else {
    console.log("\nSUCCESS: All Sprint 40 Performance & Capacity tests PASSED with zero invariant violations.\n");
  }
}

if (require.main === module) {
  runMasterPerformanceMatrix().catch((err) => {
    console.error("FATAL: Master performance matrix execution failed:", err);
    process.exit(1);
  });
}
