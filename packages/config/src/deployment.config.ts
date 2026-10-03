import { z } from "zod";

export const CanonicalEnvironmentSchema = z.enum([
  "development",
  "test",
  "staging",
  "production"
]);
export type CanonicalEnvironment = z.infer<typeof CanonicalEnvironmentSchema>;

export const DeploymentConfigSchema = z.object({
  // Runtime & Environment Identity
  NODE_ENV: CanonicalEnvironmentSchema.default("development"),
  APP_ENV: CanonicalEnvironmentSchema.default("development"),
  APP_NAME: z.string().default("carhire-os"),
  APP_VERSION: z.string().default("0.1.0"),
  RELEASE_ID: z.string().default("dev-local-0.1.0"),
  GIT_COMMIT_SHA: z.string().default("local-dev-commit"),
  BUILD_TIMESTAMP: z.string().default(new Date(0).toISOString()),

  // Ports and API Routing
  PORT: z.coerce.number().default(3000),
  API_PORT: z.coerce.number().default(3001),
  API_PREFIX: z.string().default("/api/v1"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:3000"),
  
  // Security & Trusted Proxy
  TRUSTED_PROXIES: z.string().default("127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),

  // Database (PostgreSQL)
  DATABASE_URL: z.string().min(1),
  DATABASE_MIGRATION_URL: z.string().optional(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(20),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().default(10000),

  // Redis & BullMQ
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  REDIS_MAX_RETRIES_PER_REQ: z.coerce.number().default(3),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().default(10000),
  REDIS_KEY_PREFIX: z.string().default("carhire:"),

  // Worker Sizing & Graceful Drain
  WORKER_CONCURRENCY: z.coerce.number().default(10),
  WORKER_DRAIN_TIMEOUT_MS: z.coerce.number().default(25000), // Sprint 40 capacity informed (under 30s K8s/ECS grace)
  SCHEDULER_ACTIVE: z.coerce.boolean().default(true),

  // Authentication & Secrets
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRATION: z.string().default("7d"),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),

  // Storage (S3 / MinIO / Local)
  STORAGE_DRIVER: z.enum(["local", "s3", "minio"]).default("local"),
  STORAGE_BUCKET: z.string().default("carhire-assets"),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default("af-south-1"),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),

  // Payment Providers (Credentials never logged, presence checked)
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),

  // Logging & Observability Baseline
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "verbose"]).default("info"),
  ENABLE_SWAGGER: z.coerce.boolean().default(false),
  ENABLE_DEBUG_ENDPOINTS: z.coerce.boolean().default(false),
});

export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

export class ConfigurationError extends Error {
  constructor(message: string, public readonly validationErrors?: Record<string, any>) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Validates configuration with fail-fast semantics for staging/production.
 * In development and test, safe non-production defaults are permissible.
 */
export function validateDeploymentConfig(rawEnv: Record<string, any> = process.env): DeploymentConfig {
  const envType = rawEnv.APP_ENV || rawEnv.NODE_ENV || "development";
  const isProductionOrStaging = envType === "production" || envType === "staging";

  // Enforce required database URL if not set in dev
  const candidate = {
    ...rawEnv,
    NODE_ENV: rawEnv.NODE_ENV || "development",
    APP_ENV: rawEnv.APP_ENV || rawEnv.NODE_ENV || "development",
    DATABASE_URL: rawEnv.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/carhire_db?schema=public",
    JWT_SECRET:
      typeof rawEnv.JWT_SECRET === "string" && rawEnv.JWT_SECRET.trim().length > 0
        ? rawEnv.JWT_SECRET
        : "development_only_jwt_secret_minimum_32_characters_long_override",
  };

  const parsed = DeploymentConfigSchema.safeParse(candidate);

  if (!parsed.success) {
    const errorDetails = parsed.error.format();
    const missingOrInvalidKeys = Object.keys(errorDetails).filter((k) => k !== "_errors");
    
    // STRICT CRITICAL RULE: NEVER log secret values. Log only key names!
    const maskedMessage = `Runtime configuration validation failed for environment [${envType}]. Invalid keys: ${missingOrInvalidKeys.join(", ")}`;
    console.error(`❌ [Configuration] ${maskedMessage}`);

    if (isProductionOrStaging) {
      throw new ConfigurationError(maskedMessage, errorDetails);
    }

    // In local dev/test only, fallback to default schema parsing
    return DeploymentConfigSchema.parse({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/carhire_db?schema=public",
      JWT_SECRET: "development_only_jwt_secret_minimum_32_characters_long_override",
    });
  }

  const config = parsed.data;

  // Staging / Production Guardrails (Fail Fast)
  if (isProductionOrStaging) {
    if (config.JWT_SECRET.includes("dev_jwt_secret") || config.JWT_SECRET.includes("development_only")) {
      throw new ConfigurationError("Production/Staging JWT_SECRET cannot use default development credentials!");
    }
    if (config.ENABLE_DEBUG_ENDPOINTS) {
      throw new ConfigurationError("ENABLE_DEBUG_ENDPOINTS must be false in staging/production!");
    }
    if (config.ENABLE_SWAGGER && config.APP_ENV === "production") {
      throw new ConfigurationError("ENABLE_SWAGGER must be disabled in production!");
    }
  }

  return config;
}
