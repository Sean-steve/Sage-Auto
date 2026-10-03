// ============================================================================
// CAR HIRE OS — AUTHENTICATION CONTROLLER (DEV-004, DEV-007, SEC-007)
// RESTful endpoints for identity lifecycle, sessions, and recovery
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  RegisterUserSchema,
  LoginSchema,
  RefreshTokenSchema,
  LogoutSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
  ResendVerificationSchema,
} from "@carhire/validation";
import { AuthService } from "../application/services/auth.service";
import { createAuthGuard } from "./auth.guard";
import { TokenService } from "../application/security/token.service";

export function createAuthController(authService: AuthService, tokenService: TokenService): Router {
  const router = Router();
  const authGuard = createAuthGuard(tokenService);

  const getMeta = (req: Request) => ({
    ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1",
    userAgent: req.headers["user-agent"] || "unknown",
    requestId: (req.headers["x-request-id"] as string) || crypto.randomUUID(),
  });

  // --------------------------------------------------------------------------
  // 1. REGISTER
  // --------------------------------------------------------------------------
  router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = RegisterUserSchema.parse(req.body);
      const result = await authService.register(validated, getMeta(req));
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 2. LOGIN
  // --------------------------------------------------------------------------
  router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = LoginSchema.parse(req.body);
      const result = await authService.login(validated, getMeta(req));
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 3. REFRESH TOKEN
  // --------------------------------------------------------------------------
  router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = RefreshTokenSchema.parse(req.body);
      const result = await authService.refreshToken(validated.refreshToken, getMeta(req));
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 4. LOGOUT
  // --------------------------------------------------------------------------
  router.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = LogoutSchema.parse(req.body || {});
      const authHeader = req.headers.authorization;
      let userId = "ANONYMOUS";
      let sessionId: string | undefined;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const claims = tokenService.verifyAccessToken(authHeader.substring(7));
          userId = claims.sub;
          sessionId = claims.sid;
        } catch {
          // Ignore invalid token during logout attempt
        }
      }

      await authService.logout(
        userId,
        sessionId,
        validated.refreshToken,
        Boolean(validated.allSessions),
        getMeta(req)
      );

      res.status(200).json({ data: { message: "Successfully logged out." } });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 5. CURRENT AUTHENTICATED USER (ME)
  // --------------------------------------------------------------------------
  router.get("/me", authGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getMe(req.auth!.userId);
      res.status(200).json({ data: { user } });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 6. SESSIONS MANAGEMENT
  // --------------------------------------------------------------------------
  router.get("/sessions", authGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await authService.getActiveSessions(req.auth!.userId, req.auth!.sessionId);
      res.status(200).json({ data: { sessions } });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/sessions/:sessionId", authGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.revokeSession(
        req.auth!.userId,
        req.params.sessionId,
        Boolean(req.auth!.isPlatformStaff),
        getMeta(req)
      );
      res.status(200).json({ data: { message: "Session successfully revoked." } });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/sessions", authGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.revokeAllSessions(req.auth!.userId, getMeta(req));
      res.status(200).json({ data: { message: "All sessions successfully revoked.", ...result } });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 7. PASSWORD RECOVERY
  // --------------------------------------------------------------------------
  router.post("/forgot-password", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = ForgotPasswordSchema.parse(req.body);
      await authService.forgotPassword(validated.email, getMeta(req));
      res.status(200).json({
        data: { message: "If an account with this email exists, a password reset link has been dispatched." },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/reset-password", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = ResetPasswordSchema.parse(req.body);
      await authService.resetPassword(validated.token, validated.newPassword, getMeta(req));
      res.status(200).json({
        data: { message: "Password has been successfully updated. You may now sign in." },
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 8. EMAIL VERIFICATION
  // --------------------------------------------------------------------------
  router.post("/verify-email", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = VerifyEmailSchema.parse(req.body);
      await authService.verifyEmail(validated.token, getMeta(req));
      res.status(200).json({
        data: { message: "Email address has been successfully verified." },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/resend-verification", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = ResendVerificationSchema.parse(req.body);
      await authService.resendVerification(validated.email, getMeta(req));
      res.status(200).json({
        data: { message: "If your email is unverified, a fresh verification email has been dispatched." },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
