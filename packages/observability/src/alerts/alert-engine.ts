// ============================================================================
// CAR HIRE OS — ALERT RULES ENGINE & OPERATIONAL DISPATCH (SPRINT 42)
// Actionable alert catalog, candidate operational targets, flapping prevention & runbook linkage
// ============================================================================

import { AlertRule, ActiveAlert } from "../types";

export const CANONICAL_ALERT_RULES: AlertRule[] = [
  {
    id: "alert-api-5xx-surge",
    name: "API Server Error Rate Surge",
    description: "HTTP 5xx responses exceed acceptable candidate operational threshold",
    severity: "SEV-1_CRITICAL",
    category: "API",
    metricName: "carhire_http_requests_total",
    condition: "GT",
    threshold: 10, // 10 errors in evaluation window
    evaluationWindowSeconds: 60,
    flappingHysteresisCycles: 2,
    isCandidateTarget: true,
    candidateTargetLabel: "CANDIDATE OPERATIONAL TARGET (< 0.1% 5xx error rate)",
    owner: "PLATFORM_OPERATIONS",
    runbookRef: "RB-001-API-5XX-SURGE",
    diagnosticSteps: [
      "Check recent structured logs for error context and stack traces",
      "Inspect database pool saturation and Redis connection state",
      "Verify whether errors are concentrated on a specific route or cluster",
      "Check recent deployments or configuration changes in release history",
    ],
    remediationAction: "If deployment correlated, initiate zero-loss rollback to previous release artifact.",
  },
  {
    id: "alert-db-pool-exhaustion",
    name: "PostgreSQL Connection Pool Exhaustion",
    description: "Database connection pool has zero idle connections and waiting queue is growing",
    severity: "SEV-1_CRITICAL",
    category: "DATABASE",
    metricName: "carhire_db_pool_connections_waiting",
    condition: "GT",
    threshold: 5,
    evaluationWindowSeconds: 30,
    flappingHysteresisCycles: 2,
    isCandidateTarget: true,
    candidateTargetLabel: "CANDIDATE OPERATIONAL TARGET (0 waiting pool connections)",
    owner: "DATABASE_ENGINEERING",
    runbookRef: "RB-002-DB-POOL-EXHAUSTION",
    diagnosticSteps: [
      "Inspect pg_stat_activity for long-running transactions or unindexed full scans",
      "Check for unreleased connection leaks in recent background jobs",
      "Check database CPU and disk I/O metrics on PostgreSQL instance",
    ],
    remediationAction: "Terminate long-running orphaned queries or safely increase pool max within server capacity.",
  },
  {
    id: "alert-db-deadlock-spike",
    name: "Database Transaction Deadlocks Detected",
    description: "High rate of transaction deadlocks between concurrent booking/rental updates",
    severity: "SEV-2_HIGH",
    category: "DATABASE",
    metricName: "carhire_db_deadlocks_total",
    condition: "GT",
    threshold: 2,
    evaluationWindowSeconds: 120,
    flappingHysteresisCycles: 1,
    isCandidateTarget: true,
    candidateTargetLabel: "CANDIDATE OPERATIONAL TARGET (0 deadlocks per minute)",
    owner: "DATABASE_ENGINEERING",
    runbookRef: "RB-003-DB-DEADLOCK-SPIKE",
    diagnosticSteps: [
      "Query PostgreSQL deadlock log entries to inspect colliding queries",
      "Identify concurrent booking/rental lock order discrepancies",
    ],
    remediationAction: "Ensure queries lock rows in canonical ascending ID order; verify advisory lock discipline.",
  },
  {
    id: "alert-redis-disconnected",
    name: "Redis Broker Offline / Partitioned",
    description: "Redis connection dropped; background queues operating in degraded or fallback mode",
    severity: "SEV-1_CRITICAL",
    category: "REDIS_QUEUE",
    metricName: "carhire_redis_connected",
    condition: "EQ",
    threshold: 0,
    evaluationWindowSeconds: 15,
    flappingHysteresisCycles: 2,
    isCandidateTarget: false,
    owner: "PLATFORM_OPERATIONS",
    runbookRef: "RB-005-REDIS-PARTITION",
    diagnosticSteps: [
      "Check Redis container / managed cluster health and network connectivity",
      "Verify TLS certificate and authentication credentials",
    ],
    remediationAction: "Restart Redis node or failover to standby replica; verify worker reconnect.",
  },
  {
    id: "alert-queue-age-breach",
    name: "Queue Latency / Oldest Job Age SLA Breach",
    description: "Oldest waiting job exceeds acceptable processing latency window",
    severity: "SEV-2_HIGH",
    category: "REDIS_QUEUE",
    metricName: "carhire_queue_oldest_waiting_age_seconds",
    condition: "GT",
    threshold: 120, // 2 minutes
    evaluationWindowSeconds: 60,
    flappingHysteresisCycles: 2,
    isCandidateTarget: true,
    candidateTargetLabel: "CANDIDATE OPERATIONAL TARGET (< 60s queue wait time)",
    owner: "PLATFORM_OPERATIONS",
    runbookRef: "RB-007-QUEUE-AGE-BREACH",
    diagnosticSteps: [
      "Check number of active worker nodes and worker CPU/memory saturation",
      "Inspect queue depth across commands, events, and notifications",
    ],
    remediationAction: "Scale up worker replica instances or increase WORKER_CONCURRENCY setting.",
  },
  {
    id: "alert-worker-absence",
    name: "Critical Background Worker Cluster Absence",
    description: "Zero active background worker instances registered for more than 30 seconds",
    severity: "SEV-1_CRITICAL",
    category: "WORKERS",
    metricName: "carhire_worker_instances_active",
    condition: "LTE",
    threshold: 0,
    evaluationWindowSeconds: 30,
    flappingHysteresisCycles: 2,
    isCandidateTarget: false,
    owner: "PLATFORM_OPERATIONS",
    runbookRef: "RB-009-WORKER-ABSENCE",
    diagnosticSteps: [
      "Check worker container logs for exit codes or fatal OOM restarts",
      "Verify Redis connectivity and BullMQ lock acquisitions",
    ],
    remediationAction: "Restart worker container instances; verify graceful worker startup.",
  },
  {
    id: "alert-outbox-lag-breach",
    name: "Outbox Event Relay Lagging",
    description: "Undispatched transactional outbox events accumulating beyond acceptable threshold",
    severity: "SEV-2_HIGH",
    category: "WORKERS",
    metricName: "carhire_outbox_undispatched_events",
    condition: "GT",
    threshold: 50,
    evaluationWindowSeconds: 60,
    flappingHysteresisCycles: 2,
    isCandidateTarget: true,
    candidateTargetLabel: "CANDIDATE OPERATIONAL TARGET (< 10 undispatched outbox events)",
    owner: "PLATFORM_OPERATIONS",
    runbookRef: "RB-011-OUTBOX-LAG",
    diagnosticSteps: [
      "Check sched.outbox-relay job execution status in worker registry",
      "Verify whether event transport message broker is rejecting publishes",
    ],
    remediationAction: "Trigger outbox batch replay command via Platform Admin command center.",
  },
  {
    id: "alert-payment-unknown-backlog",
    name: "Payment UNKNOWN Backlog Accumulation",
    description: "Transactions stuck in UNKNOWN status exceeding threshold awaiting manual or automated reconciliation",
    severity: "SEV-2_HIGH",
    category: "PAYMENTS",
    metricName: "carhire_payment_unknown_backlog",
    condition: "GT",
    threshold: 5,
    evaluationWindowSeconds: 180,
    flappingHysteresisCycles: 2,
    isCandidateTarget: true,
    candidateTargetLabel: "CANDIDATE OPERATIONAL TARGET (< 2 unknown payments)",
    owner: "BILLING_FINANCE",
    runbookRef: "RB-014-PAYMENT-UNKNOWN-BACKLOG",
    diagnosticSteps: [
      "Check M-Pesa / payment gateway query API availability",
      "Inspect webhook delivery latency and inbound payload errors",
    ],
    remediationAction: "Trigger canonical payment status query reconciliation job via Finance control plane.",
  },
  {
    id: "alert-payment-webhook-signature-attack",
    name: "Payment Webhook Signature Failure Surge",
    description: "Spike in rejected payment provider webhooks due to invalid signature or secret drift",
    severity: "SEV-1_CRITICAL",
    category: "PAYMENTS",
    metricName: "carhire_payment_webhook_signature_failures_total",
    condition: "GT",
    threshold: 3,
    evaluationWindowSeconds: 60,
    flappingHysteresisCycles: 1,
    isCandidateTarget: false,
    owner: "SECURITY_OPERATIONS",
    runbookRef: "RB-013-PAYMENT-WEBHOOK-SIGNATURE-SURGE",
    diagnosticSteps: [
      "Check source IPs of rejected webhook requests against provider IP ranges",
      "Verify whether payment gateway secret was recently rotated in secret manager",
    ],
    remediationAction: "If credential drift, update runtime secret; if malicious spoofing, block source IPs at WAF.",
  },
  {
    id: "alert-security-tenant-mismatch",
    name: "Cross-Tenant Context Isolation Breach Blocked",
    description: "CRITICAL SECURITY: Request attempted to access cross-tenant data across unauthorized boundaries",
    severity: "SEV-1_CRITICAL",
    category: "SECURITY",
    metricName: "carhire_security_tenant_context_mismatches_total",
    condition: "GT",
    threshold: 0, // Zero tolerance
    evaluationWindowSeconds: 15,
    flappingHysteresisCycles: 1,
    isCandidateTarget: false,
    owner: "SECURITY_OPERATIONS",
    runbookRef: "RB-022-TENANT-ISOLATION-MISMATCH",
    diagnosticSteps: [
      "Inspect blocked request trace, user ID, tenant ID, and targeted resource ID",
      "Check if user session was hijacked or if client-side state is desynchronized",
    ],
    remediationAction: "Revoke affected user session immediately; verify tenant boundary enforcement.",
  },
];

export class AlertEngine {
  private static instance: AlertEngine;
  private rules: AlertRule[] = [...CANONICAL_ALERT_RULES];
  private activeAlerts = new Map<string, ActiveAlert>();
  private breachCounts = new Map<string, number>();

  private constructor() {}

  public static getInstance(): AlertEngine {
    if (!AlertEngine.instance) {
      AlertEngine.instance = new AlertEngine();
    }
    return AlertEngine.instance;
  }

  public getRules(): AlertRule[] {
    return [...this.rules];
  }

  public getActiveAlerts(): ActiveAlert[] {
    return Array.from(this.activeAlerts.values()).filter((a) => a.status === "FIRING");
  }

  /**
   * Evaluates a single metric value against registered alert rules with hysteresis
   */
  public evaluateMetric(metricName: string, currentValue: number): ActiveAlert | null {
    const matchingRules = this.rules.filter((r) => r.metricName === metricName);
    let triggeredAlert: ActiveAlert | null = null;

    for (const rule of matchingRules) {
      let isBreached = false;
      switch (rule.condition) {
        case "GT":
          isBreached = currentValue > rule.threshold;
          break;
        case "GTE":
          isBreached = currentValue >= rule.threshold;
          break;
        case "LT":
          isBreached = currentValue < rule.threshold;
          break;
        case "LTE":
          isBreached = currentValue <= rule.threshold;
          break;
        case "EQ":
          isBreached = currentValue === rule.threshold;
          break;
        case "NEQ":
          isBreached = currentValue !== rule.threshold;
          break;
      }

      const currentCycles = (this.breachCounts.get(rule.id) || 0) + (isBreached ? 1 : 0);

      if (isBreached) {
        this.breachCounts.set(rule.id, currentCycles);

        // Flapping hysteresis: only fire once cycles requirement is met
        if (currentCycles >= rule.flappingHysteresisCycles) {
          const alert: ActiveAlert = {
            id: `alert-${rule.id}-${Date.now()}`,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            category: rule.category,
            currentValue,
            threshold: rule.threshold,
            message: `${rule.name}: Current value (${currentValue}) ${rule.condition} threshold (${rule.threshold})`,
            owner: rule.owner,
            runbookRef: rule.runbookRef,
            diagnosticSteps: rule.diagnosticSteps,
            remediationAction: rule.remediationAction,
            isCandidateTarget: rule.isCandidateTarget,
            firstTriggeredAt: this.activeAlerts.get(rule.id)?.firstTriggeredAt || new Date().toISOString(),
            lastEvaluatedAt: new Date().toISOString(),
            evaluationCyclesBreached: currentCycles,
            status: "FIRING",
          };

          this.activeAlerts.set(rule.id, alert);
          triggeredAlert = alert;
        }
      } else {
        // Condition resolved
        this.breachCounts.set(rule.id, 0);
        const existing = this.activeAlerts.get(rule.id);
        if (existing && existing.status === "FIRING") {
          existing.status = "RESOLVED";
          existing.lastEvaluatedAt = new Date().toISOString();
        }
      }
    }

    return triggeredAlert;
  }

  public reset(): void {
    this.activeAlerts.clear();
    this.breachCounts.clear();
  }
}
