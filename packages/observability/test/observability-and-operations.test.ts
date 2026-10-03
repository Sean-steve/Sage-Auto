// ============================================================================
// CAR HIRE OS — SPRINT 42 OBSERVABILITY & OPERATIONS VALIDATION SUITE
// Automated verification for logging, redaction, tracing, metrics, health, alerts & runbooks
// ============================================================================

import assert from "assert";
import {
  sanitizeTelemetryData,
  sanitizeLogString,
  isSensitiveKey,
  REDACTED_MASK,
  extractHttpContext,
  formatTraceparent,
  parseTraceparent,
  runWithTelemetryContext,
  getTelemetryContext,
  StructuredLogger,
  Tracer,
  MetricRegistry,
  SystemMetrics,
  HealthService,
  AlertEngine,
  CANONICAL_ALERT_RULES,
  DashboardRegistry,
  CANONICAL_DASHBOARDS,
  RunbookRegistry,
  CANONICAL_RUNBOOKS,
} from "../src/index";

async function runSprint42TestSuite() {
  console.log("================================================================================");
  console.log("CAR HIRE OS — SPRINT 42 OBSERVABILITY & OPERATIONS TEST SUITE");
  console.log("================================================================================");

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passedTests++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}`);
      throw err;
    }
  }

  async function testAsync(name: string, fn: () => Promise<void>) {
    totalTests++;
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passedTests++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err?.message || err}`);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // 1. REDACTION & LOG INJECTION DEFENSE
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 1: Redaction Engine & Injection Defense ---");

  test("1.1 Sensitive key detection matches passwords, tokens, and secrets", () => {
    assert.strictEqual(isSensitiveKey("password"), true);
    assert.strictEqual(isSensitiveKey("api_key"), true);
    assert.strictEqual(isSensitiveKey("jwtToken"), true);
    assert.strictEqual(isSensitiveKey("cardNumber"), true);
    assert.strictEqual(isSensitiveKey("cvv"), true);
    assert.strictEqual(isSensitiveKey("authorization"), true);
    assert.strictEqual(isSensitiveKey("vehicle_plate"), false);
  });

  test("1.2 Recursive telemetry redaction masks secret values", () => {
    const raw = {
      user: "john@example.com",
      credentials: {
        password: "SuperSecretPassword123!",
        pin: "4321",
        apiKey: "sk-live-9921471029",
      },
      headers: {
        authorization: "Bearer eyJhbGciOi...",
      },
      cleanData: "visible-value",
    };

    const sanitized = sanitizeTelemetryData(raw) as any;
    assert.strictEqual(sanitized.credentials.password, REDACTED_MASK);
    assert.strictEqual(sanitized.credentials.pin, REDACTED_MASK);
    assert.strictEqual(sanitized.credentials.apiKey, REDACTED_MASK);
    assert.strictEqual(sanitized.headers.authorization, REDACTED_MASK);
    assert.strictEqual(sanitized.cleanData, "visible-value");
  });

  test("1.3 Log injection protection strips newlines and carriage returns", () => {
    const maliciousInput = "User logged in\n[ERROR] Fake forged admin log\r\nExploit";
    const cleaned = sanitizeLogString(maliciousInput);
    assert.strictEqual(cleaned.includes("\n"), false);
    assert.strictEqual(cleaned.includes("\r"), false);
    assert.strictEqual(cleaned, "User logged in [ERROR] Fake forged admin log  Exploit");
  });

  // --------------------------------------------------------------------------
  // 2. CONTEXT PROPAGATION & W3C TRACEPARENT
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 2: Context Propagation & W3C Traceparent ---");

  test("2.1 Traceparent serialization and deserialization", () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const spanId = "00f067aa0ba902b7";
    const header = formatTraceparent(traceId, spanId);
    assert.strictEqual(header, `00-${traceId}-${spanId}-01`);

    const parsed = parseTraceparent(header);
    assert.ok(parsed);
    assert.strictEqual(parsed?.traceId, traceId);
    assert.strictEqual(parsed?.spanId, spanId);
    assert.strictEqual(parsed?.sampled, true);
  });

  await testAsync("2.2 AsyncLocalStorage ambient context propagation", async () => {
    const context = {
      correlationId: "corr-test-12345",
      traceId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      spanId: "1122334455667788",
      tenantId: "tenant-nairobi",
    };

    await runWithTelemetryContext(context, async () => {
      const ambient = getTelemetryContext();
      assert.strictEqual(ambient?.correlationId, "corr-test-12345");
      assert.strictEqual(ambient?.traceId, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");
      assert.strictEqual(ambient?.tenantId, "tenant-nairobi");
    });
  });

  // --------------------------------------------------------------------------
  // 3. STRUCTURED LOGGER
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 3: Structured Logger ---");

  test("3.1 StructuredLogger produces JSON with ambient context and buffers diagnostics", () => {
    const logger = new StructuredLogger("BillingModule");
    const testContext = {
      correlationId: "corr-logger-test",
      traceId: "99887766554433221100aabbccddeeff",
      spanId: "aabbccddeeff0011",
      tenantId: "tenant-safari",
    };

    runWithTelemetryContext(testContext, () => {
      logger.info("Invoice generated successfully", { invoiceId: "INV-001", amount: 25000 });
      const recent = StructuredLogger.getRecentLogs(5);
      assert.ok(recent.length > 0);
      const latest = recent[recent.length - 1];
      assert.strictEqual(latest.context, "BillingModule");
      assert.strictEqual(latest.correlationId, "corr-logger-test");
      assert.strictEqual(latest.traceId, "99887766554433221100aabbccddeeff");
      assert.ok(latest.tenantHash, "StructuredLogger must emit pseudonymous tenantHash, not plain tenantId");
      assert.strictEqual(latest.message, "Invoice generated successfully");
    });
  });

  // --------------------------------------------------------------------------
  // 4. DISTRIBUTED TRACER
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 4: Distributed Tracer ---");

  await testAsync("4.1 Tracer.withSpan executes child span and maintains trace continuity", async () => {
    const tracer = Tracer.getInstance();
    const traceId = "c1c2c3c4c5c6c7c8c9c0c1c2c3c4c5c6";

    await runWithTelemetryContext({ traceId, correlationId: "corr-trace-parent" }, async () => {
      await tracer.withSpan("calculate-settlement", async (span) => {
        span.setTag("status", "completed");
        assert.strictEqual(span.traceId, traceId);
        assert.ok(span.spanId);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 5. METRIC REGISTRY & CARDINALITY DEFENSE
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 5: Metric Registry & Cardinality Defense ---");

  test("5.1 Canonical metric naming prefix enforcement", () => {
    const registry = MetricRegistry.getInstance();
    // Non-canonical metric should throw
    assert.throws(() => {
      registry.counter("invalid_prefix_metric", "Help message");
    }, /canonical prefix 'carhire_\*'/);
  });

  test("5.2 High-cardinality label key rejection", () => {
    const registry = MetricRegistry.getInstance();
    assert.throws(() => {
      registry.counter("carhire_test_cardinality_fail", "Help", ["tenantId", "status"]);
    }, /High-cardinality label key 'tenantId' is strictly forbidden/);
  });

  test("5.3 High-cardinality label value rejection (UUID / email)", () => {
    const registry = MetricRegistry.getInstance();
    const counter = registry.counter("carhire_test_val_cardinality", "Help", ["status"]);
    assert.throws(() => {
      counter.inc({ status: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d" });
    }, /High-cardinality UUID\/Hash value detected/);
  });

  test("5.4 Metric counters, gauges, and Prometheus exposition formatting", () => {
    const registry = MetricRegistry.getInstance();
    const testCounter = registry.counter("carhire_test_events_total", "Test counter", ["event_type"]);
    testCounter.inc({ event_type: "booking_confirmed" }, 5);

    const testGauge = registry.gauge("carhire_test_active_items", "Test gauge", ["pool"]);
    testGauge.set({ pool: "default" }, 42);

    const prometheusOutput = registry.exportPrometheus();
    assert.ok(prometheusOutput.includes("# TYPE carhire_test_events_total counter"));
    assert.ok(prometheusOutput.includes('carhire_test_events_total{event_type="booking_confirmed"} 5'));
    assert.ok(prometheusOutput.includes("# TYPE carhire_test_active_items gauge"));
    assert.ok(prometheusOutput.includes('carhire_test_active_items{pool="default"} 42'));
  });

  // --------------------------------------------------------------------------
  // 6. HEALTH & 3-TIER DEGRADATION ENGINE
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 6: Health & 3-Tier Degradation Engine ---");

  test("6.1 Liveness check returns alive and uptime", () => {
    const health = HealthService.getInstance();
    const live = health.checkLiveness();
    assert.strictEqual(live.status, "alive");
    assert.ok(live.uptimeSeconds >= 0);
  });

  await testAsync("6.2 Comprehensive health report evaluates healthy baseline", async () => {
    const health = HealthService.getInstance();
    health.registerCheckOptions({
      checkDatabase: async () => ({ isReady: true, latencyMs: 2 }),
      checkRedis: async () => ({ isConnected: true, latencyMs: 1 }),
      checkWorkers: async () => ({ workersRunning: 2 }),
      checkQueues: async () => ({ maxOldestAgeSeconds: 10, maxWaitingCount: 5 }),
    });

    const report = await health.getComprehensiveReport();
    assert.strictEqual(report.status, "HEALTHY");
    assert.strictEqual(report.checks.liveness, true);
    assert.strictEqual(report.checks.readiness, true);
    assert.strictEqual(report.checks.database.status, "UP");
  });

  await testAsync("6.3 3-Tier classification transitions to UNAVAILABLE when database is DOWN", async () => {
    const health = HealthService.getInstance();
    health.registerCheckOptions({
      checkDatabase: async () => ({ isReady: false, latencyMs: -1, error: "Connection refused" }),
    });

    const report = await health.getComprehensiveReport();
    assert.strictEqual(report.status, "UNAVAILABLE");
    assert.strictEqual(report.checks.database.status, "DOWN");
  });

  // --------------------------------------------------------------------------
  // 7. ALERT ENGINE & FLAPPING HYSTERESIS
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 7: Alert Engine & Flapping Hysteresis ---");

  test("7.1 Canonical alert catalog has 10 rules with candidate operational targets", () => {
    const alertEngine = AlertEngine.getInstance();
    const rules = alertEngine.getRules();
    assert.strictEqual(rules.length, 10);
    const candidateRules = rules.filter((r) => r.isCandidateTarget);
    assert.ok(candidateRules.length >= 6);
  });

  test("7.2 Flapping hysteresis prevents premature alert firing on single transient spike", () => {
    const alertEngine = AlertEngine.getInstance();
    alertEngine.reset();

    // Rule: carhire_http_requests_total threshold 10, hysteresis 2 cycles
    // Cycle 1: threshold breached (15 > 10)
    const alertCycle1 = alertEngine.evaluateMetric("carhire_http_requests_total", 15);
    assert.strictEqual(alertCycle1, null, "Alert must not fire on first breach cycle due to hysteresis");

    // Cycle 2: threshold breached again (16 > 10)
    const alertCycle2 = alertEngine.evaluateMetric("carhire_http_requests_total", 16);
    assert.ok(alertCycle2, "Alert must fire after hysteresis requirement is met");
    assert.strictEqual(alertCycle2?.ruleId, "alert-api-5xx-surge");
    assert.strictEqual(alertCycle2?.status, "FIRING");

    // Recovery cycle: metric returns below threshold (2 < 10)
    alertEngine.evaluateMetric("carhire_http_requests_total", 2);
    const active = alertEngine.getActiveAlerts();
    assert.strictEqual(active.length, 0, "Alert must automatically transition out of active firing state");
  });

  // --------------------------------------------------------------------------
  // 8. DASHBOARDS-AS-CODE REGISTRY
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 8: Dashboards-as-Code Registry ---");

  test("8.1 All 11 canonical dashboards are registered", () => {
    const dashRegistry = DashboardRegistry.getInstance();
    const all = dashRegistry.getAll();
    assert.strictEqual(all.length, 11);

    const requiredDashboards = [
      "dash-system-overview",
      "dash-api-runtime",
      "dash-database-postgres",
      "dash-redis-bullmq-queues",
      "dash-payment-providers",
      "dash-notification-pipeline",
      "dash-files-media",
      "dash-domains-routing",
      "dash-analytics-reports",
      "dash-security-isolation",
      "dash-release-deployments",
    ];

    for (const dashId of requiredDashboards) {
      assert.ok(dashRegistry.getById(dashId), `Missing dashboard: ${dashId}`);
    }
  });

  // --------------------------------------------------------------------------
  // 9. OPERATIONAL RUNBOOKS CATALOG
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 9: Operational Runbook Catalog ---");

  test("9.1 All 25 canonical runbooks are registered with strict prohibitions and workflows", () => {
    const runbookRegistry = RunbookRegistry.getInstance();
    const all = runbookRegistry.getAll();
    assert.strictEqual(all.length, 25);

    for (const rb of all) {
      assert.ok(rb.id.startsWith("RB-"), `Invalid runbook ID format: ${rb.id}`);
      assert.ok(rb.title.length > 0, `Missing title on ${rb.id}`);
      assert.ok(rb.symptoms.length > 0, `Missing symptoms on ${rb.id}`);
      assert.ok(rb.strictProhibitions.length > 0, `Missing strict prohibitions on ${rb.id}`);
      assert.ok(rb.mitigationSteps.length > 0, `Missing mitigation steps on ${rb.id}`);
      assert.ok(rb.verificationProcedure.length > 0, `Missing verification on ${rb.id}`);
    }
  });

  console.log("\n================================================================================");
  console.log(`SPRINT 42 TEST SUITE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================");
}

runSprint42TestSuite().catch((err) => {
  console.error("Test execution terminated with error:", err);
  process.exit(1);
});
