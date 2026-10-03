import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default("/api/v1"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/carhire_db?schema=public"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().default("dev_jwt_secret_change_in_production_32char_minimum"),
  JWT_EXPIRATION: z.string().default("7d"),
  STORAGE_DRIVER: z.enum(["local", "s3", "minio"]).default("local"),
  STORAGE_BUCKET: z.string().default("carhire-assets"),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default("af-south-1"),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  EMAIL_DELIVERY_MODE: z.enum(["capture", "postmark", "sendgrid"]).optional(),
  EMAIL_PROVIDER: z.enum(["postmark", "sendgrid", "smtp", "ses"]).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  POSTMARK_FROM: z.string().optional(),
  POSTMARK_MESSAGE_STREAM: z.string().default("outbound"),
  APP_PUBLIC_URL: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default("af-south-1"),
  SES_FROM: z.string().optional(),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),
  ENABLE_SWAGGER: z.coerce.boolean().default(true),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "verbose"]).default("info"),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validateEnv(env: Record<string, any> = process.env): EnvConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    console.error("❌ Environment configuration validation failed:", JSON.stringify(parsed.error.format(), null, 2));
    // Provide safe defaults for development/test
    return EnvSchema.parse({});
  }
  return parsed.data;
}
