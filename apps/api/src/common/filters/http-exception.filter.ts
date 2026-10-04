import { Request, Response, NextFunction } from "express";
import { AppLoggerService } from "../logger/app-logger.service";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AppError extends ApiError {
  constructor(
    public override code: string,
    public override statusCode: number = 400,
    message: string,
    public override details?: unknown
  ) {
    super(statusCode, code, message, details);
    this.name = "AppError";
  }
}


const logger = new AppLoggerService("GlobalErrorHandler");

export function globalErrorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = (req as { id?: string }).id || "unknown";

  if (err instanceof ApiError) {
    logger.warn(`API Error [${err.code}]: ${err.message}`, {
      requestId,
      statusCode: err.statusCode,
      path: req.path,
      details: err.details,
    });

    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  const domainError = err as Error & {
    statusCode?: unknown;
    code?: unknown;
    details?: unknown;
  };
  if (
    typeof domainError.statusCode === "number" &&
    domainError.statusCode >= 400 &&
    domainError.statusCode < 600
  ) {
    const code =
      typeof domainError.code === "string" && domainError.code
        ? domainError.code
        : "DOMAIN_ERROR";
    logger.warn(`Domain Error [${code}]: ${domainError.message}`, {
      requestId,
      statusCode: domainError.statusCode,
      path: req.path,
      details: domainError.details,
    });
    return res.status(domainError.statusCode).json({
      error: {
        code,
        message: domainError.message,
        details: domainError.details,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  const operationalError = err as Error & {
    isOperational?: unknown;
    code?: unknown;
    metadata?: unknown;
  };
  if (operationalError.isOperational === true && typeof operationalError.code === "string") {
    const code = operationalError.code;
    const statusCode =
      code.includes("NOT_FOUND") || code === "RECORD_NOT_FOUND" ? 404 :
      code.includes("CROSS_TENANT") ? 403 :
      code.includes("SUBSCRIPTION_SUSPENDED") ? 403 :
      code.includes("CONFLICT") ||
      code.includes("CONCURRENCY") ||
      code.includes("UNIQUE_CONSTRAINT") ||
      code.includes("IMMUTABLE") ||
      code.includes("ALREADY_") ? 409 :
      code.includes("INVALID") ||
      code.includes("NOT_ELIGIBLE") ||
      code.includes("NOT_OPERATIONAL") ||
      code.includes("REQUIRED") ? 422 :
      code === "DATABASE_UNAVAILABLE" ? 503 :
      400;

    const safeMessage =
      code === "INTERNAL_DATABASE_ERROR"
        ? "The request could not be completed because of a data persistence problem."
        : operationalError.message;

    logger.warn(`Operational Error [${code}]: ${safeMessage}`, {
      requestId,
      statusCode,
      path: req.path,
      details: operationalError.metadata,
    });

    return res.status(statusCode).json({
      error: {
        code,
        message: safeMessage,
        details: operationalError.metadata,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  logger.error(`Unhandled Exception: ${err.message}`, err.stack, {
    requestId,
    path: req.path,
  });

  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected internal error occurred",
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
