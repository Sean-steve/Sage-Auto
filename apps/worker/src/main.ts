import "../../api/src/runtime-env";
// ============================================================================
// CAR HIRE OS — WORKER SERVICE ENTRY POINT (DEV-011, BRS-003, SPRINT 41)
// Production Background Platform with Graceful Drain, Health Server & Provenance
// ============================================================================

import http from "http";
import { WorkerManager } from "./worker.module";

export async function bootstrap(): Promise<{ manager: WorkerManager; healthServer: http.Server }> {
  console.log("[Worker] Bootstrapping @carhire/worker background execution platform...");
  const manager = new WorkerManager();
  await manager.start();

  const drainTimeoutMs = parseInt(process.env.WORKER_DRAIN_TIMEOUT_MS || "25000", 10);
  const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || "3002", 10);

  // Embedded lightweight HTTP server for K8s / Container Liveness and Readiness Probes
  const healthServer = http.createServer(async (req, res) => {
    if (req.url === "/health" || req.url === "/health/live") {
      const health = await manager.getHealth();
      res.writeHead(health.status === "unhealthy" ? 503 : 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: health.status,
        service: "@carhire/worker",
        releaseId: process.env.RELEASE_ID || "dev-local-0.1.0",
        commitSha: process.env.GIT_COMMIT_SHA || "local-dev",
        uptimeSeconds: health.uptimeSeconds,
        redisStatus: health.redisStatus,
        schedulerActive: health.schedulerActive,
      }));
      return;
    }

    if (req.url === "/health/ready") {
      const health = await manager.getHealth();
      const isReady = health.status !== "unhealthy" && (health.redisStatus === "connected" || health.redisStatus === "simulated");
      res.writeHead(isReady ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: isReady ? "ready" : "unready",
        service: "@carhire/worker",
        redisStatus: health.redisStatus,
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  healthServer.listen(healthPort, "0.0.0.0", () => {
    console.log(`[Worker] Health & liveness probe listening on http://0.0.0.0:${healthPort}/health`);
  });

  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Worker] ${signal} received, initiating graceful job drain (Timeout: ${drainTimeoutMs}ms)...`);
    
    // Close health server so orchestrator stops routing new traffic
    healthServer.close();

    try {
      await manager.stop(drainTimeoutMs);
      console.log(`[Worker] Clean shutdown completed successfully.`);
      process.exit(0);
    } catch (err) {
      console.error(`[Worker] Error during worker graceful drain:`, err);
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => handleShutdown("SIGTERM"));
  process.once("SIGINT", () => handleShutdown("SIGINT"));

  return { manager, healthServer };
}

export * from "./worker.module";
export * from "./infrastructure/redis/redis-client";
export * from "./infrastructure/queues/queue-tokens";
export * from "./infrastructure/queues/queue-registry";
export * from "./infrastructure/transport/bullmq-event-transport";
export * from "./infrastructure/workers/worker-registry";
export * from "./infrastructure/scheduler/canonical-scheduler";
export * from "./infrastructure/dlq/dead-letter-service";

if (process.env.NODE_ENV !== "test" && typeof require !== "undefined" && require.main === module) {
  bootstrap().catch((err) => {
    console.error("[Worker] Fatal error during bootstrap:", err);
    process.exit(1);
  });
}
