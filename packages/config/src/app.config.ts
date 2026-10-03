import { validateEnv, type EnvConfig } from "./env";

export interface AppConfig {
  app: {
    name: string;
    version: string;
    env: string;
    port: number;
    apiPrefix: string;
  };
  db: {
    url: string;
  };
  redis: {
    url: string;
  };
  auth: {
    jwtSecret: string;
    jwtExpiration: string;
  };
  storage: {
    driver: string;
    bucket: string;
    endpoint?: string;
    region: string;
  };
  payments: {
    mpesa: {
      environment: string;
      shortcode?: string;
    };
  };
}

export function getAppConfig(envOverride?: Record<string, any>): AppConfig {
  const env: EnvConfig = validateEnv(envOverride || process.env);
  return {
    app: {
      name: "Car Hire OS",
      version: "1.0.0",
      env: env.NODE_ENV,
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
    },
    db: {
      url: env.DATABASE_URL,
    },
    redis: {
      url: env.REDIS_URL,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtExpiration: env.JWT_EXPIRATION,
    },
    storage: {
      driver: env.STORAGE_DRIVER,
      bucket: env.STORAGE_BUCKET,
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
    },
    payments: {
      mpesa: {
        environment: env.MPESA_ENVIRONMENT,
        shortcode: env.MPESA_SHORTCODE,
      },
    },
  };
}
