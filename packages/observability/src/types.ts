// ============================================================================
// CAR HIRE OS — OBSERVABILITY & OPERATIONAL PLATFORM TYPES (SPRINT 42)
// Canonical contracts for logging, tracing, metrics, health, alerts, dashboards & runbooks
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  level: LogLevel;
  timestamp: string; // ISO 8601 UTC
  service: string;
  context: string;
  message: string;
  environment: string;
  releaseId: string;
  correlationId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  tenantHash?: string;
  actorType?: string;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  meta?: Record<string, unknown>;
}

export interface TelemetryContextData {
  correlationId: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  service: string;
  releaseId: string;
  environment: string;
  tenantId?: string | null;
  actorType?: string;
  actorId?: string;
  isSupportSession?: boolean;
  baggage?: Record<string, string>;
}

export type SpanKind = "SERVER" | "CLIENT" | "PRODUCER" | "CONSUMER" | "INTERNAL";

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  status: "OK" | "ERROR";
  statusMessage?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
}

export type MetricType = "counter" | "gauge" | "histogram";

export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labelNames: string[];
  buckets?: number[]; // For histograms
}

export interface MetricValue {
  labels: Record<string, string>;
  value: number;
  timestamp?: number;
}

export interface HistogramValue {
  labels: Record<string, string>;
  buckets: Record<number, number>;
  sum: number;
  count: number;
}

export type DegradationState = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface ComponentHealth {
  status: "UP" | "DOWN" | "DEGRADED";
  critical: boolean;
  latencyMs: number;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
  lastCheckedAt: string;
}

export interface ComprehensiveHealthReport {
  status: DegradationState;
  service: string;
  releaseId: string;
  version: string;
  commitSha: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    liveness: boolean;
    readiness: boolean;
    database: ComponentHealth;
    redis: ComponentHealth;
    storage: ComponentHealth;
    workers: ComponentHealth;
    queues: ComponentHealth;
    providers: Record<string, ComponentHealth>;
  };
}

export type AlertSeverity = "SEV-1_CRITICAL" | "SEV-2_HIGH" | "SEV-3_MEDIUM" | "SEV-4_INFO";

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  category: "API" | "DATABASE" | "REDIS_QUEUE" | "PAYMENTS" | "WORKERS" | "SECURITY" | "ANALYTICS" | "STORAGE";
  metricName: string;
  condition: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "NEQ";
  threshold: number;
  evaluationWindowSeconds: number;
  flappingHysteresisCycles: number;
  isCandidateTarget: boolean; // Flag to indicate unratified candidate operational target
  candidateTargetLabel?: string;
  owner: "PLATFORM_OPERATIONS" | "DATABASE_ENGINEERING" | "BILLING_FINANCE" | "SECURITY_OPERATIONS" | "PLATFORM_ADMIN";
  runbookRef: string;
  diagnosticSteps: string[];
  remediationAction: string;
}

export interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  category: string;
  currentValue: number;
  threshold: number;
  message: string;
  owner: string;
  runbookRef: string;
  diagnosticSteps: string[];
  remediationAction: string;
  isCandidateTarget: boolean;
  firstTriggeredAt: string;
  lastEvaluatedAt: string;
  evaluationCyclesBreached: number;
  status: "FIRING" | "RESOLVED";
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: "stat" | "timeseries" | "table" | "gauge" | "status-grid";
  metricQuery: string;
  description?: string;
  unit?: string;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

export interface DashboardDefinition {
  id: string;
  title: string;
  description: string;
  category: "OVERVIEW" | "RUNTIME" | "INFRASTRUCTURE" | "WORKERS" | "BUSINESS_OPERATIONS" | "SECURITY" | "RELEASE";
  refreshIntervalSeconds: number;
  widgets: DashboardWidget[];
}

export interface RunbookStep {
  stepNumber: number;
  title: string;
  action: string;
  commandSnippet?: string;
  verificationQuestion: string;
  expectedResult: string;
  fallbackAction?: string;
}

export interface RunbookDefinition {
  id: string;
  title: string;
  failureMode: string;
  symptoms: string[];
  probableCauses: string[];
  severity: AlertSeverity;
  ownerRole: string;
  escalationPath: string[];
  strictProhibitions: string[]; // e.g. "NEVER directly update database rows"
  prerequisites: string[];
  mitigationSteps: RunbookStep[];
  verificationProcedure: string[];
  postIncidentActions: string[];
}
