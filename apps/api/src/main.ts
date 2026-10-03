import "./runtime-env";
import { createApiApp } from "./app.module";
import { AppLoggerService } from "./common/logger/app-logger.service";

const logger = new AppLoggerService("Bootstrap");

export function bootstrap() {
  const app = createApiApp();
  const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3001;

  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.log(`@carhire/api started and listening on http://0.0.0.0:${PORT}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.warn(`@carhire/api is already running on port ${PORT}; keeping the existing instance.`);
      process.exit(0);
    }

    logger.error(`@carhire/api failed to listen on port ${PORT}.`, error.message);
    process.exit(1);
  });

  return { app, server };
}

if (process.env.NODE_ENV !== "test" && require.main === module) {
  bootstrap();
}
