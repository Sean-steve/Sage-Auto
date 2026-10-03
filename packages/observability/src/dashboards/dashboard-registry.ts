// ============================================================================
// CAR HIRE OS — DASHBOARDS-AS-CODE REGISTRY (SPRINT 42)
// Canonical dashboard specifications covering all operational & engineering domains
// ============================================================================

import { DashboardDefinition } from "../types";

export const CANONICAL_DASHBOARDS: DashboardDefinition[] = [
  {
    id: "dash-system-overview",
    title: "Car Hire OS — System Executive Overview",
    description: "High-level service degradation status, global traffic, error rates, and cluster health",
    category: "OVERVIEW",
    refreshIntervalSeconds: 15,
    widgets: [
      { id: "w-status", title: "System Degradation State", type: "stat", metricQuery: "system_degradation_state", unit: "state" },
      { id: "w-traffic", title: "Global HTTP Request Rate", type: "timeseries", metricQuery: "rate(carhire_http_requests_total[1m])", unit: "req/s" },
      { id: "w-error-rate", title: "5xx Error Percentage", type: "gauge", metricQuery: "rate(carhire_http_requests_total{status_class=\"5xx\"}[5m])", unit: "%" },
      { id: "w-active-workers", title: "Active Worker Instances", type: "stat", metricQuery: "carhire_worker_instances_active", unit: "instances" },
      { id: "w-db-pool", title: "Database Pool Waiting", type: "gauge", metricQuery: "carhire_db_pool_connections_waiting", unit: "connections" },
      { id: "w-queue-oldest", title: "Max Queue Waiting Age", type: "stat", metricQuery: "max(carhire_queue_oldest_waiting_age_seconds)", unit: "seconds" },
    ],
  },
  {
    id: "dash-api-runtime",
    title: "Car Hire OS — API & Runtime Telemetry",
    description: "HTTP endpoint latency, status codes, process CPU, memory RSS, and event loop lag",
    category: "RUNTIME",
    refreshIntervalSeconds: 15,
    widgets: [
      { id: "w-req-duration-p95", title: "HTTP Request Latency (P95)", type: "timeseries", metricQuery: "histogram_quantile(0.95, sum(rate(carhire_http_request_duration_seconds_bucket[5m])) by (le))", unit: "seconds" },
      { id: "w-req-duration-p99", title: "HTTP Request Latency (P99)", type: "timeseries", metricQuery: "histogram_quantile(0.99, sum(rate(carhire_http_request_duration_seconds_bucket[5m])) by (le))", unit: "seconds" },
      { id: "w-event-loop-lag", title: "Node.js Event Loop Lag", type: "timeseries", metricQuery: "carhire_node_eventloop_lag_seconds", unit: "seconds" },
      { id: "w-process-memory", title: "Resident Set Size (RSS)", type: "timeseries", metricQuery: "carhire_process_resident_memory_bytes / 1024 / 1024", unit: "MB" },
      { id: "w-active-reqs", title: "Active In-Flight Requests", type: "timeseries", metricQuery: "carhire_http_active_requests", unit: "requests" },
    ],
  },
  {
    id: "dash-database-postgres",
    title: "Car Hire OS — PostgreSQL Database & Pool",
    description: "Connection pool active/idle/waiting states, query latency percentiles, and transaction deadlocks",
    category: "INFRASTRUCTURE",
    refreshIntervalSeconds: 15,
    widgets: [
      { id: "w-pool-active", title: "Active Connections", type: "timeseries", metricQuery: "carhire_db_pool_connections_active", unit: "connections" },
      { id: "w-pool-idle", title: "Idle Connections", type: "timeseries", metricQuery: "carhire_db_pool_connections_idle", unit: "connections" },
      { id: "w-pool-waiting", title: "Waiting Connections", type: "timeseries", metricQuery: "carhire_db_pool_connections_waiting", unit: "connections" },
      { id: "w-query-p95", title: "Query Latency (P95)", type: "timeseries", metricQuery: "histogram_quantile(0.95, sum(rate(carhire_db_query_duration_seconds_bucket[5m])) by (le))", unit: "seconds" },
      { id: "w-deadlocks", title: "Transaction Deadlocks", type: "stat", metricQuery: "sum(carhire_db_deadlocks_total)", unit: "deadlocks" },
    ],
  },
  {
    id: "dash-redis-bullmq-queues",
    title: "Car Hire OS — Redis, Queues & Background Workers",
    description: "Redis broker latency, BullMQ queue depths, job processing durations, and dead-letter queues",
    category: "WORKERS",
    refreshIntervalSeconds: 15,
    widgets: [
      { id: "w-redis-latency", title: "Redis Ping Latency", type: "timeseries", metricQuery: "carhire_redis_latency_seconds * 1000", unit: "ms" },
      { id: "w-queue-waiting", title: "Waiting Jobs by Queue", type: "table", metricQuery: "carhire_queue_waiting_jobs", unit: "jobs" },
      { id: "w-queue-oldest", title: "Oldest Waiting Job Age", type: "timeseries", metricQuery: "carhire_queue_oldest_waiting_age_seconds", unit: "seconds" },
      { id: "w-dlq-count", title: "DLQ Entries Awaiting Replay", type: "stat", metricQuery: "sum(carhire_dlq_entries_total)", unit: "jobs" },
      { id: "w-job-failures", title: "Job Failures Total", type: "timeseries", metricQuery: "rate(carhire_queue_failed_jobs_total[5m])", unit: "fails/min" },
    ],
  },
  {
    id: "dash-payment-providers",
    title: "Car Hire OS — Payment Gateway & Webhook Operations",
    description: "M-Pesa STK push success rates, webhook signature verification health, and UNKNOWN backlog",
    category: "BUSINESS_OPERATIONS",
    refreshIntervalSeconds: 15,
    widgets: [
      { id: "w-pay-attempts", title: "Payment Attempts", type: "timeseries", metricQuery: "rate(carhire_payment_attempts_total[5m])", unit: "attempts/min" },
      { id: "w-pay-verified", title: "Verified Payments", type: "timeseries", metricQuery: "rate(carhire_payment_verified_total[5m])", unit: "verified/min" },
      { id: "w-pay-unknown", title: "Payment UNKNOWN Backlog", type: "stat", metricQuery: "sum(carhire_payment_unknown_backlog)", unit: "payments" },
      { id: "w-webhook-sig-fail", title: "Webhook Signature Failures", type: "stat", metricQuery: "sum(carhire_payment_webhook_signature_failures_total)", unit: "failures" },
      { id: "w-pay-latency-p95", title: "Processing Latency (P95)", type: "timeseries", metricQuery: "histogram_quantile(0.95, sum(rate(carhire_payment_processing_latency_seconds_bucket[5m])) by (le))", unit: "seconds" },
    ],
  },
  {
    id: "dash-notification-pipeline",
    title: "Car Hire OS — Notifications & Communication Delivery",
    description: "SMS, Email, and Push delivery success rates, queue lag, and dead-letter counts",
    category: "BUSINESS_OPERATIONS",
    refreshIntervalSeconds: 30,
    widgets: [
      { id: "w-notif-sent", title: "Notifications Sent", type: "timeseries", metricQuery: "rate(carhire_notifications_sent_total[5m])", unit: "sent/min" },
      { id: "w-notif-failed", title: "Notifications Failed", type: "timeseries", metricQuery: "rate(carhire_notifications_failed_total[5m])", unit: "failed/min" },
      { id: "w-notif-lag", title: "Delivery Queue Lag", type: "timeseries", metricQuery: "carhire_notification_queue_lag_seconds", unit: "seconds" },
    ],
  },
  {
    id: "dash-files-media",
    title: "Car Hire OS — Document Storage & Media Transcoding",
    description: "File upload scans, antivirus quarantine counts, and image processing backlog",
    category: "BUSINESS_OPERATIONS",
    refreshIntervalSeconds: 30,
    widgets: [
      { id: "w-files-pending", title: "Files Awaiting Scan", type: "gauge", metricQuery: "sum(carhire_files_scan_pending)", unit: "files" },
      { id: "w-files-quarantined", title: "Quarantined Files", type: "stat", metricQuery: "sum(carhire_files_quarantined_total)", unit: "files" },
      { id: "w-media-active", title: "Active Media Jobs", type: "gauge", metricQuery: "sum(carhire_media_processing_jobs_active)", unit: "jobs" },
    ],
  },
  {
    id: "dash-domains-routing",
    title: "Car Hire OS — Tenant Custom Domains & Routing",
    description: "SSL certificate provisioning, DNS verification wait times, and routing host error rates",
    category: "BUSINESS_OPERATIONS",
    refreshIntervalSeconds: 30,
    widgets: [
      { id: "w-domain-pending", title: "Domains Pending Validation", type: "stat", metricQuery: "sum(carhire_domain_verification_pending)", unit: "domains" },
      { id: "w-domain-errors", title: "Routing Resolution Errors", type: "timeseries", metricQuery: "rate(carhire_domain_routing_errors_total[5m])", unit: "errors/min" },
    ],
  },
  {
    id: "dash-analytics-reports",
    title: "Car Hire OS — Analytics Projections & Report Generation",
    description: "Read-model projection lag, data freshness dataAsOf, and financial report generation duration",
    category: "BUSINESS_OPERATIONS",
    refreshIntervalSeconds: 30,
    widgets: [
      { id: "w-proj-lag", title: "Analytics Projection Lag", type: "timeseries", metricQuery: "max(carhire_analytics_projection_lag_seconds)", unit: "seconds" },
      { id: "w-recon-mismatch", title: "Reconciliation Mismatches", type: "stat", metricQuery: "sum(carhire_analytics_reconciliation_mismatches_total)", unit: "mismatches" },
      { id: "w-reports-active", title: "Active Report Jobs", type: "gauge", metricQuery: "sum(carhire_reports_active_jobs)", unit: "jobs" },
    ],
  },
  {
    id: "dash-security-isolation",
    title: "Car Hire OS — Security & Tenant Isolation Audit",
    description: "Authentication failures, rate limiter triggers, and cross-tenant boundary violation blocks",
    category: "SECURITY",
    refreshIntervalSeconds: 15,
    widgets: [
      { id: "w-sec-auth-fail", title: "Auth Failures", type: "timeseries", metricQuery: "rate(carhire_security_auth_failures_total[5m])", unit: "fails/min" },
      { id: "w-sec-rate-limit", title: "Rate Limited Requests", type: "timeseries", metricQuery: "rate(carhire_security_rate_limited_total[5m])", unit: "reqs/min" },
      { id: "w-sec-isolation", title: "CRITICAL: Cross-Tenant Isolation Blocks", type: "stat", metricQuery: "sum(carhire_security_tenant_context_mismatches_total)", unit: "blocks" },
    ],
  },
  {
    id: "dash-release-deployments",
    title: "Car Hire OS — Deployment Provenance & Release Telemetry",
    description: "Active release ID, commit SHA, canary verification metrics, and deployment error deltas",
    category: "RELEASE",
    refreshIntervalSeconds: 15,
    widgets: [
      { id: "w-release-id", title: "Active Release ID", type: "stat", metricQuery: "deployment_release_id", unit: "text" },
      { id: "w-git-sha", title: "Git Commit SHA", type: "stat", metricQuery: "deployment_git_sha", unit: "text" },
      { id: "w-deploy-env", title: "Target Environment", type: "stat", metricQuery: "deployment_environment", unit: "text" },
      { id: "w-deploy-uptime", title: "Release Uptime", type: "stat", metricQuery: "deployment_uptime_seconds", unit: "seconds" },
    ],
  },
];

export class DashboardRegistry {
  private static instance: DashboardRegistry;
  private dashboards = new Map<string, DashboardDefinition>();

  private constructor() {
    for (const d of CANONICAL_DASHBOARDS) {
      this.dashboards.set(d.id, d);
    }
  }

  public static getInstance(): DashboardRegistry {
    if (!DashboardRegistry.instance) {
      DashboardRegistry.instance = new DashboardRegistry();
    }
    return DashboardRegistry.instance;
  }

  public getAll(): DashboardDefinition[] {
    return Array.from(this.dashboards.values());
  }

  public getById(id: string): DashboardDefinition | undefined {
    return this.dashboards.get(id);
  }
}
