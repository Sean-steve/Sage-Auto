// ============================================================================
// CAR HIRE OS — CANONICAL SYSTEM & DOMAIN METRIC DEFINITIONS (SPRINT 42)
// Strictly bounded-cardinality standard metric definitions across all platform subsystems
// ============================================================================

import { MetricRegistry } from "./metric-registry";

export class SystemMetrics {
  private static reg = MetricRegistry.getInstance();

  // --------------------------------------------------------------------------
  // 1. HTTP API & NETWORK METRICS
  // --------------------------------------------------------------------------
  public static readonly httpRequestsTotal = SystemMetrics.reg.counter(
    "carhire_http_requests_total",
    "Total HTTP requests received by status code class and route group",
    ["method", "status_class", "route_group"]
  );

  public static readonly httpRequestDurationSeconds = SystemMetrics.reg.histogram(
    "carhire_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "status_class", "route_group"],
    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  );

  public static readonly httpActiveRequests = SystemMetrics.reg.gauge(
    "carhire_http_active_requests",
    "Current active in-flight HTTP requests",
    ["service"]
  );

  // --------------------------------------------------------------------------
  // 2. RUNTIME & PROCESS SATURATION
  // --------------------------------------------------------------------------
  public static readonly processCpuSecondsTotal = SystemMetrics.reg.counter(
    "carhire_process_cpu_seconds_total",
    "Total user and system CPU time spent in seconds",
    ["mode"]
  );

  public static readonly processResidentMemoryBytes = SystemMetrics.reg.gauge(
    "carhire_process_resident_memory_bytes",
    "Resident Set Size (RSS) memory in bytes",
    ["service"]
  );

  public static readonly processHeapBytes = SystemMetrics.reg.gauge(
    "carhire_process_heap_bytes",
    "Node.js V8 heap used in bytes",
    ["service", "type"]
  );

  public static readonly eventLoopLagSeconds = SystemMetrics.reg.gauge(
    "carhire_node_eventloop_lag_seconds",
    "Current Node.js event loop delay in seconds",
    ["service"]
  );

  // --------------------------------------------------------------------------
  // 3. POSTGRESQL & DATABASE POOL METRICS
  // --------------------------------------------------------------------------
  public static readonly dbPoolConnectionsActive = SystemMetrics.reg.gauge(
    "carhire_db_pool_connections_active",
    "Number of active in-use PostgreSQL connections in pool",
    ["pool_name"]
  );

  public static readonly dbPoolConnectionsIdle = SystemMetrics.reg.gauge(
    "carhire_db_pool_connections_idle",
    "Number of idle PostgreSQL connections available in pool",
    ["pool_name"]
  );

  public static readonly dbPoolConnectionsWaiting = SystemMetrics.reg.gauge(
    "carhire_db_pool_connections_waiting",
    "Number of queued requests waiting for a database connection",
    ["pool_name"]
  );

  public static readonly dbQueryDurationSeconds = SystemMetrics.reg.histogram(
    "carhire_db_query_duration_seconds",
    "PostgreSQL query execution latency in seconds",
    ["operation_type"],
    [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 3]
  );

  public static readonly dbDeadlocksTotal = SystemMetrics.reg.counter(
    "carhire_db_deadlocks_total",
    "Total PostgreSQL transaction deadlocks encountered",
    ["domain"]
  );

  // --------------------------------------------------------------------------
  // 4. REDIS & CACHE METRICS
  // --------------------------------------------------------------------------
  public static readonly redisConnected = SystemMetrics.reg.gauge(
    "carhire_redis_connected",
    "Redis connection state (1 for connected, 0 for disconnected)",
    ["instance"]
  );

  public static readonly redisLatencySeconds = SystemMetrics.reg.gauge(
    "carhire_redis_latency_seconds",
    "Measured Redis ping round-trip latency in seconds",
    ["instance"]
  );

  public static readonly redisCommandErrorsTotal = SystemMetrics.reg.counter(
    "carhire_redis_command_errors_total",
    "Total Redis execution or connection errors",
    ["command"]
  );

  public static readonly cacheHitsTotal = SystemMetrics.reg.counter(
    "carhire_cache_hits_total",
    "Total cache lookups resulting in a hit",
    ["cache_type"]
  );

  public static readonly cacheMissesTotal = SystemMetrics.reg.counter(
    "carhire_cache_misses_total",
    "Total cache lookups resulting in a miss",
    ["cache_type"]
  );

  // --------------------------------------------------------------------------
  // 5. QUEUES & BULLMQ & WORKERS
  // --------------------------------------------------------------------------
  public static readonly queueWaitingJobs = SystemMetrics.reg.gauge(
    "carhire_queue_waiting_jobs",
    "Number of jobs waiting to be picked up by workers",
    ["queue_name"]
  );

  public static readonly queueActiveJobs = SystemMetrics.reg.gauge(
    "carhire_queue_active_jobs",
    "Number of jobs currently actively running on workers",
    ["queue_name"]
  );

  public static readonly queueFailedJobsTotal = SystemMetrics.reg.counter(
    "carhire_queue_failed_jobs_total",
    "Total job execution failures",
    ["queue_name", "job_name"]
  );

  public static readonly queueCompletedJobsTotal = SystemMetrics.reg.counter(
    "carhire_queue_completed_jobs_total",
    "Total successful background jobs completed",
    ["queue_name", "job_name"]
  );

  public static readonly queueOldestWaitingAgeSeconds = SystemMetrics.reg.gauge(
    "carhire_queue_oldest_waiting_age_seconds",
    "Age of oldest waiting job in queue in seconds",
    ["queue_name"]
  );

  public static readonly dlqEntriesTotal = SystemMetrics.reg.gauge(
    "carhire_dlq_entries_total",
    "Total dead-letter queue entries awaiting inspection or replay",
    ["queue_name"]
  );

  public static readonly workerInstancesActive = SystemMetrics.reg.gauge(
    "carhire_worker_instances_active",
    "Number of active worker execution instances heartbeating",
    ["cluster_role"]
  );

  public static readonly workerJobDurationSeconds = SystemMetrics.reg.histogram(
    "carhire_worker_job_duration_seconds",
    "Duration of background job execution in seconds",
    ["job_name"],
    [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60]
  );

  public static readonly schedulerLastTickTimestamp = SystemMetrics.reg.gauge(
    "carhire_scheduler_last_tick_timestamp",
    "Unix timestamp of the most recent canonical scheduler heartbeat",
    ["scheduler_id"]
  );

  // --------------------------------------------------------------------------
  // 6. OUTBOX & CANONICAL EVENT RELAY
  // --------------------------------------------------------------------------
  public static readonly outboxUndispatchedEvents = SystemMetrics.reg.gauge(
    "carhire_outbox_undispatched_events",
    "Current count of outbox events awaiting dispatch to message transport",
    ["priority"]
  );

  public static readonly outboxOldestEventAgeSeconds = SystemMetrics.reg.gauge(
    "carhire_outbox_oldest_event_age_seconds",
    "Age in seconds of the oldest undispatched outbox event",
    ["priority"]
  );

  public static readonly outboxDispatchErrorsTotal = SystemMetrics.reg.counter(
    "carhire_outbox_dispatch_errors_total",
    "Total failures attempting to dispatch outbox events",
    ["failure_type"]
  );

  // --------------------------------------------------------------------------
  // 7. PAYMENTS & WEBHOOKS
  // --------------------------------------------------------------------------
  public static readonly paymentAttemptsTotal = SystemMetrics.reg.counter(
    "carhire_payment_attempts_total",
    "Total payment initiation attempts",
    ["provider", "method"]
  );

  public static readonly paymentVerifiedTotal = SystemMetrics.reg.counter(
    "carhire_payment_verified_total",
    "Total payments successfully settled and verified",
    ["provider"]
  );

  public static readonly paymentFailedTotal = SystemMetrics.reg.counter(
    "carhire_payment_failed_total",
    "Total payment verification or gateway failures",
    ["provider", "failure_category"]
  );

  public static readonly paymentUnknownBacklog = SystemMetrics.reg.gauge(
    "carhire_payment_unknown_backlog",
    "Current count of payment transactions stuck in UNKNOWN status awaiting reconciliation",
    ["provider"]
  );

  public static readonly paymentWebhookSignatureFailuresTotal = SystemMetrics.reg.counter(
    "carhire_payment_webhook_signature_failures_total",
    "Total payment provider incoming webhooks rejected due to invalid signature or secret drift",
    ["provider"]
  );

  public static readonly paymentProcessingLatencySeconds = SystemMetrics.reg.histogram(
    "carhire_payment_processing_latency_seconds",
    "Time taken to complete payment verification and ledgering in seconds",
    ["provider"],
    [0.1, 0.5, 1, 2, 5, 10, 20]
  );

  // --------------------------------------------------------------------------
  // 8. NOTIFICATIONS
  // --------------------------------------------------------------------------
  public static readonly notificationsSentTotal = SystemMetrics.reg.counter(
    "carhire_notifications_sent_total",
    "Total communication notifications successfully dispatched",
    ["channel", "status"]
  );

  public static readonly notificationsFailedTotal = SystemMetrics.reg.counter(
    "carhire_notifications_failed_total",
    "Total notification dispatch failures",
    ["channel", "reason"]
  );

  public static readonly notificationQueueLagSeconds = SystemMetrics.reg.gauge(
    "carhire_notification_queue_lag_seconds",
    "Lag in seconds between notification creation and provider dispatch",
    ["channel"]
  );

  // --------------------------------------------------------------------------
  // 9. FILES & MEDIA
  // --------------------------------------------------------------------------
  public static readonly filesScanPending = SystemMetrics.reg.gauge(
    "carhire_files_scan_pending",
    "Number of uploaded files awaiting automated antivirus/integrity scans",
    ["storage_driver"]
  );

  public static readonly filesQuarantinedTotal = SystemMetrics.reg.counter(
    "carhire_files_quarantined_total",
    "Total files quarantined due to failed security scan",
    ["reason"]
  );

  public static readonly mediaProcessingJobsActive = SystemMetrics.reg.gauge(
    "carhire_media_processing_jobs_active",
    "Current number of image resizing or watermark processing jobs active",
    ["format"]
  );

  public static readonly mediaProcessingFailuresTotal = SystemMetrics.reg.counter(
    "carhire_media_processing_failures_total",
    "Total media transformation failures",
    ["format"]
  );

  // --------------------------------------------------------------------------
  // 10. DOMAINS & ROUTING
  // --------------------------------------------------------------------------
  public static readonly domainVerificationPending = SystemMetrics.reg.gauge(
    "carhire_domain_verification_pending",
    "Count of custom domains awaiting SSL or DNS validation",
    ["status"]
  );

  public static readonly domainRoutingErrorsTotal = SystemMetrics.reg.counter(
    "carhire_domain_routing_errors_total",
    "Total custom domain host resolution failures",
    ["error_type"]
  );

  // --------------------------------------------------------------------------
  // 11. ANALYTICS & REPORTS
  // --------------------------------------------------------------------------
  public static readonly analyticsProjectionLagSeconds = SystemMetrics.reg.gauge(
    "carhire_analytics_projection_lag_seconds",
    "Lag in seconds between event occurrence and analytics read-model projection update",
    ["projection_name"]
  );

  public static readonly analyticsReconciliationMismatchesTotal = SystemMetrics.reg.counter(
    "carhire_analytics_reconciliation_mismatches_total",
    "Total discrepancy alerts between operational ledger and analytical projections",
    ["domain"]
  );

  public static readonly reportsActiveJobs = SystemMetrics.reg.gauge(
    "carhire_reports_active_jobs",
    "Number of asynchronous financial/fleet report generation jobs executing",
    ["report_type"]
  );

  // --------------------------------------------------------------------------
  // 12. SAAS BILLING
  // --------------------------------------------------------------------------
  public static readonly saasBillingFailuresTotal = SystemMetrics.reg.counter(
    "carhire_saas_billing_failures_total",
    "Total failures executing monthly SaaS subscription billing cycles",
    ["error_code"]
  );

  public static readonly saasCollectionFailuresTotal = SystemMetrics.reg.counter(
    "carhire_saas_collection_failures_total",
    "Total subscription payment collection failures causing grace-period countdown",
    ["plan_tier"]
  );

  // --------------------------------------------------------------------------
  // 13. SECURITY & TENANT ISOLATION
  // --------------------------------------------------------------------------
  public static readonly securityAuthFailuresTotal = SystemMetrics.reg.counter(
    "carhire_security_auth_failures_total",
    "Total authentication failures (invalid credentials, expired token)",
    ["auth_mechanism"]
  );

  public static readonly securityRateLimitedTotal = SystemMetrics.reg.counter(
    "carhire_security_rate_limited_total",
    "Total requests blocked by IP or token rate limiters",
    ["limiter_scope"]
  );

  public static readonly securityTenantIsolationMismatchesTotal = SystemMetrics.reg.counter(
    "carhire_security_tenant_context_mismatches_total",
    "CRITICAL: Total cross-tenant access attempts blocked by isolation middleware",
    ["endpoint_group"]
  );
}
