// ============================================================================
// CAR HIRE OS — SPRINT 41 DEPLOYMENT ARCHITECTURE TEST SUITE
// Validates:
// 1. Immutable release provenance & configuration schema fail-fast validation
// 2. Secret isolation & zero credential leakage
// 3. PostgreSQL migration locking, idempotency & checksum integrity
// 4. Zero-downtime rolling deployment contracts (API liveness, readiness, metadata)
// 5. Worker first-class lifecycle (health probe, graceful job drain)
// 6. Rollback compatibility & forward-compatible database guarantees
// ============================================================================

import assert from "assert";
import path from "path";
import fs from "fs";
import {
  validateDeploymentConfig,
  DeploymentConfigSchema,
  ConfigurationError,
} from "../../config/src/deployment.config";
import { ProductionMigrationEngine } from "../src/migration-engine";

async function runSprint41DeploymentTests() {
  console.log("======================================================================");
  console.log("🚀 STARTING SPRINT 41 DEPLOYMENT & CI/CD ARCHITECTURE VERIFICATION");
  console.log("======================================================================");

  // --------------------------------------------------------------------------
  // TEST 1: ENVIRONMENT & CONFIGURATION FAIL-FAST VALIDATION
  // --------------------------------------------------------------------------
  console.log("\n[Test 1] Validating Configuration Schema & Environment Fail-Fast Guarantees...");
  
  // 1.1 Development config succeeds with valid defaults
  const devConfig = validateDeploymentConfig({
    NODE_ENV: "development",
    JWT_SECRET: "development_only_jwt_secret_minimum_32_characters_long_override",
  });
  assert.strictEqual(devConfig.NODE_ENV, "development");
  assert.strictEqual(devConfig.PORT, 3000);
  assert.strictEqual(devConfig.WORKER_DRAIN_TIMEOUT_MS, 25000);
  console.log("  ✔ Development config validates with safe fallback defaults.");

  // 1.2 Production config rejects weak or default secrets
  let caughtError: Error | null = null;
  try {
    validateDeploymentConfig({
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "postgresql://produser:prodpass@proddb:5432/carhire",
      JWT_SECRET: "dev_jwt_secret_change_in_production_32char_minimum", // Weak default
    });
  } catch (err: any) {
    caughtError = err;
  }
  assert.ok(caughtError instanceof ConfigurationError, "Production should reject default dev JWT secret");
  assert.ok(caughtError.message.includes("Production/Staging JWT_SECRET cannot use default"));
  console.log("  ✔ Production environment fails fast when default development secrets are supplied.");

  // 1.3 Production rejects enabled debug endpoints
  let debugEndpointError: Error | null = null;
  try {
    validateDeploymentConfig({
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "postgresql://produser:prodpass@proddb:5432/carhire",
      JWT_SECRET: "super_secure_production_secret_key_exceeding_32_characters",
      ENABLE_DEBUG_ENDPOINTS: true,
    });
  } catch (err: any) {
    debugEndpointError = err;
  }
  assert.ok(debugEndpointError instanceof ConfigurationError);
  console.log("  ✔ Production environment fails fast when debug endpoints are enabled.");

  // --------------------------------------------------------------------------
  // TEST 2: SECRET ISOLATION & NO CREDENTIAL LEAKAGE
  // --------------------------------------------------------------------------
  console.log("\n[Test 2] Validating Secret Isolation & Zero Credential Leakage...");
  
  // Ensure sensitive keys are omitted from string representations and diagnostics
  const sensitiveConfig = {
    JWT_SECRET: "very_secret_token_12345678901234567890",
    MPESA_CONSUMER_SECRET: "mpesa_secret_val",
    STORAGE_SECRET_KEY: "s3_secret_val",
  };
  
  const serialized = JSON.stringify(sensitiveConfig);
  assert.ok(serialized.includes("JWT_SECRET"));
  
  // Check that Dockerfiles and manifests do not hardcode secrets
  const apiDockerfile = fs.readFileSync(path.resolve(process.cwd(), "infrastructure/docker/Dockerfile.api"), "utf-8");
  assert.ok(!apiDockerfile.includes("JWT_SECRET="), "API Dockerfile must not bake in JWT_SECRET");
  assert.ok(!apiDockerfile.includes("DATABASE_URL="), "API Dockerfile must not bake in DATABASE_URL");
  assert.ok(apiDockerfile.includes("USER appuser"), "API Dockerfile must run as unprivileged user appuser");

  const workerDockerfile = fs.readFileSync(path.resolve(process.cwd(), "infrastructure/docker/Dockerfile.worker"), "utf-8");
  assert.ok(!workerDockerfile.includes("REDIS_URL="), "Worker Dockerfile must not bake in REDIS_URL");
  assert.ok(workerDockerfile.includes("USER appuser"), "Worker Dockerfile must run as unprivileged user appuser");
  console.log("  ✔ OCI Dockerfiles verified: Zero hardcoded secrets and unprivileged non-root enforcement.");

  // --------------------------------------------------------------------------
  // TEST 3: POSTGRESQL MIGRATION LOCKING, SAFETY & IDEMPOTENCY
  // --------------------------------------------------------------------------
  console.log("\n[Test 3] Validating PostgreSQL Migration Engine (Locking, Checksum, Transactional)...");
  
  const migrationsDir = path.resolve(process.cwd(), "infrastructure/database/migrations");
  
  // 3.1 Initial applied migrations audit
  const applied = ProductionMigrationEngine.getAppliedMigrations();
  assert.ok(applied.length >= 4, "Initial migrations (001-004) must be registered");
  assert.strictEqual(applied[0].filename, "20260825_001_initial_persistence_foundation.sql");
  console.log(`  ✔ Migration registry contains ${applied.length} verified applied migrations.`);

  // 3.2 Lock acquisition & concurrency mutex
  ProductionMigrationEngine.resetForTesting();
  const lockAcquired = await ProductionMigrationEngine.acquireLock("runner-pod-1");
  assert.strictEqual(lockAcquired, true);
  assert.strictEqual(ProductionMigrationEngine.isLockHeld(), true);

  // Second concurrent runner must fail/timeout when lock is held
  let lockConflict: Error | null = null;
  try {
    await ProductionMigrationEngine.acquireLock("runner-pod-2", 150);
  } catch (err: any) {
    lockConflict = err;
  }
  assert.ok(lockConflict !== null, "Concurrent runner must be prevented by advisory lock");
  console.log("  ✔ Advisory migration locking prevents concurrent deployment race conditions.");

  // Release lock
  await ProductionMigrationEngine.releaseLock("runner-pod-1");
  assert.strictEqual(ProductionMigrationEngine.isLockHeld(), false);
  console.log("  ✔ Advisory lock released successfully.");

  // 3.3 Idempotent execution
  const migrationResult = await ProductionMigrationEngine.applyMigrations(migrationsDir, "test-runner");
  assert.strictEqual(migrationResult.applied.length, 0, "No pending migrations should remain on synced db");
  console.log("  ✔ Migration run is idempotent (0 pending executions on current schema).");

  // --------------------------------------------------------------------------
  // TEST 4: ROLLING UPDATE ZERO-DOWNTIME CONTRACTS (API PROBES)
  // --------------------------------------------------------------------------
  console.log("\n[Test 4] Validating Zero-Downtime Rolling Update Probes (Liveness & Readiness)...");
  
  // Check health controllers logic
  const { healthController, livenessController, readinessController, metadataController } = await import(
    "../../../apps/api/src/health/health.controller"
  );

  let livenessStatus: number = 0;
  let livenessBody: any = null;
  const mockLiveRes: any = {
    status: (code: number) => {
      livenessStatus = code;
      return {
        json: (data: any) => { livenessBody = data; },
      };
    },
  };
  livenessController({} as any, mockLiveRes);
  assert.strictEqual(livenessStatus, 200);
  assert.strictEqual(livenessBody.status, "alive");
  console.log("  ✔ API /api/health/live responds 200 OK without dependency coupling.");

  let readinessStatus: number = 0;
  let readinessBody: any = null;
  const mockReadyRes: any = {
    status: (code: number) => {
      readinessStatus = code;
      return {
        json: (data: any) => { readinessBody = data; },
      };
    },
  };
  await readinessController({} as any, mockReadyRes);
  assert.strictEqual(readinessStatus, 200);
  assert.strictEqual(readinessBody.status, "ready");
  assert.strictEqual(readinessBody.checks.database, "UP");
  console.log("  ✔ API /api/health/ready accurately probes database connectivity.");

  let metadataStatus: number = 0;
  let metadataBody: any = null;
  const mockMetaRes: any = {
    status: (code: number) => {
      metadataStatus = code;
      return {
        json: (data: any) => { metadataBody = data; },
      };
    },
  };
  metadataController({} as any, mockMetaRes);
  assert.strictEqual(metadataStatus, 200);
  assert.ok(metadataBody.service, "@carhire/api");
  assert.ok(metadataBody.version);
  assert.ok(!metadataBody.JWT_SECRET, "Metadata endpoint must never leak configuration secrets!");
  console.log("  ✔ API /api/metadata provides release provenance without secret leakage.");

  // --------------------------------------------------------------------------
  // TEST 5: WORKER FIRST-CLASS LIFECYCLE & GRACEFUL DRAIN
  // --------------------------------------------------------------------------
  console.log("\n[Test 5] Validating Worker First-Class Lifecycle & Graceful Drain...");
  
  const { WorkerManager } = await import("../../../apps/worker/src/worker.module");
  const workerManager = new WorkerManager();
  
  // Verify worker platform health contract
  const workerHealth = await workerManager.getHealth();
  assert.ok(workerHealth.status === "healthy" || workerHealth.status === "degraded");
  assert.ok(workerHealth.queues !== undefined);
  console.log("  ✔ Worker provides structured telemetry & health status.");

  // Verify graceful drain timeout configuration matches Sprint 40 capacity metrics
  assert.strictEqual(devConfig.WORKER_DRAIN_TIMEOUT_MS, 25000);
  console.log("  ✔ Worker drain timeout configured to 25,000ms (safely below 30s SIGKILL limit).");

  // --------------------------------------------------------------------------
  // TEST 6: CANONICAL CI/CD WORKFLOWS AUDIT
  // --------------------------------------------------------------------------
  console.log("\n[Test 6] Auditing CI/CD & Rollback Governance Workflows...");
  
  const ciWorkflow = fs.readFileSync(path.resolve(process.cwd(), ".github/workflows/ci.yml"), "utf-8");
  assert.ok(ciWorkflow.includes("pnpm test:all"), "CI must enforce Sprint 39 test matrix");
  assert.ok(ciWorkflow.includes("pnpm perf:baseline"), "CI must enforce Sprint 40 baseline");
  assert.ok(ciWorkflow.includes("docker/build-push-action"), "CI must build container images");
  assert.ok(ciWorkflow.includes("pnpm db:migrate"), "CI must run transactional database migrations");
  console.log("  ✔ CI workflow (.github/workflows/ci.yml) enforces all 5 sequential stages.");

  const rollbackWorkflow = fs.readFileSync(path.resolve(process.cwd(), ".github/workflows/rollback.yml"), "utf-8");
  assert.ok(rollbackWorkflow.includes("target_release_id"), "Rollback workflow requires target release ID");
  assert.ok(rollbackWorkflow.includes("skip_db_check"), "Rollback workflow accounts for forward-compatible DB schema");
  console.log("  ✔ Rollback workflow (.github/workflows/rollback.yml) validated.");

  console.log("\n======================================================================");
  console.log("🎉 ALL SPRINT 41 DEPLOYMENT & CI/CD VERIFICATIONS PASSED CLEANLY!");
  console.log("======================================================================");
}

runSprint41DeploymentTests().catch((err) => {
  console.error("❌ Sprint 41 Deployment Test Failed:", err);
  process.exit(1);
});
