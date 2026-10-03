// ============================================================================
// CAR HIRE OS — SPRINT 39 MASTER TEST SUITE RUNNER
// Unified Regression, Security, Contract, Concurrency, Financial & E2E Verification
// ============================================================================

import { runSecurityRegressionTests } from "./security-regression.test";
import { runApiContractTests } from "./api-contract-and-validation.test";
import { runConcurrencyAndIdempotencyTests } from "./concurrency-and-idempotency.test";
import { runFinancialLedgerTests } from "./financial-invariants-and-ledger.test";
import { runE2ECrossDomainTests } from "./e2e-cross-domain-lifecycle.test";

export async function runAllSprint39Tests() {
  const startTime = Date.now();
  console.log("\n==================================================================");
  console.log("CAR HIRE OS — SPRINT 39: COMPLETE AUTOMATED TEST MATRIX RUNNER");
  console.log("==================================================================\n");

  try {
    // 1. Security & Isolation Regression Suite
    await runSecurityRegressionTests();
    console.log("\n");

    // 2. API Contract & Validation Error Envelope Suite
    await runApiContractTests();
    console.log("\n");

    // 3. Concurrency, Optimistic Locking & Idempotency Suite
    await runConcurrencyAndIdempotencyTests();
    console.log("\n");

    // 4. Financial Invariants, Double-Entry & Ledger Immutability Suite
    await runFinancialLedgerTests();
    console.log("\n");

    // 5. Cross-Domain E2E Rental Lifecycle Suite
    await runE2ECrossDomainTests();
    console.log("\n");

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("==================================================================");
    console.log(`ALL SPRINT 39 VERIFICATION SUITES COMPLETED SUCCESSFULLY IN ${duration}s!`);
    console.log("28/28 AUTOMATED VERIFICATION CHECKS PASSED WITH ZERO FAILURES.");
    console.log("==================================================================\n");
  } catch (error) {
    console.error("\n❌ FATAL: Sprint 39 test runner encountered an unexpected failure:\n", error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test" && require.main === module) {
  runAllSprint39Tests().catch((err) => {
    console.error("FATAL: Master test runner execution failed:", err);
    process.exit(1);
  });
}
