import { AuthSessionRepository, UserRepository } from "@carhire/database";
// ============================================================================
// CAR HIRE OS — JWT AUTHENTICATION GUARD & MIDDLEWARE (DEV-004, SEC-007)
// Enforces short-lived JWT validation and injects authenticated actor context
// ============================================================================

import { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@carhire/constants";
import { UserJwtPayload } from "@carhire/types";
import { TokenService } from "../application/security/token.service";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        email: string;
        fullName: string;
        isPlatformStaff: boolean;
        claims: UserJwtPayload;
      };
    }
  }
}

export function createAuthGuard(tokenService: TokenService) {
  return async function authenticateJwt(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: "Authentication required. Missing or malformed Bearer token.",
          requestId,
        },
      });
      return;
    }

    const token = authHeader.substring(7).trim();

    try {
      const claims = tokenService.verifyAccessToken(token);
      const [session,user] = await Promise.all([new AuthSessionRepository().findById(claims.sid),new UserRepository().findById(claims.sub)]);
      if(!session || session.userId!==claims.sub || session.revokedAt || Date.parse(session.expiresAt)<=Date.now() || !user || user.status!=="ACTIVE") throw new Error("SESSION_REVOKED");

      req.auth = {
        userId: claims.sub,
        sessionId: claims.sid,
        email: user.email,
        fullName: user.fullName,
        isPlatformStaff: Boolean(user.isPlatformStaff),
        claims,
      };
      (req as any).user = {
        id: claims.sub,
        sub: claims.sub,
        sessionId: claims.sid,
        email: user.email,
        fullName: user.fullName,
        isPlatformStaff: Boolean(user.isPlatformStaff),
      };

      next();
    } catch (err: any) {
      const code =
        err.message === "TOKEN_EXPIRED"
          ? ERROR_CODES.SESSION_EXPIRED
          : ERROR_CODES.UNAUTHORIZED;

      res.status(401).json({
        error: {
          code,
          message:
            err.message === "TOKEN_EXPIRED"
              ? "Access token has expired. Please refresh your session."
              : "Invalid authentication token.",
          requestId,
        },
      });
    }
  };
}

export function requirePlatformStaff(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();

  if (!req.auth) {
    res.status(401).json({
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: "Authentication required.",
        requestId,
      },
    });
    return;
  }

  if (!req.auth.isPlatformStaff) {
    res.status(403).json({
      error: {
        code: ERROR_CODES.FORBIDDEN,
        message: "Access restricted to Car Hire OS platform staff.",
        requestId,
      },
    });
    return;
  }

  next();
}
