// ============================================================================
// CAR HIRE OS — IDENTITY MODULE WIRING (DEV-004, SEC-007)
// ============================================================================

import { Router } from "express";
import {
  UserRepository,
  AuthSessionRepository,
  PasswordResetTokenRepository,
  EmailVerificationTokenRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { ScryptPasswordHasher } from "./application/security/password-hasher";
import { TokenService } from "./application/security/token.service";
import { RateLimiterService } from "./application/security/rate-limiter.service";
import { IEmailDeliveryPort } from "./domain/ports";
import { DevelopmentEmailDeliveryAdapter } from "./application/services/email-delivery.service";
import { ProductionEmailDeliveryAdapter } from "./application/services/production-email-delivery.adapter";
import { AuthService } from "./application/services/auth.service";
import { createAuthController } from "./presentation/auth.controller";
import { createAuthGuard, requirePlatformStaff } from "./presentation/auth.guard";
import { validateEnv } from "@carhire/config";

export class IdentityModule {
  public readonly authService: AuthService;
  public readonly tokenService: TokenService;
  public readonly passwordHasher: ScryptPasswordHasher;
  public readonly emailDelivery: IEmailDeliveryPort;
  public readonly rateLimiter: RateLimiterService;
  public readonly authGuard: ReturnType<typeof createAuthGuard>;
  public readonly router: Router;

  constructor() {
    const userRepo = new UserRepository();
    const sessionRepo = new AuthSessionRepository();
    const resetTokenRepo = new PasswordResetTokenRepository();
    const verifyTokenRepo = new EmailVerificationTokenRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.passwordHasher = new ScryptPasswordHasher();
    this.tokenService = new TokenService();
    this.rateLimiter = new RateLimiterService();

    // Email transport is explicit in development so local testing can use
    // Postmark/SendGrid without switching the entire application to production.
    // Production/staging always require a real provider and can never capture tokens.
    const env = validateEnv();
    const isProductionLike = [env.NODE_ENV, env.APP_ENV].some(
      value => value === "production" || value === "staging"
    );
    const deliveryMode = isProductionLike
      ? (env.EMAIL_PROVIDER === "postmark" || env.EMAIL_PROVIDER === "sendgrid" ? env.EMAIL_PROVIDER : undefined)
      : (env.EMAIL_DELIVERY_MODE || "capture");

    if (isProductionLike && !deliveryMode) {
      throw new Error("Production/staging email requires EMAIL_PROVIDER=postmark or EMAIL_PROVIDER=sendgrid.");
    }

    if (deliveryMode === "postmark" || deliveryMode === "sendgrid") {
      this.emailDelivery = new ProductionEmailDeliveryAdapter(deliveryMode);
    } else {
      this.emailDelivery = new DevelopmentEmailDeliveryAdapter();
    }

    this.authService = new AuthService(
      userRepo,
      sessionRepo,
      resetTokenRepo,
      verifyTokenRepo,
      auditRepo,
      outboxRepo,
      this.passwordHasher,
      this.tokenService,
      this.emailDelivery,
      this.rateLimiter
    );

    this.authGuard = createAuthGuard(this.tokenService);
    this.router = createAuthController(this.authService, this.tokenService);
  }
}

export { createAuthGuard, requirePlatformStaff };
