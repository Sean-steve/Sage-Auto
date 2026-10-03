// ============================================================================
// CAR HIRE OS — REDIS CLIENT & CONNECTION MANAGEMENT (DEV-011, INF-002)
// IORedis connection pooling, fallback detection, and lifecycle management
// ============================================================================

import Redis, { RedisOptions } from "ioredis";
import { getAppConfig } from "@carhire/config";

export type RedisStatus = "connected" | "disconnected" | "simulated";

export interface RedisManagerConfig {
  url?: string;
  maxRetriesPerRequest?: number | null;
  connectTimeout?: number;
  forceSimulated?: boolean;
}

export class RedisConnectionManager {
  private static instance: RedisConnectionManager | null = null;
  private client: Redis | null = null;
  private status: RedisStatus = "disconnected";
  private isSimulatedMode: boolean = false;

  private constructor(private readonly config: RedisManagerConfig = {}) {
    if (config.forceSimulated || process.env.REDIS_SIMULATED === "true") {
      this.isSimulatedMode = true;
      this.status = "simulated";
    }
  }

  public static getInstance(config?: RedisManagerConfig): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager(config);
    }
    return RedisConnectionManager.instance;
  }

  public static resetInstance(): void {
    if (RedisConnectionManager.instance) {
      RedisConnectionManager.instance.disconnect();
      RedisConnectionManager.instance = null;
    }
  }

  /**
   * Initializes Redis connection or resolves into simulated mode if connection fails or is disabled.
   */
  public async initialize(): Promise<RedisStatus> {
    if (this.isSimulatedMode) {
      this.status = "simulated";
      return this.status;
    }

    const appConfig = getAppConfig();
    const redisUrl = this.config.url || appConfig.redis.url || "redis://localhost:6379";

    try {
      const options: RedisOptions = {
        maxRetriesPerRequest: this.config.maxRetriesPerRequest !== undefined ? this.config.maxRetriesPerRequest : null,
        connectTimeout: this.config.connectTimeout || 3000,
        lazyConnect: true,
        retryStrategy(times) {
          if (times > 3) return null; // stop retrying after 3 attempts in local/dev
          return Math.min(times * 100, 1000);
        },
      };

      this.client = new Redis(redisUrl, options);

      this.client.on("connect", () => {
        this.status = "connected";
      });

      this.client.on("error", (err) => {
        // Silently downgrade to simulated if connection refused in test/dev
        if (!this.client || this.client.status !== "ready") {
          this.status = "simulated";
          this.isSimulatedMode = true;
        }
      });

      this.client.on("close", () => {
        if (!this.isSimulatedMode) {
          this.status = "disconnected";
        }
      });

      await this.client.connect().catch(() => {
        // Fallback to simulated mode
        this.isSimulatedMode = true;
        this.status = "simulated";
      });

      if (this.client && this.client.status === "ready") {
        this.status = "connected";
      } else {
        this.isSimulatedMode = true;
        this.status = "simulated";
      }
    } catch {
      this.isSimulatedMode = true;
      this.status = "simulated";
    }

    return this.status;
  }

  public getClient(): Redis | null {
    return this.isSimulatedMode ? null : this.client;
  }

  public getConnectionOptions(): RedisOptions {
    const options = this.client?.options || {};
    return {
      ...options,
      lazyConnect: false,
    };
  }

  public getStatus(): RedisStatus {
    return this.status;
  }

  public isSimulated(): boolean {
    return this.isSimulatedMode || this.status === "simulated";
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    this.status = this.isSimulatedMode ? "simulated" : "disconnected";
  }
}
