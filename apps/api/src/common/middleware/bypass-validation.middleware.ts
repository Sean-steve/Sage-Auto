// ============================================================================
// CAR HIRE OS — X-PLATFORM-BYPASS HEADER VALIDATION (G01: Sprint A Security)
// Rejects X-Platform-Bypass header to prevent unauthorized admin access.
// ============================================================================

import { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@carhire/constants";
import crypto from "crypto";

export interface BypassValidatedRequest extends Request {
  bypassRejected?: boolean;
}

export function bypassValidationMiddleware(req: BypassValidatedRequest, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  
  // Check for X-Platform-Bypass header (case-insensitive)
  const bypassHeader = req.headers["x-platform-bypass"];
  
  if (bypassHeader !== undefined) {
    // Header present - reject with 403
    req.bypassRejected = true;
    
    res.status(403).json({
      error: {
        code: ERROR_CODES.PLATFORM_PERMISSION_DENIED,
        message: "X-Platform-Bypass header is not permitted. Platform operations require authenticated platform staff context.",
        requestId,
      },
    });
    return;
  }
  
  // Also check for common variations
  const bypassVariations = [
    "x-platform-bypass",
    "x-platformbypass",
    "platform-bypass",
    "platformbypass",
  ];
  
  for (const variation of bypassVariations) {
    if (req.headers[variation] !== undefined) {
      req.bypassRejected = true;
      res.status(403).json({
        error: {
          code: ERROR_CODES.PLATFORM_PERMISSION_DENIED,
          message: "Platform bypass headers are not permitted.",
          requestId,
        },
      });
      return;
    }
  }
  
  next();
}