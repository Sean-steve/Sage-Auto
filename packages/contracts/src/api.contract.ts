import type {
  Tenant,
  Vehicle,
  Booking,
  Rental,
  VehicleInspection,
  TenantInvoice,
  TenantPayment,
  OwnerSettlement,
  AuditRecord,
} from "@carhire/types";

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
    tenantId?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "error";
  service: string;
  version: string;
  uptime: number;
  environment: string;
  timestamp: string;
  checks: {
    database: "connected" | "disconnected" | "simulated";
    redis: "connected" | "disconnected" | "simulated";
    storage: "ready" | "unavailable";
  };
}

export interface TenantContextHeaders {
  "x-tenant-id": string;
  "x-request-id": string;
  "x-correlation-id"?: string;
  authorization?: string;
}
