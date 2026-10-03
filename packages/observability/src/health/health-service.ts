// ============================================================================
// CAR HIRE OS — HEALTH & DEGRADATION MONITORING ENGINE (SPRINT 42)
// Liveness, Readiness, Dependency Health & 3-Tier Degradation Classification
// (HEALTHY | DEGRADED | UNAVAILABLE)
// ============================================================================

import {
  ComprehensiveHealthReport,
  ComponentHealth,
  DegradationState,
} from "../types";

export interface HealthCheckOptions {
  checkDatabase?: () => Promise<{ isReady: boolean; latencyMs: number; error?: string }>;
  checkRedis?: () => Promise<{ isConnected: boolean; latencyMs: number; error?: string }>;
  checkStorage?: () => Promise<{ isReady: boolean; latencyMs: number; error?: string }>;
  checkWorkers?: () => Promise<{ workersRunning: number; error?: string }>;
  checkQueues?: () => Promise<{ maxOldestAgeSeconds: number; maxWaitingCount: number; error?: string }>;
  checkProviders?: () => Promise<Record<string, { status: "UP" | "DOWN" | "DEGRADED"; latencyMs: number }>>;
}

export class HealthService {
  private static instance: HealthService;
  private options: HealthCheckOptions = {};

  private constructor() {}

  public static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
    }
    return HealthService.instance;
  }

  public registerCheckOptions(options: HealthCheckOptions): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Liveness: "Is the Node.js process alive and accepting signals?"
   * Should never fail due to external dependency degradation.
   */
  public checkLiveness(): { status: "alive"; uptimeSeconds: number; timestamp: string } {
    return {
      status: "alive",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: "Can this instance safely process customer traffic right now?"
   * Fails if mandatory DB connectivity is broken.
   */
  public async checkReadiness(): Promise<{ isReady: boolean; latencyMs: number; error?: string }> {
    if (this.options.checkDatabase) {
      try {
        return await this.options.checkDatabase();
      } catch (err: any) {
        return { isReady: false, latencyMs: -1, error: err?.message || String(err) };
      }
    }
    return { isReady: true, latencyMs: 1 };
  }

  /**
   * Comprehensive Health & Degradation Assessment across all dependencies
   */
  public async getComprehensiveReport(): Promise<ComprehensiveHealthReport> {
    const now = new Date().toISOString();
    const livenessOk = true;

    // 1. Database Check (Critical)
    let dbHealth: ComponentHealth = {
      status: "UP",
      critical: true,
      latencyMs: 1,
      lastCheckedAt: now,
    };
    if (this.options.checkDatabase) {
      try {
        const res = await this.options.checkDatabase();
        dbHealth = {
          status: res.isReady ? (res.latencyMs > 1000 ? "DEGRADED" : "UP") : "DOWN",
          critical: true,
          latencyMs: res.latencyMs,
          error: res.error,
          lastCheckedAt: now,
        };
      } catch (err: any) {
        dbHealth = {
          status: "DOWN",
          critical: true,
          latencyMs: -1,
          error: err?.message,
          lastCheckedAt: now,
        };
      }
    }

    // 2. Redis Check (Semi-Critical for background async jobs)
    let redisHealth: ComponentHealth = {
      status: "UP",
      critical: false,
      latencyMs: 1,
      lastCheckedAt: now,
    };
    if (this.options.checkRedis) {
      try {
        const res = await this.options.checkRedis();
        redisHealth = {
          status: res.isConnected ? (res.latencyMs > 200 ? "DEGRADED" : "UP") : "DOWN",
          critical: false,
          latencyMs: res.latencyMs,
          error: res.error,
          lastCheckedAt: now,
        };
      } catch (err: any) {
        redisHealth = {
          status: "DOWN",
          critical: false,
          latencyMs: -1,
          error: err?.message,
          lastCheckedAt: now,
        };
      }
    }

    // 3. Storage Check
    let storageHealth: ComponentHealth = {
      status: "UP",
      critical: false,
      latencyMs: 1,
      lastCheckedAt: now,
    };
    if (this.options.checkStorage) {
      try {
        const res = await this.options.checkStorage();
        storageHealth = {
          status: res.isReady ? "UP" : "DOWN",
          critical: false,
          latencyMs: res.latencyMs,
          error: res.error,
          lastCheckedAt: now,
        };
      } catch (err: any) {
        storageHealth = {
          status: "DOWN",
          critical: false,
          latencyMs: -1,
          error: err?.message,
          lastCheckedAt: now,
        };
      }
    }

    // 4. Workers Check
    let workerHealth: ComponentHealth = {
      status: "UP",
      critical: false,
      latencyMs: 0,
      lastCheckedAt: now,
      details: { running: 1 },
    };
    if (this.options.checkWorkers) {
      try {
        const res = await this.options.checkWorkers();
        workerHealth = {
          status: res.workersRunning > 0 ? "UP" : "DOWN",
          critical: false,
          latencyMs: 0,
          details: { running: res.workersRunning },
          error: res.error,
          lastCheckedAt: now,
        };
      } catch (err: any) {
        workerHealth = {
          status: "DOWN",
          critical: false,
          latencyMs: 0,
          error: err?.message,
          lastCheckedAt: now,
        };
      }
    }

    // 5. Queues Check (Age & depth evaluation)
    let queueHealth: ComponentHealth = {
      status: "UP",
      critical: false,
      latencyMs: 0,
      lastCheckedAt: now,
    };
    if (this.options.checkQueues) {
      try {
        const res = await this.options.checkQueues();
        const isDegraded = res.maxOldestAgeSeconds > 300 || res.maxWaitingCount > 1000;
        queueHealth = {
          status: isDegraded ? "DEGRADED" : "UP",
          critical: false,
          latencyMs: 0,
          details: {
            maxOldestAgeSeconds: res.maxOldestAgeSeconds,
            maxWaitingCount: res.maxWaitingCount,
          },
          error: res.error,
          lastCheckedAt: now,
        };
      } catch (err: any) {
        queueHealth = {
          status: "DOWN",
          critical: false,
          latencyMs: 0,
          error: err?.message,
          lastCheckedAt: now,
        };
      }
    }

    // 6. External Providers Check
    const providerHealths: Record<string, ComponentHealth> = {};
    if (this.options.checkProviders) {
      try {
        const providers = await this.options.checkProviders();
        for (const [pName, pVal] of Object.entries(providers)) {
          providerHealths[pName] = {
            status: pVal.status,
            critical: false,
            latencyMs: pVal.latencyMs,
            lastCheckedAt: now,
          };
        }
      } catch (err: any) {
        providerHealths["unknown"] = {
          status: "DOWN",
          critical: false,
          latencyMs: -1,
          error: err?.message,
          lastCheckedAt: now,
        };
      }
    }

    // 7. Compute Overall 3-Tier Degradation Classification
    let overallStatus: DegradationState = "HEALTHY";

    // If critical database is down -> UNAVAILABLE
    if (dbHealth.status === "DOWN") {
      overallStatus = "UNAVAILABLE";
    } else if (
      dbHealth.status === "DEGRADED" ||
      redisHealth.status === "DOWN" ||
      redisHealth.status === "DEGRADED" ||
      workerHealth.status === "DOWN" ||
      queueHealth.status === "DEGRADED" ||
      Object.values(providerHealths).some((p) => p.status === "DOWN" || p.status === "DEGRADED")
    ) {
      overallStatus = "DEGRADED";
    }

    return {
      status: overallStatus,
      service: process.env.APP_NAME || "@carhire/api",
      releaseId: process.env.RELEASE_ID || "dev-local-0.1.0",
      version: process.env.APP_VERSION || "0.1.0",
      commitSha: process.env.GIT_COMMIT_SHA || "local-dev",
      environment: process.env.APP_ENV || process.env.NODE_ENV || "development",
      timestamp: now,
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        liveness: livenessOk,
        readiness: dbHealth.status === "UP",
        database: dbHealth,
        redis: redisHealth,
        storage: storageHealth,
        workers: workerHealth,
        queues: queueHealth,
        providers: providerHealths,
      },
    };
  }
}
