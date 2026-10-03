// ============================================================================
// CAR HIRE OS — PLATFORM BYPASS VALIDATION MIDDLEWARE
// Rejects X-Platform-Bypass header in production to prevent unauthorized admin access
// ============================================================================

import { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@carhire/constants";

declare global {
  namespace Express {
    interface Request {
      platformBypassAttempted?: boolean;
    }
  }
}

export function platformBypassValidationMiddleware() {
  return function validatePlatformBypass(req: Request, res: Response, next: NextFunction): void {
    const bypassHeader = req.headers["x-platform-bypass"];
    const environment = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();

    // Check if X-Platform-Bypass header is present
    if (bypassHeader !== undefined) {
      req.platformBypassAttempted = true;
      
      // In production/staging, reject any bypass attempt
      if (environment === "production" || environment === "staging") {
        res.status(403).json({
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: "Platform bypass is not permitted in this environment.",
            requestId: req.headers["x-request-id"] as string || crypto.randomUUID(),
          },
        });
        return;
      }

      // In development, log warning but allow for testing (controlled via resolver options)
      console.warn("[SECURITY] X-Platform-Bypass header detected in development - ensuring resolver options validate properly");
    }

    next();
  };
}