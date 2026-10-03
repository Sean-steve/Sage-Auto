// ============================================================================
// CAR HIRE OS — OBSERVABILITY & TELEMETRY HTTP MIDDLEWARE (SPRINT 42)
// Ambient context propagation, W3C traceparent handling & Prometheus HTTP metrics
// ============================================================================

import { Request, Response, NextFunction } from "express";
import {
  extractHttpContext,
  formatTraceparent,
  runWithTelemetryContext,
  SystemMetrics,
  getTelemetryContext,
} from "@carhire/observability";

export interface ObservableRequest extends Request {
  id?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
}

function getStatusClass(statusCode: number): string {
  if (statusCode >= 500) return "5xx";
  if (statusCode >= 400) return "4xx";
  if (statusCode >= 300) return "3xx";
  if (statusCode >= 200) return "2xx";
  return "1xx";
}

function getRouteGroup(path: string): string {
  // Collapse high-cardinality IDs to generic route groups
  if (path.startsWith("/api/health")) return "health";
  if (path.startsWith("/api/metrics")) return "metrics";
  if (path.startsWith("/api/metadata")) return "metadata";
  if (path.startsWith("/api/v1/auth") || path.startsWith("/api/auth")) return "auth";
  if (path.startsWith("/api/v1/bookings") || path.startsWith("/api/bookings")) return "bookings";
  if (path.startsWith("/api/v1/fleet") || path.startsWith("/api/fleet") || path.startsWith("/api/vehicles")) return "fleet";
  if (path.startsWith("/api/v1/rentals") || path.startsWith("/api/rentals")) return "rentals";
  if (path.startsWith("/api/v1/payments") || path.startsWith("/api/payments")) return "payments";
  if (path.startsWith("/api/v1/finance") || path.startsWith("/api/finance")) return "finance";
  if (path.startsWith("/api/v1/platform") || path.startsWith("/api/platform")) return "platform";
  if (path.startsWith("/api/v1/tenants") || path.startsWith("/api/tenants")) return "tenants";
  return "other";
}

export function observabilityMiddleware(req: ObservableRequest, res: Response, next: NextFunction) {
  const extracted = extractHttpContext(req);

  req.id = extracted.requestId;
  req.correlationId = extracted.correlationId;
  req.traceId = extracted.traceId;
  req.spanId = extracted.spanId;

  // Echo standard tracing headers on response
  if (extracted.correlationId) res.setHeader("X-Correlation-ID", extracted.correlationId);
  if (extracted.requestId) res.setHeader("X-Request-ID", extracted.requestId);
  if (extracted.traceId && extracted.spanId) {
    res.setHeader("traceparent", formatTraceparent(extracted.traceId, extracted.spanId));
  }

  // Active in-flight requests gauge
  SystemMetrics.httpActiveRequests.inc({ service: "@carhire/api" });

  const startTime = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const durationSec = durationMs / 1000;
    const statusClass = getStatusClass(res.statusCode);
    const routeGroup = getRouteGroup(req.path || req.originalUrl);

    SystemMetrics.httpActiveRequests.dec({ service: "@carhire/api" });

    // HTTP Metrics recording
    SystemMetrics.httpRequestsTotal.inc({
      method: req.method,
      status_class: statusClass,
      route_group: routeGroup,
    });

    SystemMetrics.httpRequestDurationSeconds.observe(
      {
        method: req.method,
        status_class: statusClass,
        route_group: routeGroup,
      },
      durationSec
    );
  });

  runWithTelemetryContext(extracted, () => {
    next();
  });
}
